// Glue between the chat-run service's finish() hook and the history
// substrate's recordRevisionForRun.
//
// Fires at the end of every chat run. Records a `project_revisions`
// row when the working tree is dirty, attributing the commit to the
// run's resolved Identity. Errors propagate as logged warnings — the
// auto-commit is best-effort and must not affect the run's reported
// terminal status.

import path from 'node:path';
import type Database from 'better-sqlite3';

import { isHistoryEnabled } from './feature-flag.js';
import { projectRepoPath, recordRevisionForRun } from './repo.js';
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
}

type RunFinishedStatus = 'succeeded' | 'failed' | 'canceled';

/**
 * Service surface the hook needs to register itself. Subset of the
 * full createChatRunService return shape — typed here for clarity.
 */
export interface RunServiceForHook {
  setRunFinishedHook(hook: ((run: RunFinishedRun, status: RunFinishedStatus) => unknown) | null): void;
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

/**
 * Build a sensible commit message from the user prompt that triggered
 * the run. Takes the first non-empty line of the prompt and clamps it
 * to a single-line subject. Falls back to `DEFAULT_COMMIT_MESSAGE` when
 * there's no prompt (e.g., orbit runs that came through without a
 * `message` field).
 */
function buildCommitMessage(rawPrompt: string | null | undefined): string {
  if (!rawPrompt) return DEFAULT_COMMIT_MESSAGE;
  const firstLine = rawPrompt.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
  if (!firstLine) return DEFAULT_COMMIT_MESSAGE;
  // Conventional subject-line clamp; readable in `git log --oneline`
  // and any History pane that truncates beyond ~72 chars.
  return firstLine.length > 72 ? `${firstLine.slice(0, 71)}…` : firstLine;
}

/**
 * Install the post-finish hook that records a revision when the
 * working tree has uncommitted changes at run end. No-op when the
 * feature flag is off. No-op when the run has no projectId (some
 * runs aren't project-scoped). No-op when the run has no resolved
 * Identity (defensive — shouldn't happen after P0.2 wired it, but
 * skipping is safer than committing with a null author).
 */
export function installHistoryRunFinishedHook(args: InstallHistoryRunFinishedHookArgs): void {
  const { db, projectsRoot, reposRoot, runs, env = process.env } = args;

  runs.setRunFinishedHook(async (run, _status) => {
    if (!isHistoryEnabled(env)) return;
    if (!run.projectId) return;
    if (!run.identity) return;

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
      });

      if (result.kind === 'recorded') {
        // Quiet success path — visible enough in DEBUG logs without
        // adding noise to normal operation.
        if (process.env.DEBUG?.includes('history')) {
          console.log(
            `[history] recorded revision ${result.revisionId.slice(0, 8)} for run ${run.id} (${result.filesChanged} files, +${result.bytesAdded}/-${result.bytesRemoved} lines)`,
          );
        }
      } else if (result.kind === 'marker') {
        // Provenance preserved despite a sibling concurrent run
        // absorbing our changes. Logged at info level (not debug)
        // so concurrent-run absorption is observable in normal logs
        // — it's rare enough not to be noisy and useful to surface
        // when troubleshooting "why doesn't my run appear in
        // history with its own commit?"
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
