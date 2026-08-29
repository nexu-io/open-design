// The physical-Run analytics lifecycle, driven directly.
//
// The real-server chain test proves the lifecycle is installed for every Run
// of an automatic chain; this one proves what it reports once a Run settles.
// Cancellation is the case that motivated it: a Run the user stopped has to
// land as `cancelled`, not as a missing row, or the cancellation rate is
// computed against a smaller denominator than the truth.

import { describe, expect, it, vi } from 'vitest';

import {
  createRunAnalyticsLifecycle,
  inheritedRunLineageHints,
} from '../../src/services/run-analytics-lifecycle.js';

type Captured = {
  eventName: string;
  properties: Record<string, unknown>;
  insertId: string;
  context: { deviceId: string };
};

function harness() {
  const captured: Captured[] = [];
  const recoveries: Array<{ runId: string; properties: Record<string, unknown>; insertId: string }> = [];
  const completed: string[] = [];
  let settle: (status: { status: string; errorCode?: string | null; exitCode?: number | null }) => void = () => {};
  const terminal = new Promise<{ status: string }>((resolve) => {
    settle = (status) => resolve(status as { status: string });
  });

  const lifecycle = createRunAnalyticsLifecycle({
    db: {} as never,
    design: {
      runs: {
        wait: () => terminal as never,
        setAnalyticsRecovery: (run, recovery) => {
          recoveries.push({
            runId: run.id,
            properties: recovery.properties,
            insertId: recovery.insertId,
          });
        },
        markAnalyticsCompleted: (run) => { completed.push(run.id); },
        setDeliverableValidation: () => {},
      },
      analytics: {
        capture: (args) => { captured.push(args as Captured); },
      },
      getAppVersion: () => '0.0.0-test',
    },
    paths: { PROJECTS_DIR: '/nonexistent/projects', RUNTIME_DATA_DIR: '/nonexistent/data' },
    agents: { detectAgents: async () => [] },
    telemetry: {
      reportRunCompletionTelemetryFallback: () => {},
      resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined },
      runRetryEventsForAnalytics: () => [],
    },
  });

  return { captured, completed, lifecycle, recoveries, settle };
}

function fakeRun(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'run-under-test',
    projectId: null,
    conversationId: null,
    assistantMessageId: null,
    clientRequestId: 'client-request-1',
    agentId: 'codex',
    status: 'running',
    createdAt: now,
    updatedAt: now,
    events: [],
    clients: new Set(),
    ...overrides,
  } as never;
}

const CONTEXT = { deviceId: 'device-1', sessionId: 'session-1', clientType: 'web', locale: 'en' };

async function settled(h: ReturnType<typeof harness>, eventName: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const found = h.captured.find((event) => event.eventName === eventName);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `no ${eventName} captured; saw ${JSON.stringify(h.captured.map((e) => e.eventName))}`,
  );
}

describe('run analytics lifecycle', () => {
  it('reports a created run and pairs its finish under the same insert id', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun(),
      body: { agentId: 'codex' },
      requestAnalyticsContext: CONTEXT as never,
    });

    const created = await settled(h, 'run_created');
    expect(created.context.deviceId).toBe('device-1');
    h.settle({ status: 'succeeded' });

    const finished = await settled(h, 'run_finished');
    expect(finished.properties.result).toBe('success');
    // The replay in `reconcileDurableRunTerminals` appends `-finish` to the
    // stored id, so the stored id must stay the base one.
    expect(finished.insertId).toBe(`${created.insertId}-finish`);
    expect(h.recoveries.at(-1)?.insertId).toBe(created.insertId);
    expect(h.completed).toEqual(['run-under-test']);
  });

  it.each([
    ['canceled', 'cancelled'],
    ['failed', 'failed'],
    ['succeeded', 'success'],
  ])('reports a %s run as result %s', async (status, result) => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun(),
      body: {},
      requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status, errorCode: status === 'failed' ? 'AGENT_EXIT_1' : null });

    const finished = await settled(h, 'run_finished');
    expect(finished.properties.result).toBe(result);
    if (result === 'failed') {
      // Dashboards keyed on error_code must never see a blank cell.
      expect(finished.properties.error_code).toBeTruthy();
    }
  });

  it('stays silent for a run nobody asked for', async () => {
    // A scheduled Automation has no caller to attribute the Run to. Silence is
    // the correct outcome — inventing an identity would be worse than a gap.
    const h = harness();
    h.lifecycle.install({ run: fakeRun(), body: {}, requestAnalyticsContext: null });
    h.settle({ status: 'succeeded' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.captured).toEqual([]);
    expect(h.recoveries).toEqual([]);
  });
});

describe('inherited run lineage', () => {
  it('carries the source run resolved lineage onto the next physical run', () => {
    expect(
      inheritedRunLineageHints(
        { id: 'run-2', clientRequestId: 'odnext_run_b' },
        { analyticsHints: { taskExecutionId: 'task-1', initialRunId: 'run-1' } },
        2,
      ),
    ).toEqual({
      taskExecutionId: 'task-1',
      initialRunId: 'run-1',
      taskRunIndex: 2,
      sourceRunId: 'run-2',
    });
  });

  it('falls back the same way the lifecycle does when the source carried no hints', () => {
    // The first Run of a task resolves its own id from `clientRequestId`, so
    // inheriting must land on the same value — otherwise the second Run starts
    // a second task in the warehouse.
    expect(
      inheritedRunLineageHints({ id: 'run-1', clientRequestId: 'client-request-1' }, {}, 1),
    ).toEqual({
      taskExecutionId: 'client-request-1',
      initialRunId: 'run-1',
      taskRunIndex: 1,
      sourceRunId: 'run-1',
    });
  });

  it('falls back to the run id when there is no client request id either', () => {
    expect(inheritedRunLineageHints({ id: 'run-1' }, undefined, 1)).toMatchObject({
      taskExecutionId: 'run-1',
      initialRunId: 'run-1',
    });
  });
});
