import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { listIterationsForRun, recordIteration } from '../src/plugins/pipeline.js';

describe('pipeline iteration history ordering', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE run_devloop_iterations (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, stage_id TEXT NOT NULL,
      iteration INTEGER NOT NULL, artifact_diff_summary TEXT, critique_summary TEXT,
      tokens_used INTEGER, ended_at INTEGER NOT NULL
    )`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  function record(stageId: string, iteration: number, endedAt: number, runId = 'run-1') {
    vi.spyOn(Date, 'now').mockReturnValue(endedAt);
    recordIteration(db, {
      runId, stageId, iteration,
      artifactDiffSummary: null, critiqueSummary: null, tokensUsed: null,
    });
  }

  function history(runId = 'run-1') {
    return listIterationsForRun(db, runId).map((row) => `${row.stageId}:${row.iteration}`);
  }

  it('keeps all completed iterations of an earlier stage before the next stage', () => {
    record('draft', 1, 100);
    record('draft', 2, 200);
    record('review', 1, 300);
    record('review', 2, 400);
    record('publish', 1, 500);

    assert.deepEqual(history(), ['draft:1', 'draft:2', 'review:1', 'review:2', 'publish:1']);
  });

  it('preserves recording order when several stages finish in the same millisecond', () => {
    record('draft', 1, 100);
    record('draft', 2, 100);
    record('review', 1, 100);

    assert.deepEqual(history(), ['draft:1', 'draft:2', 'review:1']);
  });

  it('orders by completion time while keeping runs isolated', () => {
    record('draft', 2, 200);
    record('other', 1, 50, 'another-run');
    record('draft', 1, 100);

    assert.deepEqual(history(), ['draft:1', 'draft:2']);
    assert.deepEqual(history('another-run'), ['other:1']);
  });
});
