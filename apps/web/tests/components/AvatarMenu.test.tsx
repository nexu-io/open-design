// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import type { AgentInfo, AppConfig, ExecMode } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.134.0',
  models: [{ id: 'default', label: 'Default (CLI config)' }],
  reasoningOptions: [
    { id: 'default', label: 'Default' },
    { id: 'high', label: 'High' },
  ],
};

const claudeAgent: AgentInfo = {
  id: 'claude',
  name: 'Claude Code',
  bin: 'claude',
  available: true,
  version: '2.1.131',
  models: [
    { id: 'default', label: 'Default (CLI config)' },
    { id: 'sonnet', label: 'Sonnet (alias)' },
  ],
};

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  model: 'claude-sonnet-4-5',
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: { codex: { model: 'default', reasoning: 'default' } },
  agentCliEnv: {},
};

type ModeChangeHandler = (mode: ExecMode) => void;
type AgentChangeHandler = (id: string) => void;
type AgentModelChangeHandler = (
  id: string,
  choice: { model?: string; reasoning?: string },
) => void;
type VoidHandler = () => void;
type OpenSettingsHandler = (section?: 'execution') => void;

function renderMenu({
  config = baseConfig,
  agents = [codexAgent, claudeAgent],
  daemonLive = true,
  onModeChange = vi.fn<ModeChangeHandler>(),
  onAgentChange = vi.fn<AgentChangeHandler>(),
  onAgentModelChange = vi.fn<AgentModelChangeHandler>(),
  onOpenSettings = vi.fn<OpenSettingsHandler>(),
  onRefreshAgents = vi.fn<VoidHandler>(),
}: {
  config?: AppConfig;
  agents?: AgentInfo[];
  daemonLive?: boolean;
  onModeChange?: ReturnType<typeof vi.fn<ModeChangeHandler>>;
  onAgentChange?: ReturnType<typeof vi.fn<AgentChangeHandler>>;
  onAgentModelChange?: ReturnType<typeof vi.fn<AgentModelChangeHandler>>;
  onOpenSettings?: ReturnType<typeof vi.fn<OpenSettingsHandler>>;
  onRefreshAgents?: ReturnType<typeof vi.fn<VoidHandler>>;
} = {}) {
  render(
    <AvatarMenu
      config={config}
      agents={agents}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onOpenSettings={onOpenSettings}
      onRefreshAgents={onRefreshAgents}
    />,
  );
  return {
    onModeChange,
    onAgentChange,
    onAgentModelChange,
    onOpenSettings,
    onRefreshAgents,
  };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'avatar.title' }));
  return screen.getByRole('dialog', { name: 'avatar.title' });
}

