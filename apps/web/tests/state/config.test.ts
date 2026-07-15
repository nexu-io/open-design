import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMediaProvidersForDaemonSave,
  DEFAULT_CONFIG,
  fetchMediaProvidersFromDaemon,
  isStoredMediaProviderEntryEmpty,
  isStoredMediaProviderEntryPresent,
  KNOWN_PROVIDERS,
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

describe('KNOWN_PROVIDERS', () => {
  it('includes separate SiliconFlow CN and Global presets', () => {
    expect(
      KNOWN_PROVIDERS.filter((provider) => provider.label.startsWith('SiliconFlow')),
    ).toEqual([
      expect.objectContaining({
        label: 'SiliconFlow (CN)',
        protocol: 'openai',
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'deepseek-ai/DeepSeek-V3.1',
      }),
      expect.objectContaining({
        label: 'SiliconFlow (Global)',
        protocol: 'openai',
        baseUrl: 'https://api.siliconflow.com/v1',
        model: 'deepseek-ai/DeepSeek-V3.1',
      }),
    ]);
  });
});

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

  it('syncs CLI API key env values and intent to daemon app config while localStorage strips them', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncConfigToDaemon({
      ...DEFAULT_CONFIG,
      agentCliEnv: {
        claude: { ANTHROPIC_API_KEY: 'sk-anthropic', ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic' },
        codex: { OPENAI_API_KEY: 'sk-openai', OPENAI_BASE_URL: 'https://proxy.example/openai' },
      },
      agentCliEnvIntent: {
        claude: { apiKeyOverride: true },
        codex: { apiKeyOverride: true },
      },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      agentCliEnv: {
        claude: { ANTHROPIC_API_KEY: 'sk-anthropic', ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic' },
        codex: { OPENAI_API_KEY: 'sk-openai', OPENAI_BASE_URL: 'https://proxy.example/openai' },
      },
      agentCliEnvIntent: {
        claude: { apiKeyOverride: true },
        codex: { apiKeyOverride: true },
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

  it('syncs the silent update preference to daemon app config', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await syncConfigToDaemon({
      ...DEFAULT_CONFIG,
      allowSilentUpdates: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toMatchObject({
      allowSilentUpdates: true,
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

  it('uses daemon CLI env intent instead of merging with stale local entries', () => {
    const merged = mergeDaemonConfig(
      {
        ...DEFAULT_CONFIG,
        agentCliEnvIntent: {
          claude: { apiKeyOverride: true },
        },
      },
      {
        agentCliEnvIntent: {
          codex: { apiKeyOverride: true },
        },
      },
    );

    expect(merged.agentCliEnvIntent).toEqual({
      codex: { apiKeyOverride: true },
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

  it('defaults reporting on and mints an installationId when the install never opted out', () => {
    // Brand-new install: the daemon has no privacy state at all. The product
    // default telemetry channels (metrics + content) are on and an anonymous
    // id is assigned so events have a stable distinct id. This mirrors the
    // first-run banner's "Share" payload; artifactManifest stays
    // off, matching that surface.
    const merged = mergeDaemonConfig(DEFAULT_CONFIG, {});

    expect(merged.telemetry?.metrics).toBe(true);
    expect(merged.telemetry?.content).toBe(true);
    expect(merged.telemetry?.artifactManifest).toBe(false);
    expect(typeof merged.installationId).toBe('string');
    expect(merged.installationId).toBeTruthy();
  });

  it('mints an installationId for a reporting install that somehow has none', () => {
    // The "on but no id" state that surfaces as "Opted out" in Settings:
    // metrics is on but no anonymous id was ever assigned.
    const merged = mergeDaemonConfig(DEFAULT_CONFIG, {
      telemetry: { metrics: true, content: false, artifactManifest: false },
      installationId: null,
    });

    expect(merged.telemetry?.metrics).toBe(true);
    expect(merged.installationId).toBeTruthy();
  });

  it('preserves an explicit opt-out and never re-mints an id', () => {
    const merged = mergeDaemonConfig(DEFAULT_CONFIG, {
      telemetry: { metrics: false, content: false, artifactManifest: false },
      installationId: null,
      privacyDecisionAt: 1778244000000,
    });

    expect(merged.telemetry?.metrics).toBe(false);
    expect(merged.installationId == null).toBe(true);
  });

  it('uses daemon silent update preference and clears stale local values when absent', () => {
    expect(
      mergeDaemonConfig(DEFAULT_CONFIG, { allowSilentUpdates: false }).allowSilentUpdates,
    ).toBe(false);
    expect(
      mergeDaemonConfig(DEFAULT_CONFIG, { allowSilentUpdates: true }).allowSilentUpdates,
    ).toBe(true);
    expect(
      mergeDaemonConfig({ ...DEFAULT_CONFIG, allowSilentUpdates: true }, {}).allowSilentUpdates,
    ).toBeUndefined();
  });
});

describe('mergeDaemonMediaProviders', () => {
  it('preserves a local pending media-provider edit while adopting daemon saved-marker metadata', () => {
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
      { preserveLocalProviderIds: new Set(['openai']) },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: 'sk-local',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: 'https://local.example/v1',
      },
    });
  });

  it('preserves local pending edits and unrelated local-only providers when daemon returns a partial provider set', () => {
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
      { preserveLocalProviderIds: new Set(['openai']) },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: 'sk-local-openai',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: 'https://local-openai.example/v1',
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

  it('preserves local pending media-provider edits when daemon reload returns saved marker state', () => {
    const merged = mergeDaemonMediaProviders(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {
          openai: {
            apiKey: 'sk-local-pending',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: 'https://local-pending.example/v1',
          },
        },
      },
      {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '9876',
          baseUrl: 'https://daemon.example/v1',
        },
      },
      { preserveLocalProviderIds: new Set(['openai']) },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: 'sk-local-pending',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: 'https://local-pending.example/v1',
      },
    });
  });

  it('refreshes ordinary saved-marker rows from daemon state when there is no unsaved local secret', () => {
    const merged = mergeDaemonMediaProviders(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '1234',
            baseUrl: 'https://local-saved.example/v1',
            model: 'gpt-image-1',
          },
        },
      },
      {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '9876',
          baseUrl: 'https://daemon.example/v1',
          model: 'gpt-image-1-mini',
        },
      },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '9876',
        baseUrl: 'https://daemon.example/v1',
        model: 'gpt-image-1-mini',
      },
    });
  });

  it('prefers daemon-backed media provider state during startup reloads by default', () => {
    const merged = mergeDaemonMediaProviders(
      {
        ...DEFAULT_CONFIG,
        mediaProviders: {
          openai: {
            apiKey: 'sk-stale-local',
            baseUrl: 'https://local-stale.example/v1',
          },
        },
      },
      {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '9876',
          baseUrl: 'https://daemon.example/v1',
        },
      },
    );

    expect(merged.mediaProviders).toEqual({
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '9876',
        baseUrl: 'https://daemon.example/v1',
      },
    });
  });

  it('refreshes browser-persisted saved rows from daemon state unless the dialog marks them dirty', () => {
    const localConfig = {
      ...DEFAULT_CONFIG,
      mediaProviders: {
        openai: {
          apiKey: 'sk-browser-saved',
          apiKeyConfigured: true,
          apiKeyTail: '1234',
          baseUrl: 'https://local-stale.example/v1',
          model: 'gpt-image-1',
        },
      },
    };

    const daemonProviders = {
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '9876',
        baseUrl: 'https://daemon.example/v1',
        model: 'gpt-image-1-mini',
      },
    };

    expect(mergeDaemonMediaProviders(localConfig, daemonProviders).mediaProviders).toEqual({
      openai: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '9876',
        baseUrl: 'https://daemon.example/v1',
        model: 'gpt-image-1-mini',
      },
    });

    expect(
      mergeDaemonMediaProviders(localConfig, daemonProviders, {
        preserveLocalProviderIds: new Set(['openai']),
      }).mediaProviders,
    ).toEqual({
      openai: {
        apiKey: 'sk-browser-saved',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
        baseUrl: 'https://local-stale.example/v1',
        model: 'gpt-image-1',
      },
    });
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
              source: 'stored',
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
          source: 'stored',
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

  it('does not persist default OpenAI base URL for OAuth-only markers', () => {
    expect(
      buildMediaProvidersForDaemonSave(
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '',
            baseUrl: '',
            source: 'oauth-codex',
          },
        },
        {
          openai: {
            apiKey: '',
            apiKeyConfigured: true,
            apiKeyTail: '',
            baseUrl: '',
            source: 'oauth-codex',
          },
        },
      ),
    ).toEqual({
      providers: {},
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

  it('migrates legacy SiliconFlow Global configs to the known OpenAI preset', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'sk-test',
      baseUrl: 'https://api.siliconflow.com/v1',
      model: 'deepseek-ai/DeepSeek-V3.1',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('openai');
    expect(config.apiProviderBaseUrl).toBe('https://api.siliconflow.com/v1');
    expect(config.configMigrationVersion).toBe(1);
  });

  it('backfills the fixed-origin base URL for AIHubMix when persisted empty', () => {
    // AIHubMix hides the Base URL field, so older configs persisted an empty
    // baseUrl. An empty base URL blocks the live model-list fetch, so loadConfig
    // must resolve it to the canonical origin.
    const persisted: Partial<AppConfig> = {
      mode: 'api',
      apiProtocol: 'aihubmix',
      apiKey: 'sk-test',
      baseUrl: '',
      model: 'claude-opus-4-8',
      configMigrationVersion: 1,
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(persisted));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('aihubmix');
    expect(config.baseUrl).toBe('https://aihubmix.com/v1');
  });

  it('leaves a non-gateway protocol base URL untouched', () => {
    const persisted: Partial<AppConfig> = {
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o',
      configMigrationVersion: 1,
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(persisted));

    expect(loadConfig().baseUrl).toBe('https://api.example.com/v1');
  });

  it('keeps custom proxy paths containing bedrock-runtime on their selected protocol', () => {
    const persisted: Partial<AppConfig> = {
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'sk-proxy',
      apiVersion: '2024-01-01',
      baseUrl: 'https://proxy.example.com/bedrock-runtime/v1',
      model: 'gpt-4o',
      configMigrationVersion: 1,
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(persisted));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('openai');
    expect(config.apiKey).toBe('sk-proxy');
    expect(config.apiVersion).toBe('2024-01-01');
    expect(config.baseUrl).toBe('https://proxy.example.com/bedrock-runtime/v1');
    expect(config.model).toBe('gpt-4o');
    expect(store.get('open-design:config')).toBe(JSON.stringify(persisted));
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

  it('downgrades legacy Bedrock Runtime configs to the default chat protocol', () => {
    const legacyConfig: Partial<AppConfig> = {
      mode: 'api',
      apiKey: 'bedrock-secret',
      apiVersion: 'bedrock-2023-05-31',
      baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(legacyConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('anthropic');
    expect(config.apiKey).toBe('');
    expect(config.apiVersion).toBe('');
    expect(config.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.apiProviderBaseUrl).toBe(DEFAULT_CONFIG.apiProviderBaseUrl);
  });

  it('downgrades explicitly persisted Bedrock configs to the default chat protocol', () => {
    const savedConfig: Partial<AppConfig> = {
      mode: 'api',
      apiProtocol: 'bedrock',
      apiKey: 'bedrock-secret',
      apiVersion: 'bedrock-2023-05-31',
      baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      model: 'amazon.nova-lite-v1:0',
      configMigrationVersion: 1,
      apiProtocolConfigs: {
        bedrock: {
          apiKey: 'nested-bedrock-secret',
          apiVersion: 'bedrock-2023-05-31',
          baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
          model: 'amazon.nova-lite-v1:0',
        },
        openai: {
          apiKey: 'sk-openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o',
        },
      },
      agentId: null,
      skillId: null,
      designSystemId: null,
    };
    store.set('open-design:config', JSON.stringify(savedConfig));

    const config = loadConfig();

    expect(config.apiProtocol).toBe('anthropic');
    expect(config.apiKey).toBe('');
    expect(config.apiVersion).toBe('');
    expect(config.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.apiProviderBaseUrl).toBe(DEFAULT_CONFIG.apiProviderBaseUrl);
    expect(config.apiProtocolConfigs?.bedrock).toBeUndefined();
    expect(config.apiProtocolConfigs?.openai).toEqual({
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });

    const persisted = JSON.parse(
      store.get('open-design:config') ?? '{}',
    ) as Partial<AppConfig>;
    expect(persisted.apiProtocol).toBe('anthropic');
    expect(persisted.apiKey).toBe('');
    expect(persisted.apiVersion).toBe('');
    expect(persisted.baseUrl).toBe(DEFAULT_CONFIG.baseUrl);
    expect(persisted.apiProtocolConfigs?.bedrock).toBeUndefined();
    expect(persisted.apiProtocolConfigs?.openai).toEqual({
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
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
    expect(DEFAULT_CONFIG.accentColor).toBe('#c96442');
  });
});

describe('saveConfig', () => {
  it('keeps daemon-owned privacy fields out of localStorage', () => {
    saveConfig({
      ...DEFAULT_CONFIG,
      installationId: 'install-1',
      privacyDecisionAt: 1778244000000,
      telemetry: { metrics: true },
      allowSilentUpdates: true,
    });

    const saved = JSON.parse(store.get('open-design:config') ?? '{}');
    expect(saved.installationId).toBeUndefined();
    expect(saved.privacyDecisionAt).toBeUndefined();
    expect(saved.telemetry).toBeUndefined();
    expect(saved.allowSilentUpdates).toBeUndefined();
  });

  it('keeps CLI API key env values out of localStorage while preserving intent and non-secret env', () => {
    saveConfig({
      ...DEFAULT_CONFIG,
      agentCliEnv: {
        claude: {
          ANTHROPIC_API_KEY: 'sk-anthropic',
          ANTHROPIC_AUTH_TOKEN: 'sk-auth-token',
          ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic',
          CLAUDE_CONFIG_DIR: '~/.claude-2',
        },
        codex: {
          CODEX_API_KEY: 'sk-codex',
          OPENAI_API_KEY: 'sk-openai',
          OPENAI_BASE_URL: 'https://proxy.example/openai',
          CODEX_HOME: '~/.codex-alt',
        },
      },
      agentCliEnvIntent: {
        claude: { apiKeyOverride: true },
        codex: { apiKeyOverride: true },
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
    expect(saved.agentCliEnvIntent).toEqual({
      claude: { apiKeyOverride: true },
      codex: { apiKeyOverride: true },
    });
  });
});
