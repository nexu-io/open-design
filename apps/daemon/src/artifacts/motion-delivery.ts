import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

/** Motion source declares its delivery mode and the exact derived video.
 * This checks existence/identity, not visual quality or model claims. */
export async function validateMotionDelivery(input: {
  projectRoot: string;
  sourceFile: string;
  touchedPaths?: string[];
}): Promise<boolean> {
  try {
    const root = await fs.realpath(input.projectRoot);
    const source = path.resolve(root, input.sourceFile);
    const $ = load(await fs.readFile(source, 'utf8'));
    const mode = $('meta[name="od-motion-output"]').attr('content');
    if (mode === 'interactive') return true;
    if (mode !== 'video') return false;
    const href = $('link[rel="alternate"][type="video/mp4"]').attr('href');
    if (!href || /[?#\\]/.test(href) || /^[a-z]+:/i.test(href) || path.isAbsolute(href)) return false;
    const target = path.resolve(path.dirname(source), href);
    const realTarget = await fs.realpath(target);
    if (!realTarget.startsWith(root + path.sep) || !/\.mp4$/i.test(realTarget)) return false;
    const relativeVideo = path.relative(root, target);
    if (input.touchedPaths && !input.touchedPaths.some((file) =>
      path.relative(input.projectRoot, path.resolve(input.projectRoot, file)) === relativeVideo
    )) return false;
    const handle = await fs.open(realTarget, 'r');
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return bytesRead === 12 && header.toString('ascii', 4, 8) === 'ftyp'
        && (await handle.stat()).size > 32;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}
