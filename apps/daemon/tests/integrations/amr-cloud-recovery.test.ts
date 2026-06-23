import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAmrCloudRecoveryService } from '../../src/integrations/amr-cloud-recovery.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function tempDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-amr-recovery-'));
}

function recoveryFiles(dataDir: string): unknown[] {
  const dir = path.join(dataDir, 'amr-cloud-recovery');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as unknown);
}

describe('AMR Cloud Recovery service', () => {
  it('registers and pauses with minimal private context while public overlay excludes secrets', async () => {
    const dataDir = tempDataDir();
    const calls: Array<{ url: string; body?: unknown }> = [];
    const responses = [
      {
        operationId: 'op-1',
        retryToken: 'retry-secret',
        status: 'active',
        version: 1,
        userId: 'env-auth-user',
      },
      {
        operationId: 'op-1',
        status: 'waiting_payment',
        version: 2,
        recoveryUrl: 'https://open-design.ai/wallet/recovery?operation_id=op-1',
      },
    ];
    const service = createAmrCloudRecoveryService({
      dataDir,
      fetchImpl: async (url, init) => {
        calls.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return jsonResponse(responses.shift());
      },
      now: () => 1_000,
    });

    const env = {
      VELA_RUNTIME_KEY: 'runtime-secret',
      VELA_API_URL: 'https://amr.example',
    } as NodeJS.ProcessEnv;
    await service.prepareRun({
      run: {
        id: 'run-1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        assistantMessageId: 'assistant-1',
      },
      env,
      model: 'chat-model',
    });
    const overlay = await service.pauseForInsufficientBalance({ runId: 'run-1', env });

    expect(calls.map((call) => call.url)).toEqual([
      'https://amr.example/api/v1/billing/recoveries',
      'https://amr.example/api/v1/billing/recoveries/op-1/insufficient-balance',
    ]);
    expect(calls[1]?.body).toMatchObject({ retryToken: 'retry-secret', version: 1 });
    expect(overlay).toMatchObject({
      operationId: 'op-1',
      state: 'recovering_waiting_payment',
      userAction: 'open_wallet',
    });
    expect(JSON.stringify(overlay)).not.toContain('retry-secret');
    expect(JSON.stringify(overlay)).not.toContain('env-auth-user');

    const stored = recoveryFiles(dataDir)[0] as Record<string, unknown>;
    expect(stored.retryToken).toBe('retry-secret');
    expect(stored).not.toHaveProperty('message');
    expect(stored).not.toHaveProperty('cwd');
    expect(stored).not.toHaveProperty('env');
  });

  it('keeps manual top-up user initiated and preserves retry token when status reads omit it', async () => {
    const dataDir = tempDataDir();
    const responses = [
      { operationId: 'op-2', retryToken: 'retry-token', status: 'active', version: 1 },
      { operationId: 'op-2', status: 'waiting_payment', version: 2, manualTopupRequired: true },
      { operationId: 'op-2', status: 'retry_available', version: 3, manualTopupRequired: true },
      { operationId: 'op-2', status: 'resuming', version: 4 },
    ];
    const bodies: unknown[] = [];
    const service = createAmrCloudRecoveryService({
      dataDir,
      fetchImpl: async (_url, init) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)));
        return jsonResponse(responses.shift());
      },
      now: () => 2_000,
    });
    const env = { VELA_RUNTIME_KEY: 'rt', VELA_API_URL: 'https://amr.example' } as NodeJS.ProcessEnv;

    await service.prepareRun({ run: { id: 'run-2' }, env });
    const waiting = await service.pauseForInsufficientBalance({ runId: 'run-2', env });
    expect(waiting).toMatchObject({
      state: 'recovering_waiting_payment',
      mode: 'manual_topup_required',
      canResume: false,
    });

    const resuming = await service.resumeRun({ runId: 'run-2', env });
    expect(resuming).toMatchObject({ state: 'recovering_resuming' });
    expect(bodies.at(-1)).toMatchObject({ retryToken: 'retry-token', version: 3 });
  });

  it('blocks wrong AMR Cloud users instead of resuming', async () => {
    const dataDir = tempDataDir();
    const service = createAmrCloudRecoveryService({
      dataDir,
      fetchImpl: async () => jsonResponse({
        operationId: 'op-3',
        retryToken: 'token',
        status: 'active',
        version: 1,
        userId: 'user-a',
      }),
      now: () => 3_000,
    });

    await service.prepareRun({
      run: { id: 'run-3' },
      env: { VELA_RUNTIME_KEY: 'rt', VELA_API_URL: 'https://amr.example' } as NodeJS.ProcessEnv,
    });
    const overlay = await service.resumeRun({
      runId: 'run-3',
      env: { VELA_RUNTIME_KEY: 'rt', VELA_API_URL: 'https://amr.example' } as NodeJS.ProcessEnv,
    });

    expect(overlay).toMatchObject({
      state: 'recovering_blocked',
      userAction: 'switch_amr_user',
      blockReason: 'wrong_user',
    });
  });

  it('cleans invisible pre-registered operations on terminal failure', async () => {
    const dataDir = tempDataDir();
    const service = createAmrCloudRecoveryService({
      dataDir,
      fetchImpl: async () => jsonResponse({ operationId: 'op-4', retryToken: 't', status: 'active', version: 1 }),
    });
    const env = { VELA_RUNTIME_KEY: 'rt', VELA_API_URL: 'https://amr.example' } as NodeJS.ProcessEnv;

    await service.prepareRun({ run: { id: 'run-4' }, env });
    const overlay = await service.markTerminal({ runId: 'run-4', terminal: 'fail', env });

    expect(overlay).toBeNull();
    expect(service.getContextForRun('run-4')).toBeNull();
  });
});
