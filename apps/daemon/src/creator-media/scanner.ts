import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { CreatorMediaKind, CreatorMediaScanCandidate, CreatorMediaScanResult } from '@open-design/contracts';

const extensions: Record<string, CreatorMediaKind> = {
  '.gif': 'image', '.heic': 'image', '.jpeg': 'image', '.jpg': 'image', '.png': 'image', '.webp': 'image',
  '.mkv': 'video', '.mov': 'video', '.mp4': 'video', '.webm': 'video',
};

export async function scanCreatorMediaRoot(rootPath: string): Promise<CreatorMediaScanResult> {
  const discovered: CreatorMediaScanCandidate[] = [];
  const errors: string[] = [];
  let skipped = 0;
  const walk = async (directory: string): Promise<void> => {
    let entries;
    try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch (error) { errors.push(String(error)); return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const sourcePath = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(sourcePath); continue; }
      if (!entry.isFile()) { continue; }
      const extension = path.extname(entry.name).toLowerCase();
      const kind = extensions[extension];
      if (!kind) { skipped++; continue; }
      try {
        const stat = await fsp.stat(sourcePath);
        discovered.push({ rootPath, sourcePath, relativePath: path.relative(rootPath, sourcePath), fileName: entry.name, extension, kind, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), availability: 'available', thumbnailStatus: 'unavailable' });
      } catch (error) { errors.push(String(error)); }
    }
  };
  await walk(rootPath);
  return { discovered, skipped, errors };
}
