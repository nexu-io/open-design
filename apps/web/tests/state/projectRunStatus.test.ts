import { describe, expect, it } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import {
  foldRunsToProjectRunSummaries,
  foldRunsToProjectStatuses,
} from '../../src/state/projectRunStatus';

function run(over: Partial<ChatRunStatusResponse> & { status: ChatRunStatusResponse['status'] }) {
  return {
    id: `run-${Math.random()}`,
    projectId: 'p1',
    conversationId: null,
    assistantMessageId: null,
    agentId: 'claude',
    createdAt: 0,
    updatedAt: 1,
    ...over,
  } as ChatRunStatusResponse;
}

describe('foldRunsToProjectStatuses', () => {
  it('reports each terminal outcome under its own name', () => {
    const statuses = foldRunsToProjectStatuses([
      run({ projectId: 'ok', status: 'succeeded' }),
      run({ projectId: 'bad', status: 'failed' }),
      run({ projectId: 'stopped', status: 'canceled' }),
    ]);

    expect(statuses.get('ok')).toBe('succeeded');
    expect(statuses.get('bad')).toBe('failed');
    expect(statuses.get('stopped')).toBe('canceled');
  });

  it('keeps queued distinct from running', () => {
    // The daemon folds queued into running for its own consumers; this one
    // paces its indicator differently, so the distinction has to survive.
    const statuses = foldRunsToProjectStatuses([
      run({ projectId: 'waiting', status: 'queued' }),
      run({ projectId: 'working', status: 'running' }),
    ]);

    expect(statuses.get('waiting')).toBe('queued');
    expect(statuses.get('working')).toBe('running');
  });

  it('calls a succeeded run with unfinished declared work incomplete (#1247 / #1060)', () => {
    const statuses = foldRunsToProjectStatuses([
      run({ status: 'succeeded', endedWithUnfinishedWork: true }),
    ]);

    expect(statuses.get('p1')).toBe('incomplete');
  });

  it('lets a pending question outrank a succeeded run', () => {
    // The run that asked reports `succeeded` and exits, so without the
    // awaiting-input set a blocked project reads as finished.
    const runs = [run({ status: 'succeeded' })];

    expect(foldRunsToProjectStatuses(runs).get('p1')).toBe('succeeded');
    expect(foldRunsToProjectStatuses(runs, ['p1']).get('p1')).toBe('awaiting_input');
  });

  it('does not let a pending question mask a failure', () => {
    // Only `succeeded` is superseded — a failed or canceled run leaves nothing
    // to answer, and hiding the failure behind "needs input" would misdirect.
    expect(foldRunsToProjectStatuses([run({ status: 'failed' })], ['p1']).get('p1')).toBe('failed');
    expect(foldRunsToProjectStatuses([run({ status: 'canceled' })], ['p1']).get('p1')).toBe(
      'canceled',
    );
  });

  it('lets an in-flight run outrank finished history', () => {
    const statuses = foldRunsToProjectStatuses([
      run({ status: 'succeeded', updatedAt: 99 }),
      run({ status: 'running', updatedAt: 1 }),
    ]);

    expect(statuses.get('p1')).toBe('running');
  });

  it('picks the newest run within each of active and terminal', () => {
    expect(
      foldRunsToProjectStatuses([
        run({ status: 'succeeded', updatedAt: 1 }),
        run({ status: 'failed', updatedAt: 2 }),
      ]).get('p1'),
    ).toBe('failed');

    expect(
      foldRunsToProjectStatuses([
        run({ status: 'queued', updatedAt: 2 }),
        run({ status: 'running', updatedAt: 1 }),
      ]).get('p1'),
    ).toBe('queued');
  });

  it('omits projects it was told nothing about', () => {
    // A missing entry means "unknown", which the UI renders as an empty slot.
    // Defaulting to not_started here would assert something unverified.
    const statuses = foldRunsToProjectStatuses([run({ projectId: 'known', status: 'running' })]);

    expect(statuses.has('unknown')).toBe(false);
    expect(foldRunsToProjectStatuses([]).size).toBe(0);
  });

  it('ignores runs with no project', () => {
    expect(foldRunsToProjectStatuses([run({ projectId: null, status: 'running' })]).size).toBe(0);
  });
});

describe('foldRunsToProjectRunSummaries', () => {
  it('names the newest finished run behind the status', () => {
    const summaries = foldRunsToProjectRunSummaries([
      run({ id: 'r1', status: 'succeeded', updatedAt: 1 }),
      run({ id: 'r2', status: 'succeeded', updatedAt: 2 }),
    ]);

    expect(summaries.get('p1')).toEqual({
      status: 'succeeded',
      latestTerminalRunId: 'r2',
      latestTerminalUpdatedAt: 2,
    });
  });

  it('keeps the finished run while a newer run is in flight', () => {
    // The status follows the live run; the acknowledgement still names the
    // run that last finished, which is the notice the user may have seen.
    const summaries = foldRunsToProjectRunSummaries([
      run({ id: 'r1', status: 'succeeded', updatedAt: 1 }),
      run({ id: 'r2', status: 'running', updatedAt: 2 }),
    ]);

    expect(summaries.get('p1')).toEqual({
      status: 'running',
      latestTerminalRunId: 'r1',
      latestTerminalUpdatedAt: 1,
    });
  });

  it('carries no run identity for a project that never finished a run', () => {
    expect(foldRunsToProjectRunSummaries([run({ id: 'r1', status: 'queued' })]).get('p1')).toEqual({
      status: 'queued',
    });
  });

  it('composes awaiting_input the same way the status fold does', () => {
    const runs = [run({ id: 'r1', status: 'succeeded' })];
    expect(foldRunsToProjectRunSummaries(runs, ['p1']).get('p1')?.status).toBe('awaiting_input');
    expect(foldRunsToProjectStatuses(runs, ['p1']).get('p1')).toBe('awaiting_input');
  });

  it('agrees with foldRunsToProjectStatuses on every project', () => {
    const runs = [
      run({ id: 'a', projectId: 'ok', status: 'succeeded' }),
      run({ id: 'b', projectId: 'bad', status: 'failed' }),
      run({ id: 'c', projectId: 'busy', status: 'running' }),
      run({ id: 'd', projectId: 'part', status: 'succeeded', endedWithUnfinishedWork: true }),
    ];
    const statuses = foldRunsToProjectStatuses(runs, ['ok']);
    const summaries = foldRunsToProjectRunSummaries(runs, ['ok']);
    expect([...summaries].map(([id, summary]) => [id, summary.status])).toEqual([...statuses]);
  });
});
