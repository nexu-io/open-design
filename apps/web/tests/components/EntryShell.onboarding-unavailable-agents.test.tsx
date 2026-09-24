// @vitest-environment jsdom
//
// Regression test for issue #4662: when the onboarding "Local CLI" step
// detects zero usable local coding agents, it must surface the same
// unavailable-agent install cards (Install/Docs links + diagnostics) that
// Settings shows — not just the bare `settings.noAgentsDetected` sentence.

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

// Onboarding wires the grid's diagnostic fix-buttons to openExternalUrl (it has
// no AMR attribution to apply). Spy on it so we can assert the Install fix-button
// actually fires instead of resolving to a dead no-op (#4662 review follow-up).
const registryMocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(async () => true),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    openExternalUrl: registryMocks.openExternalUrl,
  };
});

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

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// An unavailable CLI agent carrying install/docs URLs plus a typed diagnostic
// with a rescan fix action — exactly the shape Settings renders as an install
// card with a fix-button row.
function unavailableCliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    available: false,
    installUrl: 'https://example.com/install-gemini',
    docsUrl: 'https://example.com/docs-gemini',
    diagnostics: [
      {
        reason: 'not-on-path',
        severity: 'error',
        message: 'Gemini CLI was not found on your PATH.',
        fixActions: [{ kind: 'rescan' }],
      },
    ],
    ...overrides,
  };
}

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

function onboardingProps(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
): React.ComponentProps<typeof EntryShell> {
  return {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig(),
    agents: [unavailableCliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [unavailableCliAgent()]),
    onCreateProject: vi.fn(),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };
}

function renderOnboarding(
  overrides: Partial<React.ComponentProps<typeof EntryShell>> = {},
) {
  window.history.replaceState(null, '', '/onboarding');
  const props = onboardingProps(overrides);

  function Harness() {
    const [config, setConfig] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          config={config}
          onConfigPersist={(next) => {
            props.onConfigPersist(next);
            setConfig(next as AppConfig);
          }}
        />
      </I18nProvider>
    );
  }

  render(<Harness />);
  return props;
}

