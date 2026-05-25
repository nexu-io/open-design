// Stuck-run watchdog.
//
// Emits `client_run_stuck` when a run that we've seen `run_created` for
// has not progressed within `STUCK_AFTER_MS` (no SSE events, no terminal
// state, no cancellation). This is the web-side proxy for SSE health —
// we don't yet instrument the full stream lifecycle (start / heartbeat /
// disconnect) but the user-visible symptom is invariably "I started a run
// and nothing's happening", so a coarse stuck-after-timeout watchdog
// catches the most common bad outcome.
//
// The watchdog is fired-and-forgotten: callers tell us a run started,
// poke us every time they see progress, and tell us when it terminates.
// Anything else and we emit the stuck event exactly once per run.
//
// Tied directly to issues #2464 / #2405 / #1451 — all reported as "run
// stuck in working state forever". After this lands those reports become
// data instead of GitHub anecdotes.

import { reportSafetyEvent } from '../analytics/error-tracking';

const STUCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes with no progress

interface WatchedRun {
  runId: string;
  startedAt: number;
  lastProgressAt: number;
  timer: ReturnType<typeof setTimeout>;
  emitted: boolean;
  context: Record<string, unknown>;
}

const runs = new Map<string, WatchedRun>();

export function trackRunStart(runId: string, context: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  // Replace any prior entry — a fresh start invalidates the previous
  // watchdog (rare but possible during reconnect storms).
  cancelRun(runId);
  const now = Date.now();
  const entry: WatchedRun = {
    runId,
    startedAt: now,
    lastProgressAt: now,
    timer: scheduleEmit(runId),
    emitted: false,
    context,
  };
  runs.set(runId, entry);
}

export function trackRunProgress(runId: string): void {
  const entry = runs.get(runId);
  if (!entry) return;
  if (entry.emitted) return;
  entry.lastProgressAt = Date.now();
  clearTimeout(entry.timer);
  entry.timer = scheduleEmit(runId);
}

export function trackRunTerminal(runId: string, terminalState: string): void {
  const entry = runs.get(runId);
  if (!entry) return;
  clearTimeout(entry.timer);
  runs.delete(runId);
  // Don't double-emit if we already declared it stuck — the late
  // terminal arrival is still useful to know about, though, so emit a
  // recovery event so the dashboard can pair the two.
  if (entry.emitted) {
    reportSafetyEvent('client_run_unstuck', {
      run_id: runId,
      terminal_state: terminalState,
      total_duration_ms: Date.now() - entry.startedAt,
      ...entry.context,
    });
  }
}

function cancelRun(runId: string): void {
  const existing = runs.get(runId);
  if (!existing) return;
  clearTimeout(existing.timer);
  runs.delete(runId);
}

function scheduleEmit(runId: string): ReturnType<typeof setTimeout> {
  return setTimeout(() => emitStuck(runId), STUCK_AFTER_MS);
}

function emitStuck(runId: string): void {
  const entry = runs.get(runId);
  if (!entry) return;
  if (entry.emitted) return;
  entry.emitted = true;
  reportSafetyEvent('client_run_stuck', {
    run_id: runId,
    duration_since_last_progress_ms: Date.now() - entry.lastProgressAt,
    duration_since_start_ms: Date.now() - entry.startedAt,
    ...entry.context,
  });
}

// Test-only — flush internal state between cases.
export function __resetStuckRunWatchdog(): void {
  for (const entry of runs.values()) {
    clearTimeout(entry.timer);
  }
  runs.clear();
}
