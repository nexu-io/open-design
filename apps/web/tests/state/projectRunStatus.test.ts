import { describe, expect, it } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import {
  displayStatusForSummary,
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

  it('keeps a started run that went back to queued distinct from running', () => {
    // An auto-retry backoff moves a started run back to `queued`; it is still
    // in flight and its indicator is paced differently.
    const statuses = foldRunsToProjectStatuses([
      run({ projectId: 'waiting', status: 'queued', startedAt: 5 }),
      run({ projectId: 'working', status: 'running', startedAt: 5 }),
    ]);

    expect(statuses.get('waiting')).toBe('queued');
    expect(statuses.get('working')).toBe('running');
  });

  it('counts a run that is still preparing from the moment it was created', () => {
    // The daemon lists a sent run as `queued` with no start until it spawns,
    // which took 7–22 s on a slow Windows host; the row must not keep the
    // previous result meanwhile (the chat already says 进行中).
    const statuses = foldRunsToProjectStatuses([
      run({ projectId: 'p1', status: 'succeeded', startedAt: 1, updatedAt: 2 }),
      run({ projectId: 'p1', status: 'queued', startedAt: null, createdAt: 3, updatedAt: 3 }),
      run({ projectId: 'fresh', status: 'queued', startedAt: null }),
    ]);

    expect(statuses.get('p1')).toBe('queued');
    expect(statuses.get('fresh')).toBe('queued');
  });

  it('shows a run that failed while preparing as this conversation\'s result', () => {
    const statuses = foldRunsToProjectStatuses([
      run({ projectId: 'p1', status: 'succeeded', startedAt: 1, updatedAt: 2 }),
      run({ projectId: 'p1', status: 'failed', startedAt: null, createdAt: 3, updatedAt: 4 }),
    ]);

    expect(statuses.get('p1')).toBe('failed');
  });

  it('calls a succeeded run with unfinished declared work succeeded (P0-24)', () => {
    // The run record alone names the outcome: unfinished todos, a failed save
    // or a cut-short reply never turn a delivered run into a needs-attention
    // mark that looks like a failure.
    const statuses = foldRunsToProjectStatuses([
      run({ status: 'succeeded', endedWithUnfinishedWork: true }),
    ]);

    expect(statuses.get('p1')).toBe('succeeded');
  });

  it('lets a pending question outrank a succeeded run that left work unfinished', () => {
    // Before P0-24 such a run read `incomplete`, which the question could not
    // override, so a project waiting on the user showed the failure-like mark.
    const runs = [run({ status: 'succeeded', endedWithUnfinishedWork: true })];

    expect(foldRunsToProjectStatuses(runs, ['p1']).get('p1')).toBe('awaiting_input');
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

  it('follows the conversation that most recently STARTED, not the one that ended last (P0-24 N3)', () => {
    // 报名页 starts at 10:00 and finishes at 10:08; 宣传海报 starts at 10:05
    // and fails at 10:06. The project shows the failure.
    const statuses = foldRunsToProjectStatuses([
      run({ conversationId: 'signup', status: 'succeeded', startedAt: 1000, updatedAt: 1800 }),
      run({ conversationId: 'poster', status: 'failed', startedAt: 1500, updatedAt: 1600 }),
    ]);

    expect(statuses.get('p1')).toBe('failed');
  });

  it('does not spin for an older conversation that is still running (P0-24 N3)', () => {
    const statuses = foldRunsToProjectStatuses([
      run({ conversationId: 'signup', status: 'running', startedAt: 1000, updatedAt: 2000 }),
      run({ conversationId: 'poster', status: 'succeeded', startedAt: 1500, updatedAt: 1600 }),
    ]);

    expect(statuses.get('p1')).toBe('succeeded');
  });

  it('replaces an older failure as soon as any conversation starts a run (P0-24 P3)', () => {
    const statuses = foldRunsToProjectStatuses([
      run({ conversationId: 'signup', status: 'failed', startedAt: 1000, updatedAt: 1100 }),
      run({ conversationId: 'poster', status: 'running', startedAt: 1200, updatedAt: 1200 }),
    ]);

    expect(statuses.get('p1')).toBe('running');
  });

  it('only says awaiting input when the current conversation is the one asking (P0-24 N4)', () => {
    const runs = [
      run({ conversationId: 'signup', status: 'succeeded', startedAt: 1000, updatedAt: 1100 }),
      run({ conversationId: 'poster', status: 'succeeded', startedAt: 1500, updatedAt: 1600 }),
    ];

    expect(foldRunsToProjectStatuses(runs, ['p1'], ['signup']).get('p1')).toBe('succeeded');
    expect(foldRunsToProjectStatuses(runs, ['p1'], ['poster']).get('p1')).toBe('awaiting_input');
    // An older daemon without the per-conversation set: project-wide fallback.
    expect(foldRunsToProjectStatuses(runs, ['p1']).get('p1')).toBe('awaiting_input');
  });

  /*
   * P0-24 N13: OD Next runs one logical task as several physical runs. The daemon
   * marks the finished segment succeeded first and only then starts the next
   * one, which sits `queued` without a start until it spawns. A segment ending
   * is not the turn ending: the sidebar keeps spinning until the final answer.
   */
  const task = (over: Record<string, unknown>) => ({
    taskExecutionId: 'task-1',
    outcome: 'running',
    terminal: false,
    activeRunId: 'plan',
    ...over,
  }) as unknown as ChatRunStatusResponse['strategyTask'];

  it('keeps spinning while the next segment of the same task has not started (P0-24 N13)', () => {
    const runs = [
      run({ id: 'plan', conversationId: 'c', status: 'succeeded', startedAt: 1000, updatedAt: 1100,
        strategyTask: task({ activeRunId: 'plan', nextRunId: 'produce' }) }),
      run({ id: 'produce', conversationId: 'c', status: 'queued', startedAt: null, createdAt: 1090, updatedAt: 1090 }),
    ];
    expect(foldRunsToProjectStatuses(runs).get('p1')).toBe('running');
  });

  it('shows the next segment\'s own result when it ended without ever starting (P0-24 N13)', () => {
    const runs = [
      run({ id: 'plan', conversationId: 'c', status: 'succeeded', startedAt: 1000, updatedAt: 1100,
        strategyTask: task({ activeRunId: 'plan', nextRunId: 'produce' }) }),
      run({ id: 'produce', conversationId: 'c', status: 'failed', startedAt: null, createdAt: 1090, updatedAt: 1200 }),
    ];
    expect(foldRunsToProjectStatuses(runs).get('p1')).toBe('failed');
  });

  it('keeps the segment\'s own result when its successor is not in the feed (P0-24 N13)', () => {
    const runs = [
      run({ id: 'plan', conversationId: 'c', status: 'succeeded', startedAt: 1000, updatedAt: 1100,
        strategyTask: task({ activeRunId: 'plan', nextRunId: 'produce' }) }),
    ];
    expect(foldRunsToProjectStatuses(runs).get('p1')).toBe('succeeded');
  });

  it('does not spin for a task that is waiting on the user rather than on a next run (P0-24 N13)', () => {
    // An unfinished task with no next run is parked on the user's answer.
    const runs = [
      run({ id: 'ask', conversationId: 'c', status: 'succeeded', startedAt: 1000, updatedAt: 1100,
        strategyTask: task({ activeRunId: 'ask' }) }),
    ];
    expect(foldRunsToProjectStatuses(runs, ['p1'], ['c']).get('p1')).toBe('awaiting_input');
  });

  it('does not say awaiting input for a blocked task whose question can no longer be answered (P0-24 N13)', () => {
    const runs = [
      run({ id: 'blocked', conversationId: 'c', status: 'succeeded', startedAt: 1000, updatedAt: 1100,
        strategyTask: task({ activeRunId: 'blocked', outcome: 'blocked', terminal: true }) }),
    ];
    expect(foldRunsToProjectStatuses(runs, ['p1'], ['c']).get('p1')).toBe('succeeded');
    // Without the per-conversation set (older daemon) the same holds.
    expect(foldRunsToProjectStatuses(runs, ['p1']).get('p1')).toBe('succeeded');
  });

  it('falls back to createdAt when the daemon predates startedAt', () => {
    expect(
      foldRunsToProjectStatuses([
        run({ conversationId: 'a', status: 'succeeded', createdAt: 1, updatedAt: 9 }),
        run({ conversationId: 'b', status: 'failed', createdAt: 2, updatedAt: 3 }),
      ]).get('p1'),
    ).toBe('failed');
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

  it('drops the previous notice once a newer run starts (P0-24: 新一轮开始后上一轮的蓝点不再显示)', () => {
    // The status describes the newest-started run only; while it is in flight
    // there is no finished run to acknowledge.
    const summaries = foldRunsToProjectRunSummaries([
      run({ id: 'r1', status: 'succeeded', startedAt: 1, updatedAt: 1 }),
      run({ id: 'r2', status: 'running', startedAt: 2, updatedAt: 2 }),
    ]);

    expect(summaries.get('p1')).toEqual({ status: 'running' });
  });

  it('carries no run identity for a project whose only run is still preparing', () => {
    expect(foldRunsToProjectRunSummaries([run({ id: 'r1', status: 'queued', startedAt: null })]).get('p1')).toEqual({
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

describe('displayStatusForSummary', () => {
  it('draws no mark for a run the user stopped: being stopped is not a failure (P0-24)', () => {
    expect(displayStatusForSummary('p1', { status: 'canceled', latestTerminalRunId: 'r1' }, {})).toBeUndefined();
  });

  it('draws the new-result dot for a run stopped because the client quit, until opened (P0-24 P12)', () => {
    const [summary] = [...foldRunsToProjectRunSummaries([
      run({ id: 'r1', status: 'canceled', cancelOrigin: 'daemon_shutdown', startedAt: 1, updatedAt: 2 }),
    ]).values()];

    expect(summary).toMatchObject({ status: 'canceled', stoppedWhileAway: true, latestTerminalRunId: 'r1' });
    expect(displayStatusForSummary('p1', summary!, {})).toBe('succeeded');
    expect(displayStatusForSummary('p1', summary!, { p1: 'r1' })).toBeUndefined();

    const [userStop] = [...foldRunsToProjectRunSummaries([
      run({ id: 'r2', status: 'canceled', cancelOrigin: 'user_stop', startedAt: 1, updatedAt: 2 }),
    ]).values()];
    expect(displayStatusForSummary('p1', userStop!, {})).toBeUndefined();
  });

  it('keeps drawing a failure until a newer run replaces it, even after it was opened', () => {
    expect(displayStatusForSummary('p1', { status: 'failed', latestTerminalRunId: 'r1' }, { p1: 'r1' })).toBe('failed');
  });

  it('drops an acknowledged completion and keeps an unacknowledged one', () => {
    const summary = { status: 'succeeded' as const, latestTerminalRunId: 'r2' };
    expect(displayStatusForSummary('p1', summary, { p1: 'r2' })).toBeUndefined();
    expect(displayStatusForSummary('p1', summary, { p1: 'r1' })).toBe('succeeded');
  });
});