// Onboarding is two screens since #6475: a cloud identity step, then a
// model-source radio group gated behind Continue. Both have to be walked
// before the Local CLI setup panel this suite asserts on ever mounts.
async function openLocalCliPanel(): Promise<void> {
  const cloudContinue = await screen.findByRole('button', {
    name: 'Continue (signed in)',
  });
  fireEvent.click(cloudContinue);
  fireEvent.click(await screen.findByRole('radio', { name: /Local Agent/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  analyticsMocks.track.mockReset();
  registryMocks.openExternalUrl.mockClear();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
  analyticsMocks.track.mockReset();
  registryMocks.openExternalUrl.mockClear();
});

describe('EntryShell onboarding Local CLI empty state', () => {
  it('renders unavailable-agent install cards (Docs/Install links + diagnostic) when no usable agent is detected', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: true, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;

    renderOnboarding();

    await openLocalCliPanel();

    const localPanel = await waitFor(() => {
      const panel = screen
        .getByText('Local CLI')
        .closest('.onboarding-view__setup-panel');
      if (!(panel instanceof HTMLElement)) throw new Error('local panel not found');
      // Wait until the scan has finished and the empty-state surfaced.
      if (!panel.querySelector('.onboarding-view__empty-slice')) {
        throw new Error('empty slice not rendered yet');
      }
      return panel;
    });

    // The intro sentence is still there...
    expect(localPanel.textContent).toContain('No agents detected yet.');

    // ...but the regression fix adds the unavailable-agent install grid:
    // the card, its Install + Docs links, and the diagnostic message must render.
    const grid = localPanel.querySelector('.agent-grid-unavailable');
    expect(grid).toBeTruthy();

    const installLink = localPanel.querySelector(
      'a[href="https://example.com/install-gemini"]',
    );
    expect(installLink).toBeTruthy();
    expect(installLink?.textContent).toContain('Install');

    const docsLink = localPanel.querySelector(
      'a[href="https://example.com/docs-gemini"]',
    );
    expect(docsLink).toBeTruthy();

    // The per-diagnostic actionable row is present.
    expect(localPanel.textContent).toContain(
      'Gemini CLI was not found on your PATH.',
    );
    expect(
      localPanel.querySelector('[data-reason="not-on-path"]'),
    ).toBeTruthy();
  });

  it('excludes the AMR agent from the onboarding install grid', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: true, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;

    const amr = unavailableCliAgent({
      id: 'amr',
      name: 'Open Design AMR',
      installUrl: 'https://example.com/install-amr',
      docsUrl: 'https://example.com/docs-amr',
    });
    const gemini = unavailableCliAgent();
    renderOnboarding({ agents: [amr, gemini], onRefreshAgents: vi.fn(() => [amr, gemini]) });

    await openLocalCliPanel();
    const localPanel = await waitFor(() => {
      const panel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
      if (!(panel instanceof HTMLElement)) throw new Error('local panel not found');
      if (!panel.querySelector('.agent-grid-unavailable')) {
        throw new Error('grid not rendered yet');
      }
      return panel;
    });

    // A normal unavailable agent renders its install card...
    expect(
      localPanel.querySelector('a[href="https://example.com/install-gemini"]'),
    ).toBeTruthy();
    // ...but AMR is filtered out — onboarding has its own AMR connect flow.
    expect(
      localPanel.querySelector('a[href="https://example.com/install-amr"]'),
    ).toBeNull();
    expect(localPanel.textContent).not.toContain('Open Design AMR');
  });

  it('shows only the empty-state sentence (no grid) when there are no unavailable agents', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: true, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;

    renderOnboarding({ agents: [], onRefreshAgents: vi.fn(() => []) });

    await openLocalCliPanel();
    const localPanel = await waitFor(() => {
      const panel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
      if (!(panel instanceof HTMLElement)) throw new Error('local panel not found');
      if (!panel.querySelector('.onboarding-view__empty-slice')) {
        throw new Error('empty slice not rendered yet');
      }
      return panel;
    });

    expect(localPanel.textContent).toContain('No agents detected yet.');
    expect(localPanel.querySelector('.agent-grid-unavailable')).toBeNull();
  });

  it('routes the card-footer Install link through openExternalUrl', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ loggedIn: true, profile: 'prod', user: null, configPath: '/x' }),
    ) as typeof fetch;

    // Onboarding runs inside the packaged app, where letting the anchor
    // navigate would replace the app's own window. The card footer's Install
    // link must hand off to openExternalUrl instead — the affordance this
    // whole empty state exists to provide.
    const gemini = unavailableCliAgent({
      diagnostics: [
        {
          reason: 'not-on-path',
          severity: 'error',
          message: 'Gemini CLI was not found on your PATH.',
          fixActions: [{ kind: 'openInstall' }],
        },
      ],
    });
    renderOnboarding({ agents: [gemini], onRefreshAgents: vi.fn(() => [gemini]) });

    await openLocalCliPanel();
    const localPanel = await waitFor(() => {
      const panel = screen.getByText('Local CLI').closest('.onboarding-view__setup-panel');
      if (!(panel instanceof HTMLElement)) throw new Error('local panel not found');
      if (!panel.querySelector('.agent-card-footer .agent-card-link--ghost')) {
        throw new Error('install link not rendered yet');
      }
      return panel;
    });

    // The diagnostic itself is message-only in this layout; every action lives
    // in the footer bar.
    expect(localPanel.querySelector('[data-reason="not-on-path"] button')).toBeNull();

    const installLink = localPanel.querySelector(
      '.agent-card-footer .agent-card-link--ghost',
    );
    expect(installLink).toBeTruthy();
    fireEvent.click(installLink as HTMLElement);
    expect(registryMocks.openExternalUrl).toHaveBeenCalledWith(
      'https://example.com/install-gemini',
    );
  });
});
