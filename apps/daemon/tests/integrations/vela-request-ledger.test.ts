import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeVelaRequestLedger, readRunRequestLedger, type LedgerRunFacts } from '../../src/integrations/vela-request-ledger.js';

const { runVelaCommand } = vi.hoisted(() => ({ runVelaCommand: vi.fn() }));
vi.mock('../../src/integrations/vela-command.js', () => ({
  runVelaCommand,
  velaWorkspaceCommandOptions: (workspaceId: string | null) => ({ configuredEnv: { VELA_INVOCATION_SOURCE: 'open-design', ...(workspaceId ? { VELA_WORKSPACE_ID: workspaceId } : {}) } }),
}));
const run: LedgerRunFacts = {
  id: 'run-a', agentId: 'amr', status: 'succeeded', createdAt: 100, terminalAt: 400,
  analyticsTelemetry: { startRequestedAt: 150 }, workspaceScope: { workspaceId: 'workspace-a' },
  executionSourceReceipt: { sourceSha: 'a'.repeat(40) },
};
function fixture() {
  return {
    version: 'vela-request-ledger-v1', openDesignRunId: run.id, nextCursor: null, watermark: '17',
    captureComplete: true, runInventoryComplete: true, incompleteReasons: [],
    requests: [{ requestId: 'gateway-a', callerRequestId: 'caller-a', openDesignRunId: run.id, openDesignRunAttempt: '0',
      role: 'generation', status: 'succeeded', captureComplete: true, incompleteReasons: [], runtimeVersion: 'link-test-1', requestedModel: 'public-model',
      attempts: [{ attemptId: 'provider-a', role: 'generation', status: 'succeeded', provider: 'provider', actualModel: 'backend-model',
        startedAt: '2026-09-13T01:00:00.000Z', completedAt: '2026-09-13T01:00:01.000Z', durationMs: 1000,
        inputTokens: 100, inputSemantics: 'includes_cache', cacheReadTokens: 50, cacheWriteTokens: 0,
        outputTokens: 20, outputSemantics: 'includes_reasoning', reasoningTokens: 10 }],
    }],
    callerInventory: { version: 'vela-caller-inventory-v1', openDesignRunId: run.id, complete: true, expectedGatewayRequestIds: ['gateway-a'], incompleteReasons: [],
      producers: [{ producerId: 'producer-a', openDesignRunId: run.id, runAttempt: '0', closed: true, incompleteReasons: [],
        requests: [{ callerRequestId: 'caller-a', gatewayRequestId: 'gateway-a', status: 'succeeded', startedAt: '2026-09-13T01:00:00.000Z', requestBodySha256: 'b'.repeat(64) }],
      }],
    },
  };
}

