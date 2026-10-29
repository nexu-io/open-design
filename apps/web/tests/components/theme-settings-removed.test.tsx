// @vitest-environment jsdom
//
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { I18nProvider } from '../../src/i18n';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo, AppConfig } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const AGENTS: AgentInfo[] = [
  { id: 'codex', name: 'Codex', bin: 'codex', available: true },
];

const THEME_CONTROL_LABELS = ['System', 'Light', 'Dark'];

const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  globalThis.ResizeObserver = originalResizeObserver;
  analyticsMocks.track.mockReset();
});

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('Settings → General appearance', () => {
  function renderGeneralSettings(onPersist = vi.fn()) {
    render(
      <I18nProvider initial="en">
        <SettingsDialog
          presentation="page"
          initial={{ ...DEFAULT_CONFIG }}
          agents={AGENTS}
          daemonLive
          appVersionInfo={null}
          initialSection="general"
          onPersist={onPersist}
          onPersistComposioKey={vi.fn()}
          onClose={vi.fn()}
          onRefreshAgents={vi.fn()}
        />
      </I18nProvider>,
    );
    return onPersist;
  }

  it('renders the theme picker, previews selection immediately, and persists the change', async () => {
    const onPersist = renderGeneralSettings();
    const group = screen.getByRole('group', { name: 'Appearance' });
    const buttons = THEME_CONTROL_LABELS.map((label) => screen.getByRole('button', { name: label }));
    const darkButton = screen.getByRole('button', { name: 'Dark' });

    expect(buttons).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(darkButton);

    expect(darkButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }), expect.anything());
    });
    expect(group).toBeTruthy();
  });

  it('keeps the neighbouring General settings intact', () => {
    renderGeneralSettings();

    // The language select and the system-preferences block share the General
    // page with the removed appearance control; deleting the theme picker must
    // not take them along.
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
  });
});

describe('Onboarding welcome appearance', () => {
  function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    return {
      mode: 'daemon',
      agentId: null,
      agentModels: {},
      apiProtocol: 'anthropic',
      apiProtocolConfigs: {},
      apiKey: '',
      baseUrl: '',
      model: '',
      ...overrides,
    } as AppConfig;
  }

  function renderOnboarding() {
    window.history.replaceState(null, '', '/onboarding');
    return render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={baseConfig()}
          agents={AGENTS}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => AGENTS)}
          onCreateProject={vi.fn()}
          onBeginProjectCreation={() => ({ projectId: 'optimistic-project', rollback: () => undefined })}
          onAmrBalanceGateBlockChange={() => undefined}
          onCreatePluginShareProject={vi.fn()}
          onImportClaudeDesign={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenLiveArtifact={vi.fn()}
          onDeleteProject={vi.fn()}
          onRenameProject={vi.fn()}
          onChangeDefaultDesignSystem={vi.fn()}
          onPersistComposioKey={vi.fn()}
          onOpenSettings={vi.fn()}
          onCompleteOnboarding={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('renders no sun/moon theme toggle on the welcome pane', () => {
    const { container } = renderOnboarding();

    expect(container.querySelector('.onboarding-cloud__pane')).not.toBeNull();
    expect(container.querySelector('.onboarding-cloud__theme')).toBeNull();
  });

  it('has no separate System / Light / Dark theme buttons', () => {
    renderOnboarding();

    for (const label of THEME_CONTROL_LABELS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});
