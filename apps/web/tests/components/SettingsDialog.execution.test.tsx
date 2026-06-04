// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../src/i18n/locales/en';

const {
  playSoundMock,
  requestNotificationPermissionMock,
  showCompletionNotificationMock,
  notificationPermissionMock,
  fetchCodexPetsMock,
  syncCommunityPetsMock,
  fetchSkillsMock,
  fetchDesignSystemsMock,
  fetchSkillMock,
  fetchDesignSystemMock,
  importLocalDesignSystemMock,
  importGitHubDesignSystemMock,
  fetchProviderModelsMock,
  fetchLatestGithubReleaseInfoMock,
  analyticsTrackMock,
} = vi.hoisted(() => ({
  playSoundMock: vi.fn(),
  requestNotificationPermissionMock: vi.fn(),
  showCompletionNotificationMock: vi.fn(),
  notificationPermissionMock: vi.fn(),
  fetchCodexPetsMock: vi.fn(),
  syncCommunityPetsMock: vi.fn(),
  fetchSkillsMock: vi.fn(),
  fetchDesignSystemsMock: vi.fn(),
  fetchSkillMock: vi.fn(),
  fetchDesignSystemMock: vi.fn(),
  importLocalDesignSystemMock: vi.fn(),
  importGitHubDesignSystemMock: vi.fn(),
  fetchProviderModelsMock: vi.fn(),
  fetchLatestGithubReleaseInfoMock: vi.fn(),
  analyticsTrackMock: vi.fn(),
}));

vi.mock('../../src/utils/notifications', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/notifications')>(
    '../../src/utils/notifications',
  );
  return {
    ...actual,
    playSound: playSoundMock,
    requestNotificationPermission: requestNotificationPermissionMock,
    showCompletionNotification: showCompletionNotificationMock,
    notificationPermission: notificationPermissionMock,
  };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchCodexPets: fetchCodexPetsMock,
    syncCommunityPets: syncCommunityPetsMock,
    fetchSkills: fetchSkillsMock,
    fetchDesignSystems: fetchDesignSystemsMock,
    fetchSkill: fetchSkillMock,
    fetchDesignSystem: fetchDesignSystemMock,
    importLocalDesignSystem: importLocalDesignSystemMock,
    importGitHubDesignSystem: importGitHubDesignSystemMock,
    fetchLatestGithubReleaseInfo: fetchLatestGithubReleaseInfoMock,
    codexPetSpritesheetUrl: (pet: { spritesheetUrl: string }) => pet.spritesheetUrl,
  };
});

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: fetchProviderModelsMock,
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analyticsTrackMock,
    setConsent: () => undefined,
    setIdentity: () => undefined,
    setConfigureGlobals: () => undefined,
    anonymousId: 'test-anonymous',
    sessionId: 'test-session',
    newRequestId: () => 'test-request',
  }),
}));

import { SettingsDialog } from '../../src/components/SettingsDialog';
import type { AgentRefreshOptions, SettingsSection } from '../../src/components/SettingsDialog';
import { I18nProvider } from '../../src/i18n';
import { LOCALES } from '../../src/i18n/types';
import type { AgentInfo, AppConfig, AppVersionInfo } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

const availableAgents: AgentInfo[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.80.0',
    models: [{ id: 'default', label: 'Default' }],
  },
];

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [{ id: 'default', label: 'Default' }],
  supportsCustomModel: false,
};

type OnRefreshAgents = (
  options?: AgentRefreshOptions,
) => void | AgentInfo[] | Promise<void | AgentInfo[]>;

const sampleBundledPets = [
  {
    id: 'dario',
    displayName: 'Dario',
    description: 'A tiny frustrated companion.',
    spritesheetUrl: '/api/codex-pets/dario.webp',
    spritesheetExt: 'webp',
    hatchedAt: 1710000000000,
    bundled: true,
  },
  {
    id: 'nyako',
    displayName: 'Nyako',
    description: 'A warm companion.',
    spritesheetUrl: '/api/codex-pets/nyako.webp',
    spritesheetExt: 'webp',
    hatchedAt: 1710000001000,
    bundled: true,
  },
];

const sampleCommunityPets = [
  {
    id: 'jade',
    displayName: 'Jade',
    description: 'A cheerful explorer.',
    spritesheetUrl: '/api/codex-pets/jade.webp',
    spritesheetExt: 'webp',
    hatchedAt: 1710000010000,
  },
  {
    id: 'voidling',
    displayName: 'Voidling',
    description: 'A tiny grim companion.',
    spritesheetUrl: '/api/codex-pets/voidling.webp',
    spritesheetExt: 'webp',
    hatchedAt: 1710000020000,
  },
];

const sampleSkills = [
  {
    id: 'blog-post',
    name: 'blog-post',
    description: 'A long-form article / blog post.',
    mode: 'prototype',
    previewType: 'HTML',
  },
  {
    id: 'dashboard',
    name: 'dashboard',
    description: 'Admin / analytics dashboard.',
    mode: 'prototype',
    previewType: 'HTML',
  },
  {
    id: 'sales-deck',
    name: 'sales-deck',
    description: 'A narrative sales presentation.',
    mode: 'deck',
    previewType: 'PPTX',
  },
];

const sampleDesignSystems = [
  {
    id: 'neutral-modern',
    title: 'Neutral Modern',
    summary: 'Calm editorial neutrals.',
    category: 'Default',
    swatches: ['#111827', '#f5f5f4'],
  },
  {
    id: 'signal-green',
    title: 'Signal Green',
    summary: 'Brighter utility system.',
    category: 'Experimental',
    swatches: ['#14532d', '#86efac'],
  },
];

function renderSettingsDialog(
  initial: Partial<AppConfig> = {},
  options: {
    agents?: AgentInfo[];
    daemonLive?: boolean;
    onRefreshAgents?: OnRefreshAgents;
    initialSection?: SettingsSection;
    appVersionInfo?: AppVersionInfo | null;
    welcome?: boolean;
  } = {},
) {
  const onPersist = vi.fn();
  const onPersistComposioKey = vi.fn();
  const onClose = vi.fn();
  const onRefreshAgents = options.onRefreshAgents ?? vi.fn<OnRefreshAgents>();

  const view = render(
    <SettingsDialog
      initial={{ ...baseConfig, ...initial }}
      agents={options.agents ?? availableAgents}
      daemonLive={options.daemonLive ?? true}
      appVersionInfo={options.appVersionInfo ?? null}
      initialSection={options.initialSection ?? 'execution'}
      welcome={options.welcome}
      onPersist={onPersist}
      onPersistComposioKey={onPersistComposioKey}
      onClose={onClose}
      onRefreshAgents={onRefreshAgents}
    />,
  );

  return { onPersist, onPersistComposioKey, onClose, onRefreshAgents, ...view };
}

function renderLanguageSettingsDialog(initialLocale: Parameters<typeof I18nProvider>[0]['initial'] = 'en') {
  const onPersist = vi.fn();
  const onClose = vi.fn();

  render(
    <I18nProvider initial={initialLocale}>
      <SettingsDialog
        initial={baseConfig}
        agents={availableAgents}
        daemonLive={true}
        appVersionInfo={null}
        initialSection="language"
        onPersist={onPersist}
        onPersistComposioKey={vi.fn()}
        onClose={onClose}
        onRefreshAgents={vi.fn()}
      />
    </I18nProvider>,
  );

  return { onPersist, onClose };
}

async function waitForPersist(
  onPersist: ReturnType<typeof vi.fn>,
  expectedConfig: unknown,
  expectedOptions: { forceMediaProviderSync?: boolean } = { forceMediaProviderSync: false },
) {
  await waitFor(() => {
    expect(onPersist).toHaveBeenCalledWith(
      expectedConfig,
      expect.objectContaining(expectedOptions),
    );
  });
}

function openGatewayPresetPopover() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Gateway preset' }));
  return screen.getByTestId('settings-byok-provider-preset-popover');
}

function selectGatewayPreset(label: string) {
  const popover = openGatewayPresetPopover();
  fireEvent.click(within(popover).getByRole('option', { name: label }));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  playSoundMock.mockReset();
  requestNotificationPermissionMock.mockReset();
  showCompletionNotificationMock.mockReset();
  notificationPermissionMock.mockReset();
  fetchCodexPetsMock.mockReset();
  syncCommunityPetsMock.mockReset();
  fetchSkillsMock.mockReset();
  fetchDesignSystemsMock.mockReset();
  fetchSkillMock.mockReset();
  fetchDesignSystemMock.mockReset();
  importLocalDesignSystemMock.mockReset();
  importGitHubDesignSystemMock.mockReset();
  fetchProviderModelsMock.mockReset();
  analyticsTrackMock.mockReset();
  notificationPermissionMock.mockReturnValue('default');
  requestNotificationPermissionMock.mockResolvedValue('granted');
  showCompletionNotificationMock.mockResolvedValue('shown');
  fetchCodexPetsMock.mockResolvedValue({
    pets: [],
    rootDir: '/Users/test/.codex/pets',
  });
  syncCommunityPetsMock.mockResolvedValue({
    wrote: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    rootDir: '/Users/test/.codex/pets',
    errors: [],
  });
  fetchSkillsMock.mockResolvedValue(sampleSkills);
  fetchDesignSystemsMock.mockResolvedValue(sampleDesignSystems);
  fetchSkillMock.mockImplementation(async (id: string) => ({
    id,
    body: `skill body for ${id}`,
  }));
  fetchDesignSystemMock.mockImplementation(async (id: string) => ({
    id,
    body: `design system body for ${id}`,
  }));
  fetchLatestGithubReleaseInfoMock.mockReset();
  fetchLatestGithubReleaseInfoMock.mockResolvedValue(null);
  importLocalDesignSystemMock.mockResolvedValue({
    designSystem: {
      id: 'imported-system',
      title: 'Imported System',
      summary: 'A newly imported system.',
      category: 'Imported',
      swatches: ['#0f766e', '#ccfbf1'],
    },
  });
  importGitHubDesignSystemMock.mockResolvedValue({
    designSystem: {
      id: 'github-system',
      title: 'GitHub System',
      summary: 'A GitHub imported system.',
      category: 'Imported',
      swatches: ['#1d4ed8', '#bfdbfe'],
    },
  });
  fetchProviderModelsMock.mockResolvedValue({
    ok: true,
    kind: 'success',
    latencyMs: 1,
    models: [],
  });
});

