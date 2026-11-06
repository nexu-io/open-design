import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface ShareStagingFile {
  file: string;
  data: Buffer | Uint8Array | string;
}

/**
 * Materialize a share plan without merging distinct public paths. The source
 * and temporary volumes can have different case/Unicode equivalence rules.
 * Refuse before upload if the destination cannot represent the plan exactly;
 * changing URL spelling would break the document's references.
 * The caller owns a fresh private directory and cleans it on every outcome.
 */
export async function stageShareFiles(directory: string, files: readonly ShareStagingFile[]): Promise<void> {
  const directories = new Map<string, string>();
  const checkedPaths = new Set<string>();
  for (const file of files) {
    const target = path.resolve(directory, file.file);
    const relative = path.relative(directory, target);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('share plan file escapes staging directory');
    }
    const parts = relative.split(path.sep);
    let parent = directory;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      if (checkedPaths.has(parent)) continue;
      await mkdir(parent, { recursive: true });
      const identity = await stat(parent);
      const key = `${identity.dev}:${identity.ino}`;
      const previous = directories.get(key);
      if (previous !== undefined && previous !== parent) {
        throw new Error('share staging filesystem cannot preserve distinct resource paths');
      }
      directories.set(key, parent);
      checkedPaths.add(parent);
    }
    // Exclusive creation catches file aliases without overwriting the first
    // file, including aliases inside an otherwise identically spelled folder.
    await writeFile(target, file.data, { flag: 'wx' });
  }
}
