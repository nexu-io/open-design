import { describe, expect, it } from 'vitest';
import { mediaTaskSnapshot } from '../../src/runtimes/media-task.js';

const task = {
  id: 'media-1',
  status: 'running',
  startedAt: 100,
  endedAt: null,
  progress: ['queued', 'generating', 'encoding'],
  file: '/tmp/secret-output.png',
  error: 'provider failed',
};

describe('media task snapshot contract', () => {
  it('returns bounded progress deltas and the next cursor', () => {
    expect(mediaTaskSnapshot(task, 1)).toEqual({
      taskId: 'media-1',
      status: 'running',
      startedAt: 100,
      endedAt: null,
      progress: ['generating', 'encoding'],
      nextSince: 3,
    });
  });

  it('exposes the file only for completed tasks and errors only for failures', () => {
    expect(mediaTaskSnapshot({ ...task, status: 'done', endedAt: 200 })).toMatchObject({
      file: '/tmp/secret-output.png',
    });
    expect(mediaTaskSnapshot({ ...task, status: 'failed', endedAt: 200 })).toMatchObject({
      error: 'provider failed',
    });
    expect(mediaTaskSnapshot({ ...task, status: 'interrupted', endedAt: 200 })).toMatchObject({
      error: 'provider failed',
    });
  });
});
