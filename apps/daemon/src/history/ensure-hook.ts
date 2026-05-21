// Glue between the projects-module ensure-hook surface
// (setProjectEnsuredHook) and the history substrate (initProjectHistory).
//
// Installed once at daemon startup. Every ensureProject call thereafter
// runs initProjectHistory under the feature flag, idempotently. When
// the flag is off, the hook short-circuits — no git invocations, no
// DB writes, no side effects.

import type Database from 'better-sqlite3';

import { setProjectEnsuredHook } from '../projects.js';
import { LocalFallbackProvider } from '../identity/types.js';
import { isHistoryEnabled } from './feature-flag.js';
import { initProjectHistory, projectRepoPath } from './repo.js';

export interface InstallHistoryEnsureHookArgs {
  db: Database.Database;
  /**
   * Absolute path to the directory that holds per-project gitdirs.
   * Typically `<OD_DATA_DIR>/repos/` — sibling of the projects root.
   */
  reposRoot: string;
  /**
   * Lets the integration test override the env read; production
   * callers pass nothing and the hook reads `process.env`.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Install the post-ensureProject hook that auto-initializes the
 * history substrate when the feature flag is on. Idempotent across
 * calls (the projects module's hook is a single slot; calling this
 * twice just re-registers).
 *
 * The migration commit's author is the LocalFallbackProvider's
 * identity — substrate init runs in a non-request-scoped context
 * (ensure happens from many paths, not all HTTP-driven) so we
 * deliberately don't try to thread req.identity here. User-driven
 * commits land via the chat-run lifecycle hook (P0.7), where
 * req.identity is properly available via run.identity.
 */
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
    // Linked-folder projects (metadata.baseDir set) point at the user's
    // own tree, which may already be a git repo. initProjectHistory's
    // foreign-git-collision branch handles that case — but the user's
    // expectation for those is "OD does not touch my git repo," so we
    // skip linked projects entirely rather than relying on collision
    // detection.
    if (typeof metadata?.baseDir === 'string') return;

    const repoDir = projectRepoPath(reposRoot, projectId);
    const identity = LocalFallbackProvider.resolve({}, env) ?? {
      id: 'local:default',
      displayName: 'Local User',
      source: 'local-fallback',
    };

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
      // History pane (later phase) will show "not available" for this
      // project with a link to settings explaining why.
      console.warn(
        `[history] project ${projectId} has a foreign .git${
          result.target ? ` (gitlink → ${result.target})` : ' directory'
        }; history disabled for this project.`,
      );
    }
  });
}
