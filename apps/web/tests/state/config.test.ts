import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMediaProvidersForDaemonSave,
  DEFAULT_CONFIG,
  fetchMediaProvidersFromDaemon,
  isStoredMediaProviderEntryEmpty,
  isStoredMediaProviderEntryPresent,
  loadConfig,
  mergeDaemonConfig,
  mergeDaemonMediaProviders,
  saveConfig,
  shouldSyncLocalMediaProvidersToDaemon,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from '../../src/state/config';
import type { AppConfig } from '../../src/types';

const store = new Map<string, string>();
const originalFetch = globalThis.fetch;

vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
});

describe('syncComposioConfigToDaemon', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('sends a pending Composio API key to the daemon', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncComposioConfigToDaemon({ apiKey: 'cmp_secret', apiKeyConfigured: false });

    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/composio/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_secret' }),
    });
  });

  it('does not clear a daemon-saved key when local state only has the saved marker', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncComposioConfigToDaemon({ apiKey: '', apiKeyConfigured: true, apiKeyTail: 'test' });

    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/composio/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
  });
});

describe('syncConfigToDaemon', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('syncs per-agent CLI env prefs to the daemon app config', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncConfigToDaemon({
      ...DEFAULT_CONFIG,
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        codex: { CODEX_HOME: '~/.codex-alt', CODEX_BIN: '~/bin/codex-next' },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/app-config');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      onboardingCompleted: DEFAULT_CONFIG.onboardingCompleted,
      agentId: DEFAULT_CONFIG.agentId,
      agentModels: DEFAULT_CONFIG.agentModels,
      skillId: DEFAULT_CONFIG.skillId,
      designSystemId: DEFAULT_CONFIG.designSystemId,
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        codex: { CODEX_HOME: '~/.codex-alt', CODEX_BIN: '~/bin/codex-next' },
      },
    });
  });

  it('syncs proxy API key env values to daemon app config while localStorage strips them', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncConfigToDaemon({
      ...DEFAULT_CONFIG,
      agentCliEnv: {
        claude: { ANTHROPIC_API_KEY: 'sk-anthropic', ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic' },
        codex: { OPENAI_API_KEY: 'sk-openai', OPENAI_BASE_URL: 'https://proxy.example/openai' },
      },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      agentCliEnv: {
        claude: { ANTHROPIC_API_KEY: 'sk-anthropic', ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic' },
        codex: { OPENAI_API_KEY: 'sk-openai', OPENAI_BASE_URL: 'https://proxy.example/openai' },
      },
    });
  });

  it('syncs daemon-owned privacy decision fields', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncConfigToDaemon({
      ...DEFAULT_CONFIG,
      installationId: 'install-1',
      privacyDecisionAt: 1778244000000,
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toMatchObject({
      installationId: 'install-1',
      privacyDecisionAt: 1778244000000,
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
  });
});

describe('syncMediaProvidersToDaemon', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('throws when a forced media sync fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));

    await expect(
      syncMediaProvidersToDaemon({}, { force: true, throwOnError: true }),
    ).rejects.toThrow('Media config save failed');
  });
});

describe('mergeDaemonConfig', () => {
  it('clears stale local CLI env prefs when the daemon has none', () => {
    const merged = mergeDaemonConfig(
      {
        ...DEFAULT_CONFIG,
        agentCliEnv: {
          claude: { CLAUDE_CONFIG_DIR: '~/.claude-old' },
        },
      },
      {
        agentId: 'codex',
      },
    );

    expect(merged.agentId).toBe('codex');
    expect(merged.agentCliEnv).toEqual({});
  });

  it('uses daemon CLI env prefs instead of merging with stale local entries', () => {
    const merged = mergeDaemonConfig(
      {
        ...DEFAULT_CONFIG,
        agentCliEnv: {
          claude: { CLAUDE_CONFIG_DIR: '~/.claude-old' },
        },
      },
      {
        agentCliEnv: {
          codex: { CODEX_HOME: '~/.codex-new', CODEX_BIN: '~/bin/codex-new' },
        },
      },
    );

    expect(merged.agentCliEnv).toEqual({
      codex: { CODEX_HOME: '~/.codex-new', CODEX_BIN: '~/bin/codex-new' },
    });
  });

  it('copies privacyDecisionAt from daemon config', () => {
    const merged = mergeDaemonConfig(DEFAULT_CONFIG, {
      installationId: 'install-1',
      privacyDecisionAt: 1778244000000,
      telemetry: { metrics: true },
    });

    expect(merged.installationId).toBe('install-1');
    expect(merged.privacyDecisionAt).toBe(1778244000000);
    expect(merged.telemetry).toEqual({ metrics: true });
  });

  it('migrates old daemon privacy config to a resolved decision', () => {
    const merged = mergeDaemonConfig(DEFAULT_CONFIG, {
      installationId: 'install-1',
      telemetry: { metrics: true },
    });

    expect(merged.installationId).toBe('install-1');
    expect(typeof merged.privacyDecisionAt).toBe('number');
  });
});

