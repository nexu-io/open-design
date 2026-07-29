import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STAGING_DIRNAME = '.amr-attachments';
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isWithinRoot(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

async function pruneStagedAttachments(stagingDir: string): Promise<void> {
  let entries;
  try {
    entries = await fs.promises.readdir(stagingDir, { withFileTypes: true });
  } catch {
    return;
  }
  const cutoff = Date.now() - STAGING_MAX_AGE_MS;
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile()) return;
    const filePath = path.join(stagingDir, entry.name);
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.promises.rm(filePath, { force: true });
      }
    } catch {
      // Best-effort cleanup only.
    }
  }));
}

export async function stageAmrImagePaths(
  cwd: string | null | undefined,
  imagePaths: string[],
  uploadRoot?: string | null,
): Promise<string[]> {
  if (!cwd || !Array.isArray(imagePaths) || imagePaths.length === 0) return [];
  const root = path.resolve(cwd);
  const uploadRootReal = uploadRoot
    ? await fs.promises.realpath(uploadRoot).catch(() => null)
    : null;
  const stagingDir = path.join(root, STAGING_DIRNAME);
  await fs.promises.mkdir(stagingDir, { recursive: true });
  await pruneStagedAttachments(stagingDir);

  const staged: string[] = [];
  for (const inputPath of imagePaths) {
    if (typeof inputPath !== 'string' || inputPath.trim().length === 0) continue;
    try {
      const resolved = path.resolve(inputPath);
      const real = await fs.promises.realpath(resolved);
      if (uploadRootReal && !isWithinRoot(uploadRootReal, real)) continue;
      const stat = await fs.promises.stat(real);
      if (!stat.isFile()) continue;
      if (isWithinRoot(root, real)) {
        staged.push(real);
        continue;
      }
      const basename = path.basename(real);
      const destination = path.join(stagingDir, `${randomUUID()}-${basename}`);
      await fs.promises.copyFile(real, destination);
      staged.push(destination);
    } catch {
      // Ignore malformed or missing files; attachments are advisory input.
    }
  }
  return staged;
}
