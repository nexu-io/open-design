// The physical-Run analytics lifecycle, driven directly.
//
// The real-server chain test proves the lifecycle is installed for every Run
// of an automatic chain; this one proves what it reports once a Run settles.
// Cancellation is the case that motivated it: a Run the user stopped has to
// land as `cancelled`, not as a missing row, or the cancellation rate is
// computed against a smaller denominator than the truth.

import Database from 'better-sqlite3';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  createRunAnalyticsLifecycle,
  inheritedRunLineageHints,
  type RunAnalyticsLifecycleDeps,
} from '../../src/services/run-analytics-lifecycle.js';
import {
  createRunSideEffectLedger,
  foldEventIntoRunSideEffectLedger,
} from '../../src/runtimes/run-lifecycle-analytics.js';
import { createChatRunService } from '../../src/runtimes/runs.js';
import type { ChatRun } from '../../src/runtimes/chat-run-records.js';
import {
  createRunPerRequestUsageLedger,
  foldEventIntoPerRequestUsageLedger,
} from '../../src/run-analytics-observability.js';

type Captured = {
  eventName: string;
  properties: Record<string, unknown>;
  insertId: string;
  context: { deviceId: string };
};

function harness(finishCaptureResult: unknown = {
  status: 'queued',
  acknowledgement: 'local_buffer',
  errorType: null,
}, db: unknown = {}, workspaceContext?: RunAnalyticsLifecycleDeps['workspaceContext'], runs?: ReturnType<typeof createChatRunService>, detectAgents: RunAnalyticsLifecycleDeps['agents']['detectAgents'] = async () => []) {
  const captured: Captured[] = [];
  const captureWaiters = new Map<string, Array<{ occurrence: number; resolve(event: Captured): void }>>();
  const signalCapture = (event: Captured) => {
    const events = captured.filter((entry) => entry.eventName === event.eventName);
    const remaining = [];
    for (const waiter of captureWaiters.get(event.eventName) ?? []) {
      const found = events[waiter.occurrence - 1];
      if (found) waiter.resolve(found);
      else remaining.push(waiter);
    }
    captureWaiters.set(event.eventName, remaining);
  };
  const recoveries: Array<{ runId: string; properties: Record<string, unknown>; insertId: string }> = [];
  const completed: string[] = [];
  const deliveryBegun: string[] = [];
  const deliveryFinalized: Array<{ runId: string; result: unknown }> = [];
  let signalDeliveryFinalized: () => void = () => {};
  const currentDeliveryFinalized = new Promise<void>((resolve) => { signalDeliveryFinalized = resolve; });
  let settle: (status: { status: string; errorCode?: string | null; exitCode?: number | null }) => void = () => {};
  const terminal = new Promise<{ status: string }>((resolve) => {
    settle = (status) => resolve(status as { status: string });
  });

  const lifecycle = createRunAnalyticsLifecycle({
    db: db as never,
    design: {
      runs: {
        wait: (run) => (runs ? runs.wait(run) : terminal) as never,
        ...(runs ? { persistState: runs.persistState } : {}),
        setAnalyticsRecovery: (run, recovery) => {
          if (runs) runs.setAnalyticsRecovery(run, recovery);
          else run.analyticsRecovery = recovery;
          recoveries.push({
            runId: run.id,
            properties: recovery.properties,
            insertId: recovery.insertId,
          });
        },
        beginAnalyticsDelivery: (run) => { runs?.beginAnalyticsDelivery(run); deliveryBegun.push(run.id); },
        finalizeAnalyticsDelivery: (run, result) => {
          runs?.finalizeAnalyticsDelivery(run, result);
          deliveryFinalized.push({ runId: run.id, result });
          signalDeliveryFinalized();
        },
        markAnalyticsCompleted: (run) => { runs?.markAnalyticsCompleted(run); completed.push(run.id); },
        setDeliverableValidation: () => {},
      },
      analytics: {
        capture: (args) => {
          captured.push(args as Captured);
          signalCapture(args as Captured);
          return args.eventName === 'run_finished'
            ? finishCaptureResult
            : { status: 'queued', acknowledgement: 'local_buffer', errorType: null };
        },
      },
      getAppVersion: () => '0.0.0-test',
    },
    paths: { PROJECTS_DIR: '/nonexistent/projects', RUNTIME_DATA_DIR: '/nonexistent/data' },
    agents: { detectAgents },
    ...(workspaceContext ? { workspaceContext } : {}),
    telemetry: {
      reportRunCompletionTelemetryFallback: () => {},
      resolveRunProjectKindForAnalytics: () => null,
      runArtifactBaselines: { take: () => undefined },
      runRetryEventsForAnalytics: () => [],
    },
  });

  return {
    captured,
    completed,
    deliveryBegun,
    deliveryFinalized,
    lifecycle,
    recoveries,
    settle,
    // Historical attempts still emit their event, but cannot finalize the current run.
    waitForCurrentDeliveryFinalized: () => currentDeliveryFinalized,
    waitForCapture(eventName: string, occurrence = 1): Promise<Captured> {
      const found = captured.filter((event) => event.eventName === eventName)[occurrence - 1];
      if (found) return Promise.resolve(found);
      return new Promise((resolve) => {
        const waiters = captureWaiters.get(eventName) ?? [];
        waiters.push({ occurrence, resolve });
        captureWaiters.set(eventName, waiters);
      });
    },
  };
}

