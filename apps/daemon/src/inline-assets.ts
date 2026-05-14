// Server-side port of the web-client inliner at
// apps/web/src/components/FileViewer.tsx:5248-5354 (@ base SHA 5bd97631).
// Powers the GET /api/projects/:id/export/*?inline=1 endpoint that
// inlines TOP-LEVEL relative `<link rel=stylesheet>` and
// `<script src=...>` tags into the response HTML — the viewer itself
// stays URL-load by default since PR #384 (Part 1 of
// nexu-io/open-design#368).
//
// Scope: this helper handles two tag families only. The following are
// NOT rewritten and remain external in the response:
//   - <img src>, <video src>, <audio src>, <source src>, <iframe src>
//   - CSS `url(...)` references (in inlined stylesheets or otherwise)
//   - CSS `@import` directives
//   - ES module `import` / `export from` statements inside JS bodies
//   - <link rel=preload|prefetch|icon|...> (only rel=stylesheet inlines)
//   - <link rel=stylesheet> with absolute / data: / blob: hrefs
//   - <font-face> src attrs / @font-face url() references
//
// Callers that need a fully bundled offline artifact (e.g. an HTML
// archive that opens on a machine with no network access) must layer
// their own asset rewriting on top of this primitive or build a
// stricter "fully self-contained export" follow-up. The screenshot
// path is the primary motivator: a headless browser fetches each
// referenced asset on render, so the inline-CSS-and-JS-only contract
// is sufficient.
//
// Memory profile: the helper holds one Buffer-as-string copy of the
// owner HTML plus one string copy of each sibling asset body, plus the
// concatenated output. The daemon is local-first (single-user, on the
// developer's machine — see open_design_architecture.md), so the
// effective ceiling is the size of the user's own project; no hard
// cap is enforced. If you're surfacing this endpoint to non-trusted
// callers later, you'll want a bounded-concurrency reader and an
// output-size limit.

/**
 * A handle to a project-relative asset. Decoupled into `size` (cheap;
 * sourced from `stat` or equivalent) and `read()` (full materialization)
 * so the helper can short-circuit on `maxAssetBytes` / `maxTotalBytes`
 * BEFORE the asset is buffered into memory. PR #1312 round-4 (lefarcen
 * P2): the round-3 caps fired only after every candidate had already
 * been fully read + decoded, so 500 assets at 5 MiB each could
 * materialize 2.5 GiB before the 413. The size-then-read contract
 * lets us cap pre-buffer.
 */
export interface AssetHandle {
  readonly size: number;
  read(): Promise<string | null>;
}

export interface InlineAssetReader {
  (relPath: string): Promise<AssetHandle | null>;
}

export interface InlineOptions {
  /** Max byte length of the owner HTML; exceeds → throw InlineAssetsLimitError("owner"). */
  maxOwnerBytes?: number;
  /** Max byte length of a single inlined asset body; exceeds → tag stays as URL ref. */
  maxAssetBytes?: number;
  /** Max number of `<link>`/`<script>` matches in the owner HTML; exceeds → throw "candidates". */
  maxCandidates?: number;
  /** Max byte length of the assembled output; exceeds → throw InlineAssetsLimitError("total"). */
  maxTotalBytes?: number;
  /** Max concurrent fileReader invocations; defaults to MAX_INLINE_READ_CONCURRENCY. */
  maxReadConcurrency?: number;
}

// Module-level defaults. PR #1312 round-3 (lefarcen P2): the daemon is
// local-first, but the helper still needs defensive caps to prevent
// a pathological project (or a future non-trusted caller) from
// causing unbounded read fanout / memory blow-up. These values let
// any realistic developer project through while rejecting clearly
// pathological inputs.
export const MAX_INLINE_OWNER_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_INLINE_ASSET_BYTES = 5 * 1024 * 1024; // 5 MiB per asset
export const MAX_INLINE_CANDIDATES = 500; // <link>/<script src> matches
export const MAX_INLINE_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MiB output
export const MAX_INLINE_READ_CONCURRENCY = 8; // simultaneous fileReader calls

/**
 * Thrown by `inlineRelativeAssets` when a configured cap is exceeded.
 * The route handler maps every `InlineAssetsLimitError` to a 413
 * `PAYLOAD_TOO_LARGE` envelope; the `limit` field identifies which
 * cap fired so logs/clients can disambiguate.
 */
export class InlineAssetsLimitError extends Error {
  constructor(
    message: string,
    public readonly limit: 'owner' | 'asset' | 'candidates' | 'total',
  ) {
    super(message);
    this.name = 'InlineAssetsLimitError';
  }
}

