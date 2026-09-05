/**
 * Safe synchronization of Antigravity Brain session artifacts into Open Design projects.
 *
 * Copies generated web artifacts (HTML, CSS, JS, SVG, images) from Antigravity's
 * session brain directory into the project directory via `writeProjectFile`, ensuring
 * path safety, event propagation, and history preservation.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProjectDir, writeProjectFile } from '../projects.js';

export interface SyncAntigravityBrainArtifactsOptions {
  projectsRoot: string;
  projectId: string;
  sessionId: string;
  projectMetadata?: Record<string, unknown>;
  brainBaseDir?: string;
  writeProjectFileFn?: typeof writeProjectFile;
}

export interface SyncAntigravityBrainArtifactsResult {
  syncedCount: number;
  syncedFiles: string[];
  skippedReason?: string;
}

const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.json',
]);

export function isValidBrainSessionId(sessionId: string): boolean {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return false;
  }
  const trimmed = sessionId.trim();
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return false;
  }
  return path.basename(trimmed) === trimmed;
}

function isPathInside(parent: string, child: string): boolean {
  const normParent = path.resolve(parent).toLowerCase();
  const normChild = path.resolve(child).toLowerCase();
  const rel = path.relative(normParent, normChild);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && rel !== '';
}

export async function syncAntigravityBrainArtifacts(
  options: SyncAntigravityBrainArtifactsOptions,
): Promise<SyncAntigravityBrainArtifactsResult> {
  const {
    projectsRoot,
    projectId,
    sessionId,
    projectMetadata,
    brainBaseDir,
    writeProjectFileFn = writeProjectFile,
  } = options;

  if (!isValidBrainSessionId(sessionId)) {
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'invalid_session_id' };
  }

  const baseDir =
    brainBaseDir ??
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
  const sessionDir = path.join(baseDir, sessionId.trim());

  let realSessionDir: string;
  try {
    realSessionDir = await fs.realpath(sessionDir);
  } catch {
    // Session directory does not exist or cannot be resolved
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'no_session_dir' };
  }

  let entries: string[];
  try {
    entries = await fs.readdir(realSessionDir);
  } catch {
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'no_session_dir' };
  }

  const projectDir = resolveProjectDir(projectsRoot, projectId, projectMetadata);
  const syncedFiles: string[] = [];

  for (const entry of entries) {
    if (
      entry.startsWith('.') ||
      entry === 'scratch' ||
      entry.endsWith('.md')
    ) {
      continue;
    }

    const ext = path.extname(entry).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      continue;
    }

    const srcFile = path.join(realSessionDir, entry);
    const destFile = path.join(projectDir, entry);

    try {
      // 1. Inspect file directly with lstat: must be a regular file and NOT a symlink
      const srcLstat = await fs.lstat(srcFile);
      if (srcLstat.isSymbolicLink() || !srcLstat.isFile()) {
        continue;
      }

      // 2. Resolve realpath and verify it remains strictly within realSessionDir
      const realSrc = await fs.realpath(srcFile);
      if (!isPathInside(realSessionDir, realSrc)) {
        continue;
      }

      // 3. Check mtime against destination
      let shouldWrite = true;
      try {
        const destStat = await fs.stat(destFile);
        if (destStat.mtimeMs >= srcLstat.mtimeMs) {
          shouldWrite = false;
        }
      } catch {
        shouldWrite = true;
      }

      if (!shouldWrite) {
        continue;
      }

      // 4. Open file handle and verify handle identity matches lstat (prevent TOCTOU swap)
      let handle: fs.FileHandle | undefined;
      try {
        handle = await fs.open(srcFile, 'r');
        const handleStat = await handle.stat();
        if (!handleStat.isFile()) {
          continue;
        }

        if (process.platform !== 'win32') {
          if (
            srcLstat.ino !== 0 &&
            (handleStat.ino !== srcLstat.ino || handleStat.dev !== srcLstat.dev)
          ) {
            continue;
          }
        } else {
          if (
            handleStat.size !== srcLstat.size ||
            Math.abs(handleStat.mtimeMs - srcLstat.mtimeMs) > 1
          ) {
            continue;
          }
        }

        const content = await handle.readFile();
        await writeProjectFileFn(
          projectsRoot,
          projectId,
          entry,
          content,
          { overwrite: true },
          projectMetadata,
        );
        syncedFiles.push(entry);
      } finally {
        await handle?.close();
      }
    } catch {
      // Best-effort per file
    }
  }

  return { syncedCount: syncedFiles.length, syncedFiles };
}