describe('mergeDaemonMediaProviders', () => {
  it('prefers daemon-backed media provider state when present', () => {
    const merged = mergeDaemonMediaProviders(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {
          openai: {
            apiKey: 'sk-local',
            baseUrl: 'https://local.example/v1',
          },
        },
      },
      {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '1234',
          baseUrl: 'https://daemon.example/v1',
        },
      },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: 'https://daemon.example/v1',
      },
    });
  });

  it('preserves local-only providers when daemon returns a partial provider set', () => {
    const merged = mergeDaemonMediaProviders(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {
          openai: {
            apiKey: 'sk-local-openai',
            baseUrl: 'https://local-openai.example/v1',
          },
          fal: {
            apiKey: 'sk-local-fal',
            baseUrl: 'https://queue.fal.run',
            model: 'fal-ai/imagen4/preview',
          },
        },
      },
      {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '1234',
          baseUrl: 'https://daemon-openai.example/v1',
        },
      },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: 'https://daemon-openai.example/v1',
      },
      fal: {
        apiKey: 'sk-local-fal',
        baseUrl: 'https://queue.fal.run',
        model: 'fal-ai/imagen4/preview',
      },
    });
  });

  it('keeps local media providers when daemon has no stored state yet', () => {
    const localConfig = {
      ...DEFAULT_CONFIG,
      mediaProviders: {
        openai: {
          apiKey: 'sk-local',
          baseUrl: 'https://local.example/v1',
        },
      },
    };

    const merged = mergeDaemonMediaProviders(localConfig, {
      openai: {
        apiKey: '',
        apiKeyConfigured: false,
        apiKeyTail: '',
        baseUrl: '',
      },
    });

    expect(merged.mediaProviders).toEqual(localConfig.mediaProviders);
  });

  it('drops stale marker-only local entries when daemon definitively has no stored state', () => {
    const merged = mergeDaemonMediaProviders(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: '',
            model: '',
          },
          fal: {
            apiKey: 'sk-local-fal',
            baseUrl: 'https://queue.fal.run',
            model: 'fal-ai/imagen4/preview',
          },
        },
      },
      {},
    );

    expect(merged.mediaProviders).toEqual({
      fal: {
        apiKey: 'sk-local-fal',
        baseUrl: 'https://queue.fal.run',
        model: 'fal-ai/imagen4/preview',
      },
    });
  });
});

describe('media provider entry presence helpers', () => {
  it('treat saved-marker entries as present even when visible fields are empty', () => {
    expect(
      isStoredMediaProviderEntryPresent({
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: '',
      }),
    ).toBe(true);
    expect(
      isStoredMediaProviderEntryEmpty({
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: '',
      }),
    ).toBe(false);
  });

  it('treats entries as empty only after clear-level fields and markers are removed', () => {
    expect(
      isStoredMediaProviderEntryEmpty({
        apiKey: '',
        apiKeyConfigured: false,
        apiKeyTail: '',
        baseUrl: '',
        model: '',
      }),
    ).toBe(true);
  });
});

