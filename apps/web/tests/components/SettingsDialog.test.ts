import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentRefreshOptionsForConfig,
  canFetchProviderModels,
  canRunProviderConnectionTest,
  deriveComposioCredentialState,
  configForManualOrbitRun,
  isOrbitRunDisabled,
  isValidApiBaseUrl,
  mergeProviderModelOptions,
  sanitizeSettingsSavePayload,
  shouldEnableSettingsSave,
  shouldShowCustomModelInput,
  persistConfigAndRunOrbit,
  switchApiProtocolConfig,
  testStatusVariant,
  updateAgentCliEnvValue,
  updateCurrentApiProtocolConfig,
} from '../../src/components/SettingsDialog';
import type { AppConfig, ConnectionTestResponse } from '../../src/types';

const originalFetch = globalThis.fetch;

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SettingsDialog API protocol switching', () => {
  it('stores the current custom protocol config while preserving custom endpoint details', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiKey: 'anthropic-key',
      apiProviderBaseUrl: null,
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
    };

    const next = switchApiProtocolConfig(config, 'openai');

    expect(next).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
      apiProviderBaseUrl: null,
    });
    expect(next.apiProtocolConfigs?.anthropic).toMatchObject({
      apiKey: 'anthropic-key',
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
      apiProviderBaseUrl: null,
    });
  });

  it('restores each protocol draft instead of leaking shared field values', () => {
    const openai = switchApiProtocolConfig(baseConfig, 'openai');
    const openaiEdited = updateCurrentApiProtocolConfig(openai, {
      apiKey: 'openai-key',
      baseUrl: 'https://openai-proxy.example.com',
      model: 'openai-model',
      apiProviderBaseUrl: null,
    });
    const google = switchApiProtocolConfig(openaiEdited, 'google');
    const googleEdited = updateCurrentApiProtocolConfig(google, {
      apiKey: 'google-key',
      baseUrl: 'https://google-proxy.example.com',
      model: 'google-model',
      apiProviderBaseUrl: null,
    });

    const restoredOpenai = switchApiProtocolConfig(googleEdited, 'openai');

    expect(restoredOpenai).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'openai-key',
      baseUrl: 'https://openai-proxy.example.com',
      model: 'openai-model',
      apiProviderBaseUrl: null,
    });
    expect(restoredOpenai.apiProtocolConfigs?.google).toMatchObject({
      apiKey: 'google-key',
      baseUrl: 'https://google-proxy.example.com',
      model: 'google-model',
      apiProviderBaseUrl: null,
    });
  });

  it('loads the new protocol default on first visit', () => {
    expect(switchApiProtocolConfig(baseConfig, 'openai')).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });
  });

  it('auto-fills Google defaults when switching from a selected known provider', () => {
    expect(switchApiProtocolConfig(baseConfig, 'google')).toMatchObject({
      mode: 'api',
      apiProtocol: 'google',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.0-flash',
      apiProviderBaseUrl: 'https://generativelanguage.googleapis.com',
    });
  });

  it('keeps Azure API version in the Azure draft only', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiProtocol: 'azure',
      apiKey: 'azure-key',
      model: 'deployment-one',
      apiVersion: '2024-10-21',
    };

    const next = switchApiProtocolConfig(config, 'openai');

    expect(next).toMatchObject({
      apiProtocol: 'openai',
      apiKey: '',
      apiVersion: '',
    });
    expect(next.apiProtocolConfigs?.azure).toMatchObject({
      apiKey: 'azure-key',
      model: 'deployment-one',
      apiVersion: '2024-10-21',
    });
  });
});

describe('SettingsDialog test status variant', () => {
  const baseResult: ConnectionTestResponse = { ok: false, kind: 'unknown', latencyMs: 0 };
  it('returns success for an ok result', () => {
    expect(testStatusVariant({ ok: true, kind: 'success', latencyMs: 12 })).toBe(
      'success',
    );
  });
  it('returns warn for rate-limit (config still looks valid)', () => {
    expect(testStatusVariant({ ...baseResult, kind: 'rate_limited' })).toBe(
      'warn',
    );
  });
  it('returns error for the failure kinds', () => {
    for (const kind of [
      'auth_failed',
      'forbidden',
      'not_found_model',
      'invalid_model_id',
      'invalid_base_url',
      'upstream_unavailable',
      'timeout',
      'agent_not_installed',
      'agent_spawn_failed',
      'unknown',
    ] as const) {
      expect(testStatusVariant({ ...baseResult, kind })).toBe('error');
    }
  });
});

