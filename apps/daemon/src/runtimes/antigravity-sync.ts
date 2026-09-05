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
  collisionPolicy?: 'skip' | 'overwrite';
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
    collisionPolicy = 'skip',
    writeProjectFileFn = writeProjectFile,
  } = options;

  if (!isValidBrainSessionId(sessionId)) {
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'invalid_session_id' };
  }

  const baseDir =
    brainBaseDir ??
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');

  let realBaseDir: string;
  try {
    realBaseDir = await fs.realpath(baseDir);
  } catch {
    // Brain base directory does not exist
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'no_session_dir' };
  }

  const sessionDir = path.join(baseDir, sessionId.trim());

  // 1. Check session directory identity: must be a real directory and NOT a symlink
  try {
    const sessionLstat = await fs.lstat(sessionDir);
    if (sessionLstat.isSymbolicLink() || !sessionLstat.isDirectory()) {
      return { syncedCount: 0, syncedFiles: [], skippedReason: 'symlink_session_dir' };
    }
  } catch {
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'no_session_dir' };
  }

  // 2. Resolve realpath and ensure sessionDir does not escape brainBaseDir
  let realSessionDir: string;
  try {
    realSessionDir = await fs.realpath(sessionDir);
  } catch {
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'no_session_dir' };
  }

  if (!isPathInside(realBaseDir, realSessionDir)) {
    return { syncedCount: 0, syncedFiles: [], skippedReason: 'escaped_session_dir' };
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
      // 3. Inspect file directly with lstat: must be a regular file and NOT a symlink
      const srcLstat = await fs.lstat(srcFile);
      if (srcLstat.isSymbolicLink() || !srcLstat.isFile()) {
        continue;
      }

      // 4. Resolve realpath and verify it remains strictly within realSessionDir
      const realSrc = await fs.realpath(srcFile);
      if (!isPathInside(realSessionDir, realSrc)) {
        continue;
      }

      // 5. Collision policy: default to skipping existing files to preserve user content
      if (collisionPolicy !== 'overwrite') {
        try {
          await fs.stat(destFile);
          // Destination already exists; do not overwrite user files
          continue;
        } catch {
          // Destination does not exist; proceed
        }
      }

      // 6. Open file handle and verify handle identity matches lstat (prevent TOCTOU swap)
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
          { overwrite: collisionPolicy === 'overwrite' },
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
