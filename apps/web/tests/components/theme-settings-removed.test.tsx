// @vitest-environment jsdom
//
// Product removed the theme setting outright: the workspace surfaces have no
// dark tokens, so offering dark mode only produced a broken-looking app. Two
// surfaces used to write `config.theme` — the Settings → General appearance
// segmented control and the onboarding welcome page's sun/moon toggle. These
// specs pin both as gone, so a later refactor cannot quietly reintroduce a
// path back into dark mode.

import { cleanup, render, screen } from '@testing-library/react';
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
  globalThis.ResizeObserver = originalResizeObserver;
  analyticsMocks.track.mockReset();
});

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('Settings → General (theme setting removed)', () => {
  function renderGeneralSettings() {
    return render(
      <I18nProvider initial="en">
        <SettingsDialog
          presentation="page"
          initial={{ ...DEFAULT_CONFIG }}
          agents={AGENTS}
          daemonLive
          appVersionInfo={null}
          initialSection="general"
          onPersist={vi.fn()}
          onPersistComposioKey={vi.fn()}
          onClose={vi.fn()}
          onRefreshAgents={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('renders no appearance group', () => {
    renderGeneralSettings();

    expect(screen.queryByRole('group', { name: 'Appearance' })).toBeNull();
  });

  it('renders no System / Light / Dark theme buttons', () => {
    renderGeneralSettings();

    for (const label of THEME_CONTROL_LABELS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('keeps the neighbouring General settings intact', () => {
    renderGeneralSettings();

    // The language select and the system-preferences block share the General
    // page with the removed appearance control; deleting the theme picker must
    // not take them along.
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
  });
});

describe('Onboarding welcome (theme toggle removed)', () => {
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

  it('exposes no theme control by accessible name', () => {
    renderOnboarding();

    for (const label of THEME_CONTROL_LABELS) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });
});