describe('shouldSyncLocalMediaProvidersToDaemon', () => {
  it('returns true when local providers exist and daemon has none yet', () => {
    expect(
      shouldSyncLocalMediaProvidersToDaemon(
        {
          openai: {
            apiKey: 'sk-local',
            baseUrl: 'https://local.example/v1',
          },
        },
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: false,
            apiKeyTail: '',
            baseUrl: '',
          },
        },
      ),
    ).toBe(true);
  });

  it('returns false when daemon already has persisted media provider state', () => {
    expect(
      shouldSyncLocalMediaProvidersToDaemon(
        {
          openai: {
            apiKey: 'sk-local',
            baseUrl: 'https://local.example/v1',
          },
        },
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: '',
          },
        },
      ),
    ).toBe(false);
  });

  it('returns false when daemon media config could not be fetched', () => {
    expect(
      shouldSyncLocalMediaProvidersToDaemon(
        {
          openai: {
            apiKey: 'sk-local',
            baseUrl: 'https://local.example/v1',
          },
        },
        null,
      ),
    ).toBe(false);
  });

  it('returns false when local state only has masked saved markers', () => {
    expect(
      shouldSyncLocalMediaProvidersToDaemon(
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: '',
            model: '',
          },
        },
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: false,
            apiKeyTail: '',
            baseUrl: '',
            model: '',
          },
        },
      ),
    ).toBe(false);
  });
});

describe('fetchMediaProvidersFromDaemon', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', originalFetch);
  });

  it('maps daemon media config into masked local config state', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          providers: {
            openai: {
              configured: true,
              apiKeyTail: '1234',
              baseUrl: 'https://daemon.example/v1',
              model: 'gpt-image-1',
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMediaProvidersFromDaemon()).resolves.toEqual({
      status: 'ok',
      providers: {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '1234',
          baseUrl: 'https://daemon.example/v1',
          model: 'gpt-image-1',
        },
      },
    });
  });

  it('returns an error status when daemon media config fetch fails', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMediaProvidersFromDaemon()).resolves.toEqual({ status: 'error' });
  });
});

describe('buildMediaProvidersForDaemonSave', () => {
  it('preserves a stored key while applying daemon/default non-secret values', () => {
    expect(
      buildMediaProvidersForDaemonSave(
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: '',
          },
        },
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: '',
          },
        },
        { force: true },
      ),
    ).toEqual({
      providers: {
        openai: {
          preserveApiKey: true,
          baseUrl: 'https://api.openai.com/v1',
        },
      },
      force: true,
    });
  });

  it('keeps an existing stored key when only baseUrl or model changes', () => {
    expect(
      buildMediaProvidersForDaemonSave(
        {
          nanobanana: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '9999',
            baseUrl: 'https://custom.gateway.example',
            model: 'gemini-custom',
          },
        },
        {
          nanobanana: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '9999',
            baseUrl: 'https://generativelanguage.googleapis.com',
            model: 'gemini-3.1-flash-image-preview',
          },
        },
      ),
    ).toEqual({
      providers: {
        nanobanana: {
          preserveApiKey: true,
          baseUrl: 'https://custom.gateway.example',
          model: 'gemini-custom',
        },
      },
      force: false,
    });
  });
});

afterEach(() => {
  store.clear();
});

