// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import { en } from '../../src/i18n/locales/en';

function optionNames(container: HTMLElement): string[] {
  return within(container).getAllByRole('option').map((option) => {
    const labelledBy = option.getAttribute('aria-labelledby');
    if (!labelledBy) return option.textContent?.trim() ?? '';
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
  });
}

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
  openExternalUrlMock,
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
  openExternalUrlMock: vi.fn(),
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
    openExternalUrl: openExternalUrlMock,
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
import { IntegrationsView } from '../../src/components/IntegrationsView';
import type { AgentRefreshOptions, SettingsSection } from '../../src/components/SettingsDialog';
import { reconcileAmrModelChoice } from '../../src/components/SettingsDialog';
import { reconcileAmrProfileEnv } from '../../src/components/SettingsDialog';
import { providerModelsCacheKey } from '../../src/components/providerModelsCache';
import { I18nProvider } from '../../src/i18n';
import { LOCALES } from '../../src/i18n/types';
import { MAX_MAX_TOKENS, MIN_MAX_TOKENS } from '../../src/state/maxTokens';
import type {
  AgentInfo,
  AppConfig,
  AppVersionInfo,
  ProviderModelOption,
} from '../../src/types';

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

let restoreOpenDesignHost: (() => void) | null = null;

function updateStatus(
  overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {},
): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    capabilities: {
      canApplyInPlace: false,
      canDownload: true,
      canOpenInstaller: true,
      requiresManualInstall: true,
    },
    channel: 'beta',
    currentVersion: '1.2.3-beta.3',
    enabled: true,
    mode: 'package-launcher',
    platform: 'darwin',
    state: 'idle',
    supported: true,
    ...overrides,
  };
}

function renderSettingsDialog(
  initial: Partial<AppConfig> = {},
  options: {
    agents?: AgentInfo[];
    daemonLive?: boolean;
    onRefreshAgents?: OnRefreshAgents;
    initialSection?: SettingsSection;
    appVersionInfo?: AppVersionInfo | null;
    providerModelsCache?: Record<string, ProviderModelOption[]>;
    welcome?: boolean;
    onSilentUpdatePreferenceChange?: (allowSilentUpdates: boolean) => Promise<void>;
  } = {},
) {
  const onPersist = vi.fn();
  const onPersistComposioKey = vi.fn();
  const onSilentUpdatePreferenceChange: (allowSilentUpdates: boolean) => Promise<void> =
    options.onSilentUpdatePreferenceChange
    ?? (async () => undefined);
  const onClose = vi.fn();
  const onRefreshAgents = options.onRefreshAgents ?? vi.fn<OnRefreshAgents>();

  const view = render(
    <SettingsDialog
      initial={{ ...baseConfig, ...initial }}
      agents={options.agents ?? availableAgents}
      daemonLive={options.daemonLive ?? true}
      appVersionInfo={options.appVersionInfo ?? null}
      initialSection={options.initialSection ?? 'execution'}
      providerModelsCache={options.providerModelsCache}
      welcome={options.welcome}
      onPersist={onPersist}
      onSilentUpdatePreferenceChange={onSilentUpdatePreferenceChange}
      onPersistComposioKey={onPersistComposioKey}
      onClose={onClose}
      onRefreshAgents={onRefreshAgents}
    />,
  );

  return {
    onPersist,
    onSilentUpdatePreferenceChange,
    onPersistComposioKey,
    onClose,
    onRefreshAgents,
    ...view,
  };
}

function renderIntegrationsView(
  initial: Partial<AppConfig> = {},
  options: {
    initialTab?: 'mcp' | 'connectors' | 'skills' | 'use-everywhere';
  } = {},
) {
  const onConfigPersist = vi.fn();
  const onPersistComposioKey = vi.fn();
  const view = render(
    <IntegrationsView
      config={{ ...baseConfig, ...initial }}
      initialTab={options.initialTab ?? 'mcp'}
      onConfigPersist={onConfigPersist}
      onPersistComposioKey={onPersistComposioKey}
    />,
  );

  return { onConfigPersist, onPersistComposioKey, ...view };
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
  openExternalUrlMock.mockReset();
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
  openExternalUrlMock.mockResolvedValue(true);
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

afterEach(() => {
  restoreOpenDesignHost?.();
  restoreOpenDesignHost = null;
});

describe('SettingsDialog privacy settings interactions', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('preserves a pending privacy choice when an unrelated parent config update arrives', async () => {
    const randomUUID = vi.fn(() => 'inst-new');
    vi.stubGlobal('crypto', { randomUUID });
    const initial: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentId: null,
      installationId: null,
      privacyDecisionAt: 1778244000000,
      telemetry: { metrics: false, content: false, artifactManifest: true },
    };
    const view = renderSettingsDialog(initial, { initialSection: 'privacy' });

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('inst-new');
    });

    view.rerender(
      <SettingsDialog
        initial={{ ...initial, agentId: 'codex' }}
        agents={availableAgents}
        daemonLive={true}
        appVersionInfo={null}
        initialSection="privacy"
        onPersist={view.onPersist}
        onPersistComposioKey={view.onPersistComposioKey}
        onClose={view.onClose}
        onRefreshAgents={view.onRefreshAgents}
      />,
    );

    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('aria-pressed'))
      .toBe('true');
    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('inst-new');
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('true');
  });
});

