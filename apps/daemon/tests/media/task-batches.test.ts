import { describe, expect, it } from 'vitest';

import { assignMediaTaskBatches } from '../../src/media/task-batches.js';

interface Fixture {
  id: string;
  runId?: string | undefined;
  surface?: string | undefined;
  startedAt: number;
  endedAt: number | null;
  sequence: number;
}

function task(input: Partial<Fixture> & Pick<Fixture, 'id' | 'sequence'>): Fixture {
  return {
    runId: 'run-1',
    surface: 'image',
    startedAt: 0,
    endedAt: null,
    ...input,
  };
}

describe('media task batches', () => {
  it('groups a parallel fan-out into one batch and numbers it in creation order', () => {
    const batches = assignMediaTaskBatches([
      task({ id: 'a', sequence: 1, startedAt: 1_000, endedAt: 5_000 }),
      task({ id: 'b', sequence: 2, startedAt: 1_000, endedAt: 6_000 }),
      task({ id: 'c', sequence: 3, startedAt: 1_000, endedAt: null }),
    ]);

    expect(batches.get('a')).toEqual({ batchId: 'a', batchIndex: 1, batchSize: 3 });
    expect(batches.get('b')).toEqual({ batchId: 'a', batchIndex: 2, batchSize: 3 });
    expect(batches.get('c')).toEqual({ batchId: 'a', batchIndex: 3, batchSize: 3 });
  });

  it('numbers same-millisecond siblings by creation order, not by input order', () => {
    const batches = assignMediaTaskBatches([
      task({ id: 'second', sequence: 9, startedAt: 1_000, endedAt: null }),
      task({ id: 'first', sequence: 4, startedAt: 1_000, endedAt: null }),
    ]);

    expect(batches.get('first')?.batchIndex).toBe(1);
    expect(batches.get('second')?.batchIndex).toBe(2);
    expect(batches.get('first')?.batchId).toBe('first');
    expect(batches.get('second')?.batchId).toBe('first');
  });

  it('keeps strictly sequential generations as separate single-cell batches', () => {
    const batches = assignMediaTaskBatches([
      task({ id: 'a', sequence: 1, startedAt: 1_000, endedAt: 2_000 }),
      task({ id: 'b', sequence: 2, startedAt: 2_500, endedAt: 3_000 }),
      task({ id: 'c', sequence: 3, startedAt: 3_500, endedAt: null }),
    ]);

    expect(batches.get('a')).toEqual({ batchId: 'a', batchIndex: 1, batchSize: 1 });
    expect(batches.get('b')).toEqual({ batchId: 'b', batchIndex: 1, batchSize: 1 });
    expect(batches.get('c')).toEqual({ batchId: 'c', batchIndex: 1, batchSize: 1 });
  });

  it('re-opens a batch when a later task overlaps a still-running member', () => {
    const batches = assignMediaTaskBatches([
      task({ id: 'a', sequence: 1, startedAt: 1_000, endedAt: 4_000 }),
      task({ id: 'b', sequence: 2, startedAt: 3_000, endedAt: 9_000 }),
      // Starts after `a` ended but while `b` is still running: still the same
      // perceived action, so it must not be split off into its own row.
      task({ id: 'c', sequence: 3, startedAt: 5_000, endedAt: 6_000 }),
      // Starts after every member of the batch ended -> a new action.
      task({ id: 'd', sequence: 4, startedAt: 20_000, endedAt: null }),
    ]);

    expect(batches.get('a')?.batchSize).toBe(3);
    expect(batches.get('c')).toEqual({ batchId: 'a', batchIndex: 3, batchSize: 3 });
    expect(batches.get('d')).toEqual({ batchId: 'd', batchIndex: 1, batchSize: 1 });
  });

  it('never merges tasks across runs or across surfaces', () => {
    const batches = assignMediaTaskBatches([
      task({ id: 'image', sequence: 1, startedAt: 1_000, endedAt: null }),
      task({ id: 'video', sequence: 2, startedAt: 1_000, endedAt: null, surface: 'video' }),
      task({ id: 'other-run', sequence: 3, startedAt: 1_000, endedAt: null, runId: 'run-2' }),
    ]);

    expect(batches.get('image')).toEqual({ batchId: 'image', batchIndex: 1, batchSize: 1 });
    expect(batches.get('video')).toEqual({ batchId: 'video', batchIndex: 1, batchSize: 1 });
    expect(batches.get('other-run')).toEqual({
      batchId: 'other-run',
      batchIndex: 1,
      batchSize: 1,
    });
  });

  it('never merges run-less tasks with each other', () => {
    const batches = assignMediaTaskBatches([
      task({ id: 'a', sequence: 1, startedAt: 1_000, endedAt: null, runId: undefined }),
      task({ id: 'b', sequence: 2, startedAt: 1_000, endedAt: null, runId: undefined }),
    ]);

    expect(batches.get('a')?.batchSize).toBe(1);
    expect(batches.get('b')?.batchSize).toBe(1);
  });

  it('does not shrink a batch once a member has ended', () => {
    const live = assignMediaTaskBatches([
      task({ id: 'a', sequence: 1, startedAt: 1_000, endedAt: null }),
      task({ id: 'b', sequence: 2, startedAt: 2_000, endedAt: null }),
    ]);
    expect(live.get('b')?.batchSize).toBe(2);

    // `a` could only have been running when `b` was created, so any end it
    // reports is at or after `b` started and the batch must survive.
    const settled = assignMediaTaskBatches([
      task({ id: 'a', sequence: 1, startedAt: 1_000, endedAt: 2_400 }),
      task({ id: 'b', sequence: 2, startedAt: 2_000, endedAt: 3_000 }),
    ]);
    expect(settled.get('b')).toEqual({ batchId: 'a', batchIndex: 2, batchSize: 2 });
  });
});
