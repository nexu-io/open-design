/**
 * Fold a project's runs down to the one status a UI should show for it.
 *
 * This mirrors the daemon's own composition (`normalizeProjectDisplayStatus` /
 * `composeProjectDisplayStatus` in `apps/daemon/src/server.ts`, which
 * `GET /api/projects` uses) because the web app cannot always read that
 * result: `Project.status` is attached ONLY by the unscoped `GET /api/projects`,
 * and a workspace-scoped session never sees it. Those sessions have to derive
 * the same answer from the runs feed instead — hence this module.
 *
 * Keep the two in step. Where they intentionally differ, it is called out
 * below.
 */
import type { ChatRunStatusResponse, ProjectDisplayStatus } from '@open-design/contracts';
import type { Dict } from '../i18n/types';

/**
 * Localized name per status — the single source for every surface that spells
 * one out. Lives here rather than in a component so the app shell can label a
 * status without importing a whole page module.
 */
export const STATUS_LABEL_KEYS = {
  not_started: 'designs.status.notStarted',
  queued: 'designs.status.queued',
  running: 'designs.status.running',
  awaiting_input: 'designs.status.awaitingInput',
  incomplete: 'designs.status.incomplete',
  succeeded: 'designs.status.succeeded',
  failed: 'designs.status.failed',
  canceled: 'designs.status.canceled',
} as const satisfies Record<ProjectDisplayStatus, keyof Dict>;

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

/** Whether a run has stopped for good, as opposed to queued or in flight. */
export function isTerminalRunStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

/** The newest run per project, split by whether it has finished. */
interface RunFold {
  /** Newest non-terminal run — an in-flight run outranks any history. */
  active?: { status: 'queued' | 'running'; updatedAt: number };
  /** Newest terminal run, already resolved to its display status. */
  terminal?: { status: ProjectDisplayStatus; updatedAt: number; runId: string };
}

/**
 * What a finished run should be called.
 *
 * A `succeeded` run that ended with unfinished declared work must not read as
 * plain "done" — that is the exact lie #1247 / #1060 reported. The daemon draws
 * the same distinction in `projectDisplayStatusForRunRow`. Exported so the one
 * other surface that groups runs by outcome (the desktop pet's task centre)
 * applies the identical rule instead of restating it.
 */
export function terminalRunDisplayStatus(
  run: ChatRunStatusResponse,
): 'succeeded' | 'incomplete' | 'failed' | 'canceled' {
  if (run.status === 'succeeded' && run.endedWithUnfinishedWork) return 'incomplete';
  return run.status as 'succeeded' | 'failed' | 'canceled';
}

/**
 * A project's folded status plus the identity of the finished run behind it.
 *
 * The run id is what lets a consumer acknowledge a notice PER RUN rather than
 * per project: "the user has seen that r1 finished" stays true after r2
 * finishes, and r2 is a new notice. A project-keyed acknowledgement cannot tell
 * the two apart once the running phase in between goes unobserved.
 */
export interface ProjectRunSummary {
  status: ProjectDisplayStatus;
  /** The newest terminal run, when the project has one. */
  latestTerminalRunId?: string;
  latestTerminalUpdatedAt?: number;
}

/**
 * `Map<projectId, ProjectRunSummary>` for every project the runs cover.
 *
 * `awaitingInputProjectIds` comes from the same `/api/runs` response and is
 * what lets a blocked project be told apart from a finished one; the run that
 * asked the question reports `succeeded` and exits. Pass an empty list when the
 * daemon is too old to send it — the result then simply never says
 * `awaiting_input`, which is the pre-existing behaviour, not a regression.
 */
export function foldRunsToProjectRunSummaries(
  runs: ChatRunStatusResponse[],
  awaitingInputProjectIds: readonly string[] = [],
): Map<string, ProjectRunSummary> {
  const folds = new Map<string, RunFold>();

  for (const run of runs) {
    if (!run.projectId) continue;
    const fold = folds.get(run.projectId) ?? {};
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      if (!fold.terminal || run.updatedAt > fold.terminal.updatedAt) {
        fold.terminal = {
          status: terminalRunDisplayStatus(run),
          updatedAt: run.updatedAt,
          runId: run.id,
        };
      }
      // Deliberate divergence from the daemon: `normalizeProjectDisplayStatus`
      // folds `queued` into `running`, because its consumers only ever needed
      // "is it working". `queued` is kept distinct here so a caller can pace
      // its indicator differently (a queued project has not started yet). Both
      // still mean the same thing to anyone who only checks for `running`, and
      // nothing downstream may colour them apart.
    } else if (run.status === 'queued' || run.status === 'running') {
      if (!fold.active || run.updatedAt > fold.active.updatedAt) {
        fold.active = { status: run.status, updatedAt: run.updatedAt };
      }
    }
    folds.set(run.projectId, fold);
  }

  const awaitingInput = new Set(awaitingInputProjectIds);
  const summaries = new Map<string, ProjectRunSummary>();
  for (const [projectId, fold] of folds) {
    // An in-flight run outranks history, matching the daemon's
    // `activeRunStatuses ?? latestRunStatuses` precedence.
    const base = fold.active?.status ?? fold.terminal?.status ?? 'not_started';
    // Only `succeeded` is superseded by a pending question — a failed or
    // canceled run leaves nothing to answer. Same narrow rule as
    // `composeProjectDisplayStatus`.
    const status = base === 'succeeded' && awaitingInput.has(projectId) ? 'awaiting_input' : base;
    // The terminal run is reported even while a newer run is in flight: it is
    // still the newest FINISHED run, which is what an acknowledgement names.
    summaries.set(projectId, {
      status,
      ...(fold.terminal
        ? {
            latestTerminalRunId: fold.terminal.runId,
            latestTerminalUpdatedAt: fold.terminal.updatedAt,
          }
        : {}),
    });
  }
  return summaries;
}

/**
 * `Map<projectId, ProjectDisplayStatus>` for every project the runs cover —
 * the status half of {@link foldRunsToProjectRunSummaries}, for consumers that
 * only draw a glyph and never acknowledge anything.
 */
export function foldRunsToProjectStatuses(
  runs: ChatRunStatusResponse[],
  awaitingInputProjectIds: readonly string[] = [],
): Map<string, ProjectDisplayStatus> {
  const statuses = new Map<string, ProjectDisplayStatus>();
  for (const [projectId, summary] of foldRunsToProjectRunSummaries(runs, awaitingInputProjectIds)) {
    statuses.set(projectId, summary.status);
  }
  return statuses;
}
