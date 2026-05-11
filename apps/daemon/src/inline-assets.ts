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

export interface InlineAssetReader {
  (relPath: string): Promise<string | null>;
}

export async function inlineRelativeAssets(
  html: string,
  ownerFileName: string,
  fileReader: InlineAssetReader,
): Promise<string> {
  // Each candidate records the exact byte span in the ORIGINAL html. We
  // never mutate-then-rescan, so a tag literal that happens to appear
  // inside an inlined asset body is left untouched.
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
  interface Candidate {
    start: number;
    end: number;
    replacement: Promise<string | null>;
  }

  const candidates: Candidate[] = [];

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const start = match.index!;
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, href);
    if (!resolved) continue;
    candidates.push({
      start,
      end: start + tag.length,
      replacement: fileReader(resolved).then((css) =>
        css == null ? null : buildInlineStyleBlock(tag, href, css),
      ),
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
    candidates.push({
      start,
      end: start + tag.length,
      replacement: fileReader(resolved).then((js) =>
        js == null ? null : buildInlineScriptBlock(tag, js),
      ),
    });
  }

  if (candidates.length === 0) return html;

  // Sort by start so we can splice slices of the original html in order.
  // Link and script regions cannot overlap in a well-formed document
  // (the HTML parser disallows nested <script> / <link>), so we don't
  // need overlap-resolution logic.
  candidates.sort((a, b) => a.start - b.start);

  const resolved = await Promise.all(candidates.map((c) => c.replacement));

  const parts: string[] = [];
  let cursor = 0;
  for (let i = 0; i < candidates.length; i++) {
    const { start, end } = candidates[i]!;
    const replacement = resolved[i];
    parts.push(html.slice(cursor, start));
    parts.push(replacement ?? html.slice(start, end));
    cursor = end;
  }
  parts.push(html.slice(cursor));
  return parts.join('');
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