describe('SettingsDialog execution settings BYOK interactions', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders BYOK protocol tabs and toggles API key visibility', () => {
    renderSettingsDialog();

    expect(screen.getByRole('tab', { name: 'Anthropic' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'OpenAI' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Azure OpenAI' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Google Gemini' })).toBeTruthy();
    expect(screen.getByText('Protocols')).toBeTruthy();
    expect(screen.getByText('Gateways')).toBeTruthy();
    expect(screen.getByLabelText('Gateway preset')).toBeTruthy();
    expect(screen.getByLabelText('Model')).toBeTruthy();
    const baseUrlInput = screen.getByLabelText('Base URL') as HTMLInputElement;
    expect(baseUrlInput.value).toBe('https://api.anthropic.com');
    expect(baseUrlInput.readOnly).toBe(true);
    expect(screen.getByText('Default endpoint. Usually no need to change this.')).toBeTruthy();
    const memoryModelDetails = screen
      .getAllByText('Memory model')
      .find((node) => node.closest('summary'))
      ?.closest('details');
    expect(memoryModelDetails?.hasAttribute('open')).toBe(false);
    expect(within(memoryModelDetails!).queryByLabelText('Base URL')).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Get key ↗' })
        .getAttribute('href'),
    ).toBe('https://console.anthropic.com/settings/keys');

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(apiKeyInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(apiKeyInput.type).toBe('password');

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(screen.getByLabelText('Gateway preset')).toBeTruthy();
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.openai.com/v1',
    );
    expect(
      screen
        .getByRole('link', { name: 'Get key ↗' })
        .getAttribute('href'),
    ).toBe('https://platform.openai.com/api-keys');
  });

  it('keeps BYOK file-editing limits discoverable from the provider heading (issue #1106)', () => {
    // Regression cover: switching from Local CLI to BYOK previously gave no
    // signal that file-editing tools (`Read`/`Write`/`Edit`) are absent on the
    // API path. Users typed "continue adjusting the design" expecting edits
    // and got an HTML monologue back. The notice now sits behind a heading
    // info icon so it stays discoverable without competing with setup fields.
    renderSettingsDialog();

    const trigger = screen.getByTestId('settings-byok-no-file-tools-trigger');
    expect(trigger).toBeTruthy();
    const notice = screen.getByRole('tooltip');
    expect(notice.textContent).toContain("BYOK can't read, write, or edit project files");
    expect(notice.textContent).toContain('Local CLI');

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(screen.getByTestId('settings-byok-no-file-tools-trigger')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Google Gemini' }));
    expect(screen.getByTestId('settings-byok-no-file-tools-trigger')).toBeTruthy();
  });

  it('hides the BYOK no-file-tools notice when Local CLI mode is selected', () => {
    renderSettingsDialog({ mode: 'daemon' });

    expect(screen.queryByTestId('settings-byok-no-file-tools-notice')).toBeNull();
  });

  it('lets Anthropic and Google users customize the default base URL', () => {
    renderSettingsDialog();

    expect((screen.getByLabelText('Base URL') as HTMLInputElement).readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).readOnly).toBe(false);

    cleanup();
    renderSettingsDialog();
    fireEvent.click(screen.getByRole('tab', { name: 'Google Gemini' }));
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://generativelanguage.googleapis.com',
    );
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).readOnly).toBe(true);
  });

  it('updates model and base URL when quick fill provider changes', () => {
    renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    selectGatewayPreset('DeepSeek — OpenAI');

    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('deepseek-chat');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com');
  });

  it('keeps Anthropic-compatible gateway presets selectable', () => {
    renderSettingsDialog();

    const providerPopover = openGatewayPresetPopover();
    expect(within(providerPopover).getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(
      expect.arrayContaining([
        'Custom provider',
        'Anthropic (Claude)',
        'DeepSeek — Anthropic',
        'MiniMax — Anthropic',
        'MiMo (Xiaomi) — Anthropic',
      ]),
    );

    fireEvent.click(within(providerPopover).getByRole('option', { name: 'DeepSeek — Anthropic' }));

    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('deepseek-chat');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.deepseek.com/anthropic',
    );
  });

  it('treats a manually edited base URL as a custom provider', () => {
    renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(screen.getByRole('combobox', { name: 'Gateway preset' }).textContent).toContain('OpenAI');

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://my-proxy.example.com/v1' },
    });

    expect(screen.getByRole('combobox', { name: 'Gateway preset' }).textContent).toContain('Custom provider');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://my-proxy.example.com/v1',
    );
  });

  it('offers managed and self-hosted Ollama presets with editable base URLs', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: 'Ollama Cloud' }));
    const providerPopover = openGatewayPresetPopover();
    expect(within(providerPopover).getAllByRole('option').map((option) => option.textContent?.trim())).toEqual([
      'Custom provider',
      'Ollama Cloud (managed)',
      'Ollama Self-hosted (local)',
    ]);
    fireEvent.click(screen.getByRole('combobox', { name: 'Gateway preset' }));
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).readOnly).toBe(false);

    selectGatewayPreset('Ollama Self-hosted (local)');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'http://localhost:11434',
    );
    expect(screen.queryByRole('link', { name: /Get key/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy();
  });

  it('saves and auto-tests the self-hosted Ollama preset without an API key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        mode: 'provider',
        protocol: 'ollama',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'gemma3:4b',
      });
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 28,
          model: 'gemma3:4b',
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const { onPersist } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: 'Ollama Cloud' }));
    selectGatewayPreset('Ollama Self-hosted (local)');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProtocol: 'ollama',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'gemma3:4b',
        apiProviderBaseUrl: 'http://localhost:11434',
      }),
      {},
    );

    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 28 ms/)).toBeTruthy();
    });
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(1);
  });

  it('keeps protocol drafts isolated without leaking API keys between tabs', () => {
    renderSettingsDialog({ apiKey: 'anthropic-key' });

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    expect(apiKeyInput.value).toBe('anthropic-key');

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'openai-key' },
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Anthropic' }));
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('anthropic-key');

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('openai-key');
  });

  it('autosaves BYOK edits once required fields are valid', async () => {
    const { onPersist } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'http://10.0.0.5:11434/v1' },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'Use a public http:// or https:// URL.',
    );

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'http://localhost:11434/v1' },
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mode: 'api',
        apiProtocol: 'anthropic',
        apiKey: 'sk-test',
        baseUrl: 'http://localhost:11434/v1',
        model: 'claude-sonnet-4-5',
        apiProviderBaseUrl: null,
      }),
      {},
    );
  });

  it('surfaces autosave progress, success, and failure states in the modal chrome', async () => {
    const first = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-saved' },
    });

    await waitFor(() => {
      expect(screen.getByText('Saving…')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText('All changes saved')).toBeTruthy();
    });
    expect(first.onPersist).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-saved' }),
      expect.any(Object),
    );

    cleanup();

    const second = renderSettingsDialog();
    second.onPersist.mockRejectedValueOnce(new Error('daemon offline'));

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-error' },
    });

    await waitFor(() => {
      expect(screen.getByText('Saving…')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Couldn’t save changes/i)).toBeTruthy();
    });
  });

  it('closes BYOK via the close button or backdrop', () => {
    const first = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-unsaved' },
    });
    fireEvent.click(first.container.querySelector('.settings-close') as HTMLElement);
    expect(first.onClose).toHaveBeenCalledTimes(1);

    cleanup();

    const second = renderSettingsDialog();
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-unsaved-2' },
    });
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows Azure-specific fields and autosaves an Azure config', async () => {
    const { onPersist } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: 'Azure OpenAI' }));

    expect(screen.getByRole('heading', { name: 'Azure OpenAI' })).toBeTruthy();
    expect(screen.getByLabelText('Deployment name')).toBeTruthy();
    expect(screen.getByLabelText('API version')).toBeTruthy();
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).placeholder).toBe(
      'Paste Azure endpoint URL',
    );
    expect(
      screen.getByText('Find this in Azure portal → your resource → Endpoint.'),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'azure-key' },
    });
    fireEvent.change(screen.getByLabelText('Deployment name'), {
      target: { value: '__custom__' },
    });
    fireEvent.change(screen.getByLabelText('Custom deployment name'), {
      target: { value: 'deployment-one' },
    });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://example.openai.azure.com' },
    });
    fireEvent.change(screen.getByLabelText('API version'), {
      target: { value: '2024-10-21' },
    });

    await waitFor(() => {
      expect(screen.getByText('Ready to test')).toBeTruthy();
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mode: 'api',
        apiProtocol: 'azure',
        apiKey: 'azure-key',
        model: 'deployment-one',
        baseUrl: 'https://example.openai.azure.com',
        apiVersion: '2024-10-21',
        apiProviderBaseUrl: null,
      }),
      {},
    );
  });

  it('does not fetch provider models while the API key edit is still uncommitted', async () => {
    renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-partial' },
    });

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(fetchProviderModelsMock).not.toHaveBeenCalled();
  });

  it('loads provider models automatically only after required fields are committed', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'gpt-account', label: 'Account Model' }],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(screen.queryByRole('button', { name: 'Fetch models' })).toBeNull();
    expect(fetchProviderModelsMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-openai' },
    });
    fireEvent.blur(screen.getByLabelText('API key'));

    expect(await screen.findByText('✓ Loaded 1 models from your account.')).toBeTruthy();
    expect(fetchProviderModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
      }),
      expect.any(AbortSignal),
    );
    const modelPicker = screen.getByRole('combobox', { name: 'Model' });
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    expect(
      within(modelPopover).getAllByRole('option').map((option) => option.textContent?.trim()),
    ).toEqual(expect.arrayContaining([
      'Account Model (gpt-account) · From your account',
      'gpt-4o · Suggested',
      'Custom (type below)…',
    ]));
    expect(analyticsTrackMock).toHaveBeenCalledWith(
      'settings_byok_models_fetch_result',
      expect.objectContaining({
        page_name: 'settings',
        area: 'configure_execution_mode_byok',
        provider_id: 'openai',
        result: 'success',
        trigger: 'auto',
        source: 'network',
        model_count: 1,
      }),
      undefined,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Azure OpenAI' }));
    expect(screen.queryByRole('button', { name: 'Fetch models' })).toBeNull();
    expect(screen.getByText(/Azure deployments can’t be fetched automatically/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Ollama Cloud' }));
    expect(screen.queryByRole('button', { name: 'Fetch models' })).toBeNull();
    expect(screen.getByText('Model discovery is not available for this protocol.')).toBeTruthy();
  });

  it('auto-loads provider models after a pasted dirty key is cleaned on blur', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'gpt-account', label: 'Account Model' }],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(fetchProviderModelsMock).not.toHaveBeenCalled();

    // Paste a key with a leading zero-width char + trailing newline/tab.
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: '\u200Bsk-openai\n\t' },
    });
    fireEvent.blur(screen.getByLabelText('API key'));

    // If onByokKeyCommit committed the dirty-key cache key, the auto-fetch
    // effect would bail on providerModelsCommittedKey !== providerModelsKey
    // and this text would never appear.
    expect(await screen.findByText('✓ Loaded 1 models from your account.')).toBeTruthy();
    expect(fetchProviderModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
      }),
      expect.any(AbortSignal),
    );
  });

  it('defaults to an account model when discovery replaces a provider preset', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'account-ready-model', label: 'Account Ready' }],
    });
    const { onPersist } = renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect(await screen.findByText('✓ Loaded 1 models from your account.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain(
      'Account Ready (account-ready-model) · From your account',
    );
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProtocol: 'openai',
        model: 'account-ready-model',
      }),
      {},
    );
  });

  it('keeps a suggested model the user explicitly re-picked after discovery resolves', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'account-ready-model', label: 'Account Ready' }],
    });
    const { onPersist } = renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(fetchProviderModelsMock).not.toHaveBeenCalled();

    // The user deliberately re-picks the suggested model that equals the
    // provider preset id before discovery runs.
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    fireEvent.click(within(modelPopover).getByRole('option', { name: 'gpt-4o' }));

    // Supplying the key triggers account-model discovery.
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-openai' },
    });
    fireEvent.blur(screen.getByLabelText('API key'));

    expect(await screen.findByText('✓ Loaded 1 models from your account.')).toBeTruthy();

    // The explicit pick must survive discovery — no silent rewrite to the
    // first fetched account model.
    const modelCombobox = screen.getByRole('combobox', { name: 'Model' });
    expect(modelCombobox.textContent).toContain('gpt-4o');
    expect(modelCombobox.textContent).not.toContain('account-ready-model');
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProtocol: 'openai',
        model: 'gpt-4o',
      }),
      {},
    );
  });

  it('does not show a BYOK Test button or nag when the API key is still missing', () => {
    renderSettingsDialog({
      apiProtocol: 'anthropic',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    });

    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();

    fireEvent.blur(screen.getByLabelText('API key'));

    expect(screen.queryByText('Fill API key to test the connection.')).toBeNull();
  });

  it('auto-tests a saved complete BYOK config when Settings opens', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 21,
          model: 'claude-sonnet-4-5',
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-test-provider' });

    expect(await screen.findByText(/Connected\. Replied in 21 ms/)).toBeTruthy();

    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(1);
  });

  it('auto-tests BYOK after required fields become locally valid', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 14,
          model: 'claude-sonnet-4-5',
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: '' });

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-ant-test-provider' },
    });

    expect(await screen.findByText(/Connected\. Replied in 14 ms/)).toBeTruthy();
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(1);
  });

  it('shows long BYOK model lists without a search field after provider discovery succeeds', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [
        { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
        { id: 'gpt-4.1', label: 'gpt-4.1' },
        { id: 'gpt-5.5', label: 'gpt-5.5' },
        { id: 'o4-mini', label: 'o4-mini' },
        { id: 'o3', label: 'o3' },
        { id: 'o1', label: 'o1' },
        { id: 'gpt-4o', label: 'gpt-4o' },
        { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      ],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(await screen.findByText('✓ Loaded 8 models from your account.')).toBeTruthy();

    const modelPicker = screen.getByRole('combobox', { name: 'Model' });
    fireEvent.click(modelPicker);

    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    expect(within(modelPopover).queryByTestId('settings-byok-model-search')).toBeNull();
    expect(
      within(modelPopover).getAllByRole('option').map((option) => option.textContent?.trim()),
    ).toEqual(expect.arrayContaining([
      'gpt-4.1-mini · From your account',
      'gpt-5.5 · From your account',
      'Custom (type below)…',
    ]));
  });

  it('fetches provider models, merges them into the picker, and preserves a custom current model', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [
        { id: 'remote-alpha', label: 'Remote Alpha' },
        { id: 'gpt-4o', label: 'gpt-4o' },
      ],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'custom-still-here',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect((screen.getByLabelText('Custom model id') as HTMLInputElement).value).toBe('custom-still-here');

    expect(await screen.findByText('✓ Loaded 2 models from your account.')).toBeTruthy();
    expect(fetchProviderModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
      }),
      expect.any(AbortSignal),
    );
    const modelPicker = screen.getByRole('combobox', { name: 'Model' });
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    expect(
      within(modelPopover).getAllByRole('option').map((option) => option.textContent?.trim()),
    ).toEqual(expect.arrayContaining([
      'Remote Alpha (remote-alpha) · From your account',
      'gpt-4o · From your account',
      'Custom (type below)…',
    ]));
    expect((screen.getByLabelText('Custom model id') as HTMLInputElement).value).toBe('custom-still-here');
  });

  it('clears stale fetched-model status when provider fields change', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'remote-alpha', label: 'Remote Alpha' }],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(await screen.findByText('✓ Loaded 1 models from your account.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://proxy.example.com/v1' },
    });

    await waitFor(() => {
      expect(screen.queryByText('✓ Loaded 1 models from your account.')).toBeNull();
    });
  });

  it('renders automatic provider auth failures under the API key field', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: false,
      kind: 'auth_failed',
      latencyMs: 12,
      status: 401,
      detail: 'bad key',
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect(await screen.findByText('Invalid API key.')).toBeTruthy();
    expect(screen.queryByText('Ready to test')).toBeNull();
    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy();
  });

  it('renders non-auth provider model discovery failures explicitly', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: false,
      kind: 'upstream_unavailable',
      latencyMs: 12,
      status: 503,
      detail: 'provider unavailable',
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect(await screen.findByText('Could not fetch models: provider unavailable')).toBeTruthy();
  });

  it('supports custom model entry in BYOK mode', async () => {
    const { onPersist } = renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-openai' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    fireEvent.click(within(modelPopover).getByRole('option', { name: 'Custom (type below)…' }));

    const customModelInput = screen.getByLabelText('Custom model id') as HTMLInputElement;
    expect(customModelInput).toBeTruthy();
    fireEvent.change(customModelInput, {
      target: { value: 'gpt-4.1-custom' },
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProtocol: 'openai',
        apiKey: 'sk-openai',
        model: 'gpt-4.1-custom',
        baseUrl: 'https://api.openai.com/v1',
      }),
      {},
    );
  });

  it('runs the BYOK connection test manually only after required fields are present', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      // MemoryModelInline mounts inside the BYOK section and reads the
      // current extraction override from /api/memory on mount. Swallow
      // it here so the assertion below only counts the test-connection
      // POST the user actually triggered.
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        mode: 'provider',
        protocol: 'anthropic',
        apiKey: 'sk-ant-test-provider',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
      });
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 42,
          model: 'claude-sonnet-4-5',
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-test-provider' });

    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() => {
      expect(screen.getByText('Testing connection…')).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 42 ms/)).toBeTruthy();
    });
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(1);
  });

  it('blocks an obvious OpenAI key in the Anthropic tab before testing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected request: ${input.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-openai-provider' });

    expect(screen.getByRole('alert').textContent).toContain('Invalid API key.');
    expect(screen.queryByText('Ready to test')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(screen.getByRole('alert').textContent).toContain('Invalid API key.');
    expect(screen.queryByText('Ready to test')).toBeNull();
    await waitFor(() => {
      const testConnectionCalls = fetchMock.mock.calls.filter(
        ([input]) => input.toString() === '/api/test/connection',
      );
      expect(testConnectionCalls).toHaveLength(0);
    });
    expect(analyticsTrackMock).toHaveBeenCalledWith(
      'settings_byok_test_result',
      expect.objectContaining({
        page_name: 'settings',
        area: 'execution_model',
        provider_id: 'anthropic',
        result: 'failed',
        error_code: 'api_key_wrong_protocol',
        error_kind: 'api_key_wrong_protocol',
        field_missing: 'none',
        config_key_changed: false,
        success_after_action: false,
        duration_ms: 0,
      }),
      undefined,
    );
  });

  it('shows API key and Base URL errors together for mistyped first-party URLs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected request: ${input.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({
      apiKey: 'sk-openai-provider',
      baseUrl: 'https://api.anthropic.comsssss',
      apiProviderBaseUrl: null,
    });

    const apiKeyField = screen.getByLabelText('API key').closest('label');
    const baseUrlField = screen.getByLabelText('Base URL').closest('label');
    expect(apiKeyField).toBeTruthy();
    expect(baseUrlField).toBeTruthy();
    expect(
      within(apiKeyField as HTMLElement).getByText('Invalid API key.'),
    ).toBeTruthy();
    expect(
      within(baseUrlField as HTMLElement).getByText('Base URL is invalid or unreachable.'),
    ).toBeTruthy();
    expect(screen.queryByText('Ready to test')).toBeNull();

    await new Promise((resolve) => window.setTimeout(resolve, 600));
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(0);
  });

  it('blocks mistyped first-party URLs with a valid key before auto-testing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected request: ${input.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({
      apiKey: 'sk-ant-test-provider',
      baseUrl: 'https://api.anthropic.comx',
      apiProviderBaseUrl: null,
    });

    const apiKeyField = screen.getByLabelText('API key').closest('label');
    const baseUrlField = screen.getByLabelText('Base URL').closest('label');
    expect(apiKeyField).toBeTruthy();
    expect(baseUrlField).toBeTruthy();
    expect(
      within(apiKeyField as HTMLElement).queryByText('Invalid API key.'),
    ).toBeNull();
    expect(
      within(baseUrlField as HTMLElement).getByText('Base URL is invalid or unreachable.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    expect(screen.queryByText('Ready to test')).toBeNull();

    await new Promise((resolve) => window.setTimeout(resolve, 600));
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(0);
    expect(fetchProviderModelsMock).not.toHaveBeenCalled();
  });

  it('sends a cleaned API key when the pasted value has trailing newline/zero-width characters', async () => {
    let sentApiKey: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      sentApiKey = JSON.parse(String(init?.body)).apiKey;
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 7,
          model: 'claude-sonnet-4-5',
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // Leading zero-width char + trailing newline/tab — the exact shape a
    // pasted key picks up from a docs code block or a terminal copy.
    renderSettingsDialog({ apiKey: '\u200Bsk-ant-test-provider\n\t' });

    fireEvent.blur(screen.getByLabelText('API key'));

    // The auto-test must survive the apiKey-cleanup re-render: if it fired in
    // the blur tick it would be dropped by the stale-revision guard and the
    // success state would never reach the UI.
    await waitFor(() => {
      expect(screen.getByText(/Connected\. Replied in 7 ms/)).toBeTruthy();
    });
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(1);
    // The malformed value must never reach the wire.
    expect(sentApiKey).toBe('sk-ant-test-provider');
  });

  it('shows a BYOK API key cleaned notice after blur cleanup', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 7,
          model: 'claude-sonnet-4-5',
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog();

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    fireEvent.change(apiKeyInput, {
      target: { value: ' \u200Bsk-ant-test-provider\n' },
    });
    fireEvent.blur(apiKeyInput);

    await waitFor(() => {
      expect(apiKeyInput.value).toBe('sk-ant-test-provider');
    });
    expect(screen.getByText(en['settings.apiKeyCleaned'])).toBeTruthy();
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(1);
  });

  it('lets users retry a failed BYOK connection test without editing the API key', async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      attempt += 1;
      return new Response(
        JSON.stringify(
          attempt === 1
            ? {
                ok: false,
                kind: 'timeout',
                latencyMs: 30000,
                model: 'claude-sonnet-4-5',
              }
            : {
                ok: true,
                kind: 'ok',
                latencyMs: 18,
                model: 'claude-sonnet-4-5',
                sample: 'pong',
              },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-test-provider' });

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByRole('button', { name: 'Retry test' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry test' }));

    expect(await screen.findByText(/Connected\. Replied in 18 ms/)).toBeTruthy();
    const testConnectionCalls = fetchMock.mock.calls.filter(
      ([input]) => input.toString() === '/api/test/connection',
    );
    expect(testConnectionCalls).toHaveLength(2);
  });

  it('marks a successful BYOK test after a config edit as success after action', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      const body = JSON.parse(String(init?.body)) as { apiKey?: string };
      return new Response(
        JSON.stringify(
          body.apiKey === 'sk-ant-fixed'
            ? {
                ok: true,
                kind: 'ok',
                latencyMs: 20,
                model: 'claude-sonnet-4-5',
                sample: 'pong',
              }
            : {
                ok: false,
                kind: 'auth_failed',
                latencyMs: 18,
                model: 'claude-sonnet-4-5',
              },
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-stale' });

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByRole('button', { name: 'Retry test' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-ant-fixed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText(/Connected\. Replied in 20 ms/)).toBeTruthy();
    expect(analyticsTrackMock).toHaveBeenCalledWith(
      'settings_byok_test_result',
      expect.objectContaining({
        page_name: 'settings',
        area: 'execution_model',
        provider_id: 'anthropic',
        result: 'success',
        field_missing: 'none',
        config_key_changed: true,
        success_after_action: true,
      }),
      undefined,
    );
  });

  it('renders invalid Base URL test failures on the Base URL field', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      return new Response(
        JSON.stringify({
          ok: false,
          kind: 'invalid_base_url',
          latencyMs: 12,
          model: 'claude-sonnet-4-5',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-test-provider' });

    expect(await screen.findByText('Base URL is invalid or unreachable.')).toBeTruthy();
    const baseUrlField = screen.getByLabelText('Base URL').closest('label');
    expect(baseUrlField).toBeTruthy();
    expect(
      within(baseUrlField as HTMLElement).getByText('Base URL is invalid or unreachable.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Base URL is invalid or unreachable.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retry test' })).toBeTruthy();
  });

  it('renders auth failed test failures on the API key field', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      return new Response(
        JSON.stringify({
          ok: false,
          kind: 'auth_failed',
          latencyMs: 12,
          model: 'claude-sonnet-4-5',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-test-provider' });

    expect(await screen.findByText('Invalid API key.')).toBeTruthy();
    const apiKeyField = screen.getByLabelText('API key').closest('label');
    expect(apiKeyField).toBeTruthy();
    expect(
      within(apiKeyField as HTMLElement).getByText('Invalid API key.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Invalid API key.')).toHaveLength(1);
    expect(screen.queryByText('Authentication failed. Check your API key.')).toBeNull();
    expect(screen.queryByText('Ready to test')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry test' })).toBeTruthy();
  });

  it('focuses the model field when the BYOK test returns model not found', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      return new Response(
        JSON.stringify({
          ok: false,
          kind: 'not_found_model',
          latencyMs: 18,
          model: 'missing-model',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'missing-model',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(await screen.findByText("Model 'missing-model' not found on this endpoint.")).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Custom model id'));
    });
  });
});

describe('SettingsDialog execution settings Local CLI interactions', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lets users switch to Local CLI, select an installed agent, and autosave', async () => {
    const installed = availableAgents[0]!;
    const unavailable: AgentInfo = {
      id: 'gemini',
      name: 'Gemini CLI',
      bin: 'gemini',
      available: false,
      version: null,
      models: [],
      installUrl: 'https://github.com/google-gemini/gemini-cli',
      docsUrl: 'https://github.com/google-gemini/gemini-cli/blob/main/README.md',
    };
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: null },
      { agents: [installed, unavailable] },
    );

    const localCliTab = screen.getByRole('tab', { name: /Local CLI.*1 installed/i });
    fireEvent.click(localCliTab);

    expect(screen.getByText('Your CLIs (1)')).toBeTruthy();
    const installGroupSummary = screen.getByText('Available to install (1)');
    expect(installGroupSummary.closest('details')?.hasAttribute('open')).toBe(false);
    const codexCard = screen.getByRole('button', { name: /Codex CLI/i }) as HTMLButtonElement;
    fireEvent.click(installGroupSummary);
    const geminiGroup = screen.getByRole('group', { name: /Gemini CLI/i });
    expect(within(geminiGroup).getByText('Google official CLI')).toBeTruthy();
    expect(
      (within(geminiGroup).getByRole('link', { name: en['settings.agentInstall.install'] }) as HTMLAnchorElement).getAttribute('href'),
    ).toBe(
      'https://github.com/google-gemini/gemini-cli',
    );
    expect(
      screen.getByText(en['settings.agentInstall.stepAuth']),
    ).toBeTruthy();
    expect(
      screen.getByText(en['settings.agentInstall.stepSelect']),
    ).toBeTruthy();
    expect(screen.getByText(en['settings.agentInstall.pathHint'])).toBeTruthy();

    fireEvent.click(codexCard);
    const selectedCard = codexCard.closest('.agent-card') as HTMLElement;
    expect(
      within(selectedCard).getByRole('combobox', {
        name: en['settings.modelPicker'],
      }),
    ).toBeTruthy();
    expect(
      selectedCard.compareDocumentPosition(installGroupSummary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mode: 'daemon',
        agentId: 'codex',
      }),
      {},
    );
  });

  it('filters long Local CLI model lists in Settings without hiding the current selection', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', agentModels: { codex: { model: 'gpt-4.1-mini' } } },
      {
        agents: [
          {
            ...availableAgents[0]!,
            modelsSource: 'live',
            models: [
              { id: 'default', label: 'Default' },
              { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
              { id: 'gpt-4.1', label: 'gpt-4.1' },
              { id: 'gpt-5.5', label: 'gpt-5.5' },
              { id: 'o4-mini', label: 'o4-mini' },
              { id: 'o3', label: 'o3' },
              { id: 'o1', label: 'o1' },
              { id: 'gpt-4o', label: 'gpt-4o' },
              { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
            ],
          },
        ],
      },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI/i }));
    const codexCard = screen.getByRole('button', { name: /Codex CLI/i });
    fireEvent.click(codexCard);

    const modelPicker = screen.getByRole('combobox', {
      name: en['settings.modelPicker'],
    });
    fireEvent.click(modelPicker);

    const searchInput = screen.getByTestId('settings-agent-model-search-codex') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '5.5' } });

    const modelPopover = screen.getByTestId('settings-agent-model-popover-codex');
    expect(
      within(modelPopover).getAllByRole('option').map((option) => option.textContent?.trim()),
    ).toEqual(['gpt-4.1-mini', 'gpt-5.5', 'Custom (type below)…']);
  });

  it('labels live CLI model metadata in the model picker', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        agents: [
          {
            ...availableAgents[0]!,
            modelsSource: 'live',
            models: [
              { id: 'default', label: 'Default' },
              { id: 'gpt-6-codex', label: 'GPT-6 Codex' },
            ],
          },
        ],
      },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI/i }));
    expect(screen.getByText('Live from CLI')).toBeTruthy();
    expect(
      screen.getByText(/Model list comes from this CLI/i),
    ).toBeTruthy();
  });

  it('labels fallback CLI model metadata in the model picker', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        agents: [
          {
            ...availableAgents[0]!,
            modelsSource: 'fallback',
          },
        ],
      },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI/i }));
    expect(screen.getByText('Built-in list')).toBeTruthy();
    expect(
      screen.getByText(/Showing built-in defaults/i),
    ).toBeTruthy();
  });

  it('uses the existing Settings card picker for AMR without exposing custom stale models', () => {
    renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'amr',
        agentModels: { amr: { model: 'gpt-5.4-mini', reasoning: 'default' } },
      },
      {
        agents: [
          {
            ...amrAgent,
            modelsSource: 'live',
            models: [
              { id: 'glm-5', label: 'GLM 5' },
              { id: 'glm-5.1', label: 'GLM 5.1' },
            ],
          },
        ],
      },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Open Design AMR\b/ }));

    const modelPickers = screen.getAllByRole('combobox', {
      name: en['settings.modelPicker'],
    });
    expect(modelPickers).toHaveLength(1);
    expect(modelPickers[0]?.textContent).toContain('GLM 5');
    fireEvent.click(modelPickers[0]!);
    const modelPopover = screen.getByTestId('settings-agent-model-popover-amr');
    expect(
      within(modelPopover).getAllByRole('option').map((option) => option.textContent?.trim()),
    ).toEqual(['GLM 5', 'GLM 5.1']);
    expect(screen.queryByLabelText(en['settings.modelCustomLabel'])).toBeNull();
  });

  it('shows an empty state when no local CLI agents are detected', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: null },
      { agents: [] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*0 installed/i }));
    expect(screen.getByText(/No agents detected yet/i)).toBeTruthy();
  });

  it('labels the memory model default with the selected Local CLI', async () => {
    const agents: AgentInfo[] = [
      ...availableAgents,
      {
        id: 'claude',
        name: 'Claude Code',
        bin: 'claude',
        available: true,
        version: '1.2.3',
        models: [{ id: 'default', label: 'Default (CLI config)' }],
      },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }));

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'claude' },
      { agents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*2 installed/i }));

    const memoryModel = await screen.findByRole('combobox', { name: 'Memory model' });
    expect(memoryModel.textContent).toBe('Same as chat (Claude Code)');
    expect(screen.getByText(/anthropic is only the fallback provider family/i)).toBeTruthy();
  });

  it('shows rescan loading, avoids duplicate rescans, and renders the success notice', async () => {
    const nextAgents: AgentInfo[] = [
      availableAgents[0]!,
      {
        id: 'claude',
        name: 'Claude Code',
        bin: 'claude',
        available: true,
        version: '1.2.3',
        models: [{ id: 'default', label: 'Default' }],
      },
    ];
    const pending = deferred<AgentInfo[]>();
    const onRefreshAgents = vi.fn(() => pending.promise);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: availableAgents, onRefreshAgents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    const rescanButton = screen.getByRole('button', { name: /Rescan|Scanning/i }) as HTMLButtonElement;

    fireEvent.click(rescanButton);
    expect(onRefreshAgents).toHaveBeenCalledTimes(1);
    expect(onRefreshAgents).toHaveBeenCalledWith({
      throwOnError: true,
      agentCliEnv: {},
    });
    expect(rescanButton.disabled).toBe(true);
    expect(screen.getByText('Scanning...')).toBeTruthy();

    fireEvent.click(rescanButton);
    expect(onRefreshAgents).toHaveBeenCalledTimes(1);

    pending.resolve(nextAgents);

    await waitFor(() => {
      expect(screen.getByText('Scan complete. 2 available.')).toBeTruthy();
      expect((screen.getByRole('button', { name: /Rescan/i }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('renders an error notice when rescan fails', async () => {
    const onRefreshAgents = vi.fn(async () => {
      throw new Error('boom');
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: availableAgents, onRefreshAgents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rescan/i }));

    await waitFor(() => {
      expect(screen.getByText('Scan failed. Check the daemon and try again.')).toBeTruthy();
    });
  });

  it('rescans automatically when returning after opening an install link', async () => {
    const unavailable: AgentInfo = {
      id: 'gemini',
      name: 'Gemini CLI',
      bin: 'gemini',
      available: false,
      version: null,
      models: [],
      installUrl: 'https://github.com/google-gemini/gemini-cli',
    };
    const onRefreshAgents = vi.fn(async () => availableAgents);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: [availableAgents[0]!, unavailable], onRefreshAgents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    fireEvent.click(screen.getByText('Available to install (1)'));
    fireEvent.click(screen.getByRole('link', { name: en['settings.agentInstall.install'] }));
    expect(onRefreshAgents).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(onRefreshAgents).toHaveBeenCalledWith({
        throwOnError: true,
        agentCliEnv: {},
      });
    });
  });

  it('autosaves CLI config locations from the execution form', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: availableAgents },
    );

    expect(
      screen.getByLabelText('Codex/OpenAI proxy API key (CODEX_API_KEY)'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Codex/OpenAI proxy API key (OPENAI_API_KEY · proxy/legacy)'),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Codex home'), {
      target: { value: ' ~/.codex-team ' },
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mode: 'daemon',
        agentId: 'codex',
        agentCliEnv: {
          codex: { CODEX_HOME: '~/.codex-team' },
        },
      }),
      {},
    );
  });

  it('disables Local CLI mode when the daemon is offline', () => {
    renderSettingsDialog(
      { mode: 'api' },
      { agents: availableAgents, daemonLive: false },
    );

    const localCliTab = screen.getByRole('tab', { name: /Local CLI.*daemon offline/i }) as HTMLButtonElement;
    expect(localCliTab.disabled).toBe(true);
    expect(localCliTab.getAttribute('title')).toBe('Daemon is not running');
    expect(screen.getByRole('tab', { name: /BYOK.*API provider/i }).getAttribute('aria-selected')).toBe('true');
  });

  it('renders a Local CLI connection test for selected installed agents', () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: availableAgents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));

    expect(screen.getByRole('button', { name: /Codex CLI/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test' })).toBeTruthy();
  });

  it('renders the AMR local agent without vela branding and with the Local CLI test action', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));

    expect(screen.getByRole('button', { name: /^Open Design AMR\b/ })).toBeTruthy();
    expect(screen.queryByText('1.0.0')).toBeNull();
    expect(screen.queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(screen.queryByText(/vela/i)).toBeNull();
    expect(screen.queryByText(/Not signed in/i)).toBeNull();
    expect(screen.getByText('Official')).toBeTruthy();
    expect(screen.getByText('Lower cost')).toBeTruthy();
    expect(screen.getByText('Many models')).toBeTruthy();
    expect(screen.queryByText('Limited bonus: +100%')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Authorize' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
  });

  it('only shows the AMR authorization action after selecting the AMR card', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({ loggedIn: false, profile: 'local', user: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const codexAgent = availableAgents.find((agent) => agent.id === 'codex');
    expect(codexAgent).toBeTruthy();
    if (!codexAgent) throw new Error('missing codex test agent');
    renderSettingsDialog(
      { mode: 'daemon', agentId: codexAgent.id },
      { agents: [amrAgent, codexAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*2 installed/i }));
    expect(screen.getByRole('button', { name: /^Open Design AMR\b/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Authorize' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Open Design AMR\b/ }));

    expect(await screen.findByRole('button', { name: 'Authorize' })).toBeTruthy();
  });

  it('reveals AMR cancel only while hovering the active card during sign-in', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            profile: 'local',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    const amrCardButton = screen.getByRole('button', { name: /^Open Design AMR\b/ });
    const amrCard = amrCardButton.closest('.agent-card') as HTMLElement;
    expect(amrCard).toBeTruthy();
    expect(await screen.findByText('Signing in…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    fireEvent.mouseEnter(amrCard);
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();

    fireEvent.mouseLeave(amrCard);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    });
  });

  it('cancels an in-flight AMR sign-in and returns to Authorize after a brief canceled state', async () => {
    let statusStage: 'pending' | 'signed-out' = 'pending';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify(
            statusStage === 'pending'
              ? {
                  loggedIn: false,
                  loginInFlight: true,
                  profile: 'local',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  loginInFlight: false,
                  profile: 'local',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        statusStage = 'signed-out';
        return new Response(JSON.stringify({ canceled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    const amrCard = screen.getByRole('button', { name: /^Open Design AMR\b/ }).closest('.agent-card') as HTMLElement;
    expect(await screen.findByText('Signing in…')).toBeTruthy();

    fireEvent.mouseEnter(amrCard);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Canceled')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/login/cancel', { method: 'POST' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.queryByText('Canceled')).toBeNull();
  });

  // Regression for the race called out on #3158 by both codex-connector and
  // looper: the daemon's `cancelVelaLogin()` only SIGTERMs the vela child
  // and keeps it in `activeLoginProcs` until it actually exits, so a
  // `/api/integrations/vela/status` read right after a successful cancel
  // can legally still report `loginInFlight: true`. If the AmrLoginPill
  // listener self-refreshed on the local cancel path it would bounce back
  // into `Signing in…` polling and surface the timeout/error path even
  // though the user already canceled.
  it('does not bounce back to Signing in… when daemon /status still reports loginInFlight after a local cancel (#3158)', async () => {
    let cancelReceived = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        // Keep reporting in-flight even *after* the cancel API succeeds —
        // this is the SIGTERM-to-exit window where the daemon hasn't reaped
        // the vela child yet.
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            profile: 'local',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        cancelReceived = true;
        return new Response(JSON.stringify({ canceled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    const amrCard = screen.getByRole('button', { name: /^Open Design AMR\b/ }).closest('.agent-card') as HTMLElement;
    expect(await screen.findByText('Signing in…')).toBeTruthy();

    fireEvent.mouseEnter(amrCard);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Canceled')).toBeTruthy();
    expect(cancelReceived).toBe(true);

    // Give the listener event handler — plus any rogue polling tick — a
    // generous window to misfire. Under the buggy code path the pill would
    // call /status again, see loginInFlight:true, setPending('login'), and
    // restart polling, flipping the UI back to 'Signing in…'.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByText('Signing in…')).toBeNull();

    // Eventually the Canceled UI window times out and Authorize re-appears.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authorize' })).toBeTruthy();
    }, { timeout: 3000 });
    // And still no bounce back to Signing in…
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('reconciles late AMR browser completion to Signed in after local cancel', async () => {
    let statusStage: 'pending' | 'signed-out' | 'signed-in' = 'pending';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        const body =
          statusStage === 'pending'
            ? {
                loggedIn: false,
                loginInFlight: true,
                profile: 'local',
                user: null,
                configPath: '/Users/test/.amr/config.json',
              }
            : statusStage === 'signed-in'
              ? {
                  loggedIn: true,
                  loginInFlight: false,
                  profile: 'local',
                  user: { id: 'user-1', email: 'late@example.com' },
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  loginInFlight: false,
                  profile: 'local',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        statusStage = 'signed-out';
        return new Response(JSON.stringify({ canceled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    const amrCard = screen.getByRole('button', { name: /^Open Design AMR\b/ }).closest('.agent-card') as HTMLElement;
    expect(await screen.findByText('Signing in…')).toBeTruthy();

    fireEvent.mouseEnter(amrCard);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Canceled')).toBeTruthy();

    statusStage = 'signed-in';
    window.dispatchEvent(
      new CustomEvent('od:amr-login-status-change', {
        detail: { reason: 'status-changed' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
      expect(screen.getByText('late@example.com')).toBeTruthy();
    });
  });

  it('renders the signed-in AMR account state inside Settings without leaking vela branding', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'local',
            user: {
              id: 'user-1',
              email: 'signed-in@example.com',
              name: 'Signed In User',
            },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Open Design AMR\b/ })).toBeTruthy();
    expect(screen.getByText('signed-in@example.com')).toBeTruthy();
    expect(screen.queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(screen.queryByText(/^vela$/i)).toBeNull();
  });

  it('renders env-backed AMR login inside Settings without fabricating account details', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'local',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Open Design AMR\b/ })).toBeTruthy();
    expect(screen.queryByText(/@/i)).toBeNull();
    expect(screen.queryByText(/AMR \(vela\)/i)).toBeNull();
  });

  it('does not keep a stale signed-in AMR state after a later Settings reopen reads loggedOut', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify(
            statusCalls === 1
              ? {
                  loggedIn: true,
                  profile: 'local',
                  user: { id: 'user-1', email: 'signed-in@example.com' },
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  profile: 'local',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );
    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
    first.unmount();

    const second = renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );
    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    expect(await screen.findByRole('button', { name: 'Authorize' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    second.unmount();
  });

  it('keeps AMR selected in Settings after local logout instead of silently switching agents', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify({
            loggedIn: statusCalls === 1,
            profile: 'local',
            user: statusCalls === 1 ? { id: 'user-1', email: 'signed-in@example.com' } : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/logout' && init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'amr' },
      { agents: [amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Open Design AMR\b/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('button', { name: 'Authorize' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Open Design AMR\b/ })).toBeTruthy();
    expect(
      onPersist.mock.calls.some(
        ([nextConfig]) =>
          typeof nextConfig === 'object' &&
          nextConfig !== null &&
          'agentId' in (nextConfig as Record<string, unknown>) &&
          (nextConfig as Record<string, unknown>).agentId !== 'amr',
      ),
    ).toBe(false);
  });
});

describe('SettingsDialog media providers interactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('sorts configured providers ahead of unconfigured ones and shows configured badges', () => {
    renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        mediaProviders: {
          openai: { apiKey: 'sk-media', baseUrl: 'https://custom.openai.example/v1' },
          minimax: { apiKey: 'mini-key', baseUrl: 'https://api.minimaxi.chat/v1' },
        },
      },
      { initialSection: 'media' },
    );

    const names = Array.from(document.querySelectorAll('.media-provider-name')).map((node) =>
      node.textContent?.trim(),
    );
    expect(names.slice(0, 2)).toEqual(['MiniMax', 'OpenAI']);
  });

  it('renders non-integrated providers in the coming-soon section without input fields', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );

    // Non-integrated providers (e.g. Fal.ai, Black Forest Labs) are shown in
    // a separate "Coming soon" disclosure without editable inputs.
    expect(screen.queryByLabelText('Black Forest Labs API key')).toBeNull();
    expect(screen.queryByLabelText('Black Forest Labs Base URL')).toBeNull();
    expect(document.querySelector('.media-provider-coming-soon')).toBeTruthy();
    expect(screen.getByText('ComfyUI')).toBeTruthy();
  });

  it('renders ElevenLabs as an integrated media provider with enabled inputs', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );

    const apiKeyInput = screen.getByLabelText('ElevenLabs API key') as HTMLInputElement;
    const baseUrlInput = screen.getByLabelText('ElevenLabs Base URL') as HTMLInputElement;
    expect(apiKeyInput.disabled).toBe(false);
    expect(baseUrlInput.disabled).toBe(false);
  });

  it('clears an existing provider config and removes it from the persisted payload', async () => {
    const { onPersist } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        mediaProviders: {
          openai: { apiKey: 'sk-media', baseUrl: 'https://custom.openai.example/v1' },
        },
      },
      { initialSection: 'media' },
    );

    // Issue #737 added a window.confirm guard on the Clear button so a
    // stray click cannot wipe a saved API key. Auto-accept the prompt
    // here so the test still exercises the cleared-payload path.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const clearButtons = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearButtons[0]!);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('OpenAI API key') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('OpenAI Base URL') as HTMLInputElement).value).toBe('');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mediaProviders: {},
      }),
      { forceMediaProviderSync: true },
    );

    confirmSpy.mockRestore();
  });

  it('cancels Clear when the confirmation is dismissed (issue #737)', () => {
    const { onPersist } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        mediaProviders: {
          openai: { apiKey: 'sk-media', baseUrl: 'https://custom.openai.example/v1' },
        },
      },
      { initialSection: 'media' },
    );

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const clearButtons = screen.getAllByRole('button', { name: 'Clear' });
    fireEvent.click(clearButtons[0]!);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Saved key + base URL must stay intact when the user dismisses
    // the confirmation; without this guard a fat-fingered click on
    // Clear would silently wipe the key. Autosave should never fire
    // because nothing changed.
    expect((screen.getByLabelText('OpenAI API key') as HTMLInputElement).value).toBe('sk-media');
    expect((screen.getByLabelText('OpenAI Base URL') as HTMLInputElement).value).toBe(
      'https://custom.openai.example/v1',
    );
    expect(onPersist).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('supports persisting provider API key and base URL edits', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );

    fireEvent.change(screen.getByLabelText('FishAudio API key'), {
      target: { value: 'fish-key' },
    });
    fireEvent.change(screen.getByLabelText('FishAudio Base URL'), {
      target: { value: 'https://fish.example.com' },
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mediaProviders: expect.objectContaining({
          fishaudio: {
            apiKey: 'fish-key',
            baseUrl: 'https://fish.example.com',
            model: '',
          },
        }),
      }),
      { forceMediaProviderSync: true },
    );
  });

  it('re-masks a replacement media provider API key until reveal is used again', () => {
    renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        mediaProviders: {
          openai: { apiKey: 'sk-media', baseUrl: 'https://api.openai.com/v1' },
        },
      },
      { initialSection: 'media' },
    );

    const apiKeyInput = screen.getByLabelText('OpenAI API key') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI Show key' }));
    expect(apiKeyInput.type).toBe('text');

    // Issue #737 added a window.confirm guard on Clear; jsdom's
    // unimplemented confirm() returns undefined, which would cancel
    // the clear and leave this test asserting the wrong reveal state.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[0]!);
    expect(apiKeyInput.type).toBe('password');

    fireEvent.change(apiKeyInput, { target: { value: 'sk-replacement' } });
    expect(apiKeyInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI Show key' }));
    expect(apiKeyInput.type).toBe('text');

    confirmSpy.mockRestore();
  });

  it('supports providers with a custom model override field', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );

    fireEvent.change(screen.getByLabelText('Nano Banana API key'), {
      target: { value: 'banana-key' },
    });
    fireEvent.change(screen.getByLabelText('Nano Banana Base URL'), {
      target: { value: 'https://gateway.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Nano Banana model'), {
      target: { value: 'gemini-3.1-flash-image-preview' },
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mediaProviders: expect.objectContaining({
          nanobanana: {
            apiKey: 'banana-key',
            baseUrl: 'https://gateway.example.com',
            model: 'gemini-3.1-flash-image-preview',
          },
        }),
      }),
      { forceMediaProviderSync: true },
    );
  });

  it('catches unmount flush failures for pending media-provider autosaves', async () => {
    const rejection = new Error('daemon unavailable');
    const handleUnhandledRejection = vi.fn((event: PromiseRejectionEvent) => {
      event.preventDefault();
    });
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    try {
      const { onPersist, unmount } = renderSettingsDialog(
        { mode: 'daemon', agentId: 'codex' },
        { initialSection: 'media' },
      );
      onPersist.mockRejectedValueOnce(rejection);

      fireEvent.change(screen.getByLabelText('OpenAI API key'), {
        target: { value: 'sk-unmount-media' },
      });

      await waitFor(() => {
        expect(screen.getByText('Saving…')).toBeTruthy();
      });
      unmount();
      await Promise.resolve();
      await Promise.resolve();

      expect(onPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaProviders: expect.objectContaining({
            openai: expect.objectContaining({ apiKey: 'sk-unmount-media' }),
          }),
        }),
        expect.objectContaining({ forceMediaProviderSync: true }),
      );
      expect(handleUnhandledRejection).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    }
  });

  it('closes media settings via the close button or backdrop', () => {
    const first = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );

    fireEvent.change(screen.getByLabelText('OpenAI API key'), {
      target: { value: 'sk-unsaved-media' },
    });
    fireEvent.click(first.container.querySelector('.settings-close') as HTMLElement);
    expect(first.onClose).toHaveBeenCalledTimes(1);

    cleanup();

    const second = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );
    fireEvent.change(screen.getByLabelText('OpenAI API key'), {
      target: { value: 'sk-unsaved-media-2' },
    });
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsDialog connectors interactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a saved Composio key state with masked tail and replacement guidance', () => {
    renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        composio: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: 'uQEg',
        },
      },
      { initialSection: 'composio' },
    );

    expect(screen.getAllByRole('heading', { name: 'Connectors' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Saved · ••••uQEg')).toBeTruthy();
    expect((screen.getByPlaceholderText('Paste a new key to replace the saved one') as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/your key is saved in the local daemon/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Clear' }) as HTMLButtonElement).disabled).toBe(false);

    const getApiKeyLink = screen.getByRole('link', { name: /Get API Key/i }) as HTMLAnchorElement;
    expect(getApiKeyLink.href).toBe('https://app.composio.dev/');
  });

  it('supports replacing a saved Composio key and saving the pending edit', async () => {
    const { onPersistComposioKey } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        composio: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: 'uQEg',
        },
      },
      { initialSection: 'composio' },
    );

    fireEvent.change(screen.getByPlaceholderText('Paste a new key to replace the saved one'), {
      target: { value: 'cmp_replacement_secret' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => {
      expect(onPersistComposioKey).toHaveBeenCalledWith({
        apiKey: 'cmp_replacement_secret',
        apiKeyConfigured: true,
        apiKeyTail: 'uQEg',
      });
    });
  });

  it('clears a saved Composio key from the payload', async () => {
    const { onPersistComposioKey } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        composio: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: 'uQEg',
        },
      },
      { initialSection: 'composio' },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /hold on|disconnect/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /hold on|disconnect/i }));

    await waitFor(() => {
      expect(onPersistComposioKey).toHaveBeenCalledWith({
        apiKey: '',
        apiKeyConfigured: false,
        apiKeyTail: '',
      });
    });
    expect(screen.getByText(/keys are stored locally and never shared/i)).toBeTruthy();
  });

  it('closes Composio settings via the close button or backdrop', () => {
    const first = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        composio: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: 'uQEg',
        },
      },
      { initialSection: 'composio' },
    );

    fireEvent.change(screen.getByPlaceholderText('Paste a new key to replace the saved one'), {
      target: { value: 'cmp_unsaved_secret' },
    });
    fireEvent.click(first.container.querySelector('.settings-close') as HTMLElement);
    expect(first.onClose).toHaveBeenCalledTimes(1);

    cleanup();

    const second = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        composio: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: 'uQEg',
        },
      },
      { initialSection: 'composio' },
    );
    fireEvent.change(screen.getByPlaceholderText('Paste a new key to replace the saved one'), {
      target: { value: 'cmp_unsaved_secret_2' },
    });
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsDialog MCP server interactions', () => {
  const installInfo = {
    command: '/Applications/Open Design.app/Contents/Resources/open-design/bin/node',
    args: [
      '/Applications/Open Design.app/Contents/Resources/app/node_modules/@open-design/daemon/dist/cli.js',
      'mcp',
      '--daemon-url',
      'http://127.0.0.1:51706',
    ],
    daemonUrl: 'http://127.0.0.1:51706',
    platform: 'darwin',
    cliExists: true,
    nodeExists: true,
    buildHint: null,
  };

  let fetchMock: ReturnType<typeof vi.fn>;
  let writeTextMock: ReturnType<typeof vi.fn>;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => installInfo,
    });
    vi.stubGlobal('fetch', fetchMock);

    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
    vi.clearAllMocks();
  });

  it('renders the default Claude Code install snippet after fetching daemon install info', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'integrations' },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/mcp/install-info');
    });
    expect(screen.getByText(/Run this in your terminal/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/claude mcp add-json --scope user open-design/i)).toBeTruthy();
    });
    expect(screen.getByText(/Restart your client to pick up the new server/i)).toBeTruthy();
    expect(screen.getByText(/Open Design must be running for MCP tool calls to succeed/i)).toBeTruthy();
  });

  it('switches client instructions and snippet content when a different MCP client is selected', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'integrations' },
    );

    await waitFor(() => {
      expect(screen.getByText(/claude mcp add-json --scope user open-design/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Claude Code/i }));
    fireEvent.click(screen.getByRole('option', { name: /Codex/i }));

    await waitFor(() => {
      expect(screen.getByText(/Append this table to ~\/\.codex\/config\.toml/i)).toBeTruthy();
    });
    expect(screen.getByText(/\[mcp_servers\.open-design\]/i)).toBeTruthy();

    // Scope to the picker trigger ("Codex" + the TOML method chip) so
    // we don't collide with the new one-click "Install in Codex" /
    // "Remove from Codex" button on the same panel.
    fireEvent.click(screen.getByRole('button', { name: /Codex.*TOML/i }));
    fireEvent.click(screen.getByRole('option', { name: /Cursor/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Install in Cursor/i })).toBeTruthy();
    });
    expect(screen.getByText(/merge this JSON into ~\/\.cursor\/mcp\.json/i)).toBeTruthy();
    expect(screen.getByText(/"mcpServers"/i)).toBeTruthy();
  });

  it('copies the currently selected MCP snippet to the clipboard', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'integrations' },
    );

    await waitFor(() => {
      expect(screen.getByText(/claude mcp add-json --scope user open-design/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy MCP configuration snippet' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("claude mcp add-json --scope user open-design"),
      );
    });
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('shows a daemon error state when install paths cannot be resolved', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'integrations' },
    );

    await waitFor(() => {
      const errorCard = document.querySelector('.empty-card');
      expect(errorCard?.textContent).toContain('reach the local daemon to resolve install paths');
    });
    expect(screen.getByText(/# resolving paths failed, see the error above/i)).toBeTruthy();
  });
});

