// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkspaceCollabContext } from '@open-design/contracts';

import { AvatarMenu } from '../../src/components/AvatarMenu';
import { providerModelsCacheKey } from '../../src/components/providerModelsCache';
import type { ProjectWorkspaceScopeState } from '../../src/collab/useProjectWorkspaceScope';
import type { AgentInfo, AppConfig, ExecMode } from '../../src/types';

const { openExternalUrlMock } = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn<(url: string) => Promise<boolean>>(),
}));

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/providers/registry', () => ({
  openExternalUrl: openExternalUrlMock,
}));


function personalWorkspaceContext(
  overrides: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-personal',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'personal_byok',
    seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: false },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
    ...overrides,
  } as WorkspaceCollabContext;
}

// A team MEMBER (not owner/admin) — `canManageBilling` folds in role, so this
// is the "cannot act on billing" case the upgrade entry must hide for.
function teamMemberWorkspaceContext(
  overrides: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    ...personalWorkspaceContext(),
    workspaceId: 'ws-team',
    workspaceType: 'team',
    role: 'member',
    teamId: 'team-1',
    teamName: 'OD Feature Team',
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
    ...overrides,
  } as WorkspaceCollabContext;
}

function workspaceContextResponse(context: WorkspaceCollabContext | null) {
  return new Response(JSON.stringify({ context }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function workspaceSnapshot(
  workspaceId: string,
  workspaceMemberId: string,
  planId: string,
  balanceUsd: string,
) {
  return {
    schemaVersion: 1,
    workspaceId,
    workspaceMemberId,
    billingScopeVersion: 2,
    billing: {
      billingState: 'active',
      planId,
    },
    wallet: {
      balanceUsd,
      expiresAt: null,
      updatedAt: '2026-07-27T00:00:00.000Z',
    },
    revisions: {
      billing: 'billing-1',
      wallet: 'wallet-1',
    },
  };
}

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

const deepSeekHarnessAgent: AgentInfo = {
  id: 'deepseek-harness',
  name: 'DeepSeek Harness',
  bin: 'dsh',
  available: true,
  version: '0.1.0-rc.6',
  models: [
    {
      id: 'deepseek/deepseek-v4-flash',
      label: 'DeepSeek-V4-Flash · DeepSeek',
      reasoningOptions: [
        { id: 'off', label: 'Off' },
        { id: 'high', label: 'High', default: true },
        { id: 'max', label: 'Max' },
      ],
    },
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

type EventSourceListener = (event: unknown) => void;
class MockAvatarEventSource {
  static instances: MockAvatarEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Set<EventSourceListener>>();

  constructor(readonly url: string) {
    MockAvatarEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventSourceListener): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  removeEventListener(name: string, listener: EventSourceListener): void {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string, data: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }

  close(): void {}
}

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
  projectWorkspaceScope,
}: {
  config?: AppConfig;
  agents?: AgentInfo[];
  daemonLive?: boolean;
  onModeChange?: ReturnType<typeof vi.fn<ModeChangeHandler>>;
  onAgentChange?: ReturnType<typeof vi.fn<AgentChangeHandler>>;
  onAgentModelChange?: ReturnType<typeof vi.fn<AgentModelChangeHandler>>;
  onOpenSettings?: ReturnType<typeof vi.fn<OpenSettingsHandler>>;
  onRefreshAgents?: ReturnType<typeof vi.fn<VoidHandler>>;
  projectWorkspaceScope?: ProjectWorkspaceScopeState;
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
      projectWorkspaceScope={projectWorkspaceScope}
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
    MockAvatarEventSource.instances = [];
  });

  // The composer popover is a one-decision surface: pick the model for the
  // active agent. Execution mode, which CLI agent runs, PATH rescan, reasoning
  // effort and the BYOK model are configuration, and live in
  // Settings → Execution. Keeping them out is what makes the popover compact.
  it('keeps execution configuration out of the composer popover', () => {
    const onOpenSettings = vi.fn<OpenSettingsHandler>();
    const onRefreshAgents = vi.fn<VoidHandler>();
    renderMenu({ daemonLive: false, onOpenSettings, onRefreshAgents });

    openMenu();

    // The execution console itself is gone from this popover per #5517: no mode
    // switch, no CLI list, no PATH rescan.
    expect(screen.queryByRole('button', { name: /avatar.useLocal/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /avatar.useApi/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'avatar.rescan' })).toBeNull();
    expect(onRefreshAgents).not.toHaveBeenCalled();

    // …but the link OUT to it must stay. #5517 has no such entry, and it also
    // never moved CLI switching out of this popover — we did, so without this
    // the place switching moved TO is unreachable from where it used to be.
    const openSettings = screen.getByTestId('avatar-open-execution-settings');
    expect(openSettings).toBeTruthy();
    fireEvent.click(openSettings);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  // Product decision (2026-07-24): the popover is a model picker only. The
  // OpenDesign account row — plan badge, balance, upgrade/console links —
  // was removed entirely (account/billing surfaces live in the nav rail and
  // Settings), so none of it may render even with a fully signed-in AMR
  // status. This is the guard for that invariant.
  it('never renders the account row, plan badge or balance in the popover', async () => {
    const amrAgent: AgentInfo = {
      id: 'amr',
      name: 'OpenDesign AMR',
      bin: 'vela',
      available: true,
      models: [{ id: 'default', label: 'Default (CLI config)' }],
    };
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

    // baseConfig runs Codex, with AMR installed and available.
    renderMenu({ agents: [codexAgent, claudeAgent, amrAgent] });
    const menu = openMenu();

    // Let the status fetch land so a late render cannot sneak the row back in.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTestId('avatar-agent-option-amr')).toBeNull();
    expect(menu.querySelectorAll('[data-testid^="avatar-agent-option-"]')).toHaveLength(0);
    expect(within(menu).queryByText('Plus')).toBeNull();
    expect(menu.textContent).not.toContain('$247.51');
    expect(screen.queryByRole('link', { name: 'settings.amrUpgrade' })).toBeNull();
  });

  it('changes reasoning effort from the composer popover', () => {
    const { onAgentModelChange } = renderMenu({
      config: {
        ...baseConfig,
        agentId: 'deepseek-harness',
        agentModels: {
          'deepseek-harness': {
            model: 'deepseek/deepseek-v4-flash',
            reasoning: 'high',
          },
        },
      },
      agents: [deepSeekHarnessAgent],
    });

    const menu = openMenu();
    const reasoningSelect = within(menu).getByLabelText(
      'avatar.reasoningLabel',
    );
    expect(reasoningSelect).toHaveValue('high');
    expect(
      within(reasoningSelect).getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Off', 'High', 'Max']);

    fireEvent.change(reasoningSelect, { target: { value: 'max' } });

    expect(onAgentModelChange).toHaveBeenCalledWith('deepseek-harness', {
      reasoning: 'max',
    });
  });

  it('selects a model from the inline list and dismisses the popover', () => {
    const { onAgentModelChange } = renderMenu({
      config: { ...baseConfig, agentId: 'claude' },
      agents: [codexAgent, claudeAgent],
    });

    openMenu();
    const list = screen.getByTestId('avatar-model-list');
    const options = within(list).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual([
      'Default (CLI config)',
      'Sonnet (alias)',
    ]);

    fireEvent.click(options[1]!);

    expect(onAgentModelChange).toHaveBeenCalledWith('claude', { model: 'sonnet' });
    expect(screen.queryByRole('dialog', { name: 'avatar.title' })).toBeNull();
  });

  it('keeps a custom saved model visible when it is not in the declared agent model list', () => {
    renderMenu({
      config: {
        ...baseConfig,
        agentModels: { codex: { model: 'custom-codex-model', reasoning: 'default' } },
      },
    });

    openMenu();
    // The model picker is an always-expanded radio list. A custom saved model
    // that isn't in the agent's declared list is appended as an extra option so
    // it stays visible and checked instead of silently dropping.
    const list = screen.getByTestId('avatar-model-list');
    const custom = within(list).getByRole('radio', { name: /custom-codex-model/i });
    expect(custom.getAttribute('aria-checked')).toBe('true');
  });

  it('fails closed for a locked model when the project scope is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          profile: 'feature-test',
          user: { id: 'u1', email: 'a@b.c' },
          account: { plan: 'plus', balanceUsd: '247.5087' },
          configPath: '/Users/test/.amr/config.json',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/workspace/context') {
        return workspaceContextResponse(personalWorkspaceContext({
          workspaceId: 'workspace-ambient',
        }));
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);
    openExternalUrlMock.mockResolvedValue(true);

    const { onAgentModelChange } = renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'feature-test' } },
      },
      projectWorkspaceScope: {
        loading: false,
        scope: {
          kind: 'unavailable',
          projectId: 'project-a',
          workspaceId: 'workspace-a',
          visibility: 'personal',
          context: null,
        },
      },
      agents: [
        {
          id: 'amr',
          name: 'OpenDesign AMR',
          bin: 'vela',
          available: true,
          models: [
            { id: 'free-model', label: 'Free model', enabled: true },
            { id: 'paid-model', label: 'Paid model', enabled: false },
          ],
        },
      ],
    });

    openMenu();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/integrations/vela/status',
        expect.anything(),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Plus')).toBeNull();
    const list = screen.getByTestId('avatar-model-list');
    const locked = within(list).getByRole('radio', { name: /Paid model/i });
    expect(locked.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(locked);

    expect(onAgentModelChange).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(openExternalUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByText('$247.51')).toBeNull();
    expect(screen.queryByRole('link', {
      name: 'settings.amrUpgrade',
    })).toBeNull();
    expect(screen.queryByRole('button', {
      name: /settings\.amrBalance/,
    })).toBeNull();
  });

  it('does not borrow account money for an unbound project', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === '/api/integrations/vela/status') {
        return new Response(JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          profile: 'feature-test',
          user: { id: 'u1', email: 'a@b.c' },
          account: { plan: 'plus', balanceUsd: '247.5087' },
          configPath: '/Users/test/.amr/config.json',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMenu({
      config: { ...baseConfig, agentId: 'amr' },
      projectWorkspaceScope: {
        loading: false,
        scope: {
          kind: 'unbound',
          projectId: 'project-a',
          workspaceId: null,
          context: null,
        },
      },
      agents: [{
        id: 'amr',
        name: 'OpenDesign AMR',
        bin: 'vela',
        available: true,
        models: [{ id: 'default', label: 'Default (CLI config)' }],
      }],
    });

    openMenu();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/integrations/vela/status',
        expect.anything(),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Plus')).toBeNull();
    expect(screen.queryByText('$247.51')).toBeNull();
    expect(screen.queryByRole('button', {
      name: /settings\.amrBalance/,
    })).toBeNull();
    expect(screen.queryByRole('link', {
      name: 'settings.amrUpgrade',
    })).toBeNull();
  });

  it('lets the user switch the BYOK model from the composer popover', () => {
    // Regression (#6142): in BYOK mode the composer popover collapsed the
    // model area into a read-only box showing the current model, so switching
    // BYOK models from the composer became impossible. The popover is the
    // model picker for the ACTIVE execution mode — in BYOK mode that means a
    // selectable provider-catalogue list writing through onApiModelChange,
    // exactly like the daemon-mode list writes through onAgentModelChange.
    const onApiModelChange = vi.fn<(model: string) => void>();
    render(
      <AvatarMenu
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiProviderBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4o',
        }}
        agents={[codexAgent, claudeAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiModelChange={onApiModelChange}
        providerModelsCache={{
          [providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-test', '')]: [
            { id: 'gpt-4o', label: 'gpt-4o' },
            { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
            { id: 'gpt-5.5', label: 'gpt-5.5' },
          ],
        }}
        onOpenSettings={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    const menu = openMenu();
    // The current model reads as the checked option, not as a dead-end box.
    const current = within(menu).getByRole('radio', { name: 'gpt-4o' });
    expect(current.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(within(menu).getByRole('radio', { name: 'gpt-5.5' }));
    expect(onApiModelChange).toHaveBeenCalledWith('gpt-5.5');
    expect(screen.queryByRole('dialog', { name: 'avatar.title' })).toBeNull();
  });

  it('routes a locked model only when the exact project member can upgrade', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          profile: 'feature-test',
          user: { id: 'u1', email: 'a@b.c' },
          account: { plan: 'max', balanceUsd: '9.12' },
          configPath: '/Users/test/.amr/config.json',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/workspace/billing?scope=workspace&workspaceId=workspace-a') {
        return new Response(JSON.stringify({
          summary: null,
          workspaceBalance: {
            billingScopeVersion: 2,
            workspaceId: 'workspace-a',
            workspaceMemberId: 'member-a',
            balanceUsd: '9.12',
            expiresAt: null,
            updatedAt: '2026-07-27T00:00:00.000Z',
          },
          workspaceSnapshot: workspaceSnapshot(
            'workspace-a',
            'member-a',
            'team_pro',
            '9.12',
          ),
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 202 });
    }));
    openExternalUrlMock.mockResolvedValue(true);
    const projectContext = teamMemberWorkspaceContext({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      role: 'owner',
      permissions: {
        ...teamMemberWorkspaceContext().permissions,
        canManageBilling: true,
      },
    }) as WorkspaceCollabContext & { workspaceType: 'team' };

    const { onAgentModelChange } = renderMenu({
      config: {
        ...baseConfig,
        agentId: 'amr',
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'feature-test' } },
      },
      projectWorkspaceScope: {
        loading: false,
        scope: {
          kind: 'team',
          projectId: 'project-a',
          workspaceId: 'workspace-a',
          visibility: 'personal',
          context: projectContext,
        },
      },
      agents: [{
        id: 'amr',
        name: 'OpenDesign AMR',
        bin: 'vela',
        available: true,
        models: [{ id: 'paid-model', label: 'Paid model', enabled: false }],
      }],
    });

    openMenu();
    // The popover no longer renders an upgrade link (the account row is
    // retired), so synchronize on the routing outcome itself: openAmrUpgrade
    // fails closed until the async account + billing scope land, so retry the
    // locked-model click until the route actually fires.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('radio', { name: /Paid model/i }));
      expect(openExternalUrlMock).toHaveBeenCalled();
    });

    expect(onAgentModelChange).not.toHaveBeenCalled();
    const target = new URL(openExternalUrlMock.mock.calls[0]![0]);
    expect(target.origin + target.pathname).toBe('https://open-design.ai/pricing/');
    expect(target.searchParams.get('workspaceId')).toBeNull();
    expect(target.searchParams.get('billing')).toBeNull();
  });

});
