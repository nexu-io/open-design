import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

const FONT_TYPES: Record<string, string> = {
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

// srcdoc previews have an opaque origin. Embed bundled fonts in the authorized
// document rather than relaxing the iframe sandbox or exposing assets via CORS.
export async function inlinePluginPreviewFonts(html: string, pluginRoot: string, documentDir: string): Promise<string> {
  const root = path.resolve(pluginRoot);
  const cache = new Map<string, string | null>();
  let embeddedBytes = 0;
  async function fontData(raw: string): Promise<string | null> {
    if (cache.has(raw)) return cache.get(raw)!;
    cache.set(raw, null);
    if (!raw || /^[a-z][a-z0-9+.-]*:|^[\\/]|\0/i.test(raw)) return null;
    let relative: string;
    try { relative = decodeURIComponent(raw.split(/[?#]/)[0]!); } catch { return null; }
    const mime = FONT_TYPES[path.extname(relative).toLowerCase()];
    if (!mime || relative.includes('\\') || relative.includes('\0')) return null;
    const target = path.resolve(root, documentDir, relative);
    if (!target.startsWith(root + path.sep)) return null;
    try {
      // Reject symlinks at every level, including the plugin root.
      let current = root;
      if ((await lstat(current)).isSymbolicLink()) return null;
      const segments = path.relative(root, target).split(path.sep);
      for (const segment of segments) {
        current = path.join(current, segment);
        const stat = await lstat(current);
        if (stat.isSymbolicLink()) return null;
        if (current === target && (!stat.isFile() || stat.size > 5 * 1024 * 1024 || embeddedBytes + stat.size > 16 * 1024 * 1024)) return null;
      }
      const bytes = await readFile(target);
      embeddedBytes += bytes.length;
      const data = `data:${mime};base64,${bytes.toString('base64')}`;
      cache.set(raw, data);
      return data;
    } catch { return null; }
  }
  let result = '', cursor = 0;
  for (const style of html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)) {
    const start = style.index!;
    let css = '', cssCursor = 0;
    for (const url of style[0].matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi)) {
      const data = await fontData(url[2]!);
      css += style[0].slice(cssCursor, url.index!) + (data ? `url("${data}")` : url[0]);
      cssCursor = url.index! + url[0].length;
    }
    result += html.slice(cursor, start) + css + style[0].slice(cssCursor);
    cursor = start + style[0].length;
  }
  return result + html.slice(cursor);
}