describe('SettingsDialog language interactions', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.removeItem('open-design:locale');
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  it('shows every locale as a tile and marks the current locale as selected', async () => {
    renderLanguageSettingsDialog('en');

    const tiles = await screen.findAllByRole('radio');
    expect(tiles).toHaveLength(LOCALES.length);
    expect(screen.getByRole('radio', { name: /English/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /简体中文/i }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches locale immediately and updates localStorage', async () => {
    renderLanguageSettingsDialog('en');

    fireEvent.click(screen.getByRole('radio', { name: /简体中文/i }));

    expect(screen.getByRole('radio', { name: /简体中文/i }).getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('open-design:locale')).toBe('zh-CN');
    expect(document.documentElement.getAttribute('lang')).toBe('zh-CN');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('sets rtl direction for rtl locales', async () => {
    renderLanguageSettingsDialog('en');

    fireEvent.click(screen.getByRole('radio', { name: /فارسی/i }));

    expect(window.localStorage.getItem('open-design:locale')).toBe('fa');
    expect(document.documentElement.getAttribute('lang')).toBe('fa');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('does not route language changes through autosave and closing does not revert an applied locale', async () => {
    const { onPersist, onClose } = renderLanguageSettingsDialog('en');

    fireEvent.click(screen.getByRole('radio', { name: /Deutsch/i }));

    expect(window.localStorage.getItem('open-design:locale')).toBe('de');
    expect(document.documentElement.getAttribute('lang')).toBe('de');

    fireEvent.click(screen.getByTitle(/close|schließen/i));
    expect(onPersist).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('open-design:locale')).toBe('de');
    expect(document.documentElement.getAttribute('lang')).toBe('de');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});

describe('SettingsDialog notifications interactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders notifications offline by default and only reveals sound pickers when enabled', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'notifications' },
    );

    expect(screen.getByRole('group', { name: 'Completion sound' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'offline' })[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('group', { name: 'Success sound' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Failure sound' })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'offline' })[0] as HTMLButtonElement);
    expect(playSoundMock).toHaveBeenCalledWith('ding');
    expect(screen.getByRole('group', { name: 'Success sound' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Failure sound' })).toBeTruthy();
  });

  it('updates completion success and failure sounds and autosaves the edited notification config', async () => {
    const { onPersist } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        notifications: {
          soundEnabled: true,
          successSoundId: 'chime',
          failureSoundId: 'two-tone-down',
          desktopEnabled: false,
        },
      },
      { initialSection: 'notifications' },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pluck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thud' }));

    expect(playSoundMock).toHaveBeenNthCalledWith(1, 'pluck');
    expect(playSoundMock).toHaveBeenNthCalledWith(2, 'thud');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        notifications: {
          soundEnabled: true,
          successSoundId: 'pluck',
          failureSoundId: 'thud',
          desktopEnabled: false,
        },
      }),
      {},
    );
  });

  it('enables desktop notifications after permission is granted and sends a test notification', async () => {
    notificationPermissionMock.mockReturnValueOnce('default').mockReturnValue('granted');
    requestNotificationPermissionMock.mockResolvedValue('granted');
    showCompletionNotificationMock.mockResolvedValue('shown');

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'notifications' },
    );

    const desktopToggle = screen.getAllByRole('button', { name: 'offline' })[1] as HTMLButtonElement;
    fireEvent.click(desktopToggle);

    await waitFor(() => {
      expect(requestNotificationPermissionMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: 'active' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Send test' }));
    await waitFor(() => {
      expect(showCompletionNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'succeeded' }),
      );
    });
    expect(screen.getByText(/Test notification sent/i)).toBeTruthy();
  });

  it('shows a blocked hint and keeps desktop notifications disabled when permission is denied', async () => {
    notificationPermissionMock.mockReturnValueOnce('default').mockReturnValue('denied');
    requestNotificationPermissionMock.mockResolvedValue('denied');

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'notifications' },
    );

    const desktopToggle = screen.getAllByRole('button', { name: 'offline' })[1] as HTMLButtonElement;
    fireEvent.click(desktopToggle);

    await waitFor(() => {
      expect(requestNotificationPermissionMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/Notifications blocked by the browser/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send test' })).toBeNull();
  });

  it('closes notification settings via the close button or backdrop', () => {
    const first = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'notifications' },
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'offline' })[0] as HTMLButtonElement);
    fireEvent.click(first.container.querySelector('.settings-close') as HTMLElement);
    expect(first.onClose).toHaveBeenCalledTimes(1);

    cleanup();

    const second = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'notifications' },
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'offline' })[0] as HTMLButtonElement);
    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsDialog appearance interactions', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-strong');
    document.documentElement.style.removeProperty('--accent-soft');
    document.documentElement.style.removeProperty('--accent-tint');
    document.documentElement.style.removeProperty('--accent-hover');
  });

  it('treats System as the selected appearance mode when theme is unset or system', () => {
    renderSettingsDialog(
      { theme: 'system' },
      { initialSection: 'appearance' },
    );

    expect(screen.getByRole('button', { name: 'System' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Light' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('applies the first accent color as the default appearance color', () => {
    renderSettingsDialog(
      { theme: 'system' },
      { initialSection: 'appearance' },
    );

    expect(screen.getByRole('radio', { name: 'Default accent color' }).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#c96442');
  });

  it('live previews explicit themes and removes the explicit document theme when switching back to System', () => {
    renderSettingsDialog(
      { theme: 'dark' },
      { initialSection: 'appearance' },
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('reverts an unsaved appearance preview back to the saved theme when the dialog closes', () => {
    const first = renderSettingsDialog(
      { theme: 'dark' },
      { initialSection: 'appearance' },
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(first.container.querySelector('.settings-close') as HTMLElement);
    expect(first.onClose).toHaveBeenCalledTimes(1);

    first.unmount();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists System mode explicitly and preserves accent variables without an explicit document theme', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', theme: 'dark', accentColor: '#2563eb' },
      { initialSection: 'appearance' },
    );

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2563eb');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        theme: 'system',
        accentColor: '#2563eb',
      }),
      {},
    );
  });

  it('switches back to the default accent color and persists it explicitly', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', theme: 'light', accentColor: '#2563eb' },
      { initialSection: 'appearance' },
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Default accent color' }));

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#c96442');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        accentColor: '#c96442',
      }),
      {},
    );
  });

  it('keeps an autosaved accent color applied after the dialog closes', async () => {
    const view = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', theme: 'light', accentColor: '#2563eb' },
      { initialSection: 'appearance' },
    );

    fireEvent.click(screen.getByRole('radio', { name: '#059669' }));

    await waitForPersist(
      view.onPersist,
      expect.objectContaining({
        accentColor: '#059669',
      }),
      {},
    );

    fireEvent.click(view.container.querySelector('.settings-close') as HTMLElement);
    expect(view.onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#059669');
  });

  it('live previews and autosaves preset and custom accent colors', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', theme: 'light' },
      { initialSection: 'appearance' },
    );

    fireEvent.click(screen.getByRole('radio', { name: '#059669' }));
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#059669');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        accentColor: '#059669',
      }),
      {},
    );

    fireEvent.change(screen.getByLabelText('Custom color'), {
      target: { value: '#123456' },
    });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#123456');

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        accentColor: '#123456',
      }),
      {},
    );
  });

  it('localizes the accent color controls in Chinese', () => {
    render(
      <I18nProvider initial="zh-CN">
        <SettingsDialog
          initial={{ ...baseConfig, theme: 'light' }}
          agents={availableAgents}
          daemonLive={true}
          appVersionInfo={null}
          initialSection="appearance"
          onPersist={vi.fn()}
          onPersistComposioKey={vi.fn()}
          onClose={vi.fn()}
          onRefreshAgents={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('主题色')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: '主题色' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '默认主题色' })).toBeTruthy();
    expect(screen.getByLabelText('自定义颜色')).toBeTruthy();
  });
});

