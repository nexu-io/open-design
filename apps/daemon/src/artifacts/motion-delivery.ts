import type { MotionDeliveryContract } from '@open-design/contracts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

/** The frozen plan owns delivery mode and exact paths; HTML cannot downgrade it.
 * This checks existence/identity, not visual quality or model claims. */
export async function validateMotionDelivery(input: {
  projectRoot: string;
  sourceFile: string;
  contract: MotionDeliveryContract;
  touchedPaths?: string[];
}): Promise<boolean> {
  try {
    const root = await fs.realpath(input.projectRoot);
    const source = path.resolve(root, input.sourceFile);
    const $ = load(await fs.readFile(source, 'utf8'));
    if (input.sourceFile !== input.contract.sourcePath) return false;
    if (input.contract.mode === 'interactive') return true;
    const href = $('link[rel="alternate"][type="video/mp4"]').attr('href');
    if (!href || /[?#\\]/.test(href) || /^[a-z]+:/i.test(href) || path.isAbsolute(href)) return false;
    const target = path.resolve(path.dirname(source), href);
    if (target !== path.resolve(root, input.contract.videoPath)) return false;
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
