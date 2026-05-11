// Server-side port of the web-client inliner at
// apps/web/src/components/FileViewer.tsx:5248-5354 (@ base SHA 5bd97631).
// Powers the GET /api/projects/:id/export/*?inline=1 endpoint that ships a
// self-contained HTML document for explicit "Export self-contained HTML" and
// screenshot tooling — the viewer itself stays URL-load by default since
// PR #384 (Part 1 of nexu-io/open-design#368).
//
// The web client and this helper diverge in exactly one place: the global
// replace below. See the inline comment near `replaceAllOccurrences` for
// the rationale.

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

function buildInlineStyleBlock(_tag: string, href: string, css: string): string {
  return (
    `<style data-od-inline-asset="${escapeHtmlAttr(href)}">\n` +
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

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

