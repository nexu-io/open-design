// Glue between the projects-module ensure-hook surface
// (setProjectEnsuredHook) and the history substrate (initProjectHistory).
//
// Installed once at daemon startup. Every ensureProject call thereafter
// runs initProjectHistory under the feature flag, idempotently. When
// the flag is off, the hook short-circuits — no git invocations, no
// DB writes, no side effects.

import type Database from 'better-sqlite3';

import { setProjectEnsuredHook } from '../projects.js';
import { resolveIdentity } from '../identity/types.js';
import { getProject } from '../db.js';
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
 * The migration commit's author comes from the identity seam's
 * resolveIdentity(emptyReq, env) — substrate init runs in a non-
 * request-scoped context (ensure happens from many paths, not all
 * HTTP-driven) so we pass an empty req-shape and let the registered
 * provider chain do its job. Today only LocalFallbackProvider is
 * registered, so this returns the placeholder identity. When future
 * providers register ahead of the fallback, those would (correctly)
 * fail to match against an empty request and fall through; new
 * substrate init paths that want to attribute to a specific user
 * should pass the real req through instead. User-driven commits
 * land via the chat-run lifecycle hook (P0.7), where req.identity
 * is properly available via run.identity.
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
    // own tree; we must not init substrate over them. Several
    // ensureProject callers omit `metadata` from the args, so trust the
    // caller's value only when present; otherwise look it up so the
    // skip guarantee doesn't depend on every call site remembering.
    const effectiveMetadata = (metadata && typeof metadata === 'object')
      ? metadata
      : (getProject(db, projectId)?.metadata ?? null) as { baseDir?: string } | null;
    if (typeof effectiveMetadata?.baseDir === 'string') return;

    const repoDir = projectRepoPath(reposRoot, projectId);
    // Route through the identity seam, not LocalFallbackProvider directly:
    // when future multi-user providers register ahead of the fallback,
    // they get a chance to match (and correctly fall through to the
    // fallback for empty-req substrate-init paths).
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
      // History pane (later phase) will show "not available" for this
      // project with a link to settings explaining why.
      console.warn(
        `[history] project ${projectId} has a foreign .git${
          result.target ? ` (gitlink → ${result.target})` : ' directory'
        }; history disabled for this project.`,
      );
    } else if (result.kind === 'repaired') {
      // The substrate was half-initialized (gitdir present on disk,
      // no migration row in the DB) from a prior init that crashed
      // between the migration commit and the SQLite INSERT. We
      // reconstructed the missing row from HEAD. Logged at info-level
      // so the recovery is observable in normal logs — it indicates
      // a prior crash/abort during init that's now self-healed.
      console.log(
        `[history] project ${projectId} substrate was half-initialized; repaired migration revision ${result.revisionId.slice(0, 8)} from HEAD.`,
      );
    }
  });
}
