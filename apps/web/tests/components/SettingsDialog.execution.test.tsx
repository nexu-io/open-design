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
  fetchProviderModelsMock,
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
  fetchProviderModelsMock: vi.fn(),
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
    codexPetSpritesheetUrl: (pet: { spritesheetUrl: string }) => pet.spritesheetUrl,
  };
});

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: fetchProviderModelsMock,
}));

import { SettingsDialog } from '../../src/components/SettingsDialog';
import type { SettingsSection } from '../../src/components/SettingsDialog';
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
    onRefreshAgents?: ReturnType<typeof vi.fn>;
    initialSection?: SettingsSection;
    appVersionInfo?: AppVersionInfo | null;
  } = {},
) {
  const onPersist = vi.fn();
  const onPersistComposioKey = vi.fn();
  const onClose = vi.fn();
  const onRefreshAgents = options.onRefreshAgents ?? vi.fn();

  const view = render(
    <SettingsDialog
      initial={{ ...baseConfig, ...initial }}
      agents={options.agents ?? availableAgents}
      daemonLive={options.daemonLive ?? true}
      appVersionInfo={options.appVersionInfo ?? null}
      initialSection={options.initialSection ?? 'execution'}
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
  fetchProviderModelsMock.mockReset();
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
  });

  it('renders BYOK protocol tabs and toggles API key visibility', () => {
    renderSettingsDialog();

    expect(screen.getByRole('tab', { name: 'Anthropic' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'OpenAI' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Azure OpenAI' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Google Gemini' })).toBeTruthy();
    expect(screen.getByLabelText('Quick fill provider')).toBeTruthy();
    expect(screen.getByLabelText('Model')).toBeTruthy();
    expect(screen.getByLabelText('Base URL')).toBeTruthy();

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    expect(apiKeyInput.type).toBe('password');

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(apiKeyInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(apiKeyInput.type).toBe('password');
  });

  it('updates model and base URL when quick fill provider changes', () => {
    renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    fireEvent.change(screen.getByLabelText('Quick fill provider'), {
      target: { value: '1' },
    });

    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('deepseek-chat');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com');
  });

  it('treats a manually edited base URL as a custom provider', () => {
    renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    const providerSelect = screen.getByLabelText('Quick fill provider') as HTMLSelectElement;
    expect(providerSelect.value).toBe('0');

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://my-proxy.example.com/v1' },
    });

    expect(providerSelect.value).toBe('');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://my-proxy.example.com/v1',
    );
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

    const baseUrlInput = screen.getByLabelText('Base URL') as HTMLInputElement;

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });

    fireEvent.change(baseUrlInput, {
      target: { value: 'http://10.0.0.5:11434/v1' },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'Enter a valid public http:// or https:// URL.',
    );

    fireEvent.change(baseUrlInput, {
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

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'azure-key' },
    });
    fireEvent.change(screen.getByLabelText('Deployment name'), {
      target: { value: '__custom__' },
    });
    fireEvent.change(screen.getByLabelText('Custom model id'), {
      target: { value: 'deployment-one' },
    });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://example.openai.azure.com' },
    });
    fireEvent.change(screen.getByLabelText('API version'), {
      target: { value: '2024-10-21' },
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

  it('supports custom model entry in BYOK mode', async () => {
    const { onPersist } = renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-openai' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: '__custom__' },
    });

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

  it('enables model fetching only for supported BYOK provider drafts', () => {
    renderSettingsDialog({ apiProtocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiProviderBaseUrl: 'https://api.openai.com/v1' });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    const fetchButton = screen.getByRole('button', { name: 'Fetch models' }) as HTMLButtonElement;
    expect(fetchButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-openai' },
    });
    expect(fetchButton.disabled).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Azure OpenAI' }));
    expect((screen.getByRole('button', { name: 'Fetch models' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Automatic deployment discovery is not available/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Ollama Cloud' }));
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'ollama-key' },
    });
    expect((screen.getByRole('button', { name: 'Fetch models' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Model discovery is not available for this protocol.')).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));

    expect(await screen.findByText('Fetched 2 models.')).toBeTruthy();
    expect(fetchProviderModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai',
      }),
      expect.any(AbortSignal),
    );
    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(
      expect.arrayContaining(['remote-alpha', 'gpt-4o', '__custom__']),
    );
    expect(
      Array.from(select.options).some((o) =>
        o.textContent === 'Remote Alpha (remote-alpha)',
      ),
    ).toBe(true);
    expect((screen.getByLabelText('Custom model id') as HTMLInputElement).value).toBe('custom-still-here');

    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    expect(fetchProviderModelsMock).toHaveBeenCalledTimes(1);
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
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    expect(await screen.findByText('Fetched 1 models.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://proxy.example.com/v1' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Fetched 1 models.')).toBeNull();
    });
  });

  it('renders provider model fetch failures inline', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));

    expect(await screen.findByText('Authentication failed. Check your API key.')).toBeTruthy();
  });
});

