import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __forTestHasCompleteByokOpenCodeConfig,
  __forTestWithoutSensitiveRunInput,
} from '../../src/routes/runs.js';

// A daemon data root with no OrcaRouter credential: the OrcaRouter cases below
// assert the client must carry its own key when neither the environment nor the
// daemon store holds one.
const EMPTY_DATA_DIR = '/nonexistent-open-design-data-root';

const ORCA_KEY_ENV = ['ORCA_API_KEY', 'OD_ORCAROUTER_API_KEY', 'ORCAROUTER_API_KEY'];

describe('BYOK run input boundary', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // The host environment exports one of these names (the daemon reads it for
    // a self-hosted/CI deployment), and an env key legitimately wins over the
    // store. Clear it so the store/absence is what each case exercises.
    for (const name of ORCA_KEY_ENV) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ORCA_KEY_ENV) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it('accepts a complete run-scoped Local BYOK provider', async () => {
    await expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
      model: 'gpt-5.4-mini',
      byokProvider: {
        protocol: 'openai',
        apiKey: 'local-only-secret',
        baseUrl: 'https://api.openai.com/v1',
      },
    }, EMPTY_DATA_DIR)).resolves.toBe(true);
  });

  it('rejects a BYOK run without a run-scoped provider', async () => {
    await expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
    }, EMPTY_DATA_DIR)).resolves.toBe(false);
  });

  it('accepts a keyless run-scoped provider when the protocol permits it', async () => {
    await expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
      model: 'local-model',
      byokProvider: {
        protocol: 'openai',
        baseUrl: 'http://127.0.0.1:1234/v1',
        requiresApiKey: false,
      },
    }, EMPTY_DATA_DIR)).resolves.toBe(true);
  });

  it('still requires the key when neither env nor store holds an OrcaRouter credential', async () => {
    await expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
      model: 'openai/gpt-5.5',
      byokProvider: {
        protocol: 'orcarouter',
        apiKey: '',
        baseUrl: 'https://api.orcarouter.ai/v1',
      },
    }, EMPTY_DATA_DIR)).resolves.toBe(false);
  });

  it('accepts the named OrcaRouter provider keyless when the environment supplies the key', async () => {
    process.env.ORCA_API_KEY = 'sk-orca-env-not-a-real-key';
    await expect(__forTestHasCompleteByokOpenCodeConfig({
      agentId: 'byok-opencode',
      model: 'openai/gpt-5.5',
      byokProvider: {
        protocol: 'orcarouter',
        apiKey: '',
        baseUrl: 'https://api.orcarouter.ai/v1',
      },
    }, EMPTY_DATA_DIR)).resolves.toBe(true);
  });

  it('removes credential-bearing and server-owned fields before persistence', () => {
    const sanitized = __forTestWithoutSensitiveRunInput({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      byokProvider: { apiKey: 'nested-secret' },
      apiKey: 'top-level-secret',
      rechargeResumeCapability: 'capability-secret',
      workspaceScope: {
        schemaVersion: 1,
        projectId: 'forged-project',
        workspaceId: 'forged-workspace',
        workspaceMemberId: 'forged-member',
        source: 'persisted_project_binding',
      },
      message: 'Create a site',
    });

    expect(sanitized).toEqual({
      agentId: 'byok-opencode',
      message: 'Create a site',
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret');
  });
});
