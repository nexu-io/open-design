/**
 * Conformance history persistence (Phase 16). Pins the read-merge-write
 * shape the nightly cron and the /api/critique/conformance route share:
 * one JSON-line per adapter per day, with malformed lines silently
 * dropped and the last entry per (adapter, date) winning so a
 * retry-after-failure cron writes the right answer.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendConformanceDay,
  conformanceHistoryDir,
  readConformanceHistory,
} from '../src/critique/conformance-history.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'od-conformance-history-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const NOW = new Date('2026-05-13T12:00:00Z');

function isoDay(offsetDays: number): string {
  const d = new Date(NOW.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe('conformance-history persistence (Phase 16)', () => {
  it('returns an empty array when the directory does not exist yet', async () => {
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toEqual([]);
  });

  it('round-trips a single row through append + read', async () => {
    await appendConformanceDay(tmp, {
      date: isoDay(0),
      adapter: 'mock',
      shippedRate: 0.95,
      cleanParseRate: 0.98,
      totalRuns: 100,
    });
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adapter).toBe('mock');
    expect(rows[0]?.shippedRate).toBe(0.95);
  });

  it('keeps the last entry per (adapter, date) so retries win', async () => {
    const today = isoDay(0);
    await appendConformanceDay(tmp, {
      date: today,
      adapter: 'mock',
      shippedRate: 0.50,
      cleanParseRate: 0.60,
      totalRuns: 50,
    });
    // Retry the same day with a better number.
    await appendConformanceDay(tmp, {
      date: today,
      adapter: 'mock',
      shippedRate: 0.95,
      cleanParseRate: 0.98,
      totalRuns: 100,
    });
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.shippedRate).toBe(0.95);
    expect(rows[0]?.totalRuns).toBe(100);
  });

  it('drops malformed lines silently instead of throwing', async () => {
    // Hand-write a file with one valid row and one corrupt line.
    const file = path.join(conformanceHistoryDir(tmp), 'mock', `${isoDay(0)}.jsonl`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const good = JSON.stringify({
      date: isoDay(0),
      adapter: 'mock',
      shippedRate: 0.95,
      cleanParseRate: 0.98,
      totalRuns: 100,
    });
    await fs.writeFile(file, `${good}\nnot valid json{{\n`, 'utf8');
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adapter).toBe('mock');
  });

  it('ignores files outside the rolling window', async () => {
    await appendConformanceDay(tmp, {
      date: isoDay(20),
      adapter: 'mock',
      shippedRate: 0.10,
      cleanParseRate: 0.10,
      totalRuns: 100,
    });
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toEqual([]);
  });

  it('aggregates across adapter directories', async () => {
    await appendConformanceDay(tmp, {
      date: isoDay(0),
      adapter: 'A',
      shippedRate: 0.95,
      cleanParseRate: 0.98,
      totalRuns: 100,
    });
    await appendConformanceDay(tmp, {
      date: isoDay(0),
      adapter: 'B',
      shippedRate: 0.92,
      cleanParseRate: 0.97,
      totalRuns: 50,
    });
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.adapter))).toEqual(new Set(['A', 'B']));
  });

  it('rejects rows with non-finite numeric fields', async () => {
    const file = path.join(conformanceHistoryDir(tmp), 'mock', `${isoDay(0)}.jsonl`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const bad = JSON.stringify({
      date: isoDay(0),
      adapter: 'mock',
      shippedRate: 'oops',
      cleanParseRate: 0.98,
      totalRuns: 100,
    });
    await fs.writeFile(file, `${bad}\n`, 'utf8');
    const rows = await readConformanceHistory(tmp, 14, NOW);
    expect(rows).toEqual([]);
  });
});
