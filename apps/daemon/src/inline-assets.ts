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

interface Replacement {
  from: string;
  to: string;
}

export async function inlineRelativeAssets(
  html: string,
  ownerFileName: string,
  fileReader: InlineAssetReader,
): Promise<string> {
  const replacements: Array<Promise<Replacement | null>> = [];

  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, href);
    if (!resolved) continue;
    replacements.push(
      fileReader(resolved).then<Replacement | null>((css) =>
        css == null
          ? null
          : {
              from: tag,
              to:
                `<style data-od-inline-asset="${escapeHtmlAttr(href)}">\n` +
                `${css.replace(/<\/style/gi, '<\\/style')}\n</style>`,
            },
      ),
    );
  }

  const scriptTags =
    html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scriptTags) {
    const src = readHtmlAttr(tag, 'src');
    if (!src) continue;
    const resolved = resolveProjectRelativePath(ownerFileName, src);
    if (!resolved) continue;
    replacements.push(
      fileReader(resolved).then<Replacement | null>((js) => {
        if (js == null) return null;
        const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
        const attrs = open
          .replace(/^<script/i, '')
          .replace(/>$/i, '')
          .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
        return {
          from: tag,
          to: `<script${attrs}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
        };
      }),
    );
  }

  const resolvedReplacements = (await Promise.all(replacements)).filter(
    (item): item is Replacement => item !== null,
  );

  // Divergence from apps/web/src/components/FileViewer.tsx:5313: the web
  // client uses `.replace(from, () => to)`, which replaces only the first
  // occurrence. That produces inconsistent output when a document has
  // duplicate identical tags — one inlined, the rest left as URL refs.
  // This helper replaces every occurrence. The web inline path is on a
  // deprecation track (URL-load is the default since PR #384), so the
  // divergence is forward-pointing.
  return resolvedReplacements.reduce(
    (next, { from, to }) => replaceAllOccurrences(next, from, to),
    html,
  );
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

function replaceAllOccurrences(source: string, from: string, to: string): string {
  return source.split(from).join(to);
}