describe('SettingsDialog execution settings Local CLI interactions', () => {
  afterEach(() => {
    cleanup();
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

    const codexCard = screen.getByRole('button', { name: /Codex CLI/i }) as HTMLButtonElement;
    const geminiGroup = screen.getByRole('group', { name: /Gemini CLI/i });
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
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mode: 'daemon',
        agentId: 'codex',
      }),
      {},
    );
  });

  it('shows an empty state when no local CLI agents are detected', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: null },
      { agents: [] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*0 installed/i }));
    expect(screen.getByText(/No agents detected yet/i)).toBeTruthy();
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

  it('autosaves CLI config locations from the execution form', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: availableAgents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));

    fireEvent.change(screen.getByLabelText('Claude Code config directory'), {
      target: { value: '  ~/.claude-qa  ' },
    });
    fireEvent.change(screen.getByLabelText('Codex home'), {
      target: { value: ' ~/.codex-team ' },
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        mode: 'daemon',
        agentId: 'codex',
        agentCliEnv: {
          claude: { CLAUDE_CONFIG_DIR: '~/.claude-qa' },
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
    expect(screen.getAllByText('Configured').length).toBeGreaterThanOrEqual(2);
  });

  it('renders unsupported providers as disabled rows', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'media' },
    );

    expect(screen.getAllByText('Unsupported').length).toBeGreaterThan(0);
    const bflApiKey = screen.getByLabelText('Black Forest Labs API key') as HTMLInputElement;
    const bflBaseUrl = screen.getByLabelText('Black Forest Labs Base URL') as HTMLInputElement;
    expect(bflApiKey.disabled).toBe(true);
    expect(bflBaseUrl.disabled).toBe(true);
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
    expect(screen.getByText(/keys are stored locally in the daemon/i)).toBeTruthy();
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
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'MCP server' })).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: /Codex/i }));
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

  it('opens the language menu and marks the current locale as selected', async () => {
    renderLanguageSettingsDialog('en');

    const trigger = screen.getByRole('button', { name: /English/i });
    fireEvent.click(trigger);

    const options = await screen.findAllByRole('menuitemradio');
    expect(options).toHaveLength(LOCALES.length);
    expect(screen.getByRole('menuitemradio', { name: /English/i }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: /简体中文/i }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches locale immediately, updates localStorage, and closes the menu', async () => {
    renderLanguageSettingsDialog('en');

    fireEvent.click(screen.getByRole('button', { name: /English/i }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /简体中文/i }));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: /简体中文/i })).toBeTruthy();
    expect(window.localStorage.getItem('open-design:locale')).toBe('zh-CN');
    expect(document.documentElement.getAttribute('lang')).toBe('zh-CN');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('sets rtl direction for rtl locales and closes the menu on escape', async () => {
    renderLanguageSettingsDialog('en');

    fireEvent.click(screen.getByRole('button', { name: /English/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /English/i }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /فارسی/i }));

    expect(window.localStorage.getItem('open-design:locale')).toBe('fa');
    expect(document.documentElement.getAttribute('lang')).toBe('fa');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('does not route language changes through autosave and closing does not revert an applied locale', async () => {
    const { onPersist, onClose } = renderLanguageSettingsDialog('en');

    fireEvent.click(screen.getByRole('button', { name: /English/i }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Deutsch/i }));

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

    expect((screen.getByRole('button', { name: 'Wake' }) as HTMLButtonElement).disabled).toBe(true);

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

    const toggle = screen.getByRole('button', { name: 'Tuck away' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Wake' })).toBeTruthy();

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

describe('SettingsDialog skills and design systems interactions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the skills library by default and filters by mode and search', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'library' },
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Skills3/i })).toBeTruthy();
      expect(screen.getByText('blog-post')).toBeTruthy();
      expect(screen.getByText('sales-deck')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /deck1/i }));
    expect(screen.queryByText('blog-post')).toBeNull();
    expect(screen.getByText('sales-deck')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'sales' },
    });
    expect(screen.getByText('sales-deck')).toBeTruthy();
    expect(screen.queryByText('dashboard')).toBeNull();
  });

  it('opens a skill preview and persists disabled skills from toggle switches', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'library' },
    );

    await waitFor(() => {
      expect(screen.getByText('blog-post')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByTitle('Preview')[0] as HTMLElement);
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

  it('switches to design systems, previews details, and persists disabled design systems', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'library' },
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Design Systems2/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Design Systems2/i }));
    await waitFor(() => {
      expect(screen.getByText('Neutral Modern')).toBeTruthy();
      expect(screen.getByText('Signal Green')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Experimental1/i }));
    expect(screen.queryByText('Neutral Modern')).toBeNull();
    expect(screen.getByText('Signal Green')).toBeTruthy();

    fireEvent.click(screen.getByText('Signal Green'));
    await waitFor(() => {
      expect(fetchDesignSystemMock).toHaveBeenCalledWith('signal-green');
      expect(screen.getByText('design system body for signal-green')).toBeTruthy();
    });

    fireEvent.click(screen.getAllByTitle('Toggle')[0] as HTMLElement);

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        disabledDesignSystems: ['signal-green'],
      }),
      {},
    );
  });

  it('shows an empty state when library search returns no results', async () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { initialSection: 'library' },
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

    expect(screen.getByRole('heading', { level: 3, name: 'About' })).toBeTruthy();
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
});