function fakeRun(overrides: Record<string, unknown> = {}): ChatRun {
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
  };
}

const CONTEXT = { deviceId: 'device-1', sessionId: 'session-1', clientType: 'web', locale: 'en' };

async function settled(h: ReturnType<typeof harness>, eventName: string) {
  const captured = await h.waitForCapture(eventName);
  if (eventName === 'run_finished') await h.waitForCurrentDeliveryFinalized();
  return captured;
}

const WORKSPACE_SCOPE = {
  schemaVersion: 1,
  projectId: 'project-a',
  workspaceId: 'workspace-a',
  workspaceMemberId: 'project-creator',
  source: 'persisted_project_binding',
} as const;

function workspaceContext(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-a',
    workspaceType: 'team',
    workspaceMemberId: 'actual-caller',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
    memberCount: 7,
    ...overrides,
  };
}

describe('run analytics lifecycle', () => {
  it('freezes persisted Motion intent for creation, terminal and recovery independently of discovery routing', async () => {
    const project = { id: 'motion-project', name: 'Motion', metadataJson: JSON.stringify({ kind: 'video', videoModel: 'hyperframes-html', intent: 'motion-design' }) };
    const db = { prepare: () => ({ get: () => project }) };
    const h = harness(undefined, db);
    h.lifecycle.install({
      run: fakeRun({ projectId: project.id }),
      body: { projectId: project.id, analyticsHints: { projectKind: 'hyperframes' } },
      requestAnalyticsContext: CONTEXT as never,
    });
    expect((await settled(h, 'run_created')).properties.project_intent).toBe('motion-design');
    project.metadataJson = JSON.stringify({ intent: 'hyperframes' });
    h.settle({ status: 'succeeded' });
    expect((await settled(h, 'run_finished')).properties.project_intent).toBe('motion-design');
    expect(h.recoveries).toHaveLength(2);
    expect(h.recoveries.every((row) => row.properties.project_intent === 'motion-design')).toBe(true);
  });

  it.each([
    { attachments: undefined, expected: undefined },
    { attachments: [], expected: [] },
    { attachments: [{ id: 'board', source: 'board-batch' }, { id: 'legacy' }], expected: [] },
    { attachments: [{ id: 'saved-1', source: 'saved-comment' }, { id: 'saved-1', source: 'saved-comment' }, { id: 'board', source: 'board-batch' }, { id: 'legacy' }], expected: ['saved-1'] },
  ])('freezes this Run saved comments across creation, completion and recovery: $expected', async ({ attachments, expected }) => {
    const h = harness();
    const body = { agentId: 'codex', commentAttachments: attachments, analyticsHints: { sourceRunId: 'unrelated-run' } };
    h.lifecycle.install({ run: fakeRun(), body, requestAnalyticsContext: CONTEXT as never });
    const created = await settled(h, 'run_created');
    expect(created.properties.comment_ids).toEqual(expected);
    expect(Object.hasOwn(created.properties, 'comment_ids')).toBe(expected !== undefined);
    body.commentAttachments = [{ id: 'later', source: 'saved-comment' }];
    h.settle({ status: 'succeeded' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties.comment_ids).toEqual(expected);
    expect(h.recoveries.every((recovery) => JSON.stringify(recovery.properties.comment_ids) === JSON.stringify(expected))).toBe(true);
    expect(h.completed).toEqual(['run-under-test']);
    expect(h.recoveries).toHaveLength(2);
  });

  it.each([{ ids: [] }, { ids: ['original'] }])('preserves same-Run recovered comment IDs $ids over new request attachments', async ({ ids }) => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({ analyticsRecovery: { context: CONTEXT, properties: { comment_ids: ids } } }),
      body: { commentAttachments: [{ id: 'new', source: 'saved-comment' }] },
      requestAnalyticsContext: CONTEXT as never,
    });
    expect((await settled(h, 'run_created')).properties.comment_ids).toEqual(ids);
    h.settle({ status: 'succeeded' });
    expect((await settled(h, 'run_finished')).properties.comment_ids).toEqual(ids);
    expect(h.recoveries.at(-1)?.properties.comment_ids).toEqual(ids);
  });
  it('uses current Run attachments when the existing recovery predates comment observation', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({ analyticsRecovery: { context: CONTEXT, properties: { source_run_id: 'other-run' } } }),
      body: { commentAttachments: [{ id: 'current', source: 'saved-comment' }], analyticsHints: { sourceRunId: 'other-run' } },
      requestAnalyticsContext: CONTEXT as never,
    });
    expect((await settled(h, 'run_created')).properties.comment_ids).toEqual(['current']);
    h.settle({ status: 'canceled' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({ comment_ids: ['current'], result: 'cancelled' });
    expect(h.recoveries).toHaveLength(2);
  });

  it('freezes authorized workspace and member count across page switches and completion', async () => {
    const authorized = workspaceContext();
    const resolveExact = vi.fn(async () => authorized);
    const h = harness(undefined, {}, { resolveExact });
    const run = fakeRun({ projectId: 'project-a', workspaceScope: WORKSPACE_SCOPE });
    h.lifecycle.install({
      run,
      body: { workspaceId: 'page-b', analyticsHints: { memberCount: 99, creditType: 'design_plan' } },
      requestAnalyticsContext: CONTEXT as never,
    });
    const created = await settled(h, 'run_created');
    expect(resolveExact).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'workspace-a' });
    expect(created.properties).toMatchObject({ workspace_id: 'workspace-a', member_count: 7 });
    expect(created.properties).not.toHaveProperty('credit_type');
    authorized.workspaceId = 'page-b';
    authorized.memberCount = 99;
    h.settle({ status: 'succeeded' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({ workspace_id: 'workspace-a', member_count: 7, result: 'success' });
    expect(finished.properties).not.toHaveProperty('credit_type');
    expect(h.recoveries.every((recovery) => recovery.properties.workspace_id === 'workspace-a')).toBe(true);
    expect(h.recoveries.at(-1)?.properties.member_count).toBe(7);
    expect(finished.insertId).toBe(`${created.insertId}-finish`);
  });

  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7', NaN, Infinity])(
    'omits unknown or invalid memberCount %s without using seatSummary or client hints',
    async (memberCount) => {
      const h = harness(undefined, {}, { resolveExact: async () => workspaceContext({ memberCount: memberCount as number }) });
      h.lifecycle.install({
        run: fakeRun({ projectId: 'project-a', workspaceScope: WORKSPACE_SCOPE }),
        body: { memberCount: 42, analyticsHints: { memberCount: 42 } },
        requestAnalyticsContext: CONTEXT as never,
      });
      const created = await settled(h, 'run_created');
      expect(created.properties.workspace_id).toBe('workspace-a');
      expect(created.properties).not.toHaveProperty('member_count');
      h.settle({ status: 'succeeded' });
      const finished = await settled(h, 'run_finished');
      expect(finished.properties).not.toHaveProperty('member_count');
    },
  );

  it.each([
    { workspaceId: 'workspace-b' },
    { memberStatus: 'removed' },
    { lifecycleState: 'deleted' },
  ] satisfies Partial<WorkspaceCollabContext>[])('does not stamp a mismatched or unauthorized workspace: %j', async (overrides) => {
    const h = harness(undefined, {}, { resolveExact: async () => workspaceContext(overrides) });
    h.lifecycle.install({
      run: fakeRun({ projectId: 'project-a', workspaceScope: WORKSPACE_SCOPE }),
      body: { workspaceId: 'workspace-a' }, requestAnalyticsContext: CONTEXT as never,
    });
    const created = await settled(h, 'run_created');
    expect(created.properties).not.toHaveProperty('workspace_id');
    expect(created.properties).not.toHaveProperty('member_count');
  });

  it('keeps unknown historical workspace context unknown on resume', async () => {
    const resolveExact = vi.fn(async () => workspaceContext());
    const h = harness(undefined, {}, { resolveExact });
    h.lifecycle.install({
      run: fakeRun({ projectId: 'project-a', workspaceScope: WORKSPACE_SCOPE,
        analyticsRecovery: { context: CONTEXT, properties: { run_id: 'run-under-test' }, insertId: 'legacy-attempt' },
      }),
      body: { workspaceId: 'page-b', memberCount: 99 }, requestAnalyticsContext: CONTEXT as never,
    });
    const created = await settled(h, 'run_created');
    expect(created.properties).not.toHaveProperty('workspace_id');
    expect(created.properties).not.toHaveProperty('member_count');
    expect(resolveExact).not.toHaveBeenCalled();
  });

  it('keeps analytics running when exact workspace authorization is unavailable', async () => {
    const h = harness(undefined, {}, { resolveExact: async () => { throw new Error('unavailable'); } });
    h.lifecycle.install({
      run: fakeRun({ projectId: 'project-a', workspaceScope: WORKSPACE_SCOPE }),
      body: {}, requestAnalyticsContext: CONTEXT as never,
    });
    const created = await settled(h, 'run_created');
    expect(created.properties).not.toHaveProperty('workspace_id');
    h.settle({ status: 'failed' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties.result).toBe('failed');
    expect(finished.properties).not.toHaveProperty('workspace_id');
  });

  it('retains the original optional workspace snapshot on resume without re-reading page authority', async () => {
    const resolveExact = vi.fn(async () => workspaceContext({ memberCount: 99 }));
    const h = harness(undefined, {}, { resolveExact });
    h.lifecycle.install({
      run: fakeRun({
        projectId: 'project-a', workspaceScope: WORKSPACE_SCOPE, manualResumeAttemptCount: 1,
        analyticsRecovery: { context: CONTEXT, properties: { workspace_id: 'workspace-a', member_count: 7 }, insertId: 'previous-attempt', completedAt: 1 },
      }),
      body: { workspaceId: 'page-b' }, requestAnalyticsContext: CONTEXT as never,
    });
    const created = await settled(h, 'run_created');
    expect(created.properties).toMatchObject({ workspace_id: 'workspace-a', member_count: 7 });
    expect(resolveExact).not.toHaveBeenCalled();
    h.settle({ status: 'succeeded' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({ workspace_id: 'workspace-a', member_count: 7 });
  });

  it('installs only one created/finished observer for repeated starts of the same attempt', async () => {
    const h = harness();
    const input = { run: fakeRun(), body: {}, requestAnalyticsContext: CONTEXT as never };
    h.lifecycle.install(input);
    h.lifecycle.install(input);
    const created = await settled(h, 'run_created');
    h.settle({ status: 'succeeded' });
    await settled(h, 'run_finished');
    expect(h.captured.map((event) => event.eventName)).toEqual(['run_created', 'run_finished']);
    expect(h.captured[1]?.insertId).toBe(`${created.insertId}-finish`);
  });

  it.each(['natural', 'current-first', 'original-first'] as const)('keeps a late workspace response on its original attempt after finish and resume (%s)', async (finishOrder) => {
    const runs = createChatRunService({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    });
    let resolveContext: (context: ReturnType<typeof workspaceContext>) => void = () => {};
    const context = new Promise<ReturnType<typeof workspaceContext>>((resolve) => { resolveContext = resolve; });
    const resolveExact = vi.fn(() => context);
    let releaseConfiguration: () => void = () => {};
    const heldConfiguration = new Promise<void>((resolve) => { releaseConfiguration = resolve; });
    let configurationReads = 0;
    const h = harness(undefined, {}, { resolveExact }, runs, async () => {
      const read = configurationReads++;
      if ((finishOrder === 'current-first' && read === 0)
        || (finishOrder === 'original-first' && read === 1)) await heldConfiguration;
      return [];
    });
    const run = runs.create({ projectId: 'project-a', agentId: 'amr', workspaceScope: WORKSPACE_SCOPE, clientRequestId: 'original-request' });
    const perRequestUsageLedger = createRunPerRequestUsageLedger();
    foldEventIntoPerRequestUsageLedger(perRequestUsageLedger, {
      event: 'agent', data: { type: 'request_usage', requestId: 'call-old', usage: { input_tokens: 10, output_tokens: 2 } },
    });
    const sideEffectLedger = createRunSideEffectLedger();
    sideEffectLedger.artifactPaths.add('old.html');
    Object.assign(run, { perRequestUsageLedger, sideEffectLedger });
    const input = { run: run as never, body: {}, requestAnalyticsContext: CONTEXT as never };
    h.lifecycle.install(input);
    runs.finish(run, 'failed', 1, null);
    expect(runs.prepareRestart(run)).toBe(run);
    // Let the first attempt's already-resolved terminal promise snapshot its
    // ledger before the resumed provider completes another model request.
    await Promise.resolve();
    foldEventIntoPerRequestUsageLedger(perRequestUsageLedger, {
      event: 'agent', data: { type: 'request_usage', requestId: 'call-new', usage: { input_tokens: 20, output_tokens: 3 } },
    });
    sideEffectLedger.artifactPaths.add('new.html');
    h.lifecycle.install({ ...input, resumed: true });
    runs.finish(run, 'succeeded', 0, null);
    resolveContext(workspaceContext());
    if (finishOrder !== 'natural') {
      const first = await h.waitForCapture('run_finished');
      expect(first.properties.run_attempt).toBe(finishOrder === 'current-first' ? 1 : 0);
      releaseConfiguration();
    }
    await h.waitForCapture('run_finished', 2);
    await h.waitForCurrentDeliveryFinalized();
    const created = h.captured.filter((event) => event.eventName === 'run_created');
    const finished = h.captured.filter((event) => event.eventName === 'run_finished');
    expect(created).toHaveLength(2);
    expect(finished.map((event) => event.properties.result).sort()).toEqual(['failed', 'success']);
    expect(resolveExact).toHaveBeenCalledOnce();
    expect(finished.map((event) => event.properties.run_attempt).sort()).toEqual([0, 1]);
    expect(finished.find((event) => event.properties.run_attempt === 0)?.properties).toMatchObject({
      request_usage_count: 1, request_usage_input_tokens_sum: 10, artifact_count: 1,
    });
    expect(finished.find((event) => event.properties.run_attempt === 1)?.properties).toMatchObject({
      request_usage_count: 2, request_usage_input_tokens_sum: 30, artifact_count: 2,
    });
    expect(finished.map((event) => event.insertId).sort()).toEqual(created.map((event) => `${event.insertId}-finish`).sort());
    expect(h.recoveries.at(-1)?.properties.result).toBe('success');
    expect(h.recoveries.at(-1)?.properties.run_attempt).toBe(1);
    expect(h.deliveryFinalized).toHaveLength(1);
    expect(h.completed).toEqual([run.id]);
    for (const event of h.captured) expect(event.properties).toMatchObject({ workspace_id: 'workspace-a', member_count: 7, task_execution_id: 'original-request' });
  });

  it('records text-only settlement as a normal successful reply', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({ strategyTask: { terminal: true, outcome: 'completed', settlementReason: 'ended', deliverableValid: false, settlementFacts: { physicalStatus: 'succeeded', deliverableValid: false } } }),
      body: { agentId: 'codex' }, requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'succeeded' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({ result: 'success', od_next_settlement_reason: 'ended', od_next_settlement_facts: { physicalStatus: 'succeeded', deliverableValid: false } });
    expect(finished.properties.od_next_blocked_reason_code).toBeUndefined();
  });

  it('reports a physical failure even when orchestration has ended normally', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({ strategyTask: { terminal: true, outcome: 'completed', settlementReason: 'ended', settlementFacts: { physicalStatus: 'failed' } } }),
      body: { agentId: 'codex' }, requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'failed' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({ result: 'failed', od_next_settlement_reason: 'ended', od_next_settlement_facts: { physicalStatus: 'failed' } });
    expect(finished.properties.od_next_blocked_reason_code).toBeUndefined();
  });

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

  it('keeps failed PostHog enqueue delivery recoverable instead of marking analytics complete', async () => {
    const deliveryFailure = {
      status: 'failed',
      acknowledgement: 'none',
      errorType: 'enqueue_failed',
    };
    const h = harness(deliveryFailure);
    h.lifecycle.install({
      run: fakeRun(),
      body: { agentId: 'codex' },
      requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');

    h.settle({ status: 'failed', errorCode: 'AGENT_EXIT_1' });
    await settled(h, 'run_finished');
    await vi.waitFor(() => expect(h.deliveryFinalized).toHaveLength(1));

    expect(h.deliveryBegun).toEqual(['run-under-test']);
    expect(h.deliveryFinalized).toEqual([{
      runId: 'run-under-test',
      result: deliveryFailure,
    }]);
    expect(h.completed).toEqual([]);
  });

  it('publishes the bounded terminal lifecycle envelope for the current attempt', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({
        terminalLifecycle: {
          version: 1,
          runAttempt: 2,
          runtimeGenerationId: '0f2d4d9e-f034-4ed5-8330-314bd1d525cc',
          terminationOrigin: 'watchdog_cleanup',
          terminalIntegrity: 'late',
          terminalPersistence: { status: 'acknowledged', errorType: null },
          posthogDelivery: {
            status: 'in_flight',
            acknowledgement: 'none',
            attemptCount: 1,
            errorType: null,
          },
          unfinishedState: 'recovery_pending',
          duplicateTerminalCount: 1,
          lateTerminalCount: 1,
        },
      }),
      body: { agentId: 'amr' },
      requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');

    h.settle({ status: 'failed', errorCode: 'AGENT_EXIT_1' });
    const finished = await settled(h, 'run_finished');

    expect(finished.properties).toMatchObject({
      terminal_integrity: 'late',
      run_attempt: 2,
      runtime_generation_id: '0f2d4d9e-f034-4ed5-8330-314bd1d525cc',
      termination_origin: 'watchdog_cleanup',
      terminal_persistence_status: 'acknowledged',
      terminal_persistence_error_type: null,
      posthog_delivery_status: 'queued',
      posthog_acknowledgement: 'local_buffer',
      posthog_delivery_attempt_count: 1,
      posthog_error_type: null,
      mature_unfinished_state: 'unknown',
      duplicate_terminal_count: 1,
      late_terminal_count: 1,
    });
  });

  it.each(['noop', 'recording', 'throwing', 'pending'] as const)('keeps real Run terminal state intact with %s measurement', async (measurement) => {
    const captured: Captured[] = [];
    const runs = createChatRunService({
      createSseResponse: () => ({
        send: vi.fn(() => true),
        end: vi.fn(),
        cleanup: vi.fn(),
      }),
      createSseErrorPayload: (code: string, message: string) => ({
        error: { code, message },
      }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
    });
    const lifecycle = createRunAnalyticsLifecycle({
      db: {} as never,
      design: {
        runs: {
          ...runs,
          beginAnalyticsDelivery: (run: ReturnType<typeof runs.create>) => {
            runs.beginAnalyticsDelivery(run);
            queueMicrotask(() => {
              runs.finish(run, 'failed', 1, null);
              runs.finish(run, 'succeeded', 0, null);
            });
          },
        } as never,
        analytics: {
          capture: (args) => {
            captured.push(args as Captured);
            if (measurement === 'noop') return undefined;
            if (args.eventName === 'run_finished' && measurement === 'throwing') throw new Error('measurement only');
            if (args.eventName === 'run_finished' && measurement === 'pending') return new Promise(() => {});
            return {
              status: 'queued',
              acknowledgement: 'local_buffer',
              errorType: null,
            };
          },
        },
        getAppVersion: () => '0.0.0-test',
      },
      paths: {
        PROJECTS_DIR: '/nonexistent/projects',
        RUNTIME_DATA_DIR: '/nonexistent/data',
      },
      agents: { detectAgents: async () => [] },
      telemetry: {
        reportRunCompletionTelemetryFallback: () => {},
        resolveRunProjectKindForAnalytics: () => null,
        runArtifactBaselines: { take: () => undefined },
        runRetryEventsForAnalytics: () => [],
      },
    });
    const run = runs.create({
      projectId: null,
      conversationId: null,
      agentId: 'amr',
    });
    lifecycle.install({
      run: run as never,
      body: { agentId: 'amr', commentAttachments: [{ id: 'real-run-comment', source: 'saved-comment' }] },
      requestAnalyticsContext: CONTEXT as never,
    });
    await vi.waitFor(() => {
      expect(captured.some((event) => event.eventName === 'run_created')).toBe(true);
    });

    runs.finish(run, 'failed', 1, null);

    await vi.waitFor(() => {
      expect(captured.some((event) => event.eventName === 'run_finished')).toBe(true);
    });
    const finished = captured.find((event) => event.eventName === 'run_finished');
    expect(await runs.wait(run)).toMatchObject({ status: 'failed' });
    expect(finished?.properties).toMatchObject({
      comment_ids: ['real-run-comment'],
      terminal_integrity: 'late',
      duplicate_terminal_count: 1,
      late_terminal_count: 1,
    });
  });

  it('publishes only bounded prompt budget facts on run_finished', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({
        agentId: 'amr',
        events: [{
          event: 'agent',
          data: {
            type: 'diagnostic',
            name: 'prompt_budget_v1',
            source: 'acp-json-rpc',
            schemaVersion: 1,
            frameBytes: 34_810,
            promptBytes: 34_222,
            promptTokenEstimate: 11_408,
            tokenEstimateMethod: 'utf8_bytes_div_3_ceil_v1',
            sessionMode: 'resume',
            modelId: 'claude-opus-5',
            contextWindowSource: 'model_metadata',
            contextWindowTokens: 200_000,
            priorSessionUsageSource: 'agent_session',
            priorSessionInputTokens: 123_456,
            prompt: 'PRIVATE_PROMPT_MUST_NOT_LEAK',
            sessionId: 'PRIVATE_SESSION_MUST_NOT_LEAK',
            path: '/PRIVATE_PATH_MUST_NOT_LEAK',
          },
        }],
      }),
      body: { agentId: 'amr' },
      requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'succeeded' });

    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({
      prompt_budget_version: 'prompt_budget_v1',
      prompt_frame_bytes: 34_810,
      prompt_bytes: 34_222,
      prompt_token_estimate: 11_408,
      prompt_token_estimate_method: 'utf8_bytes_div_3_ceil_v1',
      prompt_session_mode: 'resume',
      prompt_model_id: 'claude-opus-5',
      prompt_context_window_source: 'model_metadata',
      prompt_context_window_tokens: 200_000,
      prompt_prior_session_usage_source: 'agent_session',
      prompt_prior_session_input_tokens: 123_456,
    });
    expect(JSON.stringify(finished.properties)).not.toContain('PRIVATE_');
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

  it('publishes current-attempt admission evidence with legacy failure fields intact', async () => {
    const h = harness();
    const message = '[code=model_limit_exceeded] model usage limit exceeded';
    h.lifecycle.install({
      run: fakeRun({ agentId: 'amr', events: [
        { event: 'start', data: { model: 'example-chat-model', streamFormat: 'acp-json-rpc' } },
        { event: 'agent', data: { type: 'status', label: 'waiting_for_first_output' } },
        { event: 'agent', data: { type: 'text_delta', delta: 'Example output' } },
        { event: 'error', data: { error: { code: 'RATE_LIMITED', message } } },
      ] }),
      body: { agentId: 'amr' }, requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'failed', errorCode: 'RATE_LIMITED' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({
      result: 'failed', error_code: 'RATE_LIMITED',
      failure_category: 'rate_limit', failure_detail: 'model_window_limit',
      classifier_version: 'run-failure-v3', policy_reason: 'model_window_limit',
      admission_phase: 'during_execution', admission_status: 'admitted',
    });
    expect(h.recoveries.at(-1)?.properties).toMatchObject({ classifier_version: 'run-failure-v3', admission_status: 'admitted' });
  });

  it('preserves early AMR admission evidence beyond the event ring-buffer cap', async () => {
    const h = harness();
    const message = '[code=model_limit_exceeded] model usage limit exceeded';
    const fullEvents = [
      { event: 'start', data: { agentId: 'amr', model: 'example-chat-model', streamFormat: 'acp-json-rpc' } },
      { event: 'agent', data: { type: 'status', label: 'waiting_for_first_output' } },
      { event: 'agent', data: { type: 'text_delta', delta: 'Example output' } },
      ...Array.from({ length: 2_001 }, (_, index) => ({
        event: 'diagnostic', data: { index },
      })),
      { event: 'error', data: { message } },
    ];
    const sideEffectLedger = createRunSideEffectLedger();
    for (const event of fullEvents) foldEventIntoRunSideEffectLedger(sideEffectLedger, event);
    h.lifecycle.install({
      run: fakeRun({
        agentId: 'amr', sideEffectLedger, events: fullEvents.slice(-2_000),
      }),
      body: { agentId: 'amr' }, requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'failed', errorCode: 'AGENT_EXECUTION_FAILED' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({
      policy_reason: 'model_window_limit', admission_phase: 'during_execution',
      admission_status: 'admitted',
    });
  });

  it('does not count replayed non-AMR ACP history when the start is truncated', async () => {
    const h = harness();
    const message = '[code=model_limit_exceeded] model usage limit exceeded';
    const fullEvents = [
      { event: 'start', data: { agentId: 'hermes', model: 'example-chat-model', streamFormat: 'acp-json-rpc' } },
      ...Array.from({ length: 10 }, (_, index) => ({
        event: 'diagnostic', data: { index },
      })),
      { event: 'agent', data: { type: 'text_delta', delta: 'Replayed history' } },
      { event: 'agent', data: { type: 'status', label: 'waiting_for_first_output' } },
      { event: 'agent', data: { type: 'text_delta', delta: 'Host notice', hostSynthesized: true } },
      ...Array.from({ length: 1_988 }, (_, index) => ({
        event: 'diagnostic', data: { index },
      })),
      { event: 'error', data: { message } },
      { event: 'agent', data: { type: 'text_delta', delta: 'Late activity' } },
    ];
    const sideEffectLedger = createRunSideEffectLedger();
    for (const event of fullEvents) foldEventIntoRunSideEffectLedger(sideEffectLedger, event);
    h.lifecycle.install({
      run: fakeRun({
        agentId: 'hermes', sideEffectLedger, events: fullEvents.slice(-2_000),
      }),
      body: { agentId: 'hermes' }, requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'failed', errorCode: 'AGENT_EXECUTION_FAILED' });
    const finished = await settled(h, 'run_finished');
    expect(finished.properties).toMatchObject({
      policy_reason: 'model_window_limit', admission_phase: 'unknown',
      admission_status: 'unknown',
    });
  });

  it('stays silent for a run nobody asked for', async () => {
    // A scheduled Automation has no caller to attribute the Run to. Silence is
    // the correct outcome — inventing an identity would be worse than a gap.
    const h = harness();
    h.lifecycle.install({ run: fakeRun(), body: { commentAttachments: [{ id: 'saved', source: 'saved-comment' }] }, requestAnalyticsContext: null });
    h.settle({ status: 'succeeded' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.captured).toEqual([]);
    expect(h.recoveries).toEqual([]);
  });

  it('publishes per-request usage count, sums, and reconciliation invariant to run_finished', async () => {
    const h = harness();
    const run = fakeRun({
      agentId: 'claude',
      events: [
        {
          event: 'agent',
          data: {
            type: 'request_usage',
            requestId: 'msg_1',
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'request_usage',
            requestId: 'msg_2',
            usage: { input_tokens: 20, output_tokens: 15, cache_read_input_tokens: 3 },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: { input_tokens: 30, output_tokens: 20, cache_read_input_tokens: 5 },
          },
        },
      ],
    });
    h.lifecycle.install({
      run,
      body: { agentId: 'claude' },
      requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'succeeded' });

    const finished = await settled(h, 'run_finished');
    expect(finished.properties.request_usage_count).toBe(2);
    expect(finished.properties.request_usage_input_tokens_sum).toBe(30);
    expect(finished.properties.request_usage_output_tokens_sum).toBe(20);
    expect(finished.properties.request_usage_reconciles_aggregate).toBe(true);
  });
});

describe('run_finished storage observability', () => {
  it('adds storage fields to the emitted run_finished only, never to the recovery snapshot', async () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', events_json TEXT);`);
    db.prepare(`INSERT INTO messages (id, content, events_json) VALUES ('assistant-1', 'done', '[]')`).run();
    try {
      const h = harness(undefined, db);
      h.lifecycle.install({
        run: fakeRun({ assistantMessageId: 'assistant-1' }),
        body: { agentId: 'codex' },
        requestAnalyticsContext: CONTEXT as never,
      });
      await settled(h, 'run_created');
      h.settle({ status: 'succeeded' });
      const finished = await settled(h, 'run_finished');
      expect(finished.properties).toMatchObject({
        storage_schema_version: 1,
        storage_events_json_bytes: 2,
        storage_content_bytes: 4,
      });
      const recovery = h.recoveries.at(-1)!.properties;
      expect(Object.keys(recovery).filter((key) => key.startsWith('storage_'))).toEqual([]);
      // Every recovery property reaches PostHog unchanged.
      for (const [key, value] of Object.entries(recovery)) expect(finished.properties[key]).toEqual(value);
    } finally {
      db.close();
    }
  });

  it('emits exactly the pre-existing properties when storage cannot be measured', async () => {
    const h = harness();
    h.lifecycle.install({
      run: fakeRun({ assistantMessageId: 'assistant-1' }),
      body: { agentId: 'codex' },
      requestAnalyticsContext: CONTEXT as never,
    });
    await settled(h, 'run_created');
    h.settle({ status: 'succeeded' });
    const finished = await settled(h, 'run_finished');
    expect(Object.keys(finished.properties).filter((key) => key.startsWith('storage_'))).toEqual([]);
    expect(finished.properties).toEqual(h.recoveries.at(-1)!.properties);
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
