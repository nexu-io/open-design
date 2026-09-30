import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createChatRunService } from '../../src/runtimes/runs.js';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function service(directory: string) {
  return createChatRunService({
    runsLogDir: directory as unknown as null,
    createSseResponse: () => ({ send: () => true, end() {}, cleanup() {} }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
  });
}
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'od-media-recovery-'));
  directories.push(directory);
  const runs = service(directory);
  const run = runs.create({ projectId: 'project', conversationId: 'conversation' });
  runs.noteMediaTaskFailure(run.id, {
    taskId: 'failed', output: 'hero.png', surface: 'image', failedAt: 100,
    error: { message: 'provider error' },
  });
  return { directory, runs, run };
}
const replacement = { taskId: 'replacement', output: 'hero.png', surface: 'image', startedAt: 101, completedAt: 110 };

describe('same-run media recovery evidence', () => {
  it('persists both the recovery and original failure across restart', () => {
    const { directory, runs, run } = fixture();
    expect(runs.noteMediaTaskRecovery(run.id, replacement)).toBe(true);
    runs.finish(run, 'succeeded', 0, null);
    const restored = service(directory).get(run.id);
    expect(restored.endedWithUnfinishedWork).toBe(false);
    expect(restored.mediaTaskFailures).toEqual([expect.objectContaining({
      taskId: 'failed', error: { message: 'provider error' }, recoveredByTaskId: 'replacement', recoveredAt: 110,
    })]);
  });

  it.each([
    { output: 'other.png' },
    { surface: 'video' },
    { startedAt: 99 },
    { output: undefined },
  ])('does not accept unrelated or older success: %j', (change) => {
    const { runs, run } = fixture();
    expect(runs.noteMediaTaskRecovery(run.id, { ...replacement, ...change })).toBe(false);
    runs.finish(run, 'succeeded', 0, null);
    expect(run.endedWithUnfinishedWork).toBe(true);
  });

  it('cannot recover a different run or a legacy failure without a target', () => {
    const { runs, run } = fixture();
    const other = runs.create({ projectId: 'project', conversationId: 'conversation' });
    expect(runs.noteMediaTaskRecovery(other.id, replacement)).toBe(false);
    runs.noteMediaTaskFailure(run.id, { taskId: 'legacy', surface: 'image', failedAt: 100, error: { message: 'old' } });
    runs.noteMediaTaskRecovery(run.id, replacement);
    runs.finish(run, 'succeeded', 0, null);
    expect(run.endedWithUnfinishedWork).toBe(true);
  });
});