describe('SettingsDialog pets interactions', () => {
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');

  afterEach(() => {
    if (clipboardDescriptor) {
      Object.defineProperty(window.navigator, 'clipboard', clipboardDescriptor);
    } else {
      Reflect.deleteProperty(window.navigator, 'clipboard');
    }
    cleanup();
  });

  it('renders bundled pets by default and exposes community pets in a separate tab', async () => {
    fetchCodexPetsMock.mockResolvedValue({
      pets: [...sampleBundledPets, ...sampleCommunityPets],
      rootDir: '/Users/test/.codex/pets',
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'pet' },
    );

    expect((screen.getByRole('button', { name: 'Show pet' }) as HTMLButtonElement).disabled).toBe(false);

    await waitFor(() => {
      expect(screen.getByText('Dario')).toBeTruthy();
      expect(screen.getByText('Nyako')).toBeTruthy();
    });
    expect(screen.queryByText('Jade')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    expect(screen.getByText('Recently hatched')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download community pets' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByText('Jade')).toBeTruthy();
    expect(screen.getByText('Voidling')).toBeTruthy();
  });

  it('supports editing and persisting a custom pet', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'pet' },
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));

    fireEvent.change(screen.getByDisplayValue('Buddy'), {
      target: { value: 'Scout' },
    });
    fireEvent.change(screen.getByDisplayValue('🦄'), {
      target: { value: '🤖' },
    });
    fireEvent.change(screen.getByDisplayValue('Hi! I am here whenever you need me.'), {
      target: { value: 'Hi there, builder.' },
    });
    fireEvent.click(document.querySelector('.pet-swatch[title="#2348b8"]') as HTMLElement);

    expect(screen.getAllByText('Scout').length).toBeGreaterThan(0);
    expect(screen.getByText('Hi there, builder.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use my pet' }));

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        pet: expect.objectContaining({
          adopted: true,
          enabled: true,
          petId: 'custom',
          custom: expect.objectContaining({
            name: 'Scout',
            glyph: '🤖',
            greeting: 'Hi there, builder.',
            accent: '#2348b8',
          }),
        }),
      }),
      {},
    );
  });

  it('toggles an adopted pet between tucked and awake states', async () => {
    const { onPersist } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        pet: {
          adopted: true,
          enabled: true,
          petId: 'custom',
          custom: {
            name: 'Buddy',
            glyph: '🦄',
            accent: '#c96442',
            greeting: 'Hi! I am here whenever you need me.',
          },
        },
      },
      { initialSection: 'pet' },
    );

    const toggle = screen.getByRole('button', { name: 'Hide pet' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Show pet' })).toBeTruthy();
    expect(screen.getByText('Hide pet')).toBeTruthy();

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        pet: expect.objectContaining({
          adopted: true,
          enabled: false,
        }),
      }),
      {},
    );
  });

  it('refreshes and syncs community pets with inline status feedback', async () => {
    fetchCodexPetsMock.mockResolvedValue({
      pets: sampleCommunityPets,
      rootDir: '/Users/test/.codex/pets',
    });
    syncCommunityPetsMock.mockResolvedValue({
      wrote: 2,
      skipped: 1,
      failed: 0,
      total: 5,
      rootDir: '/Users/test/.codex/pets',
      errors: [],
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'pet' },
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    await waitFor(() => {
      expect(fetchCodexPetsMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(fetchCodexPetsMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download community pets' }));
    await waitFor(() => {
      expect(syncCommunityPetsMock).toHaveBeenCalledTimes(1);
      expect(fetchCodexPetsMock).toHaveBeenCalledTimes(3);
      expect(screen.getByText('Synced 2 new pets (5 total).')).toBeTruthy();
    });
  });

  it('copies the hatch prompt with the current concept', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'pet' },
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    fireEvent.change(screen.getByLabelText('Pet concept (optional)'), {
      target: { value: 'a tiny pixel-art bee in a cozy sweater' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('Concept: a tiny pixel-art bee in a cozy sweater.'),
      );
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('Use the @hatch-pet skill end-to-end:'),
      );
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeTruthy();
    });
  });
});