describe('SettingsDialog execution settings BYOK interactions', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('collapses the settings sidebar and toggles fullscreen from dialog chrome', () => {
    const { container } = renderSettingsDialog();
    const dialog = screen.getByRole('dialog');
    const sidebar = container.querySelector('#settings-sidebar');

    expect(dialog.classList.contains('settings-sidebar-collapsed')).toBe(false);
    expect(sidebar?.getAttribute('aria-hidden')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse settings sidebar' }));
    expect(dialog.classList.contains('settings-sidebar-collapsed')).toBe(true);
    expect(sidebar?.getAttribute('aria-hidden')).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Expand settings sidebar' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Expand settings sidebar' }));
    expect(dialog.classList.contains('settings-sidebar-collapsed')).toBe(false);
    expect(sidebar?.getAttribute('aria-hidden')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(dialog.classList.contains('settings-fullscreen')).toBe(true);
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(dialog.classList.contains('settings-fullscreen')).toBe(false);
  });

  it('renders BYOK provider preset tabs and toggles API key visibility', () => {
    renderSettingsDialog();

    expect(screen.getByRole('tablist', { name: en['settings.protocolAria'] })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Anthropic' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'OpenAI' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Azure OpenAI' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Google Gemini' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Ollama Cloud' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'SenseAudio' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'AIHubMix' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'AWS Bedrock' })).toBeNull();
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

  it('isolates API key draft and visibility by BYOK provider preset', () => {
    renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'sk-openai-provider' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(apiKeyInput.value).toBe('sk-openai-provider');
    expect(apiKeyInput.type).toBe('text');

    fireEvent.click(screen.getByRole('tab', { name: 'DeepSeek' }));

    expect(apiKeyInput.value).toBe('');
    expect(apiKeyInput.type).toBe('password');
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.deepseek.com',
    );

    fireEvent.change(apiKeyInput, { target: { value: 'sk-deepseek-provider' } });
    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect(apiKeyInput.value).toBe('sk-openai-provider');
    expect(apiKeyInput.type).toBe('text');

    fireEvent.click(screen.getByRole('tab', { name: 'DeepSeek' }));

    expect(apiKeyInput.value).toBe('sk-deepseek-provider');
    expect(apiKeyInput.type).toBe('password');
  });

  it('shows configured status from provider-scoped drafts for same-protocol presets', () => {
    renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'sk-openai-provider' } });
    fireEvent.click(screen.getByRole('tab', { name: 'DeepSeek' }));
    fireEvent.change(apiKeyInput, { target: { value: 'sk-deepseek-provider' } });

    expect(screen.getByRole('tab', { name: 'OpenAI' }).getAttribute('title')).toBe(
      'OpenAI - Configured',
    );
    expect(screen.getByRole('tab', { name: 'DeepSeek' }).getAttribute('title')).toBe(
      'DeepSeek - Configured',
    );
  });

  it('persists provider-scoped BYOK drafts across Settings reopen', async () => {
    const first = renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'sk-openai-provider' } });
    fireEvent.click(screen.getByRole('tab', { name: 'DeepSeek' }));

    await waitForPersist(
      first.onPersist,
      expect.objectContaining({
        apiProviderBaseUrl: 'https://api.deepseek.com',
        baseUrl: 'https://api.deepseek.com',
        byokProviderConfigDrafts: expect.objectContaining({
          'openai:https://api.openai.com/v1': expect.objectContaining({
            apiConfig: expect.objectContaining({
              apiKey: 'sk-openai-provider',
              baseUrl: 'https://api.openai.com/v1',
              model: 'gpt-4o',
            }),
          }),
        }),
      }),
      {},
    );

    const persistedConfig = first.onPersist.mock.calls.at(-1)?.[0] as AppConfig;
    first.unmount();

    renderSettingsDialog(persistedConfig);
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.deepseek.com',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe(
      'sk-openai-provider',
    );
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.openai.com/v1',
    );
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('gpt-4o');
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

  it('only persists Max tokens overrides within the supported BYOK range', async () => {
    const { onPersist } = renderSettingsDialog({ apiKey: 'sk-test' });

    const maxTokensInput = screen.getByRole('spinbutton', { name: /Max tokens/ }) as HTMLInputElement;
    expect(maxTokensInput.min).toBe(String(MIN_MAX_TOKENS));
    expect(maxTokensInput.max).toBe(String(MAX_MAX_TOKENS));
    expect(maxTokensInput.step).toBe('1');

    fireEvent.change(maxTokensInput, { target: { value: String(MIN_MAX_TOKENS - 1) } });

    await waitFor(() => {
      const latestConfig = onPersist.mock.calls.at(-1)?.[0] as AppConfig | undefined;
      expect(latestConfig?.maxTokens).toBeUndefined();
    });
    expect(
      onPersist.mock.calls.some(([config]) => (config as AppConfig).maxTokens === MIN_MAX_TOKENS - 1),
    ).toBe(false);
    expect(maxTokensInput.value).toBe(String(MIN_MAX_TOKENS - 1));

    fireEvent.blur(maxTokensInput);
    expect(maxTokensInput.value).toBe('');

    fireEvent.change(maxTokensInput, { target: { value: '64000' } });

    await waitFor(() => {
      const latestConfig = onPersist.mock.calls.at(-1)?.[0] as AppConfig | undefined;
      expect(latestConfig?.maxTokens).toBe(64000);
    });

    fireEvent.change(maxTokensInput, { target: { value: String(MAX_MAX_TOKENS + 1) } });

    await waitFor(() => {
      const latestConfig = onPersist.mock.calls.at(-1)?.[0] as AppConfig | undefined;
      expect(latestConfig?.maxTokens).toBeUndefined();
    });
    expect(
      onPersist.mock.calls.some(([config]) => (config as AppConfig).maxTokens === MAX_MAX_TOKENS + 1),
    ).toBe(false);

    fireEvent.change(maxTokensInput, { target: { value: '' } });

    await waitFor(() => {
      const latestConfig = onPersist.mock.calls.at(-1)?.[0] as AppConfig | undefined;
      expect(latestConfig?.maxTokens).toBeUndefined();
    });
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

    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain(
      'deepseek-v4-flash',
    );
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com');
  });

  it('offers Atlas Cloud as an OpenAI-compatible gateway preset', () => {
    renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    selectGatewayPreset('Atlas Cloud');

    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain(
      'qwen/qwen3.5-flash',
    );
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).value).toBe(
      'https://api.atlascloud.ai/v1',
    );
    expect(screen.getByRole('link', { name: 'Get key ↗' }).getAttribute('href')).toBe(
      'https://atlascloud.ai/?utm_source=open_design&utm_medium=provider_preset&utm_campaign=atlascloud_byok',
    );
  });

  it('keeps Anthropic-compatible gateway presets selectable', () => {
    renderSettingsDialog();

    const providerPopover = openGatewayPresetPopover();
    expect(optionNames(providerPopover)).toEqual(
      expect.arrayContaining([
        'Custom provider',
        'Anthropic (Claude)',
        'DeepSeek — Anthropic',
        'MiniMax — Anthropic',
        'MiMo (Xiaomi) — Anthropic',
      ]),
    );

    fireEvent.click(within(providerPopover).getByRole('option', { name: 'DeepSeek — Anthropic' }));

    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain(
      'deepseek-v4-flash',
    );
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
    expect(optionNames(providerPopover)).toEqual([
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
    await waitFor(() => {
      const testConnectionCalls = fetchMock.mock.calls.filter(
        ([input]) => input.toString() === '/api/test/connection',
      );
      expect(testConnectionCalls).toHaveLength(1);
    });
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
    // A non-http scheme is still rejected client-side. (An internal-IP URL is
    // no longer rejected here — it is syntactically valid and the daemon owns
    // the allowlist decision; see #3225.)
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'ftp://api.example.com' },
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

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
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
    expect(optionNames(modelPopover)).toEqual(expect.arrayContaining([
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

    fetchProviderModelsMock.mockClear();
    fireEvent.click(screen.getByRole('tab', { name: '小米 MiMo' }));
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(fetchProviderModelsMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Fetch models' })).toBeNull();
    expect(screen.getByText('Model discovery is not available for this protocol.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain('mimo-v2.5-pro');
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
    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
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

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
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

  it('replaces a retired preset with the first provider preference available to the account', async () => {
    const testedModels: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/memory') {
        return new Response(
          JSON.stringify({ enabled: true, memories: [], extraction: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      expect(url).toBe('/api/test/connection');
      const body = JSON.parse(String(init?.body)) as { model?: string };
      testedModels.push(body.model ?? '');
      return new Response(
        JSON.stringify({
          ok: true,
          kind: 'ok',
          latencyMs: 7,
          model: body.model,
          sample: 'pong',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [
        { id: 'account-first', label: 'Account First' },
        { id: 'kimi-k2.6', label: 'Kimi K2.6' },
      ],
    });
    const { onPersist } = renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2-0711-preview',
      apiProviderBaseUrl: 'https://api.moonshot.cn/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Moonshot' }));

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain(
      'Kimi K2.6 (kimi-k2.6) · From your account',
    );
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).not.toContain(
      'account-first',
    );
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProtocol: 'openai',
        model: 'kimi-k2.6',
      }),
      {},
    );
    await waitFor(() => {
      expect(testedModels).toEqual(['kimi-k2.6']);
    });
  });

  it('does not treat the first upstream model as the default when no preference matches', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [
        { id: 'account-first', label: 'Account First' },
        { id: 'account-second', label: 'Account Second' },
      ],
    });
    const { onPersist } = renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).not.toContain(
      'account-first',
    );
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProtocol: 'openai',
        model: '',
      }),
      {},
    );
  });

  it('does not carry a generic preset model into a fresh custom provider before discovery', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'endpoint-model', label: 'Endpoint Model' }],
    });
    const { onPersist } = renderSettingsDialog({
      apiProtocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Custom provider' }));

    expect((screen.getByLabelText('Custom model id') as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://custom.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-custom' },
    });
    fireEvent.blur(screen.getByLabelText('API key'));

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toContain(
      'Endpoint Model (endpoint-model) · From your account',
    );
    await waitForPersist(
      onPersist,
      expect.objectContaining({
        apiProviderBaseUrl: null,
        baseUrl: 'https://custom.example.com/v1',
        model: 'endpoint-model',
      }),
      {},
    );
  });

  it('restores fetched model discovery state when switching back to a provider', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [{ id: 'account-ready-model', label: 'Account Ready' }],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'DeepSeek' }));
    expect(screen.queryByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'OpenAI' }));
    expect(screen.getByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
    expect(fetchProviderModelsMock).toHaveBeenCalledTimes(1);
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

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();

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

  it('filters long BYOK model lists after provider discovery succeeds without hiding the current selection', async () => {
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
    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();

    const modelPicker = screen.getByRole('combobox', { name: 'Model' });
    fireEvent.click(modelPicker);

    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    const searchInput = within(modelPopover).getByTestId('settings-byok-model-search') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '5.5' } });

    expect(optionNames(modelPopover)).toEqual([
      'gpt-4.1-mini · From your account',
      'gpt-5.5 · From your account',
      'Custom (type below)…',
    ]);
  });

  it('reports the account model count when account models are combined with provider suggestions', async () => {
    fetchProviderModelsMock.mockResolvedValueOnce({
      ok: true,
      kind: 'success',
      latencyMs: 12,
      models: [
        { id: 'glm-4.6', label: 'glm-4.6' },
        { id: 'account-glm-1', label: 'Account GLM 1' },
        { id: 'account-glm-2', label: 'Account GLM 2' },
        { id: 'account-glm-3', label: 'Account GLM 3' },
        { id: 'account-glm-4', label: 'Account GLM 4' },
        { id: 'account-glm-5', label: 'Account GLM 5' },
        { id: 'account-glm-6', label: 'Account GLM 6' },
        { id: 'account-glm-7', label: 'Account GLM 7' },
      ],
    });
    renderSettingsDialog({
      apiProtocol: 'openai',
      apiKey: 'sk-zhipu',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.6',
      apiProviderBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    });

    fireEvent.click(screen.getByRole('tab', { name: '智谱' }));

    expect(await screen.findByText('✓ Loaded 8 models from your account.')).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
    const modelPopover = screen.getByTestId('settings-byok-model-popover');
    expect(within(modelPopover).getByRole('option', { name: 'glm-4-plus · Suggested' })).toBeTruthy();
    expect(within(modelPopover).getByRole('option', { name: 'glm-4-air · Suggested' })).toBeTruthy();
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

    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();
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
    expect(optionNames(modelPopover)).toEqual(expect.arrayContaining([
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
    expect(await screen.findByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://proxy.example.com/v1' },
    });

    await waitFor(() => {
      expect(screen.queryByText(/✓ Loaded \d+ models(?: from your account)?\./)).toBeNull();
    });
  });

  it('does not reuse discovered models for Anthropic full Messages endpoints', () => {
    const messagesEndpoint = 'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages';
    const staleDiscoveryKey = providerModelsCacheKey(
      'anthropic',
      messagesEndpoint,
      'sk-mimo',
      '',
    );

    renderSettingsDialog(
      {
        apiProtocol: 'anthropic',
        apiKey: 'sk-mimo',
        baseUrl: messagesEndpoint,
        model: 'mimo-v2.5-pro',
        apiProviderBaseUrl: null,
      },
      {
        providerModelsCache: {
          [staleDiscoveryKey]: [{ id: 'deepseek-chat', label: 'deepseek-chat' }],
        },
      },
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }));
    const modelPopover = screen.getByTestId('settings-byok-model-popover');

    expect(optionNames(modelPopover)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('deepseek-chat')]),
    );
    expect(within(modelPopover).getByRole('option', { name: 'Custom (type below)…' })).toBeTruthy();
    expect((screen.getByLabelText('Custom model id') as HTMLInputElement).value).toBe(
      'mimo-v2.5-pro',
    );
    expect(fetchProviderModelsMock).not.toHaveBeenCalled();
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

  it('shows provider upstream detail for failed BYOK connection tests', async () => {
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
          kind: 'upstream_unavailable',
          latencyMs: 42,
          status: 400,
          detail:
            'The selected NVIDIA model instance is currently unavailable at the provider. Try a different model or retry later.',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSettingsDialog({ apiKey: 'sk-ant-test-provider' });

    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(
      await screen.findByText(
        /Provider returned 400\. Try again in a moment\. The selected NVIDIA model instance is currently unavailable/,
      ),
    ).toBeTruthy();
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
    await waitFor(() => {
      const testConnectionCalls = fetchMock.mock.calls.filter(
        ([input]) => input.toString() === '/api/test/connection',
      );
      expect(testConnectionCalls).toHaveLength(1);
    });
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

  it('pins Open Design to the top of the installed CLI list', () => {
    const claudeAgent: AgentInfo = {
      id: 'claude',
      name: 'Claude Code',
      bin: 'claude',
      available: true,
      version: '2.1.196',
      models: [{ id: 'default', label: 'Default' }],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
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
            loginInFlight: false,
            profile: 'local',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    }));

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: [availableAgents[0]!, claudeAgent, amrAgent] },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*3 installed/i }));

    expect(
      screen
        .getAllByTestId(/^settings-agent-card-/)
        .map((card) => card.getAttribute('data-testid')),
    ).toEqual([
      'settings-agent-card-amr',
      'settings-agent-card-codex',
      'settings-agent-card-claude',
    ]);
  });

  it('lets users switch to Local CLI, select an installed agent, and autosave', async () => {
    const installed = availableAgents[0]!;
    const unavailable: AgentInfo = {
      id: 'kimi',
      name: 'Kimi CLI',
      bin: 'kimi',
      available: false,
      version: null,
      models: [],
      installUrl: 'https://github.com/MoonshotAI/kimi-cli',
      docsUrl: 'https://www.kimi.com/code/docs/en/kimi-cli/guides/getting-started.html?aff=open-design',
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
    const kimiGroup = screen.getByRole('group', { name: /Kimi CLI/i });
    expect(within(kimiGroup).getByText('Moonshot Kimi CLI')).toBeTruthy();
    expect(
      (within(kimiGroup).getByRole('link', { name: en['settings.agentInstall.install'] }) as HTMLAnchorElement).getAttribute('href'),
    ).toBe(
      'https://github.com/MoonshotAI/kimi-cli',
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
    expect(optionNames(modelPopover)).toEqual(['gpt-4.1-mini', 'gpt-5.5', 'Custom (type below)…']);
  });

  it('keeps the Local CLI custom model input clearable when default is the fallback model', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        agents: [
          {
            ...availableAgents[0]!,
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI/i }));
    fireEvent.click(screen.getByRole('combobox', {
      name: en['settings.modelPicker'],
    }));
    const modelPopover = screen.getByTestId('settings-agent-model-popover-codex');
    fireEvent.click(within(modelPopover).getByRole('option', {
      name: en['settings.modelCustom'],
    }));

    const customModelInput = screen.getByLabelText(
      en['settings.modelCustomLabel'],
    ) as HTMLInputElement;
    expect(customModelInput.value).toBe('');

    fireEvent.change(customModelInput, { target: { value: 'default' } });
    expect(customModelInput.value).toBe('default');

    fireEvent.change(customModelInput, { target: { value: '' } });
    expect(customModelInput.value).toBe('');
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
    fireEvent.click(screen.getByRole('button', { name: /^Open Design\b/ }));

    const modelPickers = screen.getAllByRole('combobox', {
      name: en['settings.modelPicker'],
    });
    expect(modelPickers).toHaveLength(1);
    expect(modelPickers[0]?.textContent).toContain('GLM 5');
    fireEvent.click(modelPickers[0]!);
    const modelPopover = screen.getByTestId('settings-agent-model-popover-amr');
    expect(optionNames(modelPopover)).toEqual(['GLM 5', 'GLM 5.1']);
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

  it('renders diagnostics and fix actions on installed agents with auth failures', async () => {
    const docsUrl = 'https://docs.example.com/codex-auth';
    const authMissingAgent: AgentInfo = {
      ...availableAgents[0]!,
      authStatus: 'missing',
      authMessage: 'Codex CLI is installed but not authenticated.',
      docsUrl,
      diagnostics: [
        {
          reason: 'auth-missing',
          severity: 'error',
          message: 'Codex CLI is installed but not authenticated.',
          fixActions: [{ kind: 'openDocs' }, { kind: 'rescan' }],
        },
      ],
    };
    const onRefreshAgents = vi.fn(async () => [authMissingAgent]);

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: [authMissingAgent], onRefreshAgents },
    );

    fireEvent.click(screen.getByRole('tab', { name: /Local CLI.*1 installed/i }));
    const codexCard = screen.getByRole('button', { name: /Codex CLI/i })
      .closest('.agent-card') as HTMLElement;

    expect(
      within(codexCard).getByText('Codex CLI is installed but not authenticated.'),
    ).toBeTruthy();

    fireEvent.click(within(codexCard).getByRole('button', {
      name: en['settings.agentInstall.docs'],
    }));
    expect(openExternalUrlMock).toHaveBeenCalledWith(docsUrl);

    fireEvent.click(within(codexCard).getByRole('button', {
      name: en['settings.rescan'],
    }));
    await waitFor(() => {
      expect(onRefreshAgents).toHaveBeenCalledWith({
        throwOnError: true,
        agentCliEnv: {},
      });
    });
  });

  it('rescans automatically when returning after opening an install link', async () => {
    const unavailable: AgentInfo = {
      id: 'kimi',
      name: 'Kimi CLI',
      bin: 'kimi',
      available: false,
      version: null,
      models: [],
      installUrl: 'https://github.com/MoonshotAI/kimi-cli',
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

  it('autosaves CLI env overrides from the execution form', async () => {
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      { agents: availableAgents },
    );

    expect(
      screen.getByLabelText('Codex/OpenAI CLI API key (CODEX_API_KEY)'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Codex/OpenAI CLI API key (OPENAI_API_KEY)'),
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

    expect(screen.getByRole('button', { name: /^Open Design\b/ })).toBeTruthy();
    expect(screen.queryByText('1.0.0')).toBeNull();
    expect(screen.queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(screen.queryByText(/vela/i)).toBeNull();
    expect(screen.queryByText(/Not signed in/i)).toBeNull();
    expect(screen.getByText('Official')).toBeTruthy();
    expect(screen.queryByText('Lower cost')).toBeNull();
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
    expect(screen.getByRole('button', { name: /^Open Design\b/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Authorize' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Open Design\b/ }));

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
    const amrCardButton = screen.getByRole('button', { name: /^Open Design\b/ });
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
    const amrCard = screen.getByRole('button', { name: /^Open Design\b/ }).closest('.agent-card') as HTMLElement;
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
    const amrCard = screen.getByRole('button', { name: /^Open Design\b/ }).closest('.agent-card') as HTMLElement;
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
    const amrCard = screen.getByRole('button', { name: /^Open Design\b/ }).closest('.agent-card') as HTMLElement;
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
            account: { plan: 'pro' },
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
    expect(screen.getByRole('button', { name: /^Open Design\b/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Plan pro/ })).toBeTruthy();
    expect(screen.getByText('signed-in@example.com')).toBeTruthy();
    expect(screen.queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(screen.queryByText(/^vela$/i)).toBeNull();
  });

  it('keeps the AMR plan badge on the account row outside the clipped benefits row', async () => {
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
            account: { plan: 'pro' },
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

    const amrCardButton = await screen.findByRole('button', { name: /Plan pro/ });
    const planBadge = within(amrCardButton).getByText('pro');
    const benefits = amrCardButton.querySelector('.agent-card-benefits');
    const planSlot = planBadge.closest('.agent-card-plan-badge-slot');
    const accountRow = planBadge.closest('.agent-card-amr-email');

    expect(benefits).toBeTruthy();
    expect(planSlot).toBeTruthy();
    expect(accountRow).toBeTruthy();
    expect(accountRow?.textContent).toContain('signed-in@example.com');
    expect(planSlot?.getAttribute('aria-hidden')).toBe('true');
    expect(benefits?.contains(planBadge)).toBe(false);
  });

  it('loads the Settings AMR wallet fallback balance without a manual card refresh button', async () => {
    let walletCalls = 0;
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
      if (url === '/api/integrations/vela/wallet' || url === '/api/integrations/vela/wallet?refresh=1') {
        walletCalls += 1;
        return new Response(
          JSON.stringify({
            status: 'available',
            profile: 'local',
            user: { id: 'user-1', email: 'signed-in@example.com' },
            balanceUsd: '1.0000',
            updatedAt: '2026-06-29T08:00:00.000Z',
            fetchedAt: '2026-06-29T08:00:01.000Z',
            stale: false,
            source: 'vela_api',
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

    expect(await screen.findByText('$1.00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh AMR wallet balance' })).toBeNull();
    expect(walletCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/wallet', {
      cache: 'no-store',
    });
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
    expect(screen.getByRole('button', { name: /^Open Design\b/ })).toBeTruthy();
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
    expect(screen.getByRole('button', { name: /^Open Design\b/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('button', { name: 'Authorize' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Open Design\b/ })).toBeTruthy();
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

  it('reconciles the open settings draft when the parent agent CLI env changes', async () => {
    const view = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'amr',
        theme: 'dark',
        agentModels: {
          amr: {
            model: 'prod-only-model',
            reasoning: 'default',
          },
        },
        agentCliEnv: {
          codex: { CODEX_BIN: '/tmp/codex-dev' },
          amr: {
            OPEN_DESIGN_AMR_PROFILE: 'prod',
            AMR_API_BASE_URL: 'https://draft.example.test',
          },
        },
      },
      { initialSection: 'appearance', agents: [amrAgent, ...availableAgents] },
    );

    view.rerender(
      <SettingsDialog
        initial={{
          ...baseConfig,
          mode: 'daemon',
          agentId: 'amr',
          theme: 'dark',
          agentCliEnv: {
            amr: {
              OPEN_DESIGN_AMR_PROFILE: 'local',
              AMR_API_BASE_URL: 'https://daemon.example.test',
            },
          },
        }}
        agents={[amrAgent, ...availableAgents]}
        daemonLive={true}
        appVersionInfo={null}
        initialSection="appearance"
        onPersist={view.onPersist}
        onPersistComposioKey={view.onPersistComposioKey}
        onClose={view.onClose}
        onRefreshAgents={view.onRefreshAgents}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    await waitForPersist(
      view.onPersist,
      expect.objectContaining({
        theme: 'light',
        agentModels: {},
        agentCliEnv: {
          codex: { CODEX_BIN: '/tmp/codex-dev' },
          amr: {
            OPEN_DESIGN_AMR_PROFILE: 'local',
            AMR_API_BASE_URL: 'https://draft.example.test',
          },
        },
      }),
      {},
    );
  });

  it('clears a stale AMR draft model when the external profile changes and the draft still matches the previous config', () => {
    expect(
      reconcileAmrModelChoice(
        {
          amr: {
            model: 'prod-only-model',
            reasoning: 'default',
          },
        },
        {
          ...baseConfig,
          agentModels: {
            amr: {
              model: 'prod-only-model',
              reasoning: 'default',
            },
          },
          agentCliEnv: {
            amr: {
              OPEN_DESIGN_AMR_PROFILE: 'prod',
            },
          },
        },
        {
          ...baseConfig,
          agentModels: {},
          agentCliEnv: {
            amr: {
              OPEN_DESIGN_AMR_PROFILE: 'local',
            },
          },
        },
      ),
    ).toEqual({});
  });

  it('preserves unrelated draft env entries when reconciling the AMR profile', () => {
    expect(
      reconcileAmrProfileEnv(
        {
          codex: { CODEX_BIN: '/tmp/codex-dev' },
          amr: {
            OPEN_DESIGN_AMR_PROFILE: 'prod',
            AMR_API_BASE_URL: 'https://draft.example.test',
          },
        },
        {
          amr: {
            OPEN_DESIGN_AMR_PROFILE: 'local',
            AMR_API_BASE_URL: 'https://daemon.example.test',
          },
        },
      ),
    ).toEqual({
      codex: { CODEX_BIN: '/tmp/codex-dev' },
      amr: {
        OPEN_DESIGN_AMR_PROFILE: 'local',
        AMR_API_BASE_URL: 'https://draft.example.test',
      },
    });
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

describe('IntegrationsView skills tab', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists functional skills and filters them by mode + search', async () => {
    renderIntegrationsView(
      { mode: 'daemon', agentId: 'codex' },
      { initialTab: 'skills' },
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

  it('updates skill filter counts from the current filter context', async () => {
    fetchSkillsMock.mockResolvedValue([
      {
        id: 'product-image',
        name: 'product-image',
        description: 'Product image generation.',
        mode: 'image',
        category: 'marketing',
        previewType: 'PNG',
        source: 'built-in',
      },
      {
        id: 'document-brief',
        name: 'document-brief',
        description: 'Document brief.',
        mode: 'deck',
        category: 'documents',
        previewType: 'HTML',
        source: 'built-in',
      },
      {
        id: 'landing-page',
        name: 'landing-page',
        description: 'Landing page.',
        mode: 'prototype',
        category: 'marketing',
        previewType: 'HTML',
        source: 'built-in',
      },
    ]);

    renderIntegrationsView(
      { mode: 'daemon', agentId: 'codex' },
      { initialTab: 'skills' },
    );

    await waitFor(() => {
      expect(screen.getByText('product-image')).toBeTruthy();
      expect(screen.getByText('document-brief')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'image' },
    });

    const categorySelect = screen.getByRole('combobox', { name: 'Category' });
    expect(
      within(categorySelect).getByRole('option', { name: 'Documents (0)' }),
    ).toBeTruthy();
    expect(
      within(categorySelect).getByRole('option', { name: 'Marketing (1)' }),
    ).toBeTruthy();

    fireEvent.change(categorySelect, {
      target: { value: 'documents' },
    });

    expect(screen.getByText('No items match your search.')).toBeTruthy();
    expect(
      within(screen.getByRole('combobox', { name: 'Category' })).getByRole(
        'option',
        { name: 'Documents (0)' },
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('combobox', { name: 'Type' })).getByRole('option', {
        name: 'image (0)',
      }),
    ).toBeTruthy();
  });

  it('opens a skill detail panel and persists disabled skills from toggle switches', async () => {
    const { onConfigPersist } = renderIntegrationsView(
      { mode: 'daemon', agentId: 'codex' },
      { initialTab: 'skills' },
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

    await waitFor(() => {
      expect(onConfigPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          disabledSkills: ['blog-post'],
        }),
      );
    });
  });

  it('shows an empty state when search matches nothing', async () => {
    renderIntegrationsView(
      { mode: 'daemon', agentId: 'codex' },
      { initialTab: 'skills' },
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

  it('shows development builds as unsupported for in-app updates', () => {
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.4.1',
          channel: 'beta',
          packaged: false,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    );

    expect(screen.getByText(en['settings.updateStatusDevelopment'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: en['settings.installLatest'] })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: en['settings.updateViewReleases'] }));

    expect(openExternalUrlMock).toHaveBeenCalledWith('https://github.com/nexu-io/open-design/releases');
  });

  it('downloads an available packaged update from the about page', async () => {
    const available = updateStatus({
      availableVersion: '1.2.3-beta.4',
      state: 'available',
    });
    const downloaded = updateStatus({
      artifact: {
        name: 'Open Design Beta.dmg',
        platformKey: 'macAppleSilicon',
        type: 'dmg',
        url: 'https://fixture.test/Open Design Beta.dmg',
      },
      availableVersion: '1.2.3-beta.4',
      downloadPath: '/tmp/open-design-updater/Open Design Beta.dmg',
      state: 'downloaded',
    });
    const download = vi.fn(async () => downloaded);
    restoreOpenDesignHost = installMockOpenDesignHost({
      host: {
        updater: {
          download,
          status: vi.fn(async () => available),
        },
      },
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '1.2.3-beta.3',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    );

    expect(
      await screen.findByText('New version 1.2.3-beta.4 found. Preparing download.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: en['updater.download'] }));

    await waitFor(() => {
      expect(download).toHaveBeenCalledWith({ payload: { source: 'settings-about' } });
    });
    expect(screen.getByText('Version 1.2.3-beta.4 is ready to install.')).toBeTruthy();
  });

  it('installs a downloaded payload update from the about page', async () => {
    const payloadReady = updateStatus({
      artifact: {
        name: 'open-design-1.2.3-beta.4-mac-arm64-payload.zip',
        platformKey: 'mac',
        type: 'payload',
        url: 'https://fixture.test/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      },
      availableVersion: '1.2.3-beta.4',
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      downloadPath: '/tmp/open-design-updater/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      state: 'downloaded',
    });
    const installing = updateStatus({
      ...payloadReady,
      state: 'installing',
    });
    const install = vi.fn(async () => installing);
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreOpenDesignHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => payloadReady),
        },
      },
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '1.2.3-beta.3',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    );

    expect(await screen.findByText('Version 1.2.3-beta.4 is ready to install.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: en['updater.installRestart'] }));

    await waitFor(() => {
      expect(install).toHaveBeenCalledWith({ payload: { source: 'settings-about' } });
    });
    await waitFor(() => {
      expect(quit).toHaveBeenCalledWith({ payload: { source: 'settings-about' } });
    });
  });

  it('keeps a quit retry action when update install succeeds but quit throws or fails', async () => {
    const payloadReady = updateStatus({
      artifact: {
        name: 'open-design-1.2.3-beta.4-mac-arm64-payload.zip',
        platformKey: 'mac',
        type: 'payload',
        url: 'https://fixture.test/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      },
      availableVersion: '1.2.3-beta.4',
      capabilities: {
        canApplyInPlace: true,
        canDownload: true,
        canOpenInstaller: false,
        requiresManualInstall: false,
      },
      downloadPath: '/tmp/open-design-updater/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      state: 'downloaded',
    });
    const installed = updateStatus({
      ...payloadReady,
      installResult: {
        dryRun: true,
        openedAt: '2026-05-19T00:00:00.000Z',
        path: '/tmp/open-design-updater/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      },
    });
    const install = vi.fn(async () => installed);
    const quit = vi.fn()
      .mockRejectedValueOnce(new Error('desktop quit failed'))
      .mockResolvedValue({
        ok: false as const,
        reason: 'desktop quit is not available',
      });
    restoreOpenDesignHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => payloadReady),
        },
      },
    });

    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex' },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '1.2.3-beta.3',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    );

    fireEvent.click(await screen.findByRole('button', { name: en['updater.installRestart'] }));

    await waitFor(() => {
      expect(install).toHaveBeenCalledWith({ payload: { source: 'settings-about' } });
    });
    await waitFor(() => {
      expect(quit).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('button', { name: en['updater.quitButton'] })).toBeTruthy();
    expect(screen.getAllByText(en['updater.quitFailedTitle']).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: en['updater.quitButton'] }));

    await waitFor(() => {
      expect(quit).toHaveBeenCalledTimes(2);
    });
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('toggles allowSilentUpdates via the non-optimistic Settings path without crashing', async () => {
    const onSilentUpdatePreferenceChange = vi.fn(async () => undefined);
    const { onPersist } = renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', allowSilentUpdates: false },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.14.1',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
        onSilentUpdatePreferenceChange,
      },
    );

    const checkbox = screen.getByTestId('settings-allow-silent-updates') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    await waitFor(() => expect(onSilentUpdatePreferenceChange).toHaveBeenCalledWith(true));
    // Must not go through optimistic handleConfigPersist autosave.
    expect(onPersist).not.toHaveBeenCalled();

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    await waitFor(() => expect(onSilentUpdatePreferenceChange).toHaveBeenCalledWith(false));
  });

  it('reverts the Settings silent-update toggle when the non-optimistic save fails', async () => {
    let appConfigSilent: boolean | undefined = false;
    const onSilentUpdatePreferenceChange = vi.fn(async (value: boolean) => {
      throw new Error('daemon offline');
      appConfigSilent = value;
    });
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', allowSilentUpdates: false },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.14.1',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
        onSilentUpdatePreferenceChange,
      },
    );

    const checkbox = screen.getByTestId('settings-allow-silent-updates') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(onSilentUpdatePreferenceChange).toHaveBeenCalledWith(true));
    await waitFor(() => {
      expect((screen.getByTestId('settings-allow-silent-updates') as HTMLInputElement).checked).toBe(false);
    });
    // App-wide preference must not keep the rejected value.
    expect(appConfigSilent).toBe(false);
  });

  it('disables the Settings silent-update checkbox while a save is in flight', async () => {
    let resolveSave: (() => void) | null = null;
    const onSilentUpdatePreferenceChange = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderSettingsDialog(
      { mode: 'daemon', agentId: 'codex', allowSilentUpdates: false },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.14.1',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
        onSilentUpdatePreferenceChange,
      },
    );

    const checkbox = screen.getByTestId('settings-allow-silent-updates') as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(onSilentUpdatePreferenceChange).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(checkbox.disabled).toBe(true));

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(checkbox.disabled).toBe(false));
    expect(onSilentUpdatePreferenceChange).toHaveBeenCalledTimes(1);
  });

  it('still autosaves an unrelated edit that lands during a silent-update save', async () => {
    // Regression: success must only advance autosaveLastSavedRef for
    // allowSilentUpdates. Spreading the whole latest draft would mark a
    // concurrent theme (etc.) change as already saved and skip onPersist.
    let resolveSave: (() => void) | null = null;
    const onSilentUpdatePreferenceChange = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { onPersist } = renderSettingsDialog(
      {
        mode: 'daemon',
        agentId: 'codex',
        allowSilentUpdates: false,
        theme: 'light',
        accentColor: '#2563eb',
      },
      {
        initialSection: 'about',
        appVersionInfo: {
          version: '0.14.1',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
        onSilentUpdatePreferenceChange,
      },
    );

    fireEvent.click(screen.getByTestId('settings-allow-silent-updates'));
    await waitFor(() => expect(onSilentUpdatePreferenceChange).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(
        (screen.getByTestId('settings-allow-silent-updates') as HTMLInputElement).disabled,
      ).toBe(true);
    });
    expect(onPersist).not.toHaveBeenCalled();

    // Concurrent persisted edit while the silent-update request is in flight.
    fireEvent.click(screen.getByRole('button', { name: /Appearance/i }));
    fireEvent.click(screen.getByRole('radio', { name: '#059669' }));

    // Resolve silent-update AFTER the concurrent edit is in draft. The success
    // path must not stamp this accent into autosaveLastSavedRef.
    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });

    await waitForPersist(
      onPersist,
      expect.objectContaining({
        accentColor: '#059669',
      }),
      {},
    );
  });

  it('does not read event.currentTarget inside the silent-updates setCfg updater', async () => {
    // Source invariant: functional updaters must not close over event.currentTarget
    // (null after the native/React event handler returns under pending lanes).
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const source = await readFile(
      join(process.cwd(), 'src/components/SettingsDialog.tsx'),
      'utf8',
    );
    const silentToggleBlock = source.match(
      /data-testid="settings-allow-silent-updates"[\s\S]*?<\/label>/,
    )?.[0];
    expect(silentToggleBlock).toBeTruthy();
    expect(silentToggleBlock).not.toMatch(
      /setCfg\(\s*\(\s*current\s*\)\s*=>\s*\(\{[\s\S]*?event\.currentTarget\.checked/,
    );
    expect(silentToggleBlock).toMatch(/const allowSilentUpdates = event\.currentTarget\.checked/);
  });
});
