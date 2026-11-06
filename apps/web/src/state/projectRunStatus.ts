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

/**
 * What a finished run should be called.
 *
 * The run record alone decides it (P0-24): a run that returned its final
 * answer is `succeeded` even when declared todos are unfinished, a file failed
 * to save, or the reply was cut short. `endedWithUnfinishedWork` is therefore
 * deliberately ignored here — reading it as `incomplete` painted a delivered
 * turn with the same mark as a failure. The daemon's `GET /api/projects`
 * (`projectDisplayStatusForRunRow`) still reports `incomplete`; only the
 * project list reads that, and it is out of this change's scope. Exported so
 * the desktop pet's task centre applies the identical rule.
 */
export function terminalRunDisplayStatus(
  run: ChatRunStatusResponse,
): 'succeeded' | 'failed' | 'canceled' {
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
  /** The run the status describes, when it has finished. */
  latestTerminalRunId?: string;
  latestTerminalUpdatedAt?: number;
  /**
   * The run was stopped because the client quit, not by the user's own stop
   * click: the user was not there when it ended, so it is a new result they
   * have not seen (P0-24 P12) and earns the same blue dot as a completion.
   */
  stoppedWhileAway?: boolean;
}

/**
 * When a run began, for picking the project's current conversation.
 *
 * `startedAt` is the first `start` event. A run without one counts from
 * `createdAt`: the daemon keeps no run waiting behind another, so a run it
 * lists as `queued` and unstarted is one the user already sent that is still
 * preparing to spawn — on a slow host that took 7–22 s, and skipping it kept
 * the previous result on the row while the chat already said 进行中. A run that
 * ends during that preparation is this conversation's result too. A message
 * still waiting in the composer's queue has no run at all, so P0-24 N3 ("a
 * queued message counts once it starts") holds without this function. A
 * daemon that predates `startedAt` takes the same `createdAt` path.
 */
function runStartedAt(run: ChatRunStatusResponse): number | null {
  if (typeof run.startedAt === 'number' && Number.isFinite(run.startedAt)) return run.startedAt;
  return Number.isFinite(run.createdAt) ? run.createdAt : null;
}

/**
 * The run that next carries this run's logical task, when the task goes on.
 *
 * P0-24 N13: OD Next runs one logical task as several physical runs. The daemon
 * marks a finished segment succeeded before it starts the next one, which waits
 * `queued` without a start until it spawns — so that segment ending is not the
 * turn ending. Only an explicit next run counts: an unfinished task with no
 * next run is parked on the user (a question), not on the daemon.
 */
function continuationRunId(run: ChatRunStatusResponse): string | null {
  const task = run.strategyTask;
  if (!task || task.terminal || !isTerminalRunStatus(run.status)) return null;
  if (task.nextRunId && task.nextRunId !== run.id) return task.nextRunId;
  if (task.activeRunId && task.activeRunId !== run.id) return task.activeRunId;
  return null;
}

/**
 * The run that speaks for the turn `run` belongs to: `run` itself, or — while
 * its task continues — the successor carrying it, even before that successor
 * has started (it then reads queued/running) or when it ended without ever
 * starting (its own result is the turn's, per N13 ④). A successor missing from
 * the feed leaves `run` in charge, so a stale projection cannot spin forever.
 */
function runSpeakingForTurn(
  run: ChatRunStatusResponse,
  runsById: ReadonlyMap<string, ChatRunStatusResponse>,
): ChatRunStatusResponse {
  let current = run;
  // A task has at most a handful of physical runs; the bound only guards a cycle.
  for (let hop = 0; hop < 8; hop += 1) {
    const nextId = continuationRunId(current);
    const next = nextId ? runsById.get(nextId) : undefined;
    if (!next) return current;
    current = next;
  }
  return current;
}

