import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const MAX_PAGES = 64;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const ORIGIN = 'https://opendesign.invalid';

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function pageUrl(relative: string): URL {
  return new URL(relative.split('/').map(encodeURIComponent).join('/'), `${ORIGIN}/`);
}

/** Read only project-owned regular files, within a fixed per-page I/O budget. */
async function readPage(root: string, relative: string): Promise<string | null> {
  try {
    const target = await fs.realpath(path.resolve(root, relative));
    if (!within(root, target)) return null;
    const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_PAGE_BYTES) return null;
      const buffer = Buffer.alloc(stat.size + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== stat.size) return null;
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/**
 * A prototype's linked pages belong to its canonical entry. Accept a changed
 * page only after following real local HTML navigation from that entry; an
 * unrelated HTML file, external URL, or old untouched page is not delivery.
 * This reads markup only and never executes scripts or fetches resources.
 */
export async function findTouchedLinkedPage(input: {
  projectRoot: string;
  entryFile: string;
  htmlPaths: ReadonlySet<string>;
  touchedPaths: ReadonlySet<string>;
}): Promise<string | null> {
  let root: string;
  try { root = await fs.realpath(input.projectRoot); } catch { return null; }
  const pending = [input.entryFile];
  const seen = new Set(pending);
  let totalBytes = 0;
  for (let index = 0; index < pending.length && index < MAX_PAGES; index += 1) {
    const current = pending[index]!;
    const html = await readPage(root, current);
    if (html === null) continue;
    totalBytes += Buffer.byteLength(html);
    if (totalBytes > MAX_TOTAL_BYTES) return null;
    if (input.touchedPaths.has(current)) return current;
    const $ = load(html);
    const baseHref = $('base[href]').first().attr('href');
    let base = pageUrl(current);
    try { if (baseHref) base = new URL(baseHref, base); } catch { continue; }
    if (base.origin !== ORIGIN) continue;
    for (const element of $('a[href], area[href]').toArray()) {
      const href = $(element).attr('href')?.trim();
      if (!href || href.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
      try {
        const url = new URL(href, base);
        if (url.origin !== ORIGIN) continue;
        const relative = decodeURIComponent(url.pathname.slice(1));
        if (!input.htmlPaths.has(relative) || seen.has(relative)) continue;
        // Bound queued work too: a page can contain arbitrarily many links.
        if (seen.size >= MAX_PAGES) break;
        seen.add(relative);
        pending.push(relative);
      } catch { /* An invalid href is not evidence of a local page. */ }
    }
  }
  return null;
}
