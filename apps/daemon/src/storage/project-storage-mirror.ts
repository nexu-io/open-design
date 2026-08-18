import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { resolveProjectStorage, type ProjectStorage } from './project-storage.js';

/**
 * #7043 — best-effort mirror between the daemon's local project working copy
 * and an S3-compatible blob store (AWS S3, MinIO, ...).
 *
 * The daemon's agent runtimes spawn with the project directory as their cwd on
 * local disk, so the local tree stays the authoritative working copy. When
 * OD_PROJECT_STORAGE=s3, this mirror pushes every project-file mutation to the
 * blob store (write-through), restores a fresh/empty local tree from the store,
 * and re-syncs the whole tree when a run terminates (agent processes write
 * files directly, bypassing the HTTP write path).
 *
 * All operations are best-effort: a blob-store outage must never break local
 * project work, so callers swallow upload failures (the local tree remains the
 * source of truth and the next sync retries the whole tree).
 */
export interface ProjectStorageMirror {
  readonly enabled: true;
  adapter: ProjectStorage;
  uploadFile(projectId: string, relpath: string): Promise<void>;
  uploadProject(projectId: string): Promise<void>;
  deleteFile(projectId: string, relpath: string): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  restoreIfEmpty(projectId: string, localDir: string): Promise<void>;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [dir];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue; // missing dir mid-walk: treat as empty
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

export function createProjectStorageMirror(
  adapter: ProjectStorage,
  projectsRoot: string,
): ProjectStorageMirror {
  return {
    enabled: true,
    adapter,
    async uploadFile(projectId, relpath) {
      const body = await fsp.readFile(path.join(projectsRoot, projectId, relpath));
      await adapter.writeFile(projectId, relpath, body);
    },
    async uploadProject(projectId) {
      const root = path.join(projectsRoot, projectId);
      const files = await walkFiles(root);
      for (const file of files) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        const body = await fsp.readFile(file);
        await adapter.writeFile(projectId, rel, body);
      }
    },
    async deleteFile(projectId, relpath) {
      await adapter.deleteFile(projectId, relpath);
    },
    async deleteProject(projectId) {
      const entries = await adapter.listFiles(projectId);
      for (const entry of entries) {
        await adapter.deleteFile(projectId, entry.path);
      }
    },
    async restoreIfEmpty(projectId, localDir) {
      let entries;
      try {
        entries = await fsp.readdir(localDir);
      } catch {
        return;
      }
      if (entries.length > 0) return;
      const remote = await adapter.listFiles(projectId);
      for (const entry of remote) {
        const body = await adapter.readFile(projectId, entry.path);
        const target = path.join(localDir, entry.path);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.writeFile(target, body);
      }
    },
  };
}

export function resolveProjectStorageMirror(
  env: NodeJS.ProcessEnv,
  projectsRoot: string,
): ProjectStorageMirror | null {
  const kind = (env.OD_PROJECT_STORAGE ?? 'local').trim().toLowerCase();
  if (kind !== 's3') return null;
  const adapter = resolveProjectStorage({ projectsRoot, env });
  return createProjectStorageMirror(adapter, projectsRoot);
}