/**
 * `Map<projectId, ProjectRunSummary>` for every project the runs cover.
 *
 * P0-24 sidebar rule: a project's status follows only the conversation that
 * most recently STARTED executing a run — that run's own outcome, nothing
 * else. Another conversation still running does not make the project spin, an
 * older failure is replaced as soon as any conversation starts a new run, and
 * a question pending in an older conversation does not surface (N3 / N4).
 * The newest-started run is by construction its conversation's latest run.
 * An OD Next segment speaks through the run continuing its task, and a
 * blocked task's locked question is not one the user can answer (N13).
 *
 * `awaitingInputConversationIds` names the conversations holding an
 * unanswered question form. When the daemon predates that set, the
 * project-level `awaitingInputProjectIds` stands in for it (the old,
 * project-wide behaviour) rather than never saying `awaiting_input`.
 *
 * Deliberate divergence from the daemon's `GET /api/projects`, which still
 * composes the most recently ENDED run and a project-wide question: that feed
 * only serves the legacy project list and the CLI, both outside P0-24.
 */
export function foldRunsToProjectRunSummaries(
  runs: ChatRunStatusResponse[],
  awaitingInputProjectIds: readonly string[] = [],
  awaitingInputConversationIds?: readonly string[],
): Map<string, ProjectRunSummary> {
  const current = new Map<string, { run: ChatRunStatusResponse; startedAt: number }>();
  const runsById = new Map(runs.map((run) => [run.id, run]));
  // A task's next segment speaks through the segment it continues (N13), so
  // it never competes for "current" on its own, started or not.
  const successorIds = new Set<string>();
  for (const run of runs) {
    const nextId = continuationRunId(run);
    if (nextId) successorIds.add(nextId);
  }
  for (const run of runs) {
    if (!run.projectId || successorIds.has(run.id)) continue;
    const startedAt = runStartedAt(run);
    if (startedAt === null) continue;
    const held = current.get(run.projectId);
    if (
      !held
      || startedAt > held.startedAt
      || (startedAt === held.startedAt && run.updatedAt > held.run.updatedAt)
    ) {
      current.set(run.projectId, { run, startedAt });
    }
  }

  const awaitingProjects = new Set(awaitingInputProjectIds);
  const awaitingConversations = awaitingInputConversationIds
    ? new Set(awaitingInputConversationIds)
    : null;
  const summaries = new Map<string, ProjectRunSummary>();
  for (const run of runs) {
    // A project whose runs are all still queued has nothing started yet.
    if (run.projectId && !current.has(run.projectId) && !summaries.has(run.projectId)) {
      summaries.set(run.projectId, { status: 'not_started' });
    }
  }
  for (const [projectId, { run: startedRun }] of current) {
    const run = runSpeakingForTurn(startedRun, runsById);
    if (run.status === 'queued' || run.status === 'running') {
      // An auto-retry backoff moves a started run back to `queued`; it is
      // still this conversation's run in flight. A task's next segment waiting
      // to spawn is the same turn still running, not a turn back in the queue.
      summaries.set(projectId, { status: run === startedRun ? run.status : 'running' });
      continue;
    }
    const terminal = terminalRunDisplayStatus(run);
    // A blocked task's question is locked and cannot be answered (N13 ③).
    const asksUser = terminal === 'succeeded' && run.strategyTask?.outcome !== 'blocked' && (
      awaitingConversations
        ? run.conversationId !== null && awaitingConversations.has(run.conversationId)
        : awaitingProjects.has(projectId)
    );
    summaries.set(projectId, {
      status: asksUser ? 'awaiting_input' : terminal,
      latestTerminalRunId: run.id,
      latestTerminalUpdatedAt: run.updatedAt,
      ...(terminal === 'canceled' && run.cancelOrigin === 'daemon_shutdown'
        ? { stoppedWhileAway: true }
        : {}),
    });
  }
  return summaries;
}