describe('Vela request ledger conversion', () => {
  it('preserves observed usage semantics, actual model aliases and caller-body identity', () => {
    const result = normalizeVelaRequestLedger(fixture(), run);
    expect(result).toMatchObject({ schemaVersion: 'generation-request-ledger-v1', sourceRunId: run.id,
      complete: true, captureComplete: true, requestInventoryComplete: true, watermark: expect.stringContaining('"gatewayWatermark":"17"'),
      includesAuxiliary: true, includesFailures: true, includesProviderRetries: true,
      executionDurationMs: 250, queueDurationMs: 50, retryWaitMs: null,
      identity: { sourceSha: 'a'.repeat(40), requestedModel: 'public-model', actualModel: 'backend-model', runtimeVersion: 'link-test-1',
        promptSha256: createHash('sha256').update(JSON.stringify(['b'.repeat(64)])).digest('hex') },
      observedModelRoutes: [{ requestedModel: 'public-model', actualModel: 'backend-model' }],
      observedGatewayRuntimeVersions: ['link-test-1'],
    });
    expect(result.requests).toEqual([expect.objectContaining({ requestId: '["gateway-a","provider-a"]', gatewayRequestId: 'gateway-a', attemptId: 'provider-a',
      inputTokens: 100, cacheReadTokens: 50, outputTokens: 20, reasoningTokens: 10, inputSemantics: 'includes_cache', outputSemantics: 'includes_reasoning' })]);
    expect(result.incompleteReasons).toEqual(['retry_wait_not_observed']);
  });

  it('keeps failed retries distinct and missing provider usage null, never zero', () => {
    const data = fixture();
    data.requests[0]!.attempts.unshift({ ...data.requests[0]!.attempts[0]!, attemptId: 'provider-failed', role: 'retry', status: 'failed',
      inputTokens: null as unknown as number, actualModel: null as unknown as string });
    const result = normalizeVelaRequestLedger(data, run);
    expect(result.requests.map(row => row.requestId)).toEqual(['["gateway-a","provider-failed"]', '["gateway-a","provider-a"]']);
    expect(result.requests[0]!.inputTokens).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.identity.actualModel).toBeNull();
    expect(result.incompleteReasons).toContain('provider_usage_incomplete');
    expect(result.incompleteReasons).toContain('request_model_identity_incomplete');
  });

  it.each([
    ['missing caller inventory', (data: ReturnType<typeof fixture>) => { delete (data as Partial<typeof data>).callerInventory; }],
    ['open producer', (data: ReturnType<typeof fixture>) => { data.callerInventory.producers[0]!.closed = false; }],
    ['foreign producer', (data: ReturnType<typeof fixture>) => { data.callerInventory.producers[0]!.openDesignRunId = 'other'; }],
    ['wrong physical attempt', (data: ReturnType<typeof fixture>) => { data.callerInventory.producers[0]!.runAttempt = '1'; }],
    ['unknown caller', (data: ReturnType<typeof fixture>) => { data.requests[0]!.callerRequestId = 'different'; }],
    ['duplicate caller', (data: ReturnType<typeof fixture>) => { data.callerInventory.producers[0]!.requests.push(data.callerInventory.producers[0]!.requests[0]!); }],
    ['unmatched expected request', (data: ReturnType<typeof fixture>) => { data.callerInventory.expectedGatewayRequestIds.push('unobserved'); }],
    ['foreign run', (data: ReturnType<typeof fixture>) => { data.openDesignRunId = 'other'; }],
    ['pagination not finished', (data: ReturnType<typeof fixture>) => { data.nextCursor = 'next' as unknown as null; }],
  ])('refuses complete for %s', (_label, change) => {
    const data = fixture(); change(data);
    const result = normalizeVelaRequestLedger(data, run);
    expect(result.complete).toBe(false);
    expect(result.watermark).toBeNull();
    expect(result.identity.promptSha256).toBeNull();
  });

  it('cannot claim finished inventory while host Run is active', () => {
    const result = normalizeVelaRequestLedger(fixture(), { ...run, status: 'running' });
    expect(result.requestInventoryComplete).toBe(false);
    expect(result.incompleteReasons).toContain('run_not_terminal');
  });

  it('requires caller receipts for every host-observed retry attempt', () => {
    const result = normalizeVelaRequestLedger(fixture(), { ...run, retryAttemptCount: 1 });
    expect(result.complete).toBe(false);
    expect(result.incompleteReasons).toContain('host_run_attempt_inventory_mismatch');
  });

  it('keeps historical source and timing unknown and ignores configured/resolved model claims', () => {
    const data = fixture();
    data.requests[0]!.attempts[0]!.actualModel = null as unknown as string;
    Object.assign(data.requests[0]!, { resolvedModel: 'pretend-model' });
    const result = normalizeVelaRequestLedger(data, { ...run, executionSourceReceipt: null, analyticsTelemetry: {}, terminalAt: null });
    expect(result.identity.sourceSha).toBeNull();
    expect(result.identity.actualModel).toBeNull();
    expect(result.executionDurationMs).toBeNull();
    expect(result.queueDurationMs).toBeNull();
  });

  it('retains zero-provider rejections as unknown accounting rows', () => {
    const data = fixture(); data.requests[0]!.status = 'rejected'; data.requests[0]!.attempts = [];
    const result = normalizeVelaRequestLedger(data, run);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({ status: 'rejected', attemptId: null, inputTokens: null, outputTokens: null });
    expect(result.complete).toBe(false);
  });

  it('reports every actual route/version and refuses primary identity if any request is unknown', () => {
    const data = fixture();
    const auxiliary = structuredClone(data.requests[0]!);
    auxiliary.requestId = 'gateway-b'; auxiliary.callerRequestId = 'caller-b'; auxiliary.requestedModel = 'auxiliary-model'; auxiliary.role = 'auxiliary'; auxiliary.runtimeVersion = 'link-test-2';
    auxiliary.attempts[0]!.attemptId = 'provider-b'; auxiliary.attempts[0]!.role = 'auxiliary'; auxiliary.attempts[0]!.actualModel = 'auxiliary-backend';
    data.requests.push(auxiliary);
    data.callerInventory.expectedGatewayRequestIds.push('gateway-b');
    data.callerInventory.producers[0]!.requests.push({ ...data.callerInventory.producers[0]!.requests[0]!, callerRequestId: 'caller-b', gatewayRequestId: 'gateway-b' });
    const result = normalizeVelaRequestLedger(data, run);
    expect(result.observedModelRoutes).toEqual([{ requestedModel: 'auxiliary-model', actualModel: 'auxiliary-backend' }, { requestedModel: 'public-model', actualModel: 'backend-model' }]);
    expect(result.observedGatewayRuntimeVersions).toEqual(['link-test-1', 'link-test-2']);
    expect(result.identity.runtimeVersion).toBeNull();
    expect(result.incompleteReasons).toContain('gateway_runtime_identity_incomplete_or_mixed');
    auxiliary.attempts[0]!.role = 'retry';
    const retriedAuxiliary = normalizeVelaRequestLedger(data, run);
    expect(retriedAuxiliary.identity.actualModel).toBe('backend-model');
    expect(retriedAuxiliary.requests[1]!.role).toBe('retry');
    auxiliary.attempts[0]!.actualModel = null as unknown as string;
    expect(normalizeVelaRequestLedger(data, run).identity.actualModel).toBeNull();
  });
});