export async function inlineRelativeAssets(
  html: string,
  ownerFileName: string,
  fileReader: InlineAssetReader,
  opts: InlineOptions = {},
): Promise<string> {
  // Each pending entry records the exact byte span in the ORIGINAL html
  // plus the builder that turns the asset's content into the
  // replacement string. We never mutate-then-rescan, so a tag literal
  // that happens to appear inside an inlined asset body is left
  // untouched.
  //
  // Two divergences from apps/web/src/components/FileViewer.tsx:5265-5314:
  //
  // 1. Position-based, single-pass concat (vs. `.reduce` over `.replace`).
  //    The web client's reduce-over-replace re-scans the mutated string
  //    on each pass, which (a) replaces only the first occurrence of a
  //    duplicate tag and (b) corrupts already-inlined bodies that contain
  //    another tag's literal substring. This helper avoids both by
  //    operating on captured indices in the original input.
  // 2. Duplicate identical tags: this helper inlines every occurrence
  //    (the web client's first-match-only is a side-effect of `.replace`
  //    semantics). The web inline path is on a deprecation track since
  //    PR #384 made URL-load the default, so the divergence is
  //    forward-pointing.
  const maxOwnerBytes = opts.maxOwnerBytes ?? MAX_INLINE_OWNER_BYTES;
  const maxAssetBytes = opts.maxAssetBytes ?? MAX_INLINE_ASSET_BYTES;
  const maxCandidates = opts.maxCandidates ?? MAX_INLINE_CANDIDATES;
  const maxTotalBytes = opts.maxTotalBytes ?? MAX_INLINE_TOTAL_BYTES;
  const maxReadConcurrency = opts.maxReadConcurrency ?? MAX_INLINE_READ_CONCURRENCY;

  const ownerBytes = Buffer.byteLength(html, 'utf8');
  if (ownerBytes > maxOwnerBytes) {
    throw new InlineAssetsLimitError(
      `owner html ${ownerBytes} bytes exceeds maxOwnerBytes ${maxOwnerBytes}`,
      'owner',
    );
  }

  interface Pending {
    start: number;
    end: number;
    resolved: string;
    build: (content: string) => string;
  }

  const pending: Pending[] = [];

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const start = match.index!;
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, href);
    if (!resolved) continue;
    pending.push({
      start,
      end: start + tag.length,
      resolved,
      build: (css) => buildInlineStyleBlock(tag, href, css),
    });
  }

  for (const match of html.matchAll(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi,
  )) {
    const tag = match[0];
    const start = match.index!;
    const src = readHtmlAttr(tag, 'src');
    if (!src) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, src);
    if (!resolved) continue;
    pending.push({
      start,
      end: start + tag.length,
      resolved,
      build: (js) => buildInlineScriptBlock(tag, js),
    });
  }

  if (pending.length === 0) return html;

  if (pending.length > maxCandidates) {
    throw new InlineAssetsLimitError(
      `found ${pending.length} candidates, exceeds maxCandidates ${maxCandidates}`,
      'candidates',
    );
  }

  // Sort by start so we can splice slices of the original html in order.
  // Link and script regions cannot overlap in a well-formed document
  // (the HTML parser disallows nested <script> / <link>), so we don't
  // need overlap-resolution logic.
  pending.sort((a, b) => a.start - b.start);

  // Running-total tracker. Owner html bytes contribute first; each
  // accepted asset reserves its stat-size BEFORE the read. The
  // concat-time guard further down is the exact final check; this
  // pre-buffer reservation is the early-abort that bounds peak memory
  // (PR #1312 round-4, lefarcen P2). Reservation is approximate
  // (counts the original tag bytes that get replaced, doesn't count
  // wrapper overhead) — close enough for resource bounding, and the
  // concat-time guard catches any remaining drift.
  let runningBytes = ownerBytes;
  let totalAborted = false;

  const replacements = await runWithConcurrency(
    pending,
    maxReadConcurrency,
    async (p) => {
      if (totalAborted) return null;
      const handle = await fileReader(p.resolved);
      if (handle == null) return null;
      // Per-asset cap, pre-buffer (stat-based — no read yet).
      if (handle.size > maxAssetBytes) return null;
      // Total cap, pre-buffer. The check + write below has no `await`
      // between them, so under Node's single-threaded event loop the
      // pair is atomic with respect to other workers — no race.
      if (runningBytes + handle.size > maxTotalBytes) {
        totalAborted = true;
        return null;
      }
      runningBytes += handle.size;
      const content = await handle.read();
      if (content == null) {
        // Read failed/returned null AFTER stat said it was OK — refund
        // the reservation so the total stays honest for any in-flight
        // siblings still racing the cap check.
        runningBytes -= handle.size;
        return null;
      }
      const actualBytes = Buffer.byteLength(content, 'utf8');
      if (actualBytes > maxAssetBytes) {
        // Defensive: handle.size may have been stale or the reader
        // ignored its own promise. Refund and drop the inlining.
        runningBytes -= handle.size;
        return null;
      }
      // PR #1312 round-5 (lefarcen P3 confirmed path-a): reconcile the
      // pre-read reservation with the actual content byte length. A
      // stat-lying reader (stale stat, UTF-8 decode expansion, sparse
      // file, deliberate under-report) could otherwise let many strings
      // materialize before the concat-time guard catches it. The per-
      // asset check above protects against single-asset blow-up; this
      // adjustment + re-check guards the running total.
      runningBytes += actualBytes - handle.size;
      if (runningBytes > maxTotalBytes) {
        // Drop this asset's inlining (tag stays as URL ref), set the
        // abort flag so subsequent workers skip their read(), let
        // Promise.all settle, then throw 'total' below. No throw-
        // before-settle race — matches the round-2/3/4 graceful-
        // fallback pattern.
        totalAborted = true;
        return null;
      }
      return p.build(content);
    },
  );

  if (totalAborted) {
    throw new InlineAssetsLimitError(
      `running total exceeded maxTotalBytes ${maxTotalBytes} during reads`,
      'total',
    );
  }

  // Concat slices in one pass with a running output-size guard. The
  // guard counts both the original-html slices we preserve and the
  // replacement strings we inject. Exact final check; the
  // pre-buffer reservation above is approximate (raw asset size,
  // doesn't account for <style>/<script> wrapper overhead) so this
  // catches any drift.
  const parts: string[] = [];
  let cursor = 0;
  let totalBytes = 0;
  const guard = (segment: string) => {
    totalBytes += Buffer.byteLength(segment, 'utf8');
    if (totalBytes > maxTotalBytes) {
      throw new InlineAssetsLimitError(
        `assembled output ${totalBytes} bytes exceeds maxTotalBytes ${maxTotalBytes}`,
        'total',
      );
    }
  };
  for (let i = 0; i < pending.length; i++) {
    const { start, end } = pending[i]!;
    const replacement = replacements[i];
    const before = html.slice(cursor, start);
    guard(before);
    parts.push(before);
    const inject = replacement ?? html.slice(start, end);
    guard(inject);
    parts.push(inject);
    cursor = end;
  }
  const tail = html.slice(cursor);
  guard(tail);
  parts.push(tail);
  return parts.join('');
}

