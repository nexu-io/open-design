import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRunCostReport } from '../src/run-cost-report.js';

let runsDir: string;

function writeRun(runId: string, lines: unknown[]): void {
  const dir = path.join(runsDir, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'events.jsonl'),
    lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
    'utf8',
  );
}

function usage(cachedRead: number, output = 0) {
  return {
    event: 'agent',
    data: { type: 'usage', usage: { cached_read_tokens: cachedRead, output_tokens: output } },
    timestamp: 0,
  };
}

beforeEach(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-cost-'));
});

afterEach(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('readRunCostReport', () => {
  it('decomposes a persisted run event log', () => {
    writeRun('r1', [usage(0, 10), usage(1000, 20), usage(1400, 30)]);

    const result = readRunCostReport({ runsDir, runId: 'r1' });

    expect(result.report).not.toBeNull();
    expect(result.report!.steps).toHaveLength(3);
    expect(result.report!.terms.outputTokens).toBe(60);
    expect(result.unavailableReason).toBeUndefined();
  });

  it('reports a missing event log instead of throwing', () => {
    const result = readRunCostReport({ runsDir, runId: 'never-ran' });

    expect(result.report).toBeNull();
    expect(result.unavailableReason).toBe('no-event-log');
  });

  it('distinguishes an empty log from a log with no usage frames', () => {
    writeRun('r2', [{ event: 'agent', data: { type: 'text_delta', delta: 'hi' } }]);

    const result = readRunCostReport({ runsDir, runId: 'r2' });

    expect(result.report).toBeNull();
    expect(result.unavailableReason).toBe('no-usage-frames');
  });

  it('skips unparseable lines rather than failing the whole report', () => {
    const dir = path.join(runsDir, 'r3');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'events.jsonl'),
      ['{ not json', JSON.stringify(usage(500, 5)), ''].join('\n'),
      'utf8',
    );

    const result = readRunCostReport({ runsDir, runId: 'r3' });

    expect(result.report!.steps).toHaveLength(1);
  });

  it('refuses a run id that would escape the runs directory', () => {
    // The run id arrives from an HTTP path param. Joining it blindly would let
    // `../../` read an events.jsonl anywhere the daemon can reach.
    const result = readRunCostReport({ runsDir, runId: '../../etc' });

    expect(result.report).toBeNull();
    expect(result.unavailableReason).toBe('no-event-log');
  });

  it('honours a caller-supplied rate card', () => {
    writeRun('r4', [usage(0, 1_000_000)]);

    const result = readRunCostReport({
      runsDir,
      runId: 'r4',
      rates: { inputPerMTok: 1, cachedReadPerMTok: 1, cacheWritePerMTok: 1, outputPerMTok: 2 },
    });

    expect(result.report!.usd.output).toBeCloseTo(2, 6);
  });
});
