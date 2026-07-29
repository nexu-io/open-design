/**
 * Disk side of the run cost report: turn a persisted `events.jsonl` into the
 * pure decomposition from `@open-design/contracts`.
 *
 * The arithmetic deliberately lives in contracts so the daemon, the CLI, and
 * the web panel all read the same numbers. This module owns only the I/O and
 * the path safety around it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeRunCost,
  type RunCostRates,
  type RunCostResponse,
} from '@open-design/contracts';

export interface ReadRunCostReportOptions {
  /** Directory holding per-run logs at `<runsDir>/<runId>/events.jsonl`. */
  runsDir: string;
  runId: string;
  /** Rate card override; defaults to the contract's validated card. */
  rates?: RunCostRates;
}

/**
 * A run id arrives from an HTTP path parameter, so it must not be able to
 * steer the join outside `runsDir`. Ids the daemon mints are UUIDs; anything
 * carrying a separator or a parent-directory hop is rejected outright rather
 * than normalized, so there is no "clever" path left to reason about.
 */
function isSafeRunId(runId: string): boolean {
  if (!runId || runId.length > 128) return false;
  if (runId === '.' || runId === '..') return false;
  if (runId.includes('/') || runId.includes('\\') || runId.includes('\0')) return false;
  return path.basename(runId) === runId;
}

/**
 * Read and decompose one run's event log.
 *
 * Never throws for ordinary absence: a run that predates event-log persistence,
 * whose log was pruned, or whose log carries no per-call usage is REPORTED as
 * unavailable with a reason, so a caller can explain the gap instead of
 * rendering an empty panel.
 *
 * `no-usage-frames` deliberately does NOT claim the run made no model call.
 * Per-call usage frames were verified present on `json-event-stream` runs, but
 * a stream family that never emits them would land here identically. Callers
 * must present both causes rather than picking one.
 */
export function readRunCostReport(options: ReadRunCostReportOptions): RunCostResponse {
  const { runsDir, runId, rates } = options;
  const unavailable = (
    reason: NonNullable<RunCostResponse['unavailableReason']>,
  ): RunCostResponse => ({ runId, report: null, unavailableReason: reason });

  if (!isSafeRunId(runId)) return unavailable('no-event-log');

  const eventsPath = path.join(runsDir, runId, 'events.jsonl');
  let raw: string;
  try {
    raw = fs.readFileSync(eventsPath, 'utf8');
  } catch {
    return unavailable('no-event-log');
  }

  // The log is append-only JSONL written across daemon versions and can be
  // truncated mid-line by a crash, so a bad line is skipped rather than
  // failing a report the rest of the file can still support.
  const lines: unknown[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }

  const report = analyzeRunCost(lines, rates ? { rates } : {});
  if (report.steps.length === 0) return unavailable('no-usage-frames');
  return { runId, report };
}
