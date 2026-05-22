// Glue between the projects-module ensure-hook surface
// (setProjectEnsuredHook) and the history substrate (initProjectHistory).
// Installed once at daemon startup; when the feature flag is off the
// hook short-circuits.

import type Database from 'better-sqlite3';

import { setProjectEnsuredHook } from '../projects.js';
import { resolveIdentity } from '../identity/types.js';
import { getProject } from '../db.js';
import { isHistoryEnabled } from './feature-flag.js';
import { initProjectHistory, projectRepoPath } from './repo.js';

export interface InstallHistoryEnsureHookArgs {
  db: Database.Database;
  /** Absolute path to the directory holding per-project gitdirs. */
  reposRoot: string;
  /** Lets tests override the env read; production passes nothing. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Shape the projects-module hook passes to its registered callback.
 * Defined here because projects.ts is `@ts-nocheck` and can't export
 * the type; consumers that want it can import from this module.
 */
export interface ProjectEnsuredHookArgs {
  projectsRoot: string;
  projectId: string;
  projectDir: string;
  metadata?: { baseDir?: string } | null;
}

export function installHistoryEnsureHook(args: InstallHistoryEnsureHookArgs): void {
  const { db, reposRoot, env = process.env } = args;

  setProjectEnsuredHook(async ({ projectId, projectDir, metadata }: ProjectEnsuredHookArgs) => {
    if (!isHistoryEnabled(env)) return;
    // Linked-folder projects (metadata.baseDir set) point at the
    // user's own tree; we must not init substrate over them. Several
    // ensureProject callers omit `metadata`, so look it up when absent
    // — the skip guarantee can't depend on every call site remembering.
    const effectiveMetadata = (metadata && typeof metadata === 'object')
      ? metadata
      : (getProject(db, projectId)?.metadata ?? null) as { baseDir?: string } | null;
    if (typeof effectiveMetadata?.baseDir === 'string') return;

    const repoDir = projectRepoPath(reposRoot, projectId);
    // Route through the identity seam, not LocalFallbackProvider
    // directly: when future multi-user providers register ahead of
    // the fallback they get a chance to match (and correctly fall
    // through to the fallback for empty-req substrate-init paths).
    const identity = resolveIdentity({}, env);

    const result = await initProjectHistory({
      projectId,
      projectDir,
      repoDir,
      identity,
      db,
    });

    if (result.kind === 'foreign-git-collision') {
      // Surface but don't throw — ensureProject's contract is "return
      // the directory." Project file ops continue to work; the
      // History pane will show "not available" for this project.
      console.warn(
        `[history] project ${projectId} has a foreign .git${
          result.target ? ` (gitlink → ${result.target})` : ' directory'
        }; history disabled for this project.`,
      );
    } else if (result.kind === 'repaired') {
      console.log(
        `[history] project ${projectId} substrate was half-initialized; repaired migration revision ${result.revisionId.slice(0, 8)} from HEAD.`,
      );
    }
  });
}