describe('SettingsDialog provider connection test requirements', () => {
  it('allows Azure tests to use the daemon default API version', () => {
    expect(
      canRunProviderConnectionTest({
        apiKey: 'azure-key',
        baseUrl: 'https://my-azure.openai.azure.com',
        model: 'deployment-one',
      }),
    ).toBe(true);
  });

  it('still requires the shared provider fields', () => {
    expect(
      canRunProviderConnectionTest({ ...baseConfig, apiKey: '' }),
    ).toBe(false);
    expect(
      canRunProviderConnectionTest({ ...baseConfig, baseUrl: '' }),
    ).toBe(false);
    expect(
      canRunProviderConnectionTest({ ...baseConfig, model: '' }),
    ).toBe(false);
  });
});

describe('SettingsDialog provider model fetch helpers', () => {
  it('requires key, valid base URL, and a supported protocol', () => {
    expect(
      canFetchProviderModels(
        { apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' },
        'openai',
      ),
    ).toBe(true);
    expect(
      canFetchProviderModels(
        { apiKey: '', baseUrl: 'https://api.openai.com/v1' },
        'openai',
      ),
    ).toBe(false);
    expect(
      canFetchProviderModels(
        { apiKey: 'sk-openai', baseUrl: 'http://10.0.0.5:11434/v1' },
        'openai',
      ),
    ).toBe(false);
    expect(
      canFetchProviderModels(
        { apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com' },
        'azure',
      ),
    ).toBe(false);
    expect(
      canFetchProviderModels(
        { apiKey: 'ollama-key', baseUrl: 'https://ollama.com' },
        'ollama',
      ),
    ).toBe(false);
  });

  it('merges fetched provider models before static suggestions without duplicates', () => {
    expect(
      mergeProviderModelOptions(
        [
          { id: 'remote-a', label: 'Remote A' },
          { id: 'gpt-4o', label: 'Remote GPT' },
        ],
        ['gpt-4o', 'o4-mini'],
      ),
    ).toEqual([
      { id: 'remote-a', label: 'Remote A' },
      { id: 'gpt-4o', label: 'Remote GPT' },
      { id: 'o4-mini', label: 'o4-mini' },
    ]);
  });
});

describe('SettingsDialog custom model picker state', () => {
  it('keeps custom input visible while an intermediate value matches a known model', () => {
    expect(
      shouldShowCustomModelInput('gpt-5', ['gpt-5', 'o3'], true),
    ).toBe(true);
  });

  it('uses the dropdown when a known model is selected outside custom mode', () => {
    expect(
      shouldShowCustomModelInput('gpt-5', ['gpt-5', 'o3'], false),
    ).toBe(false);
  });

  it('shows custom input for unknown or empty model values', () => {
    expect(
      shouldShowCustomModelInput('gpt-5.5', ['gpt-5', 'o3'], false),
    ).toBe(true);
    expect(shouldShowCustomModelInput('', ['gpt-5', 'o3'], false)).toBe(true);
  });
});

describe('SettingsDialog API Base URL validation', () => {
  it('accepts public http/https URLs and loopback local providers', () => {
    expect(isValidApiBaseUrl('https://api.openai.com/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://127.0.0.1:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://[::1]:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://[::ffff:127.0.0.1]:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('  https://resource.openai.azure.com  ')).toBe(true);

    expect(isValidApiBaseUrl('ddddd')).toBe(false);
    expect(isValidApiBaseUrl('api.openai.com/v1')).toBe(false);
    expect(isValidApiBaseUrl('ftp://api.example.com')).toBe(false);
    expect(isValidApiBaseUrl('http:api.example.com')).toBe(false);
    expect(isValidApiBaseUrl('https://')).toBe(false);
    expect(isValidApiBaseUrl('http://0.0.0.0:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://10.0.0.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://100.64.0.1:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://169.254.1.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://172.16.0.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://192.168.1.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://224.0.0.1:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[::]:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[fd00::1]:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[fe80::1]:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[::ffff:192.168.1.5]:11434/v1')).toBe(false);
  });
});

describe('SettingsDialog agent CLI env settings', () => {
  it('updates supported per-agent CLI env values without dropping sibling agents', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    };

    const next = updateAgentCliEnvValue(
      config,
      'claude',
      'CLAUDE_CONFIG_DIR',
      '  ~/.claude-2  ',
    );

    expect(next.agentCliEnv).toEqual({
      claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
      codex: { CODEX_HOME: '~/.codex-alt' },
    });
  });

  it('updates additional Codex CLI env values without dropping sibling Codex fields', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    };

    const next = updateAgentCliEnvValue(
      config,
      'codex',
      'CODEX_BIN',
      '  ~/bin/codex-next  ',
    );

    expect(next.agentCliEnv).toEqual({
      codex: { CODEX_HOME: '~/.codex-alt', CODEX_BIN: '~/bin/codex-next' },
    });
  });

  it('removes empty per-agent CLI env entries', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    };

    const next = updateAgentCliEnvValue(
      config,
      'claude',
      'CLAUDE_CONFIG_DIR',
      '',
    );

    expect(next.agentCliEnv).toEqual({
      codex: { CODEX_HOME: '~/.codex-alt' },
    });
  });

  it('passes pending CLI env prefs through agent rescan options', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-pending' },
      },
    };

    expect(agentRefreshOptionsForConfig(config)).toEqual({
      throwOnError: true,
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-pending' },
      },
    });
  });

  it('passes an empty CLI env object through agent rescan after fields are cleared', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {},
    };

    expect(agentRefreshOptionsForConfig(config)).toEqual({
      throwOnError: true,
      agentCliEnv: {},
    });
  });
});