/**
 * Which finished run the user has already looked at, per project (per product:
 * 点进去之后对号换回默认 icon).
 *
 * Invariant: a ✓ is acknowledged for ONE specific finished run — the value is
 * that run's id — and a newer finished run is a new notice. Keyed on the run
 * rather than the project so the acknowledgement stays correct even when no
 * surface was polling for the whole of the next run: the newest terminal run's
 * id no longer matches and the ✓ shows again. Only a project whose live status
 * is `succeeded` consults this at all.
 *
 * Persisted so a reload, which re-reads the same runs feed, does not re-raise
 * every ✓ the user has already cleared. The key predates the shared feed (it
 * was the rail's own), and is kept so existing acknowledgements survive.
 */
export type AcknowledgedRuns = Readonly<Record<string, string>>;

export const ACKNOWLEDGED_RUNS_STORAGE_KEY = 'od.entry.railRecentSeenDone';

export function readStoredAcknowledgedRuns(): AcknowledgedRuns {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ACKNOWLEDGED_RUNS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Anything but a plain object of run ids — including a bare list of
    // project ids, which cannot say which run it meant — reads as "nothing
    // acknowledged". The worst case is one ✓ the user has already seen, never a
    // missing one.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const acknowledged: Record<string, string> = {};
    for (const [projectId, runId] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof runId === 'string' && runId) acknowledged[projectId] = runId;
    }
    return acknowledged;
  } catch {
    return {};
  }
}

export function writeStoredAcknowledgedRuns(acknowledged: AcknowledgedRuns): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACKNOWLEDGED_RUNS_STORAGE_KEY, JSON.stringify(acknowledged));
  } catch {
    // Private mode / storage disabled: the ✓ still clears for this session.
  }
}

/**
 * The status a glyph surface should DRAW for a project — the one display
 * mapping every surface (the rail's 最近项目 rows, the workspace tab switcher)
 * applies, so they can never tell different stories about the same project
 * (OPEND-2795).
 *
 * An acknowledged ✓ is DROPPED (`undefined`: the row goes back to its default
 * mark), not drawn quieter. A stopped run is dropped too: being stopped is not
 * a failure (P0-24), and the interrupted badge it used to share with `failed`
 * told users their stop had broken something. Every other status is live and
 * stays: a running, blocked or failed project is not a notice the user can
 * spend.
 *
 * A run stopped while the user was away (the client quit) is the exception:
 * it is a new result the user has not seen, so it draws the completion dot
 * until acknowledged, exactly like a completion (P0-24 P12).
 */
export function displayStatusForSummary(
  projectId: string,
  summary: ProjectRunSummary,
  acknowledged: AcknowledgedRuns,
): ProjectDisplayStatus | undefined {
  if (!summaryIsNotice(summary)) {
    return summary.status === 'canceled' ? undefined : summary.status;
  }
  if (
    summary.latestTerminalRunId !== undefined
    && acknowledged[projectId] === summary.latestTerminalRunId
  ) {
    return undefined;
  }
  return 'succeeded';
}

/**
 * Whether a summary is a "new result" notice — the blue dot that opening the
 * project spends: a completion, or a run stopped while the user was away.
 */
export function summaryIsNotice(summary: ProjectRunSummary): boolean {
  return summary.status === 'succeeded' || (summary.status === 'canceled' && summary.stoppedWhileAway === true);
}

/**
 * `Map<projectId, ProjectDisplayStatus>` for every project the runs cover —
 * the status half of {@link foldRunsToProjectRunSummaries}, for consumers that
 * only draw a glyph and never acknowledge anything.
 */
export function foldRunsToProjectStatuses(
  runs: ChatRunStatusResponse[],
  awaitingInputProjectIds: readonly string[] = [],
  awaitingInputConversationIds?: readonly string[],
): Map<string, ProjectDisplayStatus> {
  const statuses = new Map<string, ProjectDisplayStatus>();
  for (const [projectId, summary] of foldRunsToProjectRunSummaries(
    runs,
    awaitingInputProjectIds,
    awaitingInputConversationIds,
  )) {
    statuses.set(projectId, summary.status);
  }
  return statuses;
}
