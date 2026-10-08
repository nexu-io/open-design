import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { afterEach, describe, expect, it } from 'vitest';

import { createChatRunService } from '../src/runtimes/runs.js';

let directory: string | undefined;
afterEach(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function newService(root: string) {
  return createChatRunService({
    createSseResponse: () => ({ send: () => true, end() {}, cleanup() {} }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    // The existing JS-inferred service option defaults to null.
    runsLogDir: path.join(root, 'runs') as unknown as null,
  });
}

describe('explicit snapshot identity survives another durable-service restart', () => {
  it.each([
    { name: 'null', value: null },
    { name: 'empty string', value: '' },
    { name: 'malformed explicit object', value: { invalid: true } },
  ])('does not turn $name into an absent legacy field after persistence', async ({ value }) => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'od-snapshot-presence-'));
    const warm = newService(directory);
    const run = warm.create({ projectId: 'snapshot-presence-project', agentId: 'codex' });
    warm.emit(run, 'agent', { type: 'text_delta', delta: 'Completed fixture.' });
    const log = run.eventsLogStream;
    if (!log) throw new Error('The real event journal was not opened');
    const flushed = finished(log);
    warm.finish(run, 'succeeded', 0, null);
    await flushed;

    const statePath = path.join(directory, 'runs', run.id, 'state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    // Preserve the otherwise production-written record; only the explicit
    // malformed identity is the controlled fixture input under test.
    state.appliedPluginSnapshotId = value;
    fs.writeFileSync(statePath, JSON.stringify(state));
    const firstCold = newService(directory);
    const hydrated = firstCold.get(run.id);
    if (!hydrated) throw new Error('First cold hydration lost the real run');
    firstCold.persistState(hydrated);

    const persisted = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    expect(Object.hasOwn(persisted, 'appliedPluginSnapshotId')).toBe(true);
    expect(persisted.appliedPluginSnapshotId).toEqual(value);
    const secondCold = newService(directory);
    const restored = secondCold.get(run.id);
    expect(restored).toMatchObject({ status: 'succeeded', exitCode: 0 });
    expect(Object.hasOwn(restored!, 'appliedPluginSnapshotId')).toBe(true);
    expect(restored!.appliedPluginSnapshotId).toEqual(value);
    expect(secondCold.statusBody(restored!)).toMatchObject({
      status: 'succeeded', appliedPluginSnapshotId: null,
    });
  });
});