describe('deriveComposioCredentialState', () => {
  // Issue #741: when a Composio API key is already saved and the user
  // starts typing a draft replacement, the saved-key indicator must
  // stay visible. The previous code conflated `saved + draft` with
  // `draft only` and made the badge vanish on the first keystroke.

  it('returns "empty" when nothing is configured and the field is empty', () => {
    expect(deriveComposioCredentialState({})).toBe('empty');
    expect(deriveComposioCredentialState(null)).toBe('empty');
    expect(deriveComposioCredentialState(undefined)).toBe('empty');
    expect(deriveComposioCredentialState({ apiKey: '' })).toBe('empty');
    expect(deriveComposioCredentialState({ apiKey: '   ' })).toBe('empty');
  });

  it('returns "saved" when a key is configured and no draft is being typed', () => {
    expect(
      deriveComposioCredentialState({ apiKeyConfigured: true }),
    ).toBe('saved');
    expect(
      deriveComposioCredentialState({ apiKey: '', apiKeyConfigured: true }),
    ).toBe('saved');
    expect(
      deriveComposioCredentialState({ apiKey: '   ', apiKeyConfigured: true }),
    ).toBe('saved');
  });

  it('returns "pending-new" when only a draft is being typed (no saved key)', () => {
    expect(deriveComposioCredentialState({ apiKey: 'sk-draft' })).toBe('pending-new');
    expect(
      deriveComposioCredentialState({ apiKey: 'sk-draft', apiKeyConfigured: false }),
    ).toBe('pending-new');
  });

  it('returns "saved-pending" when a key is saved AND a draft is being typed', () => {
    // Regression: this is the state that previously masqueraded as
    // "pending-new" and made the saved-key badge disappear.
    expect(
      deriveComposioCredentialState({ apiKey: 'sk-replacement', apiKeyConfigured: true }),
    ).toBe('saved-pending');
  });

  it('treats whitespace-only drafts as no draft so the badge is anchored on "saved"', () => {
    expect(
      deriveComposioCredentialState({ apiKey: '   \t\n', apiKeyConfigured: true }),
    ).toBe('saved');
  });
});

