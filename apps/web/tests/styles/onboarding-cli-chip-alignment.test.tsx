// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

// The onboarding Local CLI chips inherit `justify-content: center` from the
// global `button` primitive unless `entry-layout.css` opts out, so the cascade
// is only observable with both stylesheets loaded in their app order
// (`index.css` pulls primitives, `home/index.css` pulls entry-layout).
const GLOBAL_STYLESHEETS = [
  '../../src/styles/primitives.css',
  '../../src/styles/home/entry-layout.css',
];

const analyticsMocks = vi.hoisted(() => ({ track: vi.fn() }));

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
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function loadGlobalStyles() {
  for (const relativePath of GLOBAL_STYLESHEETS) {
    const style = document.createElement('style');
    style.setAttribute('data-stylesheet', relativePath);
    style.textContent = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    document.head.appendChild(style);
  }
}

const agents: AgentInfo[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '2.1.131',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: 'codex-cli 0.147.0',
    models: [{ id: 'gpt-5', label: 'GPT-5' }],
  },
];

function baseConfig(): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'claude-code',
    agentModels: { 'claude-code': { model: 'sonnet' } },
    apiProtocol: 'anthropic',
    apiKey: '',
    baseUrl: '',
    model: '',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: false,
  };
}

function renderOnboarding() {
  window.history.replaceState(null, '', '/onboarding');
  const props: React.ComponentProps<typeof EntryShell> = {
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
    agents,
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => agents),
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
  };

  function Harness() {
    const [config, setConfig] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell
          {...props}
          config={config}
          onConfigPersist={(next) => setConfig(next as AppConfig)}
        />
      </I18nProvider>
    );
  }

  render(<Harness />);
}

async function openLocalCliStep() {
  fireEvent.click(
    await screen.findByRole('button', { name: /Continue \(signed in\)/i }),
  );
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Choose your model source' })).toBeTruthy();
  });
  fireEvent.click(screen.getByRole('radio', { name: /Local Agent/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
  expect(await screen.findByText('Local CLI')).toBeTruthy();
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('style[data-stylesheet]').forEach((node) => node.remove());
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  analyticsMocks.track.mockReset();
  window.sessionStorage.clear();
});

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input);
    if (url.endsWith('/api/integrations/vela/status')) {
      return jsonResponse({
        loggedIn: true,
        profile: 'prod',
        configPath: '/x',
        user: { id: 'u', email: 'user@example.com' },
      });
    }
    return jsonResponse({});
  }) as typeof fetch;
});

describe('onboarding Local CLI chip alignment', () => {
  it('starts each detected CLI chip at the card start instead of centering it', async () => {
    loadGlobalStyles();
    renderOnboarding();
    await openLocalCliStep();

    const chips = Array.from(
      document.querySelectorAll<HTMLElement>('.onboarding-view__agent-chip'),
    );
    expect(chips.length).toBeGreaterThan(1);

    for (const chip of chips) {
      // Every chip is a fixed-width grid cell, so a centered flex line makes
      // the icon+name group float by a different amount per card and the
      // column reads ragged.
      expect(getComputedStyle(chip).justifyContent).toBe('flex-start');
    }
  });
});
