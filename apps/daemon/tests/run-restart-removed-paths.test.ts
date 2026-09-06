// A resumed run must not report the previous attempt's file removals. The web
// treats `removedPaths` as delivery evidence for a delete-only Design turn
// (#7744), so a value that survives `prepareRestart` would mark the second
// attempt delivered for work the first one did — and would do it precisely
// when the new attempt cannot produce its own value, because the filesystem
// baseline was contended or unavailable and the diff never ran.

import { describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../src/runtimes/runs.js';

function makeRunService() {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

describe('prepareRestart clears the previous attempt s file observations', () => {
  it('drops removedPaths alongside artifactPaths', () => {
    const runs = makeRunService();
    const run = runs.create({ projectId: 'p1', conversationId: 'c1' });
    run.status = 'failed';
    run.artifactCount = 2;
    run.artifactPaths = ['index.html'];
    run.removedPaths = ['scripts/sketch.py'];

    expect(runs.statusBody(run).removedPaths).toEqual(['scripts/sketch.py']);

    expect(runs.prepareRestart(run)).not.toBeNull();

    expect(run.removedPaths).toBeUndefined();
    expect(run.artifactPaths).toBeUndefined();
    expect(run.artifactCount).toBeUndefined();
    // The resumed attempt reports nothing until it observes its own removals,
    // so a status read during the second attempt cannot inherit the first's.
    expect(runs.statusBody(run).removedPaths).toBeUndefined();
    expect(runs.statusBody(run).artifactPaths).toBeUndefined();
  });

  it('reports only what the second attempt observed for itself', () => {
    const runs = makeRunService();
    const run = runs.create({ projectId: 'p1', conversationId: 'c1' });
    run.status = 'failed';
    run.removedPaths = ['first-attempt.txt'];
    runs.prepareRestart(run);

    run.removedPaths = ['second-attempt.txt'];
    expect(runs.statusBody(run).removedPaths).toEqual(['second-attempt.txt']);
  });

  it('leaves a still-active run untouched', () => {
    const runs = makeRunService();
    const run = runs.create({ projectId: 'p1', conversationId: 'c1' });
    run.removedPaths = ['stale.txt'];

    expect(runs.prepareRestart(run)).toBeNull();
    expect(run.removedPaths).toEqual(['stale.txt']);
  });
});
