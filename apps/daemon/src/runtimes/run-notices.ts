/**
 * Global run notices (P0-24 N10, 推测项 A-06).
 *
 * Every turn that ends on this machine passes through the run registry's
 * terminal hook. This module classifies the ones the user should hear about
 * wherever they are — a question waiting for their reply, a finished reply, a
 * failure — and keeps them in a small in-memory log the desktop client polls
 * (`GET /api/run-notices`, `od run notices`).
 *
 * Deliberately in memory: the product rule is that notices are never replayed
 * after a restart (N10). Each daemon process mints a fresh `epoch`; a client
 * that sees it change resumes from the newest notice without showing any.
 */
import { randomUUID } from 'node:crypto';
import type { RunNotice, RunNoticeKind, RunNoticesResponse } from '@open-design/contracts';
import { runAskedUserQuestion } from './run-artifacts.js';

/** The slice of a run (live object or durable state) the classifier reads. */
export interface RunNoticeSource {
  id?: unknown;
  projectId?: unknown;
  conversationId?: unknown;
  events?: unknown;
  strategyTask?: { terminal?: unknown; nextRunId?: unknown } | null;
}

/**
 * Which notice a terminal run produces, or `null` for none.
 *
 *  · stopped (by the user, by quitting, by a daemon restart) → none;
 *  · failed → `failed`;
 *  · ended on a renderable question form → `awaiting_input` (the same
 *    detection the analytics signal uses);
 *  · an OD Next segment the daemon is about to continue → none — only the
 *    final answer counts (N13 ②). The daemon writes the successor into
 *    `strategyTask.nextRunId` before the source run's terminal transition;
 *  · any other success, including a blocked task → `new_reply` (N13 ③).
 */
export function classifyRunNotice(run: RunNoticeSource, status: string): RunNoticeKind | null {
  if (typeof run.projectId !== 'string' || !run.projectId) return null;
  if (status === 'failed') return 'failed';
  if (status !== 'succeeded') return null;
  const events = Array.isArray(run.events) ? run.events : [];
  if (runAskedUserQuestion(events)) return 'awaiting_input';
  const task = run.strategyTask;
  if (task && task.terminal === false && typeof task.nextRunId === 'string' && task.nextRunId) {
    return null;
  }
  return 'new_reply';
}

export interface RunNoticeLog {
  /** Terminal hook: classify and append. Never throws. */
  record(run: RunNoticeSource, status: string, terminalAt: number): void;
  /** Notices after `after`, oldest first; `filter` decides visibility per notice. */
  read(after: number, filter?: (notice: RunNotice) => boolean | Promise<boolean>): Promise<RunNoticesResponse>;
}

export function createRunNoticeLog(options: {
  /** Display name for the notification title; `null` when the project is gone. */
  projectName: (projectId: string) => string | null;
  /**
   * Runs that ended before this process started are replayed through the
   * terminal hook at startup (durable backfill). They are history, not news.
   */
  startedAt?: number;
  capacity?: number;
}): RunNoticeLog {
  const epoch = randomUUID();
  const startedAt = options.startedAt ?? Date.now();
  const capacity = Math.max(1, options.capacity ?? 200);
  const notices: RunNotice[] = [];
  const seenRunIds = new Set<string>();
  let latestSeq = 0;

  return {
    record(run, status, terminalAt) {
      try {
        if (!Number.isFinite(terminalAt) || terminalAt < startedAt) return;
        const runId = typeof run.id === 'string' ? run.id : '';
        if (!runId || seenRunIds.has(runId)) return;
        const kind = classifyRunNotice(run, status);
        if (!kind) return;
        const projectId = run.projectId as string;
        seenRunIds.add(runId);
        latestSeq += 1;
        notices.push({
          seq: latestSeq,
          runId,
          projectId,
          projectName: safeName(options.projectName, projectId),
          conversationId: typeof run.conversationId === 'string' && run.conversationId
            ? run.conversationId
            : null,
          kind,
          at: terminalAt,
        });
        while (notices.length > capacity) {
          const dropped = notices.shift();
          if (dropped) seenRunIds.delete(dropped.runId);
        }
      } catch (error) {
        console.warn('[run-notices] record failed', error);
      }
    },
    async read(after, filter) {
      const from = Number.isFinite(after) ? after : 0;
      const pending = notices.filter((notice) => notice.seq > from);
      const visible: RunNotice[] = [];
      for (const notice of pending) {
        if (!filter || await filter(notice)) visible.push(notice);
      }
      return { epoch, latestSeq, notices: visible };
    },
  };
}

function safeName(resolve: (projectId: string) => string | null, projectId: string): string | null {
  try {
    const name = resolve(projectId);
    return typeof name === 'string' && name.trim() ? name : null;
  } catch {
    return null;
  }
}

type RunTerminalHook<TRun> = (run: TRun, status: string, terminalAt: number) => void;

/**
 * Run several terminal hooks from the registry's single `onTerminal` seam.
 * Each runs on its own: a notice failure must never cost the AMR terminal
 * report its outbox write, and the reverse.
 */
export function composeRunTerminalHooks<TRun>(
  ...hooks: RunTerminalHook<TRun>[]
): RunTerminalHook<TRun> {
  return (run, status, terminalAt) => {
    for (const hook of hooks) {
      try {
        hook(run, status, terminalAt);
      } catch (error) {
        console.warn('[runs] terminal hook failed', error);
      }
    }
  };
}