describe('loadConfig', () => {
  it('migrates legacy OpenAI-compatible API configs to an explicit apiProtocol', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.mode).toBe('api');
    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.model).toBe('deepseek-chat');
    expect(config.apiProtocol).toBe('openai');
    expect(config.configMigrationVersion).toBe(1);
  });

  it('migrates legacy Anthropic API configs to an explicit apiProtocol', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('anthropic');
  });

  it('infers protocol for legacy daemon-mode API fields without changing mode', () => {
    const daemonConfig: Partial<AppConfig> = {
      mode: 'daemon',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      agentId: 'codex',
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(daemonConfig));

    const config = loadConfig();

    expect(config.mode).toBe('daemon');
    expect(config.apiProtocol).toBe('openai');
    expect(config.configMigrationVersion).toBe(1);
  });

  it('migrates legacy Ollama Cloud configs to an explicit ollama apiProtocol', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'ollama-key',
      baseUrl: 'https://ollama.com',
      model: 'gpt-oss:120b',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.mode).toBe('api');
    expect(config.baseUrl).toBe('https://ollama.com');
    expect(config.model).toBe('gpt-oss:120b');
    expect(config.apiProtocol).toBe('ollama');
    expect(config.apiProviderBaseUrl).toBe('https://ollama.com');
    expect(config.configMigrationVersion).toBe(1);
  });

  it('migrates legacy ollama.com configs with a custom base URL path', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'ollama-key',
      baseUrl: 'https://ollama.com/api',
      model: 'deepseek-v4-pro',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('ollama');
    // /api suffix must be stripped so the daemon doesn't build /api/api/chat.
    expect(config.baseUrl).toBe('https://ollama.com');
  });

  it('migrates legacy ollama.com configs with a trailing /api/ suffix', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'ollama-key',
      baseUrl: 'https://ollama.com/api/',
      model: 'glm-5',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('ollama');
    expect(config.baseUrl).toBe('https://ollama.com');
  });

  it('does not overwrite an already explicit apiProtocol', () => {
    const explicitConfig: Partial<AppConfig> = {
      mode: 'api',
      apiProtocol: 'anthropic',
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(explicitConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('anthropic');
  });

  it('preserves saved settings when migration sees a malformed base URL', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://[broken-ipv6',
      model: 'custom-model',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.mode).toBe('api');
    expect(config.apiKey).toBe('sk-test');
    expect(config.baseUrl).toBe('https://[broken-ipv6');
    expect(config.model).toBe('custom-model');
    expect(config.apiProtocol).toBe('anthropic');
  });

  it('preserves a valid saved accent color', () => {
    const savedConfig: Partial<AppConfig> = {
      theme: 'dark',
      accentColor: '#4F46E5',
    };
    store.set('open-design:config', JSON.stringify(savedConfig));

    const config = loadConfig();

    expect(config.theme).toBe('dark');
    expect(config.accentColor).toBe('#4f46e5');
  });

  it('falls back to the default accent color for malformed saved colors', () => {
    const savedConfig: Partial<AppConfig> = {
      accentColor: 'blue',
    };
    store.set('open-design:config', JSON.stringify(savedConfig));

    expect(loadConfig().accentColor).toBe(DEFAULT_CONFIG.accentColor);
  });

  it('falls back to the default Orbit time for out-of-range saved times', () => {
    const savedConfig: Partial<AppConfig> = {
      orbit: {
        enabled: true,
        time: '99:99',
        templateSkillId: 'orbit-general',
      },
    };
    store.set('open-design:config', JSON.stringify(savedConfig));

    expect(loadConfig().orbit?.time).toBe(DEFAULT_CONFIG.orbit?.time);
  });

  it('returns defaults for malformed localStorage JSON', () => {
    store.set('open-design:config', '{broken-json');

    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('sets an explicit apiProtocol for new default configs', () => {
    expect(DEFAULT_CONFIG.apiProtocol).toBe('anthropic');
    expect(DEFAULT_CONFIG.configMigrationVersion).toBe(1);
  });
});

describe('saveConfig', () => {
  it('keeps daemon-owned privacy fields out of localStorage', () => {
    saveConfig({
      ...DEFAULT_CONFIG,
      installationId: 'install-1',
      privacyDecisionAt: 1778244000000,
      telemetry: { metrics: true },
    });

    const saved = JSON.parse(store.get('open-design:config') ?? '{}');
    expect(saved.installationId).toBeUndefined();
    expect(saved.privacyDecisionAt).toBeUndefined();
    expect(saved.telemetry).toBeUndefined();
  });

  it('keeps proxy API key env values out of localStorage while preserving non-secret env', () => {
    saveConfig({
      ...DEFAULT_CONFIG,
      agentCliEnv: {
        claude: {
          ANTHROPIC_API_KEY: 'sk-anthropic',
          ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic',
          CLAUDE_CONFIG_DIR: '~/.claude-2',
        },
        codex: {
          OPENAI_API_KEY: 'sk-openai',
          OPENAI_BASE_URL: 'https://proxy.example/openai',
          CODEX_HOME: '~/.codex-alt',
        },
      },
    });

    const saved = JSON.parse(store.get('open-design:config') ?? '{}');
    expect(saved.agentCliEnv.claude).toEqual({
      ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic',
      CLAUDE_CONFIG_DIR: '~/.claude-2',
    });
    expect(saved.agentCliEnv.codex).toEqual({
      OPENAI_BASE_URL: 'https://proxy.example/openai',
      CODEX_HOME: '~/.codex-alt',
    });
  });
});