describe('AvatarMenu', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('opens execution settings when Local CLI is selected while the daemon is offline', () => {
    const onOpenSettings = vi.fn();
    renderMenu({
      daemonLive: false,
      onOpenSettings,
    });

    openMenu();
    fireEvent.click(screen.getByRole('button', { name: /avatar.useLocal/i }));

    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('opens execution settings from the popover action', () => {
    const onOpenSettings = vi.fn<OpenSettingsHandler>();
    renderMenu({ onOpenSettings });

    openMenu();
    fireEvent.click(
      screen.getByRole('button', { name: 'inlineSwitcher.openFullSettings' }),
    );

    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('pins Open Design to the top of the CLI picker', async () => {
    const amrAgent: AgentInfo = {
      id: 'amr',
      name: 'Open Design AMR',
      bin: 'vela',
      available: true,
      models: [{ id: 'default', label: 'Default (CLI config)' }],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            profile: 'test',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200 });
    }));

    renderMenu({ agents: [codexAgent, claudeAgent, amrAgent] });
    const menu = openMenu();

    await waitFor(() => {
      expect(screen.getByTestId('avatar-agent-option-amr')).toBeTruthy();
    });
    expect(
      Array.from(menu.querySelectorAll('[data-testid^="avatar-agent-option-"]'))
        .map((row) => row.getAttribute('data-testid')),
    ).toEqual([
      'avatar-agent-option-amr',
      'avatar-agent-option-codex',
      'avatar-agent-option-claude',
    ]);
  });

  it('rescans agents and re-renders newly available CLI entries', async () => {
    function Harness() {
      const [agents, setAgents] = useState<AgentInfo[]>([
        codexAgent,
        { ...claudeAgent, available: false },
      ]);
      return (
        <AvatarMenu
          config={baseConfig}
          agents={agents}
          daemonLive={true}
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
          onRefreshAgents={() => {
            setAgents([codexAgent, claudeAgent]);
          }}
        />
      );
    }

    render(<Harness />);

    openMenu();
    expect(screen.queryByRole('button', { name: /Claude Code/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'avatar.rescan' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Claude Code/i })).toBeTruthy();
    });
  });

  it('routes reasoning selection changes through onAgentModelChange', () => {
    const onAgentModelChange = vi.fn();
    renderMenu({ onAgentModelChange });

    openMenu();
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1]!, { target: { value: 'high' } });

    expect(onAgentModelChange).toHaveBeenCalledWith('codex', {
      reasoning: 'high',
    });
  });

  it('keeps a custom saved model visible when it is not in the declared agent model list', () => {
    renderMenu({
      config: {
        ...baseConfig,
        agentModels: { codex: { model: 'custom-codex-model', reasoning: 'default' } },
      },
    });

    openMenu();
    // The model picker is a SearchableModelSelect: a combobox button whose
    // label shows the active selection, backed by a popover listbox. A custom
    // saved model that isn't in the agent's declared list is injected as an
    // additional option so it stays selectable instead of silently dropping.
    const modelCombobox = screen.getAllByRole('combobox')[0] as HTMLButtonElement;
    expect(modelCombobox.textContent).toContain('custom-codex-model');

    fireEvent.click(modelCombobox);
    const popover = screen.getByTestId('avatar-model-popover');
    expect(
      within(popover).getByRole('option', { name: /custom-codex-model/i }),
    ).toBeTruthy();
  });

  it('renders the signed-in plan/balance and stamps the avatar upgrade link', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            loginInFlight: false,
            profile: 'test',
            user: { id: 'u1', email: 'a@b.c' },
            account: { plan: 'plus', balanceUsd: '247.5087' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        telemetry: { metrics: true },
        installationId: 'od-install-abc',
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
      },
      agents: [
        {
          id: 'amr',
          name: 'Open Design AMR',
          bin: 'vela',
          available: true,
          models: [{ id: 'default', label: 'Default (CLI config)' }],
        },
      ],
    });

    const dialog = openMenu();
    // Plan badge + balance render once the signed-in status resolves.
    expect(await screen.findByText('Plus')).toBeTruthy();
    expect(dialog.textContent).toContain('$247.51');
    const amrRow = screen.getByTestId('avatar-agent-option-amr');
    expect(amrRow.querySelector('.avatar-amr-row__stat-label')?.textContent).toBe(
      'settings.amrBalance',
    );
    expect(amrRow.querySelector('.avatar-amr-row__stat-value')?.textContent).toBe(
      '$247.51',
    );

    expect(screen.queryByRole('link', { name: 'avatar.amrConsole' })).toBeNull();
    const upgrade = screen.getByRole('link', {
      name: 'settings.amrUpgrade',
    }) as HTMLAnchorElement;
    fireEvent.click(upgrade);
    const url = new URL(upgrade.href);
    expect(url.searchParams.get('view')).toBe('plans');
    expect(url.searchParams.get('od_entry_source')).toBe('avatar_amr_upgrade');
    expect(url.searchParams.get('source')).toBe('open_design');
    expect(url.searchParams.get('od_device_id')).toBe('od-install-abc');
  });

  it('omits wallet and upgrade links for non-upgradeable plans', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            loginInFlight: false,
            profile: 'test',
            user: { id: 'u1', email: 'a@b.c' },
            account: { plan: 'max', balanceUsd: '247.5087' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        telemetry: { metrics: true },
        installationId: 'od-install-abc',
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
      },
      agents: [
        {
          id: 'amr',
          name: 'Open Design AMR',
          bin: 'vela',
          available: true,
          models: [{ id: 'default', label: 'Default (CLI config)' }],
        },
      ],
    });

    openMenu();
    expect(await screen.findByText('Max')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'settings.amrUpgrade' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'avatar.amrConsole' })).toBeNull();
  });

  it('falls back to the wallet snapshot when signed-in status has no account balance', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            loginInFlight: false,
            profile: 'test',
            user: { id: 'u1', email: 'a@b.c' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(
          JSON.stringify({
            status: 'available',
            profile: 'test',
            user: { id: 'u1', email: 'a@b.c' },
            balanceUsd: '31.0089',
            updatedAt: '2026-06-29T08:00:00.000Z',
            fetchedAt: '2026-06-29T08:00:01.000Z',
            stale: false,
            source: 'vela_api',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
      },
      agents: [
        {
          id: 'amr',
          name: 'Open Design AMR',
          bin: 'vela',
          available: true,
          models: [{ id: 'default', label: 'Default (CLI config)' }],
        },
      ],
    });

    openMenu();
    expect(await screen.findByText('$31.01')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/vela/wallet', {
      cache: 'no-store',
    });
  });

  it('uses the signed-in status profile for avatar console and upgrade links', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            loginInFlight: false,
            profile: 'test',
            user: { id: 'u1', email: 'a@b.c' },
            account: { plan: 'plus', balanceUsd: '247.5087' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        telemetry: { metrics: true },
        installationId: 'od-install-abc',
      },
      agents: [
        {
          id: 'amr',
          name: 'Open Design AMR',
          bin: 'vela',
          available: true,
          models: [{ id: 'default', label: 'Default (CLI config)' }],
        },
      ],
    });

    openMenu();
    expect(await screen.findByText('Plus')).toBeTruthy();

    expect(screen.queryByRole('link', { name: 'avatar.amrConsole' })).toBeNull();
    const upgrade = screen.getByRole('link', {
      name: 'settings.amrUpgrade',
    }) as HTMLAnchorElement;
    fireEvent.click(upgrade);
    const upgradeUrl = new URL(upgrade.href);
    expect(upgradeUrl.origin).toBe('https://vela.powerformer.net');
    expect(upgradeUrl.searchParams.get('view')).toBe('plans');
  });

  it('clears stale AMR account data before refreshing on reopen', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return new Response(
            JSON.stringify({
              loggedIn: true,
              loginInFlight: false,
              profile: 'test',
              user: { id: 'u1', email: 'old@example.com' },
              account: { plan: 'plus', balanceUsd: '247.51' },
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        throw new Error('status unavailable');
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'test' } },
      },
      agents: [
        {
          id: 'amr',
          name: 'Open Design AMR',
          bin: 'vela',
          available: true,
          models: [{ id: 'default', label: 'Default (CLI config)' }],
        },
      ],
    });

    const trigger = screen.getByRole('button', { name: 'avatar.title' });
    fireEvent.click(trigger);
    expect(await screen.findByText('Plus')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'avatar.title' }).textContent).toContain('$247.51');

    fireEvent.click(trigger);
    fireEvent.click(trigger);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const dialog = screen.getByRole('dialog', { name: 'avatar.title' });
    expect(within(dialog).queryByText('Plus')).toBeNull();
    expect(dialog.textContent).not.toContain('$247.51');
  });
});
