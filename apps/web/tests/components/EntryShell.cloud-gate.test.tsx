// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';

const workspaceState = vi.hoisted(() => ({
  current: {
    context: null,
    loading: false,
    failure: 'reauth-required' as 'reauth-required' | undefined,
  },
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return { ...actual, useWorkspaceContext: () => workspaceState.current };
});

function agent(id: string): AgentInfo {
  return { id, name: id, bin: id, available: true, models: [] } as unknown as AgentInfo;
}

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'claude-code',
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    onboardingCompleted: true,
    ...overrides,
  } as AppConfig;
}

function renderHome(overrides: Partial<React.ComponentProps<typeof EntryShell>> = {}) {
  window.history.replaceState(null, '', '/');
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
    config: config(),
    agents: [agent('claude-code')],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [agent('claude-code')]),
    onCreateProject: vi.fn(),
    onBeginProjectCreation: () => ({ projectId: 'p', rollback: () => undefined }),
    onAmrBalanceGateBlockChange: () => undefined,
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
    onCancelCloudOnboarding: vi.fn(),
    ...overrides,
  };

  function Harness() {
    const [current, setCurrent] = useState(props.config);
    return (
      <I18nProvider initial="en">
        <EntryShell {...props} config={current}
          onConfigPersist={(next) => { props.onConfigPersist(next); setCurrent(next as AppConfig); }} />
      </I18nProvider>
    );
  }
  render(<Harness />);
  return props;
}

describe('EntryShell workspace reauth gate', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    workspaceState.current = { context: null, loading: false, failure: 'reauth-required' };
  });

  it('still routes to onboarding on workspace reauth when the gate is not dismissed', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
    renderHome();
    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
  });

  it('keeps a dismissed user on Home despite workspace reauth', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
    renderHome({ cloudGateDismissed: true });
    await waitFor(() => expect(screen.queryByTestId('home-hero-input')).toBeTruthy());
    expect(window.location.pathname).toBe('/');
  });
});