describe('SettingsDialog Orbit run behavior', () => {
  it('keeps manual Orbit runs disabled while connector availability is still loading', () => {
    expect(isOrbitRunDisabled(false, null)).toBe(true);
  });

  it('allows manual Orbit runs once loading finishes and a connector is available', () => {
    expect(isOrbitRunDisabled(false, 1)).toBe(false);
  });

  it('persists the current orbit template config before starting the run', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (url === '/api/app-config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/orbit/run') {
        return new Response(JSON.stringify({ projectId: 'orbit-project', agentRunId: 'run-1' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit({
        ...baseConfig,
        orbit: {
          enabled: true,
          time: '09:30',
          templateSkillId: 'orbit-template-1',
        },
      }),
    ).resolves.toEqual({ projectId: 'orbit-project', agentRunId: 'run-1' });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      url: '/api/app-config',
      method: 'PUT',
    });
    expect(JSON.parse(calls[0]!.body ?? '{}')).toMatchObject({
      orbit: {
        enabled: true,
        time: '09:30',
        templateSkillId: 'orbit-template-1',
      },
    });
    expect(calls[1]).toMatchObject({
      url: '/api/orbit/run',
      method: 'POST',
    });
  });

  it('does not sync an unsaved Composio draft before starting a manual Orbit run', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (url === '/api/media/config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/app-config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/orbit/run') {
        return new Response(JSON.stringify({ projectId: 'orbit-project', agentRunId: 'run-3' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit({
        ...baseConfig,
        composio: { apiKey: 'cmp_new_key', apiKeyConfigured: false },
        mediaProviders: {
          openai: { apiKey: 'media-key', baseUrl: '' },
        },
        orbit: {
          enabled: true,
          time: '09:30',
          templateSkillId: 'orbit-template-1',
        },
      }),
    ).resolves.toEqual({ projectId: 'orbit-project', agentRunId: 'run-3' });

    expect(calls.map((call) => call.url)).toEqual([
      '/api/media/config',
      '/api/app-config',
      '/api/orbit/run',
    ]);
    expect(JSON.parse(calls[0]!.body ?? '{}')).toMatchObject({ force: false });
  });

  it('does not force an explicit empty media provider map before starting a manual Orbit run', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (url === '/api/media/config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/app-config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/orbit/run') {
        return new Response(JSON.stringify({ projectId: 'orbit-project', agentRunId: 'run-4' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit({
        ...baseConfig,
        mediaProviders: {},
        orbit: {
          enabled: true,
          time: '09:30',
          templateSkillId: 'orbit-template-1',
        },
      }),
    ).resolves.toEqual({ projectId: 'orbit-project', agentRunId: 'run-4' });

    expect(calls.map((call) => call.url)).toEqual(['/api/media/config', '/api/app-config', '/api/orbit/run']);
    expect(JSON.parse(calls[0]!.body ?? '{}')).toMatchObject({
      providers: {},
      force: false,
    });
  });

  it('preserves masked daemon media keys before starting a manual Orbit run', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (url === '/api/media/config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/app-config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/orbit/run') {
        return new Response(JSON.stringify({ projectId: 'orbit-project', agentRunId: 'run-preserve' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit(
        {
          ...baseConfig,
          mediaProviders: {
            openai: {
              apiKey: '',
              apiKeyConfigured: true,
              apiKeyTail: '1234',
              baseUrl: 'https://custom.example/v1',
            },
          },
        },
        {
          daemonProviders: {
            openai: {
              apiKey: '',
              apiKeyConfigured: true,
              apiKeyTail: '1234',
              baseUrl: '',
            },
          },
        },
      ),
    ).resolves.toEqual({ projectId: 'orbit-project', agentRunId: 'run-preserve' });

    expect(JSON.parse(calls[0]!.body ?? '{}')).toMatchObject({
      providers: {
        openai: {
          preserveApiKey: true,
          baseUrl: 'https://custom.example/v1',
        },
      },
      force: false,
    });
  });

  it('does not start a manual Orbit run when saving app config fails', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url === '/api/app-config') {
        return new Response(null, { status: 500 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit({
        ...baseConfig,
        composio: { apiKey: 'cmp_new_key', apiKeyConfigured: false },
      }),
    ).rejects.toThrow('Failed to sync app config (500)');

    expect(calls).toEqual(['/api/app-config']);
  });

  it('still starts a manual Orbit run when saving media credentials fails', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url === '/api/media/config') {
        return new Response(null, { status: 500 });
      }
      if (url === '/api/app-config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/orbit/run') {
        return new Response(JSON.stringify({ projectId: 'orbit-project', agentRunId: 'run-media-failed' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit({
        ...baseConfig,
        mediaProviders: {
          openai: { apiKey: 'media-key', baseUrl: '' },
        },
      }),
    ).resolves.toEqual({ projectId: 'orbit-project', agentRunId: 'run-media-failed' });

    expect(calls).toEqual([
      { url: '/api/media/config', method: 'PUT' },
      { url: '/api/app-config', method: 'PUT' },
      { url: '/api/orbit/run', method: 'POST' },
    ]);
  });

  it('persists the displayed default template before starting a legacy null-template run', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url, method, body });

      if (url === '/api/app-config') {
        return new Response(null, { status: 204 });
      }
      if (url === '/api/orbit/run') {
        return new Response(JSON.stringify({ projectId: 'orbit-project', agentRunId: 'run-2' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    await expect(
      persistConfigAndRunOrbit(configForManualOrbitRun({
        ...baseConfig,
        orbit: {
          enabled: true,
          time: '09:30',
          templateSkillId: null,
        },
      })),
    ).resolves.toEqual({ projectId: 'orbit-project', agentRunId: 'run-2' });

    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0]!.body ?? '{}')).toMatchObject({
      orbit: {
        enabled: true,
        time: '09:30',
        templateSkillId: 'orbit-general',
      },
    });
    expect(calls[1]).toMatchObject({
      url: '/api/orbit/run',
      method: 'POST',
    });
  });
});

describe('shouldEnableSettingsSave', () => {
  // Issue #739: when the user toggles BYOK on the execution section without
  // filling required fields and then navigates to a different sidebar section
  // (language, appearance, ...), the footer Save button must reflect the
  // destination section's state, not the execution section's incomplete mode.

  const validApiCfg: AppConfig = {
    ...baseConfig,
    mode: 'api',
    apiKey: 'sk-x',
    model: 'claude-sonnet-4-5',
  };

  const incompleteApiCfg: AppConfig = {
    ...baseConfig,
    mode: 'api',
    apiKey: '', // user toggled BYOK but did not fill in fields
    model: '',
  };

  const validDaemonCfg: AppConfig = {
    ...baseConfig,
    mode: 'daemon',
    agentId: 'claude-code',
  };

  const availableAgent = { id: 'claude-code', available: true };
  const unavailableAgent = { id: 'claude-code', available: false };

  it('returns true on any non-execution section regardless of mode completeness (the fix for #739)', () => {
    // The exact scenario from the issue: incomplete BYOK on execution must
    // not block save on language, appearance, composio, etc.
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'language', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'appearance', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'composio', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'media', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'integrations', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'notifications', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'pet', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'skills', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'designSystems', [availableAgent], true)).toBe(true);
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'about', [availableAgent], true)).toBe(true);
  });

  it('on execution + daemon: returns true only when an available agent is selected', () => {
    expect(shouldEnableSettingsSave(validDaemonCfg, 'execution', [availableAgent], false)).toBe(true);
    expect(
      shouldEnableSettingsSave(
        { ...validDaemonCfg, agentId: null },
        'execution',
        [availableAgent],
        false,
      ),
    ).toBe(false);
    expect(shouldEnableSettingsSave(validDaemonCfg, 'execution', [unavailableAgent], false)).toBe(false);
    expect(shouldEnableSettingsSave(validDaemonCfg, 'execution', [], false)).toBe(false);
  });

  it('on execution + api: returns true only when apiKey, model, and baseUrl are all valid', () => {
    expect(shouldEnableSettingsSave(validApiCfg, 'execution', [], true)).toBe(true);
    expect(shouldEnableSettingsSave({ ...validApiCfg, apiKey: '' }, 'execution', [], true)).toBe(false);
    expect(shouldEnableSettingsSave({ ...validApiCfg, apiKey: '   ' }, 'execution', [], true)).toBe(false);
    expect(shouldEnableSettingsSave({ ...validApiCfg, model: '' }, 'execution', [], true)).toBe(false);
    expect(shouldEnableSettingsSave(validApiCfg, 'execution', [], false)).toBe(false);
  });

  it('on execution: incomplete BYOK still disables save (existing behavior preserved)', () => {
    // Regression guard so that #739's fix only changes the cross-section
    // behavior, not the within-execution-section validity check.
    expect(shouldEnableSettingsSave(incompleteApiCfg, 'execution', [availableAgent], true)).toBe(false);
  });
});

describe('sanitizeSettingsSavePayload', () => {
  // Round-2 review on PR #827 (lefarcen + chatgpt-codex + mrcfps): enabling
  // Save on non-execution sections is the right UX, but the click still
  // calls onSave(cfg, ...) which writes the entire draft to localStorage.
  // If the user toggled BYOK without filling apiKey/model and then saved an
  // unrelated Language change, the broken execution mode would persist and
  // leave the app unable to run queries. The sanitize helper reverts the
  // execution-mode fields to `initial` in that exact case.

  const initialDaemon: AppConfig = {
    ...baseConfig,
    mode: 'daemon',
    apiKey: 'pre-existing-key',
    apiProtocol: 'anthropic',
    apiVersion: '2024-01-01',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    agentId: 'claude-code',
    agentCliEnv: { claude: { CLAUDE_CONFIG_DIR: '~/.claude' } },
    maxTokens: 8000,
  };

  const draftWithIncompleteBYOK: AppConfig = {
    ...initialDaemon,
    mode: 'api',
    apiKey: '',
    model: '',
    // Simulate the user's Appearance change carrying through cfg too.
    theme: 'dark',
  };

  const availableAgent = { id: 'claude-code', available: true };

  it('reverts execution-mode fields to initial when saving from a non-execution section with incomplete BYOK', () => {
    // The exact P1 from lefarcen + chatgpt-codex + mrcfps: persisting
    // mode='api' with empty credentials must NOT happen when the user
    // saves from a non-execution section.
    const sanitized = sanitizeSettingsSavePayload(
      draftWithIncompleteBYOK,
      initialDaemon,
      'language',
      [availableAgent],
      true,
    );

    // Execution-mode fields are restored from initial:
    expect(sanitized.mode).toBe('daemon');
    expect(sanitized.apiKey).toBe('pre-existing-key');
    expect(sanitized.apiProtocol).toBe('anthropic');
    expect(sanitized.apiVersion).toBe('2024-01-01');
    expect(sanitized.apiProviderBaseUrl).toBe('https://api.anthropic.com');
    expect(sanitized.baseUrl).toBe('https://api.anthropic.com');
    expect(sanitized.model).toBe('claude-sonnet-4-5');
    expect(sanitized.agentId).toBe('claude-code');
    expect(sanitized.agentCliEnv).toEqual({ claude: { CLAUDE_CONFIG_DIR: '~/.claude' } });
    expect(sanitized.maxTokens).toBe(8000);

    // The non-execution change (theme) is preserved:
    expect(sanitized.theme).toBe('dark');
  });

  it('passes the cfg through unchanged when execution config is already valid', () => {
    // A user with a valid BYOK setup who navigates to a non-execution
    // section and saves expects their pre-existing valid execution config
    // AND their non-execution change to land. No reversion.
    const validApiInitial: AppConfig = {
      ...baseConfig,
      mode: 'api',
      apiKey: 'sk-valid',
      model: 'claude-sonnet-4-5',
      baseUrl: 'https://api.anthropic.com',
    };
    const draftWithThemeChange: AppConfig = { ...validApiInitial, theme: 'light' };

    const sanitized = sanitizeSettingsSavePayload(
      draftWithThemeChange,
      validApiInitial,
      'appearance',
      [availableAgent],
      true,
    );

    expect(sanitized).toEqual(draftWithThemeChange);
  });

  it('passes the cfg through unchanged on the execution section itself', () => {
    // Within the execution section, the canSave gate already blocks
    // incomplete-BYOK saves, so we explicitly do NOT sanitize here:
    // any draft the user CAN save from execution is one they intend to
    // commit as a real execution-config change.
    const sanitized = sanitizeSettingsSavePayload(
      draftWithIncompleteBYOK,
      initialDaemon,
      'execution',
      [availableAgent],
      true,
    );
    expect(sanitized).toBe(draftWithIncompleteBYOK);
  });

  it('reverts on every non-execution section, not just language', () => {
    // The fix must cover every sidebar section that does not own execution
    // fields, otherwise a save from any one of them could leak the
    // incomplete BYOK draft.
    const sections: Array<Parameters<typeof sanitizeSettingsSavePayload>[2]> = [
      'media',
      'composio',
      'integrations',
      'language',
      'appearance',
      'notifications',
      'pet',
      'skills',
      'designSystems',
      'about',
    ];
    for (const section of sections) {
      const sanitized = sanitizeSettingsSavePayload(
        draftWithIncompleteBYOK,
        initialDaemon,
        section,
        [availableAgent],
        true,
      );
      expect(sanitized.mode).toBe('daemon');
      expect(sanitized.apiKey).toBe('pre-existing-key');
      expect(sanitized.agentId).toBe('claude-code');
    }
  });

  it('preserves the non-execution change even when the daemon agent is unavailable in the registry passed in', () => {
    // Edge case: user originally had a valid daemon mode with available
    // agent. They didn't touch execution. The agent later went unavailable
    // (e.g., daemon offline). Saving an Appearance change should still
    // preserve the user's existing daemon selection because the revert
    // path uses initial as the source of truth, not the live agent registry.
    const sanitized = sanitizeSettingsSavePayload(
      { ...initialDaemon, theme: 'system' },
      initialDaemon,
      'appearance',
      [{ id: 'claude-code', available: false }],
      true,
    );
    // Execution fields land equal to initial regardless of revert path,
    // and the appearance change survives.
    expect(sanitized.mode).toBe('daemon');
    expect(sanitized.agentId).toBe('claude-code');
    expect(sanitized.theme).toBe('system');
  });
});
