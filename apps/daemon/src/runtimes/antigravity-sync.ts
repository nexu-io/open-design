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

  let entries: string[];
  try {
    entries = await fs.readdir(sessionDir);
  } catch {
    // Session directory does not exist or cannot be read
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

    const srcFile = path.join(sessionDir, entry);
    const destFile = path.join(projectDir, entry);

    try {
      const srcStat = await fs.stat(srcFile);
      if (!srcStat.isFile()) continue;

      let shouldWrite = true;
      try {
        const destStat = await fs.stat(destFile);
        if (destStat.mtimeMs >= srcStat.mtimeMs) {
          shouldWrite = false;
        }
      } catch {
        // Destination does not exist; write it
        shouldWrite = true;
      }

      if (shouldWrite) {
        const content = await fs.readFile(srcFile);
        await writeProjectFileFn(
          projectsRoot,
          projectId,
          entry,
          content,
          { overwrite: true },
          projectMetadata,
        );
        syncedFiles.push(entry);
      }
    } catch {
      // Best-effort per file
    }
  }

  return { syncedCount: syncedFiles.length, syncedFiles };
}