/**
 * Run `fn` over `items` with at most `limit` invocations in flight at
 * any moment. Order of `items` and of the returned results is
 * preserved. Used to bound concurrent fileReader calls so a project
 * with hundreds of `<link>`/`<script>` tags doesn't open hundreds of
 * file descriptors simultaneously.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

// Attrs that affect <style> semantics and must be carried across from
// the source <link rel=stylesheet> so the inlined output matches the
// behavior of the original URL-loaded stylesheet:
//   - media        — media query (e.g. `media="print"` for print-only)
//   - title        — alternate stylesheet sets
//   - disabled     — boolean: initial disabled state
//   - nonce        — CSP nonce passthrough
// All four are valid on both <link rel=stylesheet> and <style>. Other
// <link> attrs (rel, href, type, crossorigin, integrity, referrerpolicy)
// don't apply to <style> and are intentionally dropped.
const STYLE_PRESERVED_LINK_ATTRS = ['media', 'title', 'nonce'] as const;
const STYLE_PRESERVED_BOOLEAN_ATTRS = ['disabled'] as const;

function buildInlineStyleBlock(tag: string, href: string, css: string): string {
  const carried: string[] = [];
  for (const name of STYLE_PRESERVED_LINK_ATTRS) {
    const value = readHtmlAttr(tag, name);
    if (value != null) carried.push(`${name}="${escapeHtmlAttr(value)}"`);
  }
  for (const name of STYLE_PRESERVED_BOOLEAN_ATTRS) {
    if (hasBooleanHtmlAttr(tag, name)) carried.push(name);
  }
  const attrString = carried.length === 0 ? '' : ` ${carried.join(' ')}`;
  return (
    `<style data-od-inline-asset="${escapeHtmlAttr(href)}"${attrString}>\n` +
    `${css.replace(/<\/style/gi, '<\\/style')}\n</style>`
  );
}

function buildInlineScriptBlock(tag: string, js: string): string {
  const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
  const attrs = open
    .replace(/^<script/i, '')
    .replace(/>$/i, '')
    .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
  return `<script${attrs}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`;
}

export function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

export function resolveProjectRelativePath(
  ownerFileName: string,
  assetRef: string,
): string | null {
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

export function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

// HTML boolean attribute presence test — matches `<tag … name>` or
// `<tag … name=""…>` without requiring a value, but does NOT match a
// substring inside another attribute's value (e.g. `data-note="content
// disabled stuff"` must NOT count as `disabled` being set).
//
// Implementation: strip quoted attribute values out of the tag first
// (replace `"…"` and `'…'` with empty quotes), then run the lookahead
// regex over the remaining structural-attr-only string. The lookahead
// requires `\s|=|/?>` after the attr name, so a bare `name`,
// `name=""`, `name="…"`, or `name/>` all match — but a substring of
// any value cannot match because values have been stripped.
const ATTR_VALUE_QUOTE_DOUBLE_RE = /=\s*"[^"]*"/g;
const ATTR_VALUE_QUOTE_SINGLE_RE = /=\s*'[^']*'/g;
export function hasBooleanHtmlAttr(tag: string, name: string): boolean {
  const stripped = tag
    .replace(ATTR_VALUE_QUOTE_DOUBLE_RE, '=""')
    .replace(ATTR_VALUE_QUOTE_SINGLE_RE, "=''");
  return new RegExp(`\\s${name}(?=\\s|=|/?>)`, 'i').test(stripped);
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