describe('SettingsDialog skills section', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists functional skills and filters them by mode + search', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'skills' },
    );

    await waitFor(() => {
      expect(screen.getByText('blog-post')).toBeTruthy();
      expect(screen.getByText('sales-deck')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'deck' },
    });
    expect(screen.queryByText('blog-post')).toBeNull();
    expect(screen.getByText('sales-deck')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'sales' },
    });
    expect(screen.getByText('sales-deck')).toBeTruthy();
    expect(screen.queryByText('dashboard')).toBeNull();
  });

  it('opens a skill detail panel and persists disabled skills from toggle switches', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'skills' },
    );

    await waitFor(() => {
      expect(screen.getByText('blog-post')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('blog-post'));
    await waitFor(() => {
      expect(fetchSkillMock).toHaveBeenCalledWith('blog-post');
      expect(screen.getByText('skill body for blog-post')).toBeTruthy();
    });

    const toggles = screen.getAllByTitle('Toggle');
    fireEvent.click(toggles[0] as HTMLElement);

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        disabledSkills: ['blog-post'],
      }),
      {},
    );
  });

  it('shows an empty state when search matches nothing', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'skills' },
    );

    await waitFor(() => {
      expect(screen.getByText('blog-post')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'zzz-no-match' },
    });
    expect(screen.getByText('No items match your search.')).toBeTruthy();
  });
});

