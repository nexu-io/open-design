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
import {
  createRunSideEffectLedger,
  foldEventIntoRunSideEffectLedger,
} from '../../src/runtimes/run-lifecycle-analytics.js';
import { createChatRunService } from '../../src/runtimes/runs.js';

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
}) {
  const captured: Captured[] = [];
  const recoveries: Array<{ runId: string; properties: Record<string, unknown>; insertId: string }> = [];
  const completed: string[] = [];
  const deliveryBegun: string[] = [];
  const deliveryFinalized: Array<{ runId: string; result: unknown }> = [];
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
        beginAnalyticsDelivery: (run) => { deliveryBegun.push(run.id); },
        finalizeAnalyticsDelivery: (run, result) => {
          deliveryFinalized.push({ runId: run.id, result });
        },
        markAnalyticsCompleted: (run) => { completed.push(run.id); },
        setDeliverableValidation: () => {},
      },
      analytics: {
        capture: (args) => {
          captured.push(args as Captured);
          return args.eventName === 'run_finished'
            ? finishCaptureResult
            : { status: 'queued', acknowledgement: 'local_buffer', errorType: null };
        },
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

  return {
    captured,
    completed,
    deliveryBegun,
    deliveryFinalized,
    lifecycle,
    recoveries,
    settle,
  };
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

  it('settles matching and conflicting terminal claims before capturing run_finished', async () => {
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
      body: { agentId: 'amr' },
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
    expect(finished?.properties).toMatchObject({
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
