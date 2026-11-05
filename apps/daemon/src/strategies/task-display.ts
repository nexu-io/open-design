import type Database from 'better-sqlite3';
import { eventsHaveAuthenticatedDoneConclusion, type TaskDisplayProjection, type StrategySettlementFactsV2 } from '@open-design/contracts';
import type { StrategyTaskExecutionRecord } from './task-store.js';
import { getMessage } from '../db.js';

type Span = { start: number; end?: number; attempt: number };
type Timing = { spans: Span[]; status: string; done?: boolean; settledAt?: number; handoffEndedAt?: number };
type Row = { taskId: string; runId: string; timing: string | null; outcome: string;
  facts: string | null; reason: string | null; revision: number; runIndex: number };

function readTiming(value: string | null): Timing | null {
  if (!value) return null;
  try {
    const timing = JSON.parse(value) as Timing;
    if (!Array.isArray(timing.spans) || typeof timing.status !== 'string'
      || (timing.settledAt !== undefined && (!Number.isFinite(timing.settledAt) || timing.settledAt < 0))) return null;
    if (timing.handoffEndedAt !== undefined && (!Number.isFinite(timing.handoffEndedAt) || timing.handoffEndedAt < 0)) return null;
    if (timing.spans.some(s => !Number.isFinite(s.start) || s.start < 0
      || !Number.isSafeInteger(s.attempt) || s.attempt < 0
      || (s.end !== undefined && (!Number.isFinite(s.end) || s.end < s.start)))) return null;
    return timing;
  } catch { return null; }
}

/** Persist actual lifecycle instants; queued message timestamps keep their original meaning. */
export function recordStrategyTaskRunLifecycle(db: Database.Database, input: {
  runId: string; phase: 'prepare' | 'start' | 'end'; at: number; status: string; attempt?: number; authenticatedDoneConclusion?: boolean;
}): void {
  if (!Number.isFinite(input.at) || input.at < 0) return;
  let row: { taskId: string; timing: string | null } | undefined;
  try {
    row = db.prepare('SELECT task_execution_id AS taskId, display_timing_json AS timing FROM strategy_task_runs WHERE run_id=?')
      .get(input.runId) as typeof row;
  } catch (error) {
    // Startup reconciliation also supports databases predating strategy tasks.
    if (error instanceof Error && error.message.includes('no such table: strategy_task_runs')) return;
    throw error;
  }
  if (!row) return;
  const timing = readTiming(row.timing) ?? { spans: [], status: input.status };
  const attempt = input.attempt ?? 0;
  const span = timing.spans.find(s => s.attempt === attempt);
  if (input.phase === 'start') {
    if (!span) timing.spans.push({ start: input.at, attempt });
  } else if (input.phase === 'end' && span && input.at >= span.start) {
    span.end = input.at;
  }
  timing.status = input.status;
  if (input.phase === 'end') {
    timing.settledAt = input.at;
    if (attempt === 0 && !span) timing.handoffEndedAt = input.at;
    if (input.authenticatedDoneConclusion !== undefined) timing.done = input.authenticatedDoneConclusion;
  } else {
    delete timing.settledAt;
    timing.done = false;
  }
  const encoded = JSON.stringify(timing);
  if (encoded === row.timing) return;
  db.transaction(() => {
    db.prepare('UPDATE strategy_task_runs SET display_timing_json=? WHERE run_id=?').run(encoded, input.runId);
    db.prepare('UPDATE strategy_task_executions SET revision=revision+1 WHERE task_execution_id=?').run(row.taskId);
  })();
}

/** One projection for status polling, SSE and historical message reads. */
export function projectTaskDisplay(db: Database.Database, task: StrategyTaskExecutionRecord, now = Date.now()): TaskDisplayProjection {
  const id = task.taskExecutionId;
  const rows = db.prepare(`SELECT t.task_execution_id AS taskId, t.revision,
      t.outcome, r.run_id AS runId, r.task_run_index AS runIndex,
      r.display_timing_json AS timing, r.settlement_reason AS reason, r.settlement_facts_json AS facts
    FROM strategy_task_executions t JOIN strategy_task_runs r ON r.task_execution_id=t.task_execution_id
    WHERE t.project_id=? AND t.conversation_id=? AND t.task_execution_id=?
    ORDER BY t.created_at, t.rowid, r.task_run_index`)
    .all(task.projectId, task.conversationId, id) as Row[];
  const latest = rows.at(-1)!;
  const latestTiming = readTiming(latest.timing);
  let facts: StrategySettlementFactsV2 = {};
  try { facts = JSON.parse(latest.facts ?? '{}'); } catch { /* legacy: retain known status */ }
  const physical = latestTiming?.status ?? facts.physicalStatus;
  let done = latestTiming?.done === true;
  if (latestTiming?.done === undefined && physical === 'succeeded' && facts.todoUnfinished) {
    const messageRow = db.prepare("SELECT id FROM messages WHERE run_id=? AND conversation_id=? AND role='assistant' ORDER BY position DESC LIMIT 1")
      .get(latest.runId, task.conversationId) as { id: string } | undefined;
    if (messageRow) done = eventsHaveAuthenticatedDoneConclusion(getMessage(db, messageRow.id, task.conversationId)?.events);
  }
  const automaticQueue = latest.outcome === 'running' && latest.runIndex > 0 && !latestTiming;
  let state: TaskDisplayProjection['state'];
  if (physical === 'running' || automaticQueue) state = 'running';
  else if (physical === 'queued') state = 'preparing';
  else if (latest.outcome === 'running' && !latestTiming) state = 'preparing';
  else if (physical === 'failed') state = 'failed';
  else if (physical === 'canceled' || latest.outcome === 'canceled') state = 'canceled';
  else if (latest.reason === 'question' || facts.askedUserQuestion) state = 'waiting';
  else if (facts.todoUnfinished && !done) state = 'incomplete';
  else state = latest.outcome === 'running' ? 'preparing' : 'completed';

  let trusted = true;
  let began = false;
  let elapsed = 0;
  const segments: Array<{ start: number; end: number | null; taskId: string }> = [];
  for (const [index, row] of rows.entries()) {
    const timing = readTiming(row.timing);
    if (!timing) {
      if (index === rows.length - 1 && row.outcome === 'running') {
        if (automaticQueue && segments.at(-1)?.taskId === row.taskId) segments.at(-1)!.end = null;
      } else trusted = false;
      continue;
    }
    // An automatic successor can fail before execution starts. Its handoff
    // still belongs to the active task and ends at the host's terminal instant.
    if (row.runIndex > 0 && segments.at(-1)?.taskId === row.taskId
      && timing.handoffEndedAt != null) segments.at(-1)!.end = timing.handoffEndedAt;
    for (const span of timing.spans) {
      began = true;
      const prior = segments.at(-1);
      if (prior && prior.taskId === row.taskId && span.attempt === 0) {
        prior.end = span.end ?? null;
      } else segments.push({ start: span.start, end: span.end ?? null, taskId: row.taskId });
    }
  }
  for (const segment of segments) elapsed += Math.max(0, (segment.end ?? now) - segment.start);
  const versions = new Map(rows.map(row => [row.taskId, row.revision]));
  return { id, currentRunId: latest.runId, runIds: rows.map(row => row.runId),
    revision: versions.size + [...versions.values()].reduce((sum, v) => sum + v, 0),
    state, elapsedMs: trusted && began ? elapsed : null, observedAt: now,
    ticking: state === 'running' && segments.at(-1)?.end === null };
}