describe('SettingsDialog design systems section', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists design systems and persists disabled selections from toggle switches', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'designSystems' },
    );

    await waitFor(() => {
      expect(screen.getByText('Neutral Modern')).toBeTruthy();
      expect(screen.getByText('Signal Green')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Experimental' },
    });
    expect(screen.queryByText('Neutral Modern')).toBeNull();
    expect(screen.getByText('Signal Green')).toBeTruthy();

    fireEvent.click(screen.getByText('Signal Green'));
    await waitFor(() => {
      expect(fetchDesignSystemMock).toHaveBeenCalledWith('signal-green');
      expect(screen.getByText('design system body for signal-green')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByLabelText('Show in home gallery')[0] as HTMLElement);

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        disabledDesignSystems: ['signal-green'],
      }),
      {},
    );
  });

  it('shows an imported design system from the hidden-only import CTA', async () => {
    renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        disabledDesignSystems: ['neutral-modern'],
      },
      { initialSection: 'designSystems' },
    );

    await waitFor(() => {
      expect(screen.getByText('Neutral Modern')).toBeTruthy();
      expect(screen.getByText('Signal Green')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show hidden' }));
    expect(screen.getByText('Neutral Modern')).toBeTruthy();
    expect(screen.queryByText('Signal Green')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add design system' }));
    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/tmp/imported-system' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import from project' }));

    await waitFor(() => {
      expect(importLocalDesignSystemMock).toHaveBeenCalledWith({
        baseDir: '/tmp/imported-system',
        importMode: 'hybrid',
        craftApplies: [],
      });
      expect(screen.getByText('Imported Imported System')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'View imported design system' }));

    await waitFor(() => {
      expect(screen.getByText('Imported System')).toBeTruthy();
    });
    expect(screen.queryByText('No items match your search.')).toBeNull();
  });
});