describe('Run ledger Vela command boundary', () => {
  beforeEach(() => { runVelaCommand.mockReset(); });
  it('uses existing credential and frozen workspace resolver without direct HTTP', async () => {
    runVelaCommand.mockResolvedValue(JSON.stringify(fixture()));
    const result = await readRunRequestLedger(run, '/isolated-daemon-data');
    expect(result.complete).toBe(true);
    expect(runVelaCommand).toHaveBeenCalledWith(['request-ledger', 'get', '--open-design-run-id', run.id, '--json'], expect.objectContaining({
      configuredEnv: { VELA_INVOCATION_SOURCE: 'open-design', VELA_WORKSPACE_ID: 'workspace-a' },
      env: expect.objectContaining({ OD_DATA_DIR: '/isolated-daemon-data' }), timeoutMs: 10_000,
    }));
  });
  it('does not call upstream for active or non-AMR Runs', async () => {
    expect((await readRunRequestLedger({ ...run, status: 'running' }, '/data')).incompleteReasons).toEqual(['run_not_terminal']);
    expect((await readRunRequestLedger({ ...run, agentId: 'codex' }, '/data')).incompleteReasons).toEqual(['runtime_request_ledger_not_supported']);
    expect(runVelaCommand).not.toHaveBeenCalled();
  });
  it('returns an actionable unknown without leaking command output or failing status', async () => {
    runVelaCommand.mockRejectedValue(new Error('secret credential /private/profile'));
    const result = await readRunRequestLedger(run, '/data');
    expect(result.incompleteReasons).toEqual(['vela_request_ledger_unavailable']);
    expect(result.complete).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/secret|private/);
  });
});
