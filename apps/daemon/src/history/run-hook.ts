// Glue between the chat-run service's finish() hook and
// recordRevisionForRun. Records a `project_revisions` row when the
// working tree is dirty at run end. Errors are logged warnings —
// auto-commit is best-effort and must not affect the run's status.

import path from 'node:path';
import type Database from 'better-sqlite3';

import { isHistoryEnabled } from './feature-flag.js';
import { projectRepoPath, readHeadSha, recordRevisionForRun } from './repo.js';
import { ensureProject, isSafeId } from '../projects.js';
import { getProject } from '../db.js';
import type { Identity } from '../identity/types.js';

const DEFAULT_COMMIT_MESSAGE = 'Agent run';

/**
 * Shape the chat-run service hands to the run-finished hook. Defined
 * here because runs.ts is `@ts-nocheck`; consumers that need the
 * type import from this module.
 */
export type HistoryStatus =
  | 'pending'
  | 'recorded'
  | 'marker'
  | 'clean'
  | 'not-initialized'
  | 'failed';

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
  // Mutable: the hook sets these as it runs. Surfaced in statusBody so
  // a successful run with a failed history write is visible — the hook
  // fires fire-and-forget AFTER terminal broadcast, so console.warn
  // alone would be silently swallowed for /api/runs and /wait consumers.
  historyStatus: HistoryStatus | null;
  historyError: string | null;
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
  /** Emit an arbitrary event into the run's SSE buffer. Used by the hook
   *  to surface `history-completed` after terminal broadcast. */
  emit(run: { id: string; events: unknown[]; clients: Set<unknown>; nextEventId: number }, event: string, data: unknown): unknown;
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

    run.historyStatus = 'pending';
    run.historyError = null;

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

      run.historyStatus = result.kind;
      runs.emit(run as never, 'history-completed', {
        status: result.kind,
        revisionId: 'revisionId' in result ? result.revisionId : null,
        absorbedIntoRevisionId:
          result.kind === 'marker' ? result.absorbedIntoRevisionId : null,
      });

      if (result.kind === 'recorded') {
        if (process.env.DEBUG?.includes('history')) {
          console.log(
            `[history] recorded revision ${result.revisionId.slice(0, 8)} for run ${run.id} (${result.filesChanged} files, +${result.bytesAdded}/-${result.bytesRemoved} lines)`,
          );
        }
      } else if (result.kind === 'marker') {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.historyStatus = 'failed';
      run.historyError = message;
      runs.emit(run as never, 'history-completed', { status: 'failed', error: message });
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
  const { db, projectsRoot, runs, env = process.env } = args;

  runs.setRunCreatedHook(async (run) => {
    if (!isHistoryEnabled(env)) return;
    if (!run.projectId) return;
    if (!isSafeId(run.projectId)) return;
    try {
      const projectRow = getProject(db, run.projectId);
      if (!projectRow) return;
      const metadata = projectRow.metadata ?? null;
      // Linked-folder projects: don't init substrate over user's tree.
      // headAtCreate stays null; marker check falls back to lock-entry
      // baseline (which is also null in that case — these projects don't
      // have a daemon-owned gitdir at all).
      if (metadata && typeof metadata === 'object' && metadata.baseDir) return;
      // Force substrate init BEFORE reading HEAD so concurrent runs
      // against a fresh project share the same M0 baseline. Without
      // this, both runs read null and the marker can't fire for the
      // sibling-absorbed loser. ensureProject is idempotent — concurrent
      // calls serialize on withProjectLock inside initProjectHistory.
      await ensureProject(projectsRoot, run.projectId, metadata);
      const projectDir = path.join(projectsRoot, run.projectId);
      run.headAtCreate = await readHeadSha(projectDir);
    } catch {
      run.headAtCreate = null;
    }
  });
}
