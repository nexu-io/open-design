/**
 * Conformance history persistence (Phase 16).
 *
 * The nightly cron writes one `ConformanceDay` row per adapter per day
 * via `appendConformanceDay`. The `/api/critique/conformance` route
 * reads the rolling N-day window via `readConformanceHistory` and
 * feeds it into the `evaluateRollout` ratchet.
 *
 * Storage shape: append-only JSON-lines under
 * `<dataDir>/conformance/<adapter>/<date>.jsonl`. One file per adapter
 * per day so a corrupted line in one file cannot poison the read for
 * another adapter / another day. JSON-lines (rather than a single JSON
 * blob) so a cron interruption mid-write leaves a recoverable file:
 * the writer always appends complete lines, and the reader drops any
 * line that fails to parse rather than throwing.
 *
 * The path layout is intentionally directory-per-adapter so a future
 * operator action like "purge all history for adapter X" is one `rm
 * -rf`, not a grep + rewrite across a mixed-adapter file.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ConformanceDay } from './ratchet.js';

/**
 * Where conformance history lives, relative to the daemon's `.od` data
 * dir. Wrapped in a function so a future override (env var, test seam)
 * can swap it without rewriting call sites.
 */
export function conformanceHistoryDir(dataDir: string): string {
  return path.join(dataDir, 'conformance');
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function adapterDir(dataDir: string, adapter: string): string {
  return path.join(conformanceHistoryDir(dataDir), adapter);
}

function dayFile(dataDir: string, adapter: string, date: string): string {
  return path.join(adapterDir(dataDir, adapter), `${date}.jsonl`);
}

/**
 * Append one conformance row to the day's file. Idempotent in the
 * weak sense: calling twice for the same `(adapter, date)` appends two
 * rows, and the reader keeps the last entry per (adapter, date) so a
 * retry-after-failure cron produces the right answer. The strong-sense
 * fix (dedupe before appending) is deliberately not v1 scope; it would
 * require a read-modify-write cycle whose cost grows with history
 * size.
 */
export async function appendConformanceDay(
  dataDir: string,
  row: ConformanceDay,
): Promise<void> {
  const dir = adapterDir(dataDir, row.adapter);
  await fs.mkdir(dir, { recursive: true });
  const file = dayFile(dataDir, row.adapter, row.date);
  const line = JSON.stringify(row) + '\n';
  await fs.appendFile(file, line, 'utf8');
}

/**
 * Read every `ConformanceDay` row in the trailing `windowDays` ending
 * today (inclusive). Returns rows from every adapter in arbitrary
 * order; the evaluator aggregates them per day.
 *
 * Missing adapter directories, missing day files, and malformed lines
 * all collapse to "skip this row": a cron that has not run yet for a
 * day is data missing, not data wrong, and the evaluator handles
 * missing days by returning `hold` (insufficient data).
 */
export async function readConformanceHistory(
  dataDir: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<ConformanceDay[]> {
  const root = conformanceHistoryDir(dataDir);
  let adapters: string[];
  try {
    adapters = await fs.readdir(root);
  } catch {
    return [];
  }

  const dates: string[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(isoDay(d));
  }

  const out: ConformanceDay[] = [];
  for (const adapter of adapters) {
    for (const date of dates) {
      let body: string;
      try {
        body = await fs.readFile(dayFile(dataDir, adapter, date), 'utf8');
      } catch {
        continue;
      }
      // Keep the last entry per (adapter, date) so a retry-after-failure
      // cron produces the right answer without a dedupe pass at write
      // time. JSON-lines are read top-down; we overwrite as we go.
      let lastForToday: ConformanceDay | null = null;
      for (const line of body.split('\n')) {
        if (line.length === 0) continue;
        try {
          const candidate = JSON.parse(line) as unknown;
          if (
            candidate
            && typeof candidate === 'object'
            && typeof (candidate as ConformanceDay).date === 'string'
            && typeof (candidate as ConformanceDay).adapter === 'string'
            && Number.isFinite((candidate as ConformanceDay).shippedRate)
            && Number.isFinite((candidate as ConformanceDay).cleanParseRate)
            && Number.isFinite((candidate as ConformanceDay).totalRuns)
          ) {
            lastForToday = candidate as ConformanceDay;
          }
        } catch {
          /* drop malformed lines */
        }
      }
      if (lastForToday !== null) out.push(lastForToday);
    }
  }
  return out;
}
