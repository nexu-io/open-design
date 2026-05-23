// Glue between the chat-run service's finish() hook and
// recordRevisionForRun. Records a `project_revisions` row when the
// working tree is dirty at run end. Errors are logged warnings —
// auto-commit is best-effort and must not affect the run's status.

import path from 'node:path';
import type Database from 'better-sqlite3';

import { isHistoryEnabled } from './feature-flag.js';
import { projectRepoPath, readHeadSha, recordRevisionForRun } from './repo.js';
import { isSafeId } from '../projects.js';
import type { Identity } from '../identity/types.js';

const DEFAULT_COMMIT_MESSAGE = 'Agent run';

/**
 * Shape the chat-run service hands to the run-finished hook. Defined
 * here because runs.ts is `@ts-nocheck`; consumers that need the
 * type import from this module.
 */
export interface RunFinishedRun {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  identity: Identity | null;
  message: string | null;
  touchedFiles: boolean;
  /**
   * HEAD SHA observed by `installHistoryRunCreatedHook` right after
   * runs.create(). Null when the substrate isn't initialized yet, the
   * read failed, or the run was created before the created-hook was
   * installed. Passed through to recordRevisionForRun as the preferred
   * baseline for the sibling-absorbed marker check.
   */
  headAtCreate: string | null;
}

/**
 * The created-hook receives a mutable run reference and may set
 * `headAtCreate` directly on it.
 */
export interface RunCreatedRun {
  id: string;
  projectId: string | null;
  headAtCreate: string | null;
}

type RunFinishedStatus = 'succeeded' | 'failed' | 'canceled';

export interface RunServiceForHook {
  setRunFinishedHook(hook: ((run: RunFinishedRun, status: RunFinishedStatus) => unknown) | null): void;
  setRunCreatedHook(hook: ((run: RunCreatedRun) => unknown) | null): void;
}

export interface InstallHistoryRunFinishedHookArgs {
  db: Database.Database;
  /** Absolute path holding per-project working trees (PROJECTS_DIR). */
  projectsRoot: string;
  /** Absolute path holding per-project gitdirs (REPOS_DIR). */
  reposRoot: string;
  /** Run service whose finish() should fire the auto-commit. */
  runs: RunServiceForHook;
  /** Env override (mainly for tests). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export type InstallHistoryRunCreatedHookArgs = InstallHistoryRunFinishedHookArgs;

/**
 * First non-empty line of the prompt, clamped to a single-line subject
 * readable in `git log --oneline` (~72 chars). Falls back to a default
 * when there's no prompt (e.g., orbit runs without a `message` field).
 */
function buildCommitMessage(rawPrompt: string | null | undefined): string {
  if (!rawPrompt) return DEFAULT_COMMIT_MESSAGE;
  const firstLine = rawPrompt.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (!firstLine) return DEFAULT_COMMIT_MESSAGE;
  return firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine;
}

/**
 * Install the post-finish hook. No-op when: the feature flag is off,
 * the run has no projectId, or the run has no resolved Identity
 * (defensive — shouldn't happen after P0.2 wired it, but skipping is
 * safer than committing with a null author).
 */
export function installHistoryRunFinishedHook(args: InstallHistoryRunFinishedHookArgs): void {
  const { db, projectsRoot, reposRoot, runs, env = process.env } = args;

  runs.setRunFinishedHook(async (run, _status) => {
    if (!isHistoryEnabled(env)) return;
    if (!run.projectId) return;
    if (!run.identity) return;
    if (!isSafeId(run.projectId)) {
      console.warn(`[history] skipping hook for unsafe projectId ${JSON.stringify(run.projectId)}`);
      return;
    }

    const projectDir = path.join(projectsRoot, run.projectId);
    const repoDir = projectRepoPath(reposRoot, run.projectId);
    const message = buildCommitMessage(run.message);

    try {
      const result = await recordRevisionForRun({
        projectId: run.projectId,
        projectDir,
        repoDir,
        run: { id: run.id, identity: run.identity },
        message,
        db,
        runTouchedFiles: run.touchedFiles,
        runHeadAtCreate: run.headAtCreate,
      });

      if (result.kind === 'recorded') {
        if (process.env.DEBUG?.includes('history')) {
          console.log(
            `[history] recorded revision ${result.revisionId.slice(0, 8)} for run ${run.id} (${result.filesChanged} files, +${result.bytesAdded}/-${result.bytesRemoved} lines)`,
          );
        }
      } else if (result.kind === 'marker') {
        // Info-level (not debug): concurrent-run absorption is rare
        // and useful to surface when troubleshooting "why doesn't my
        // run appear in history with its own commit?"
        const absorbedSuffix = result.absorbedIntoRevisionId
          ? ` (absorbed into ${result.absorbedIntoRevisionId.slice(0, 8)})`
          : '';
        console.log(
          `[history] recorded marker revision ${result.revisionId.slice(0, 8)} for run ${run.id}${absorbedSuffix}`,
        );
      } else if (result.kind === 'not-initialized') {
        console.warn(
          `[history] run ${run.id} finished against project ${run.projectId} but the substrate isn't initialized; skipping commit.`,
        );
      }
      // 'clean' is the common no-op case — don't log
    } catch (err) {
      console.warn(`[history] auto-commit failed for run ${run.id}:`, err);
    }
  });
}

/**
 * Install the post-create hook. Reads HEAD asynchronously and stamps
 * `run.headAtCreate` so the finish-hook's marker check has a baseline
 * that pre-dates any sibling's commit-and-release cycle. Best-effort:
 * any failure (unsafe id, missing substrate, git error) leaves
 * `headAtCreate` null, and the marker check falls back to the
 * lock-entry baseline that's been there since round 6.
 */
export function installHistoryRunCreatedHook(args: InstallHistoryRunCreatedHookArgs): void {
  const { projectsRoot, runs, env = process.env } = args;

  runs.setRunCreatedHook(async (run) => {
    if (!isHistoryEnabled(env)) return;
    if (!run.projectId) return;
    if (!isSafeId(run.projectId)) return;
    const projectDir = path.join(projectsRoot, run.projectId);
    try {
      run.headAtCreate = await readHeadSha(projectDir);
    } catch {
      run.headAtCreate = null;
    }
  });
}
