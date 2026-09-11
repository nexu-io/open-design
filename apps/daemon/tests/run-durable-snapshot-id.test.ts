// A daemon restart (including the `.12 → .13` app update) must not erase the
// snapshot a succeeded OD Next source Run was locked to. `appliedPluginSnapshotId`
// has to round-trip through the durable `<runsLogDir>/<runId>/state.json`, or
// the clarification continuation guard rejects a source Run that its task
// record still correctly pins.

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createChatRunService } from '../src/runtimes/runs.js';

function makeRunService(runsLogDir: string) {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
    // runs.ts is `@ts-nocheck`, so its option type for runsLogDir collapses
    // to the `null` default instead of `string | null`.
    runsLogDir: runsLogDir as any,
  });
}

describe('durable run state keeps appliedPluginSnapshotId across a restart', () => {
  it('serializes and restores appliedPluginSnapshotId through state.json', () => {
    const runsLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-run-durable-snapshot-'));
    try {
      const runs = makeRunService(runsLogDir);
      const run = runs.create({
        projectId: 'p-durable-snapshot',
        conversationId: 'c-durable-snapshot',
        appliedPluginSnapshotId: 'snapshot-durable-1',
      });
      run.status = 'succeeded';
      runs.persistState(run);

      const state = JSON.parse(
        fs.readFileSync(path.join(runsLogDir, run.id, 'state.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(state.appliedPluginSnapshotId).toBe('snapshot-durable-1');

      // Fresh service over the same runsLogDir simulates the post-restart
      // daemon: the run only exists on disk until get() hydrates it.
      const restored = makeRunService(runsLogDir).get(run.id);
      expect(restored?.appliedPluginSnapshotId).toBe('snapshot-durable-1');
    } finally {
      fs.rmSync(runsLogDir, { recursive: true, force: true });
    }
  });
});