describe('SettingsDialog about interactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders app version and runtime details when version info is available', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.4.1',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    );

    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByText('0.4.1')).toBeTruthy();
    expect(screen.getByText('Channel')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByText('Runtime')).toBeTruthy();
    expect(screen.getByText('Packaged app')).toBeTruthy();
    expect(screen.getByText('Platform')).toBeTruthy();
    expect(screen.getByText('darwin')).toBeTruthy();
    expect(screen.getByText('Architecture')).toBeTruthy();
    expect(screen.getByText('arm64')).toBeTruthy();
  });

  it('renders the unavailable fallback when app version info is missing', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'about', appVersionInfo: null },
    );

    expect(
      screen.getByText(/Version details are unavailable while the daemon is offline\./i),
    ).toBeTruthy();
  });

  it('does not create dirty state on the about page', () => {
    const first = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.4.1',
          channel: 'beta',
          packaged: false,
          platform: 'linux',
          arch: 'x64',
        },
      },
    );

    fireEvent.click(first.container.querySelector('.settings-close') as HTMLElement);
    expect(first.onClose).toHaveBeenCalledTimes(1);

    cleanup();

    const second = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.4.1',
          channel: 'beta',
          packaged: false,
          platform: 'linux',
          arch: 'x64',
        },
      },
    );

    fireEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    expect(second.onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the releases page when the latest release info is stale', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    fetchLatestGithubReleaseInfoMock.mockResolvedValue({
      tagName: 'v0.4.1',
      htmlUrl: 'https://github.com/nexu-io/open-design/releases/tag/v0.4.1',
      stale: true,
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.4.1',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Install latest' }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://github.com/nexu-io/open-design/releases',
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(screen.queryByText(en['settings.alreadyLatest'])).toBeNull();
  });
});
