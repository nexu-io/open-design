// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_STATUS_EVENT,
  AMR_LOGIN_STARTUP_SETTLE_MS,
  AMR_LOGIN_TIMEOUT_MS,
} from '../../src/components/amrLoginPolling';
import { fetchProviderModels } from '../../src/providers/provider-models';
import { providerModelsCacheKey } from '../../src/components/providerModelsCache';
import { resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import type { AgentInfo, AppConfig, ProviderModelOption } from '../../src/types';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const analyticsMocks = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      track: analyticsMocks.track,
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      setConfigureGlobals: vi.fn(),
      setUserId: vi.fn(),
      anonymousId: 'test-anonymous-id',
      sessionId: 'test-session-id',
      newRequestId: () => 'test-request-id',
    }),
  };
});

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

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(),
}));

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

const amrAgent: AgentInfo = {
  id: 'amr',
  name: 'AMR (vela)',
  bin: 'amr',
  available: true,
  version: '1.0.0',
  models: [
    { id: 'default', label: 'Default' },
    { id: 'amr-cloud-latest', label: 'AMR Cloud Latest' },
  ],
};

const codexAgent: AgentInfo = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.133.0-alpha.1',
  models: [{ id: 'default', label: 'Default' }],
};

function renderSwitcher(
  config: Partial<AppConfig> = {},
  agents: AgentInfo[] = [amrAgent],
  providerModelsCache: Record<string, ProviderModelOption[]> = {},
  options: { compact?: boolean } = {},
) {
  const onAgentModelChange = vi.fn();
  const view = render(
    <InlineModelSwitcher
      config={{ ...baseConfig, ...config }}
      agents={agents}
      providerModelsCache={providerModelsCache}
      compact={options.compact}
      daemonLive={true}
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
  return { ...view, onAgentModelChange };
}

// recvqfYKutwWlQ: the AMR upgrade entry point must only render for a caller who
// can actually act on it (`permissions.canManageBilling`), never just a
// caller whose plan tier happens to be upgradeable. Personal workspaces
// resolve `canManageBilling` true because the user is always their own owner
// there (`buildWorkspacePermissions`: `canManageBilling: readable && isOwner`),
// so this fixture doubles as the "personal identity keeps the upgrade entry"
// control case.
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

function workspaceDirectoryResponse(context: WorkspaceCollabContext) {
  return new Response(JSON.stringify(workspaceDirectoryFixture([context])), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function expectVelaLoginWithAttribution(
  fetchMock: ReturnType<typeof vi.fn>,
  sourceDetail: string,
) {
  const loginCall = fetchMock.mock.calls.find(([input, init]) => (
    input.toString() === '/api/integrations/vela/login'
    && (init as RequestInit | undefined)?.method === 'POST'
  ));
  expect(loginCall).toBeDefined();
  const init = loginCall?.[1] as RequestInit | undefined;
  expect(init).toEqual(expect.objectContaining({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: expect.any(String),
  }));
  const body = JSON.parse(String(init?.body)) as {
    attribution?: {
      entryId?: string;
      sourceProduct?: string;
      sourceDetail?: string;
      occurredAt?: string;
    };
  };
  expect(body.attribution).toEqual(expect.objectContaining({
    entryId: expect.stringMatching(/^od-amr-/u),
    sourceProduct: 'open_design',
    sourceDetail,
  }));
  expect(Number.isFinite(Date.parse(body.attribution?.occurredAt ?? ''))).toBe(true);
}

describe('InlineModelSwitcher AMR row', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(fetchProviderModels).mockReset();
    analyticsMocks.track.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    try {
      window.localStorage.clear();
    } catch {
      // jsdom normally exposes localStorage; keep cleanup tolerant.
    }
    resetWorkspaceContextCache();
  });

  it('shows the AMR reminder dot once when another CLI is selected', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
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

    const view = renderSwitcher(
      { agentId: 'codex' },
      [amrAgent, codexAgent],
    );

    expect(screen.getByTestId('inline-model-switcher-amr-reminder')).toBeTruthy();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      within(popover).getByTestId('inline-model-switcher-account-amr-reminder'),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(
      screen.queryByTestId('inline-model-switcher-account-amr-reminder'),
    ).toBeNull();

    view.unmount();
    renderSwitcher({ agentId: 'codex' }, [amrAgent, codexAgent]);
    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
  });

  it('keeps an accessible name on the chip when the icon-only treatment hides its text', () => {
    // Regression: in the icon-only topbar treatment `.inline-switcher__chip-text`
    // is `display: none`, so the visible label is removed from the accessibility
    // tree. The button must still expose a real accessible name (CLI/model state)
    // for screen-reader users, not just an icon plus a `data-tooltip` hint.
    renderSwitcher({}, [amrAgent, codexAgent]);

    const chip = screen.getByRole('button', {
      name: /Open Design/i,
    });
    expect(chip).toBe(screen.getByTestId('inline-model-switcher-chip'));
    expect(chip.getAttribute('aria-label')).toMatch(/·/u);
  });

  it('shows an explicit AMR default choice instead of the concrete catalog fallback', () => {
    renderSwitcher(
      {
        agentId: 'amr',
        agentModels: { amr: { model: 'default', reasoning: 'default' } },
      },
      [
        {
          ...amrAgent,
          models: [
            { id: 'kimi-k2.6', label: 'Kimi K2.6', default: true },
            { id: 'glm-5.1', label: 'GLM 5.1' },
          ],
        },
      ],
    );

    const chip = screen.getByTestId('inline-model-switcher-chip');
    expect(chip.getAttribute('aria-label')).toContain('Open Design');
    expect(chip.getAttribute('aria-label')).toContain('default');
    expect(chip.getAttribute('aria-label')).not.toContain('Kimi K2.6');

    fireEvent.click(chip);
    expect(screen.getByTestId('inline-model-switcher-agent-model')).toHaveTextContent('default');
  });

  it('does not show the AMR reminder dot when AMR is already selected', () => {
    renderSwitcher({}, [amrAgent, codexAgent]);

    expect(screen.queryByTestId('inline-model-switcher-amr-reminder')).toBeNull();
  });

  it('can render the compact home-hero chip variant', () => {
    renderSwitcher({}, [amrAgent, codexAgent], {}, { compact: true });

    expect(screen.getByTestId('inline-model-switcher').className).toContain(
      'inline-switcher--compact',
    );
  });

  it('labels AMR without vela branding and keeps AMR models from AgentInfo.models', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
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

    renderSwitcher();

    expect(screen.getByTestId('inline-model-switcher-chip').textContent).toContain(
      'Open Design',
    );
    expect(screen.getByTestId('inline-model-switcher-chip').textContent).not.toContain('AMR');

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(within(popover).getByTestId('inline-model-switcher-open-settings')).toBeTruthy();
    expect(within(popover).getByRole('button', { name: /settings/i })).toBeTruthy();
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    expect(amrButton.querySelector('.inline-switcher__agent-status-icon')).toBeNull();
    expect(
      amrButton.querySelector('.inline-switcher__account-name')?.textContent,
    ).toBe('Open Design');
    expect(within(popover).queryByText(/AMR \(vela\)/i)).toBeNull();
    expect(within(popover).queryByText(/vela/i)).toBeNull();
    expect(within(popover).queryByText(/Not signed in/i)).toBeNull();

    const modelPicker = within(popover).getByTestId(
      'inline-model-switcher-agent-model',
    );
    expect(modelPicker.textContent).toContain('Default');
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('inline-model-switcher-agent-model-popover');
    expect(optionNames(modelPopover)).toEqual(['Default', 'AMR Cloud Latest']);
  });

  it('persists the live AMR fallback when the saved AMR model is stale', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          loggedIn: true,
          profile: 'default',
          user: null,
          configPath: '/Users/test/.vela/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ));

    const { onAgentModelChange } = renderSwitcher({
      agentModels: { amr: { model: 'gpt-5.4-mini', reasoning: 'default' } },
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const modelPicker = within(popover).getByTestId(
      'inline-model-switcher-agent-model',
    );
    expect(modelPicker.textContent).toContain('Default');
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('inline-model-switcher-agent-model-popover');
    expect(optionNames(modelPopover)).toEqual(['Default', 'AMR Cloud Latest']);
    await waitFor(() => {
      expect(onAgentModelChange).toHaveBeenCalledWith('amr', {
        model: 'default',
        reasoning: 'default',
      });
    });
  });

  it('shows icon-only signed-in status instead of account information in the AMR button', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'default',
            user: {
              id: 'user-1',
              email: 'manual-amr@example.local',
              name: 'Manual AMR Test User',
            },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Signed in$/i,
    });
    expect(within(popover).queryByText(/manual-amr@example\.local/i)).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('shows wallet balance in the Open Design account row when signed-in status has no account summary', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'test',
            user: {
              id: 'user-1',
              email: 'manual-amr@example.local',
              name: 'Manual AMR Test User',
            },
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
            user: { id: 'user-1', email: 'manual-amr@example.local' },
            balanceUsd: '0.1000',
            updatedAt: '2026-06-23T06:05:18.782Z',
            fetchedAt: '2026-06-23T06:05:19.000Z',
            stale: false,
            source: 'daemon_cache',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', {
      name: /^Open Design\s+Signed in$/i,
    });
    await waitFor(() => {
      expect(within(popover).getByText('Allowance')).toBeTruthy();
      expect(within(popover).getByText('$0.10')).toBeTruthy();
    });
  });

  it('uses only the explicit team workspace balance, never the account fallback', async () => {
    const workspaceContext = teamMemberWorkspaceContext();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'test',
            user: {
              id: 'user-1',
              email: 'manual-amr@example.local',
            },
            account: { plan: 'plus', balanceUsd: '247.5087' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/workspace/directory') {
        return workspaceDirectoryResponse(workspaceContext);
      }
      if (url === '/api/workspace/context') {
        return workspaceContextResponse(workspaceContext);
      }
      if (url === '/api/workspace/billing?scope=workspace&workspaceId=ws-team') {
        return new Response(
          JSON.stringify({
            summary: null,
            workspaceBalance: {
              billingScopeVersion: 2,
              workspaceId: 'ws-team',
              workspaceMemberId: 'wm-1',
              balanceUsd: '7.8912',
              expiresAt: null,
              updatedAt: '2026-07-26T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(await within(popover).findByText('$7.89')).toBeTruthy();
    expect(within(popover).queryByText('$247.51')).toBeNull();
  });

  it('prefers fresh signed-in status balance over an older wallet snapshot', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify(
            statusCalls === 1
              ? {
                  loggedIn: true,
                  profile: 'test',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: true,
                  profile: 'test',
                  user: null,
                  account: { plan: 'plus', balanceUsd: '42.0000' },
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(
          JSON.stringify({
            status: 'available',
            profile: 'test',
            user: null,
            balanceUsd: '0.1000',
            updatedAt: '2026-06-23T06:05:18.782Z',
            fetchedAt: '2026-06-23T06:05:19.000Z',
            stale: false,
            source: 'daemon_cache',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    let popover = screen.getByTestId('inline-model-switcher-popover');
    await waitFor(() => {
      expect(within(popover).getByText('$0.10')).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    popover = screen.getByTestId('inline-model-switcher-popover');
    await waitFor(() => {
      expect(within(popover).getByText('$42.00')).toBeTruthy();
    });
    expect(within(popover).queryByText('$0.10')).toBeNull();
  });

  it('routes inline upgrades through the signed-in AMR profile', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const workspaceContext = personalWorkspaceContext();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'test',
            user: { id: 'user-1', email: 'manual-amr@example.local' },
            account: { plan: 'plus', balanceUsd: '42.0000' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      // Personal workspace: `canManageBilling` is always true there, so this
      // is the control case proving the permission gate below does not
      // suppress the upgrade entry for non-team identities.
      if (url === '/api/workspace/directory') {
        return workspaceDirectoryResponse(workspaceContext);
      }
      if (url === '/api/workspace/context') {
        return workspaceContextResponse(workspaceContext);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({
      telemetry: { metrics: true },
      installationId: 'od-install-abc',
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByText('$42.00');
    fireEvent.click(await screen.findByTestId('inline-model-switcher-account-upgrade'));

    const [url, target, features] = openSpy.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.origin).toBe('https://vela.powerformer.net');
    expect(parsed.pathname).toBe('/dashboard');
    // `billing=plan` is B's state-aware upgrade intent, replacing the wallet
    // page's fixed `view=plans` pricing modal.
    expect(parsed.searchParams.get('billing')).toBe('plan');
    expect(parsed.searchParams.get('od_entry_source')).toBe('inline_amr_upgrade');
    expect(parsed.searchParams.get('od_device_id')).toBe('od-install-abc');
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  });

  // recvqfYKutwWlQ: a team member's plan tier can be upgradeable while the
  // member itself cannot act on billing (owner-only) — the upgrade entry must
  // stay hidden for them even with a fully signed-in, upgrade-eligible AMR
  // account.
  it('hides the inline upgrade action for a team member without billing permission', async () => {
    const workspaceContext = teamMemberWorkspaceContext();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'test',
            user: { id: 'user-1', email: 'manual-amr@example.local' },
            account: { plan: 'plus', balanceUsd: '42.0000' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/workspace/directory') {
        return workspaceDirectoryResponse(workspaceContext);
      }
      if (url === '/api/workspace/context') {
        return workspaceContextResponse(workspaceContext);
      }
      if (url === '/api/workspace/billing?scope=workspace&workspaceId=ws-team') {
        return new Response(
          JSON.stringify({
            summary: null,
            workspaceBalance: {
              billingScopeVersion: 2,
              workspaceId: 'ws-team',
              workspaceMemberId: 'wm-1',
              balanceUsd: '7.8912',
              expiresAt: null,
              updatedAt: '2026-07-26T00:00:00.000Z',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({
      telemetry: { metrics: true },
      installationId: 'od-install-abc',
    });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByText('$7.89');
    // Give the workspace-context fetch a beat to settle so a late render
    // cannot sneak the button back in.
    await waitFor(() => expect(fetchMock.mock.calls.some(([i]) =>
      i.toString() === '/api/workspace/context')).toBe(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('inline-model-switcher-account-upgrade')).toBeNull();
  });

  it('filters fetched BYOK provider models in the Home switcher search box', async () => {
    renderSwitcher(
      {
        mode: 'api',
        apiProtocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4.1-mini',
      },
      [amrAgent, codexAgent],
      {
        [providerModelsCacheKey(
          'openai',
          'https://api.openai.com/v1',
          'sk-test',
        )]: [
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
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const modelPicker = screen.getByTestId('inline-model-switcher-api-model');
    fireEvent.click(modelPicker);

    const searchInput = screen.getByTestId(
      'inline-model-switcher-api-model-search',
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: '5.5' } });

    const modelPopover = screen.getByTestId('inline-model-switcher-api-model-popover');
    expect(optionNames(modelPopover)).toEqual(['gpt-4.1-mini', 'gpt-5.5']);
  });

  it('prefers fetched BYOK provider models over only showing the currently selected custom model', async () => {
    renderSwitcher(
      {
        mode: 'api',
        apiProtocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiProviderBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4.1-mini',
      },
      [amrAgent, codexAgent],
      {
        [providerModelsCacheKey(
          'openai',
          'https://api.openai.com/v1',
          'sk-test',
        )]: [
          { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
          { id: 'gpt-4.1', label: 'gpt-4.1' },
          { id: 'gpt-5.5', label: 'gpt-5.5' },
        ],
      },
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const modelPicker = screen.getByTestId('inline-model-switcher-api-model');
    fireEvent.click(modelPicker);
    const modelPopover = screen.getByTestId('inline-model-switcher-api-model-popover');
    expect(optionNames(modelPopover)).toEqual(
      expect.arrayContaining(['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.5']),
    );
    expect(within(modelPopover).getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('warms the shared provider-models cache from the home picker for keyless AIHubMix', async () => {
    // Regression: the home picker only READ the cache, so on a fresh load (no
    // Settings/onboarding fetch yet) the AIHubMix BYOK list fell back to the
    // small static seed list. It must fetch the live catalogue itself. AIHubMix
    // is keyless, so the fetch fires with an empty apiKey.
    const fetchMock = vi.mocked(fetchProviderModels);
    fetchMock.mockResolvedValue({
      ok: true,
      kind: 'success',
      latencyMs: 1,
      models: [
        { id: 'claude-opus-4-8', label: 'claude-opus-4-8' },
        { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash' },
        { id: 'minimax-m3', label: 'minimax-m3' },
      ],
    });
    const onProviderModelsCacheChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'aihubmix',
          baseUrl: 'https://aihubmix.com/v1',
          apiProviderBaseUrl: 'https://aihubmix.com/v1',
          apiKey: '',
          model: 'claude-opus-4-8',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        providerModelsCache={{}}
        onProviderModelsCacheChange={onProviderModelsCacheChange}
        onOpenSettings={vi.fn()}
      />,
    );

    // No fetch until the user opens the switcher panel.
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith({
        protocol: 'aihubmix',
        baseUrl: 'https://aihubmix.com/v1',
        apiKey: '',
      });
      expect(onProviderModelsCacheChange).toHaveBeenCalled();
    });

    // The updater populates the slot under the Settings-shared cache key, so
    // one fetch serves both surfaces.
    const updater = onProviderModelsCacheChange.mock.calls[0]![0] as (
      current: Record<string, ProviderModelOption[]>,
    ) => Record<string, ProviderModelOption[]>;
    const key = providerModelsCacheKey('aihubmix', 'https://aihubmix.com/v1', '', '');
    const next = updater({});
    expect(next[key]?.map((m) => m.id)).toEqual([
      'claude-opus-4-8',
      'gemini-3.5-flash',
      'minimax-m3',
    ]);
  });

  it('does not fetch from the home picker for a keyed protocol with no API key', async () => {
    const fetchMock = vi.mocked(fetchProviderModels);
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiProviderBaseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          model: 'gpt-4.1-mini',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        providerModelsCache={{}}
        onProviderModelsCacheChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists AIHubMix as a BYOK provider chip and marks it active when selected', () => {
    const onApiProtocolChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'aihubmix',
          baseUrl: 'https://aihubmix.com/v1',
          apiProviderBaseUrl: 'https://aihubmix.com/v1',
          apiKey: '',
          model: 'gemini-3.5-flash',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={onApiProtocolChange}
        onApiModelChange={vi.fn()}
        providerModelsCache={{}}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const chip = screen.getByTestId('inline-model-switcher-provider-aihubmix');
    expect(chip.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the panel open and applies the choice when picking a BYOK model from the portaled list', async () => {
    // Regression: the model list renders in a portal on `document.body`, so a
    // mousedown on an option lands OUTSIDE the switcher's `wrapRef`. The panel's
    // outside-click handler used to close the whole panel on that mousedown,
    // unmounting the picker before its click fired — the model never changed.
    const onApiModelChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiProviderBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4.1-mini',
        }}
        agents={[amrAgent, codexAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={onApiModelChange}
        providerModelsCache={{
          [providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-test', '')]: [
            { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
            { id: 'gpt-4.1', label: 'gpt-4.1' },
            { id: 'gpt-5.5', label: 'gpt-5.5' },
          ],
        }}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-api-model'));

    const modelPopover = screen.getByTestId('inline-model-switcher-api-model-popover');
    const option = within(modelPopover).getByRole('option', { name: 'gpt-5.5' });

    // The real browser fires mousedown before the option's click. The panel's
    // document-level mousedown listener must NOT treat this portal click as
    // "outside" and close the switcher.
    fireEvent.mouseDown(option);
    expect(screen.queryByTestId('inline-model-switcher-popover')).not.toBeNull();
    expect(
      screen.queryByTestId('inline-model-switcher-api-model-popover'),
    ).not.toBeNull();

    fireEvent.click(option);
    expect(onApiModelChange).toHaveBeenCalledWith('gpt-5.5');
  });

  it('treats env-backed AMR login as signed in even when no user profile is available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
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

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Signed in$/i,
    });
    expect(within(popover).queryByText(/@/i)).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('renders daemon-reported in-flight login attempts as cancelable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
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

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Signing in/i,
    });
    expect(
      within(popover)
        .getByTestId('inline-model-switcher-account-action')
        .getAttribute('title'),
    ).toBe('Cancel sign-in');
  });

  it('refreshes stale signed-in AMR status before starting login', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify(
            statusCalls === 1
              ? {
                  loggedIn: true,
                  loginInFlight: false,
                  profile: 'default',
                  user: { id: 'user-1', email: 'manual-amr@example.local' },
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  loginInFlight: false,
                  profile: 'default',
                  user: null,
                  configPath: '/Users/test/.amr/config.json',
                },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ pid: 123 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Signed in$/i,
    });
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expectVelaLoginWithAttribution(fetchMock, 'inline_model_switcher_amr_row');
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();
  });

  it('shows daemon startup errors when AMR sign-in fails immediately', async () => {
    const startupError = 'profile "prod" api URL: is not configured';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            profile: 'prod',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: startupError }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    fireEvent.click(amrButton);

    await waitFor(() => {
      expect(
        within(popover).getByRole('radio', {
          name: /^Open Design\s+profile "prod" api URL: is not configured/i,
        }),
      ).toBeTruthy();
    });
    expect(
      within(popover).queryByRole('radio', {
        name: /^Open Design\s+Sign-in failed\./i,
      }),
    ).toBeNull();
    expect(
      popover.querySelector('.inline-switcher__account-status.is-error')
        ?.textContent,
    ).toMatch(/api URL: is not configured/i);
  });

  it('cancels a timed-out AMR sign-in from the inline switcher', async () => {
    const authAttemptId = '11111111-1111-4111-8111-111111111111';
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: loginStarted,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 123, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        loginStarted = false;
        return new Response(JSON.stringify({ canceled: true, pids: [123] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    const amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expectVelaLoginWithAttribution(fetchMock, 'inline_model_switcher_amr_row');
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        AMR_LOGIN_TIMEOUT_MS + AMR_LOGIN_POLL_INTERVAL_MS,
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/login/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ authAttemptId }),
      }),
    );
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Sign-in failed\./i }),
    ).toBeTruthy();
    expect(
      popover.querySelector('.inline-switcher__account-status.is-error'),
    ).toBeTruthy();
    expect(popover.querySelector('.inline-switcher__agent-status-icon.is-error')).toBeNull();
  });

  it('turns the pending AMR row into a cancel action', async () => {
    const authAttemptId = '11111111-1111-4111-8111-111111111111';
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: loginStarted,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 123, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        loginStarted = false;
        return new Response(JSON.stringify({ canceled: true, pids: [123] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    let amrButton = await within(popover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    amrButton = within(popover).getByRole('radio', {
      name: /^Open Design\s+Signing in/i,
    });
    expect(
      within(popover)
        .getByTestId('inline-model-switcher-account-action')
        .getAttribute('title'),
    ).toBe('Cancel sign-in');

    fireEvent.click(amrButton);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/login/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ authAttemptId }),
      }),
    );
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
    ).toBeTruthy();
  });

  it('cancels the canonical attempt when the pre-start status refresh rejects', async () => {
    const canonicalAuthAttemptId = '22222222-2222-4222-8222-222222222222';
    let releaseLogin!: (response: Response) => void;
    const heldLoginResponse = new Promise<Response>((resolve) => {
      releaseLogin = resolve;
    });
    const cancelAttemptIds: string[] = [];
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        if (statusCalls > 1) {
          throw new Error('status unavailable');
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return heldLoginResponse;
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { authAttemptId: string };
        cancelAttemptIds.push(body.authAttemptId);
        return new Response(
          JSON.stringify({
            canceled: body.authAttemptId === canonicalAuthAttemptId,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    vi.useFakeTimers();
    fireEvent.click(
      within(popover).getByTestId('inline-model-switcher-account-action'),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/login',
      expect.objectContaining({ method: 'POST' }),
    );

    fireEvent.click(
      within(popover).getByTestId('inline-model-switcher-account-action'),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelAttemptIds).toHaveLength(1);

    releaseLogin(new Response(
      JSON.stringify({ pid: 123, authAttemptId: canonicalAuthAttemptId }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    ));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelAttemptIds).toEqual([
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      canonicalAuthAttemptId,
    ]);
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
    ).toBeTruthy();
    const statusCallsAfterCanonicalCancel = statusCalls;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCalls).toBe(statusCallsAfterCanonicalCancel);
    expect(
      within(popover).queryByRole('radio', {
        name: /^Open Design\s+Signing in/i,
      }),
    ).toBeNull();
  });

  it('re-reads AMR status on reopen and converges from signed-in back to Sign in when later status is loggedOut', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify(
            statusCalls === 1
              ? {
                  loggedIn: true,
                  profile: 'default',
                  user: { id: 'user-1', email: 'manual-amr@example.local' },
                  configPath: '/Users/test/.amr/config.json',
                }
              : {
                  loggedIn: false,
                  profile: 'default',
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

    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    let popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^Open Design\s+Signed in$/i });

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^Open Design\s+Sign in$/i });
    expect(within(popover).queryByRole('radio', { name: /^Open Design\s+Signed in$/i })).toBeNull();
  });

  it('starts AMR re-login only after the user explicitly clicks the signed-out AMR row', async () => {
    let loginCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
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
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginCalls += 1;
        return new Response(JSON.stringify({ pid: 4242 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const onAgentChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={baseConfig}
        agents={[amrAgent]}
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={onAgentChange}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    await within(popover).findByRole('radio', { name: /^Open Design\s+Sign in$/i });
    expect(loginCalls).toBe(0);

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const reopenedPopover = screen.getByTestId('inline-model-switcher-popover');
    const reopenedAmrButton = await within(reopenedPopover).findByRole('radio', {
      name: /^Open Design\s+Sign in$/i,
    });
    expect(loginCalls).toBe(0);

    fireEvent.click(reopenedAmrButton);
    await waitFor(() => {
      expect(loginCalls).toBe(1);
      expect(onAgentChange).toHaveBeenCalledWith('amr');
    });
  });

  it('offers the BYOK provider catalogue, not the CLI agent catalogue, in the compact home popover', () => {
    // Bug: with BYOK active, the compact home-hero chip correctly showed the
    // BYOK model (e.g. gpt-4o), but opening the popover listed the local CLI
    // agent's models (the Open Design cloud catalogue) instead of the BYOK
    // provider's catalogue. The popover body must always reflect the active
    // execution mode; `compact` only affects layout density.
    const onApiModelChange = vi.fn();
    render(
      <InlineModelSwitcher
        config={{
          ...baseConfig,
          mode: 'api',
          apiProtocol: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiProviderBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test',
          model: 'gpt-4o',
        }}
        agents={[amrAgent, codexAgent]}
        compact
        daemonLive={true}
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={onApiModelChange}
        providerModelsCache={{
          [providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-test', '')]: [
            { id: 'gpt-4o', label: 'gpt-4o' },
            { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
            { id: 'gpt-5.5', label: 'gpt-5.5' },
          ],
        }}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    const popover = screen.getByTestId('inline-model-switcher-popover');

    // The CLI agent's catalogue must not leak into a BYOK popover.
    expect(within(popover).queryByText('AMR Cloud Latest')).toBeNull();

    // The BYOK provider's catalogue is on offer and picking a model writes
    // through the BYOK sink.
    fireEvent.click(within(popover).getByTestId('inline-model-switcher-api-model'));
    const modelPopover = screen.getByTestId(
      'inline-model-switcher-api-model-popover',
    );
    expect(optionNames(modelPopover)).toEqual(
      expect.arrayContaining(['gpt-4o', 'gpt-4o-mini', 'gpt-5.5']),
    );
    fireEvent.click(within(modelPopover).getByRole('option', { name: 'gpt-5.5' }));
    expect(onApiModelChange).toHaveBeenCalledWith('gpt-5.5');
  });

  it('lists fetched BYOK provider models from the shared cache', () => {
    const cacheKey = providerModelsCacheKey(
      'anthropic',
      baseConfig.baseUrl,
      'sk-test',
      '',
    );
    renderSwitcher(
      {
        mode: 'api',
        apiKey: 'sk-test',
        model: 'claude-3-5-haiku-latest',
      },
      [amrAgent],
      {
        [cacheKey]: [
          { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
        ],
      },
    );

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    const select = screen.getByTestId(
      'inline-model-switcher-api-model',
    );
    fireEvent.click(select);
    const modelPopover = screen.getByTestId(
      'inline-model-switcher-api-model-popover',
    );
    expect(
      within(modelPopover).getByRole('option', { name: 'Claude 3.5 Haiku' }),
    ).toBeTruthy();
  });

  it('opens the compact model list after signed-out AMR login when no model is saved', async () => {
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.startsWith('/api/integrations/vela/status')) {
        return new Response(
          JSON.stringify({
            loggedIn: loginStarted,
            loginInFlight: false,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    await waitFor(() => {
      expect(
        within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
          'inline-model-switcher-compact-model-amr-cloud-latest',
        ),
      ).toBeTruthy();
    });
  });

  it('re-evaluates saved-model at AMR sign-in, not at pick time', async () => {
    // Regression (review thread): the pick-time path used to freeze the
    // saved-model decision in `pendingCompactAmrPickRef`. If
    // `config.agentModels.amr` is mutated between pick and sign-in (e.g.
    // another surface clears the saved model), the signed-in handler must
    // re-evaluate at sign-in time with the freshest `config.agentModels` —
    // not use the stale pick-time frozen value.
    const authAttemptId = '77777777-7777-4777-8777-777777777777';
    let loginStarted = false;
    let signedInStatus = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.startsWith('/api/integrations/vela/status')) {
        return new Response(
          JSON.stringify({
            loggedIn: signedInStatus,
            loginInFlight: loginStarted && !signedInStatus,
            authAttemptId,
            profile: 'default',
            user: signedInStatus
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202, headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        // Pick-time decision: with this in place, the old frozen-mode path
        // would close the panel after sign-in. The test asserts the new
        // sign-in-time re-check opens it instead.
        agentModels: { amr: { model: 'amr-cloud-latest' } },
      });
      return (
        <>
          <button
            data-testid="clear-amr-model"
            onClick={() => setConfig((c) => ({ ...c, agentModels: {} }))}
          />
          <InlineModelSwitcher
            config={config}
            agents={[amrAgent, codexAgent]}
            providerModelsCache={{}}
            compact
            daemonLive
            onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
            onAgentChange={(id) =>
              setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
            }
            onAgentModelChange={vi.fn()}
            onApiProtocolChange={vi.fn()}
            onApiModelChange={vi.fn()}
            onOpenSettings={vi.fn()}
          />
        </>
      );
    }

    render(<StatefulCompact />);
    // Pick AMR (signed out) — at pick time `agentModels.amr` is
    // 'amr-cloud-latest', so the old frozen-decision path would freeze
    // `mode: 'close'` here. The test then clears the saved model mid-login
    // and asserts the sign-in handler re-evaluates with the cleared state.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await waitFor(() => {
      expect(loginStarted).toBe(true);
      expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    });

    // Switch to fake timers so we can advance the poll cycle deterministically.
    vi.useFakeTimers();
    // Clear the saved AMR model BEFORE the next poll tick fires. This is
    // the mutation the regression guards against — the new sign-in code
    // must read the latest `config.agentModels`, not the frozen value.
    fireEvent.click(screen.getByTestId('clear-amr-model'));
    await act(async () => {
      await Promise.resolve();
    });

    // Flip the status response to signed-in so the next poll tick takes
    // the `'signed-in'` branch.
    signedInStatus = true;

    // Advance past the poll interval so the polling tick fires with the
    // updated signed-in status and the cleared `agentModels`.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    vi.useRealTimers();

    // The sign-in handler must evaluate the CURRENT (cleared)
    // agentModels. With no saved model, the model panel opens.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
          'inline-model-switcher-compact-model-amr-cloud-latest',
        ),
      ).toBeTruthy();
    });
  });

  it('keeps the compact panel closed after signed-out AMR login when a model is saved', async () => {
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.startsWith('/api/integrations/vela/status')) {
        return new Response(
          JSON.stringify({
            loggedIn: loginStarted,
            loginInFlight: false,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        agentModels: { amr: { model: 'amr-cloud-latest' } },
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    await waitFor(() => {
      expect(loginStarted).toBe(true);
      expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    });
  });

  it('finalizes analytics and wakes AMR surfaces when sign-in completes before the first poll tick', async () => {
    // Regression (review thread): the immediate post-login status refresh can
    // observe signed-in (login faster than the 2s poll interval). That branch
    // used to stop polling and clear UI state without resolving the auth
    // analytics or broadcasting the status change — so `amr_auth_result` was
    // never emitted and App/other AMR surfaces stayed stale.
    const authAttemptId = '55555555-5555-4555-8555-555555555555';
    let loginStarted = false;
    const broadcastReasons: string[] = [];
    const onBroadcast = (event: Event) => {
      const reason = (event as CustomEvent).detail?.reason;
      if (reason) broadcastReasons.push(reason);
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onBroadcast);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            // Signed-in from the first post-login read: the login already
            // completed before any poll tick can fire.
            loggedIn: loginStarted,
            loginInFlight: false,
            authAttemptId,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await waitFor(() => expect(loginStarted).toBe(true), { timeout: 2000 });
    await waitFor(() => {
      const resultCalls = analyticsMocks.track.mock.calls.filter(
        ([event]) => event === 'amr_auth_result',
      );
      expect(resultCalls.length).toBeGreaterThan(0);
      expect(resultCalls[0]?.[1]).toMatchObject({ result: 'success' });
    });
    expect(broadcastReasons).toContain('status-changed');
    await waitFor(() => {
      expect(
        within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
          'inline-model-switcher-compact-model-amr-cloud-latest',
        ),
      ).toBeTruthy();
    });

    window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onBroadcast);
  });

  it('drops the pending AMR handoff when another CLI is picked mid-login', async () => {
    // Regression (review thread): `pendingCompactAmrPickRef` used to survive
    // a non-AMR pick mid-login. When AMR eventually reported signed-in,
    // `resumePendingCompactAmrPick` would reopen the model list (or close
    // the new agent's panel) even though the active agent had moved on.
    // The handoff is now scoped to the originating agent and dropped the
    // moment `config.agentId` leaves 'amr'.
    const authAttemptId = '33333333-3333-4333-8333-333333333333';
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: loginStarted,
            loginInFlight: false,
            authAttemptId,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    // Pick AMR (signed out) — login starts, agent panel closes.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await waitFor(() => {
      expect(loginStarted).toBe(true);
      expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    });

    // Mid-login, switch to Codex (no saved model — finishCompactAgentPick
    // opens the model panel for the new agent). The pending AMR handoff must
    // drop the moment the active agent leaves 'amr'.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));
    expect(
      screen.getByTestId('inline-model-switcher-compact-model-default'),
    ).toBeTruthy();

    // AMR eventually reports signed-in. The chip must stay on Codex's model
    // ('default' for the codex fixture), and the model panel that
    // `finishCompactAgentPick('codex')` just opened must not be force-closed
    // by the resume path — the user explicitly switched agents and that
    // panel state belongs to them now.
    await waitFor(() => {
      expect(
        screen.getByTestId('inline-model-switcher-chip').textContent ?? '',
      ).toContain('default');
    });
    expect(
      screen.getByTestId('inline-model-switcher-compact-model-default'),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('inline-model-switcher-agent-amr'),
    ).toBeNull();
  });

  it('keeps the agent panel open after an AMR account-row sign-in with no pending compact pick', async () => {
    // Regression (review thread): `tryCompleteCompactAmrPick` resumed whenever
    // its closure saw `config.agentId === 'amr' && compact` and never read
    // `pendingCompactAmrPickRef`. A sign-in started from the AMR account row
    // (the agent panel stays open) never sets that ref, so completing login
    // jumped the panel to the saved-model decision — closing it or opening the
    // model list. Only a pick that closed the panel to start login may resume.
    const authAttemptId = '55555555-5555-4555-8555-555555555555';
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: loginStarted,
            loginInFlight: false,
            authAttemptId,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher(
      { agentId: 'amr', agentModels: {} },
      [amrAgent, codexAgent],
      {},
      { compact: true },
    );

    // Open the agent panel and sign in from the AMR account row — NOT by
    // picking the AMR agent (that path sets the pending compact handoff).
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    await waitFor(() => {
      expect(
        screen.getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('inline-model-switcher-account-action'));

    // Login completes. The agent panel must stay open showing the signed-in
    // account row — it must NOT jump to the compact model list.
    await waitFor(() => {
      expect(
        screen.getByRole('radio', { name: /^Open Design\s+Signed in$/i }),
      ).toBeTruthy();
    });
    expect(screen.getByTestId('inline-model-switcher-popover')).toBeTruthy();
    expect(
      screen.queryByTestId('inline-model-switcher-compact-model-amr-cloud-latest'),
    ).toBeNull();
  });

  it('does not reopen any panel when AMR sign-in completes after switching to a CLI with a saved model', async () => {
    // Regression (review thread): a poll tick's finalizer closure retains
    // `config.agentId === 'amr'` from when the poll started. After the user
    // switches to Codex (which has a saved model, so its pick closes the
    // panel), the stale AMR completion used to run `finishCompactAgentPick`
    // anyway and force the model panel open over a closed surface. The
    // pending handoff must be consumed/dropped so a completion for an agent
    // the user left cannot touch the current panel.
    const authAttemptId = '66666666-6666-4666-8666-666666666666';
    let loginStarted = false;
    let signedIn = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: signedIn,
            loginInFlight: loginStarted && !signedIn,
            authAttemptId,
            profile: 'default',
            user: signedIn ? { id: 'user-1', email: 'amr@example.local' } : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: { codex: { model: 'codex-sonnet' } },
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);

    vi.useFakeTimers();
    // Pick AMR (signed out, no saved model) — login starts, panel closes.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(true);
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    // Mid-login switch to Codex (saved model — its pick closes the panel).
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    // AMR reports signed-in; the poll tick finalizes the login. The panel
    // must stay closed — the stale AMR completion must not force it open.
    signedIn = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(screen.queryByTestId('inline-model-switcher-agent-amr')).toBeNull();

    vi.useRealTimers();
  });

  it('opens the compact model list when the saved AMR model id is stale', async () => {
    // Regression (review thread): `hasRecordedAgentModel` treated any non-empty
    // id as a saved choice. An AMR id the live catalog no longer contains is
    // normalized back to the CLI default, so the compact list has no row for it
    // — but the old helper still closed the panel and ran on Default.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: true,
            profile: 'default',
            user: { id: 'user-1', email: 'amr@example.local' },
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        agentModels: { amr: { model: 'gpt-5.4-mini' } },
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    await waitFor(() => {
      expect(
        within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
          'inline-model-switcher-compact-model-amr-cloud-latest',
        ),
      ).toBeTruthy();
    });
  });

  it('polls after a login-started broadcast whose startup status is neither signed-in nor in-flight', async () => {
    // Regression (review thread): the `login-started` broadcast started a poll
    // only when the follow-up status reported `loginInFlight: true`. The AMR
    // contract explicitly allows `loginInFlight: false` during the startup
    // settle window — if the surface that started the login unmounted, this
    // mounted switcher would never observe the eventual signed-in state. The
    // event path must start an idempotent poll when none is running and the
    // login is still being awaited.
    let loginStarted = false;
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCalls += 1;
        return new Response(
          JSON.stringify({
            loggedIn: loginStarted,
            loginInFlight: false,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 4242 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    // A separate surface starts login and broadcasts it (Settings closing is
    // the reviewer's example). The switcher sees `login-started`, its follow-up
    // status refresh reports startup-false, and it must start its own poll.
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    // Flush the event handler's follow-up status refresh. The status is
    // startup-false and a poll must have started (the poll tick below then
    // performs an additional status refresh).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loginStarted).toBe(false);
    expect(statusCalls).toBe(1);

    // The status flips to signed-in; the poll tick must observe it.
    loginStarted = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCalls).toBeGreaterThanOrEqual(2);

    // Back to real timers so the wait helpers can poll the DOM, then confirm
    // the observed signed-in state actually reached the rendered account row.
    vi.useRealTimers();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      await within(popover).findByRole('radio', {
        name: /^Open Design\s+Signed in$/i,
      }),
    ).toBeTruthy();
  });

  it('still polls when a login-started broadcast sees a transient status null', async () => {
    // Regression (review thread): the previous idempotent fallback was gated
    // by `next && ...`, but `fetchVelaLoginStatus` returns null on HTTP or
    // network errors. A null follow-up status during the login-started
    // window must still start the fallback poll — otherwise the switcher
    // stays in "Signing in" forever after the originating surface unmounts.
    let loginStarted = false;
    let transientFail = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        if (transientFail) {
          return new Response(null, { status: 503 });
        }
        return new Response(
          JSON.stringify({
            loggedIn: loginStarted,
            loginInFlight: false,
            profile: 'default',
            user: loginStarted
              ? { id: 'user-1', email: 'amr@example.local' }
              : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 4242 }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher();

    // A separate surface starts login and broadcasts; the switcher's follow-up
    // status read resolves null (transient failure). The fallback must still
    // start a poll.
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loginStarted).toBe(false);

    // The transient failure clears; the very next poll tick reads a clean
    // status. Flip the status to signed-in and the poll must converge.
    transientFail = false;
    loginStarted = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });

    vi.useRealTimers();
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));
    const popover = screen.getByTestId('inline-model-switcher-popover');
    expect(
      await within(popover).findByRole('radio', {
        name: /^Open Design\s+Signed in$/i,
      }),
    ).toBeTruthy();
  });

  it('ignores a stale poll tick after the poll restarts for a newer AMR attempt', async () => {
    // Regression (review thread): `stopAmrPolling()` clears the interval but
    // cannot cancel a `tick()` whose `refreshAmrStatus()` is already awaiting.
    // An older attempt A's in-flight tick could resolve as signed-in after a
    // restart (attempt B), then stop B's interval, clear B's login
    // bookkeeping, and resume B's compact handoff. The poll-generation guard
    // must turn that stale tick into a no-op.
    const authAttemptA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const authAttemptB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let statusCall = 0;
    let releaseStaleTick!: (response: Response) => void;
    const staleTickResponse = new Promise<Response>((resolve) => {
      releaseStaleTick = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Call 2 is attempt A's first poll tick; hold it in-flight while the
        // poll is restarted for attempt B below.
        if (statusCall === 2) {
          return staleTickResponse;
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: statusCall === 1 ? authAttemptA : authAttemptB,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // A separate surface starts an AMR login and broadcasts it; the follow-up
    // status reports in-flight, so this switcher starts poll A.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Poll A's first tick fires and suspends on the held status response.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBe(2);

    // Restart for attempt B: another login-started broadcast, another
    // in-flight status, so poll B replaces poll A. The generation guard must
    // invalidate poll A's suspended tick.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Poll A's stale tick now resolves as signed-in. With the guard it must
    // act on nothing — no panel change, no interval kill, no finalization.
    await act(async () => {
      releaseStaleTick(new Response(
        JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          authAttemptId: authAttemptA,
          profile: 'default',
          user: { id: 'user-1', email: 'amr@example.local' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // The stale tick must not consume the newer attempt's handoff: the
    // compact panel stays closed (no saved model — a live resume would open
    // the model list) and no success analytics are emitted.
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(
      analyticsMocks.track.mock.calls.filter(
        ([event]) => event === 'amr_auth_result',
      ),
    ).toHaveLength(0);

    // Poll B must still be alive: advancing another interval fires its tick
    // and issues another status request. A stale tick calling stopAmrPolling()
    // would have killed B's interval.
    const callsBeforeB = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBeGreaterThan(callsBeforeB);

    vi.useRealTimers();
  });

  it('ignores a stale login-status continuation for a superseded AMR attempt', async () => {
    // Regression (review thread): the `login-started` broadcast's follow-up
    // status continuation has the same exposure as a stale poll tick — it is
    // not covered by the poll-generation guard. An older attempt A's
    // continuation can resolve as signed-in after a restart (attempt B) and
    // then finalize B's login: stopping B's poll, broadcasting a status
    // change, and resuming the compact handoff for the wrong attempt.
    const authAttemptA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const authAttemptB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    let statusCall = 0;
    let releaseStaleContinuation!: (response: Response) => void;
    const staleContinuationResponse = new Promise<Response>((resolve) => {
      releaseStaleContinuation = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Call 1 is attempt A's follow-up continuation; hold it in-flight
        // while the login is restarted for attempt B below.
        if (statusCall === 1) {
          return staleContinuationResponse;
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: statusCall === 2 ? authAttemptB : authAttemptA,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/wallet') {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // Attempt A starts on another surface and broadcasts; its follow-up
    // status read suspends on the held response.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    // Restart for attempt B: another login-started broadcast. B's follow-up
    // reports in-flight, so poll B replaces poll A.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // A's stale continuation now resolves as signed-in. It must not finalize
    // B's login: no panel change, no success analytics, no interval kill.
    await act(async () => {
      releaseStaleContinuation(new Response(
        JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          authAttemptId: authAttemptA,
          profile: 'default',
          user: { id: 'user-1', email: 'amr@example.local' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(
      analyticsMocks.track.mock.calls.filter(
        ([event]) => event === 'amr_auth_result',
      ),
    ).toHaveLength(0);

    // Poll B must still be alive: advancing another interval fires its tick
    // and issues another status request.
    const callsBeforeB = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBeGreaterThan(callsBeforeB);

    vi.useRealTimers();
  });

  it('does not commit a stale poll tick status for a superseded AMR attempt', async () => {
    // Regression (review thread): the poll-generation guard ran AFTER
    // `refreshAmrStatus()` had already committed analytics and status. A stale
    // tick from attempt A resolving as signed-in after polling restarted for B
    // used to render A's signed-in state. The guard must reject the response
    // BEFORE any commit: the AMR account row has to keep showing B's
    // "Signing in…" state, never A's "Signed in".
    const authAttemptA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const authAttemptB = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    let statusCall = 0;
    let releaseStaleTick!: (response: Response) => void;
    const staleTickResponse = new Promise<Response>((resolve) => {
      releaseStaleTick = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Call 1: panel-open passive read (baseline signed-out).
        if (statusCall === 1) {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: false,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Call 3 is attempt A's first poll tick; hold it in-flight while the
        // poll is restarted for attempt B below.
        if (statusCall === 3) {
          return staleTickResponse;
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: statusCall === 2 ? authAttemptA : authAttemptB,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // Keep the agent panel open so the AMR account row renders live login
    // state; opening the panel issues the passive status read (call 1).
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
    ).toBeTruthy();

    // Attempt A starts on another surface and broadcasts; its follow-up
    // reports in-flight, so poll A starts (call 2).
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // A's first poll tick fires and suspends on the held status (call 3).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBe(3);
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();

    // Restart for attempt B: another login-started broadcast, in-flight
    // status (call 4), so poll B replaces poll A.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Poll A's stale tick now resolves as signed-in. Its status must be
    // rejected BEFORE commit: the account row stays on B's "Signing in…".
    await act(async () => {
      releaseStaleTick(new Response(
        JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          authAttemptId: authAttemptA,
          profile: 'default',
          user: { id: 'user-1', email: 'amr@example.local' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('radio', { name: /^Open Design\s+Signed in$/i }),
    ).toBeNull();

    vi.useRealTimers();
  });

  it('does not commit a stale login-status continuation status for a superseded AMR attempt', async () => {
    // Regression (review thread): the `login-started` follow-up continuation
    // had the same exposure as a stale poll tick — `refreshAmrStatus()` ran
    // its analytics/status commits before the caller's attempt check. A
    // stale continuation from attempt A resolving as signed-in after attempt
    // B took over must not render A's signed-in state.
    const authAttemptA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const authAttemptB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    let statusCall = 0;
    let releaseStaleContinuation!: (response: Response) => void;
    const staleContinuationResponse = new Promise<Response>((resolve) => {
      releaseStaleContinuation = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Call 1: panel-open passive read (baseline signed-out).
        if (statusCall === 1) {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: false,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Call 2 is attempt A's follow-up continuation; hold it in-flight
        // while the login is restarted for attempt B below.
        if (statusCall === 2) {
          return staleContinuationResponse;
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: statusCall === 3 ? authAttemptB : authAttemptA,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // Keep the agent panel open so the AMR account row renders live login
    // state (call 1 = passive panel-open read).
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
    ).toBeTruthy();

    // Attempt A starts on another surface and broadcasts; its follow-up
    // status read suspends on the held response (call 2).
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    // Attempt B restarts the login; its follow-up reports in-flight, so poll
    // B starts (call 3) and supersedes A's suspended continuation.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCall).toBe(3);
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();

    // A's stale continuation now resolves as signed-in. Its status must be
    // rejected BEFORE commit: the account row stays on B's "Signing in…".
    await act(async () => {
      releaseStaleContinuation(new Response(
        JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          authAttemptId: authAttemptA,
          profile: 'default',
          user: { id: 'user-1', email: 'amr@example.local' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('radio', { name: /^Open Design\s+Signed in$/i }),
    ).toBeNull();

    vi.useRealTimers();
  });

  it('does not commit a superseded handleAmrSignIn immediate status read', async () => {
    // Regression (review thread): `handleAmrSignIn`'s immediate post-spawn
    // status read had no generation check of its own — only the poll tick
    // did, and only after `refreshAmrStatus()` had already committed. If a
    // newer attempt B supersedes A while A's immediate read is in flight, A's
    // signed-in payload must not be committed as the current status.
    const authAttemptA = '11111111-1111-4111-8111-111111111111';
    const authAttemptB = '22222222-2222-4222-8222-222222222222';
    let loginStarted = false;
    let statusCall = 0;
    let releaseImmediate!: (response: Response) => void;
    const immediateResponse = new Promise<Response>((resolve) => {
      releaseImmediate = resolve;
    });
    const panelOpenResponse = new Promise<Response>(() => {
      // Held forever: the reopen read must not overwrite whatever the
      // superseded immediate read committed before we assert.
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Calls 1-2: panel-open passive read + handleAgentButtonClick's
        // pre-login read (both baseline signed-out).
        if (statusCall <= 2) {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: false,
              authAttemptId: authAttemptA,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Call 3: the login-started event continuation this component fires
        // from its own `notifyAmrLoginStatusChanged('login-started')` right
        // after the spawn succeeds — it reports A in-flight and starts poll A.
        if (statusCall === 3) {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: true,
              authAttemptId: authAttemptA,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Call 4: handleAmrSignIn's immediate post-spawn read; hold it while
        // attempt B supersedes A.
        if (statusCall === 4) {
          return immediateResponse;
        }
        // Call 5: attempt B's login-started follow-up (in-flight → poll B).
        if (statusCall === 5) {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: true,
              authAttemptId: authAttemptB,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Everything after (e.g. the reopen panel-open read) is held so the
        // superseded status can be observed without a masking write.
        return panelOpenResponse;
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId: authAttemptA }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher(
      { agentId: 'amr', agentModels: {} },
      [amrAgent],
      {},
      { compact: true },
    );

    vi.useFakeTimers();
    // Open the agent panel (call 1), then pick AMR to start login (call 2).
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(true);
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    // The immediate post-spawn read (call 4) is now in flight.
    expect(statusCall).toBe(4);

    // Attempt B supersedes A from another surface while A's immediate read is
    // still in flight; poll B starts (call 5).
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCall).toBe(5);

    // A's immediate read resolves as signed-in; it must not commit.
    await act(async () => {
      releaseImmediate(new Response(
        JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          authAttemptId: authAttemptA,
          profile: 'default',
          user: { id: 'user-1', email: 'amr@example.local' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Reopen the agent panel: its passive read (call 6) is held, so the row
    // reflects whatever the superseded immediate read committed — which must
    // be B's "Signing in…", never A's "Signed in".
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(statusCall).toBeGreaterThanOrEqual(5);
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('radio', { name: /^Open Design\s+Signed in$/i }),
    ).toBeNull();

    vi.useRealTimers();
  });

  it('keeps the AMR attempt alive when a cancel is not confirmed and the follow-up status is transient', async () => {
    // Regression (review thread): `handleAmrCancelLogin` calls
    // `stopAmrPolling()` up front, and its `canceled !== true` branch only
    // restarted polling when the follow-up status read returned
    // `loginInFlight: true`. A transient null (or a startup-window
    // `loginInFlight: false`) left `amrLoginPending` active with no interval,
    // so a later signed-in was never observed and the chip stayed "Signing
    // in" forever. The attempt must stay alive until the daemon confirms it
    // settled.
    const authAttemptId = '88888888-8888-4888-8888-888888888888';
    let loginStarted = false;
    let statusMode: 'in-flight' | 'null' | 'signed-in' = 'in-flight';
    let statusCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        if (statusMode === 'null') {
          return new Response(null, { status: 503 });
        }
        return new Response(
          JSON.stringify({
            loggedIn: statusMode === 'signed-in',
            loginInFlight: statusMode === 'in-flight',
            authAttemptId,
            profile: 'default',
            user:
              statusMode === 'signed-in'
                ? { id: 'user-1', email: 'amr@example.local' }
                : null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url === '/api/integrations/vela/login/cancel' &&
        init?.method === 'POST'
      ) {
        // The daemon does not confirm the cancel (login already settled or
        // not cancelable) — the branch under test.
        return new Response(JSON.stringify({ canceled: false, pids: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const t4Agents = [amrAgent];
    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={t4Agents}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);

    vi.useFakeTimers();
    // Pick AMR (signed out, no saved model) — login starts, panel closes.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(true);
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    // Cancel while pending: the daemon does not confirm (`canceled: false`)
    // and the follow-up status read fails transiently (503 → null). The
    // attempt must stay alive — polling restarts and keeps issuing reads.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    statusMode = 'null';
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsBeforeRestart = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    // A restarted poll tick issued another status request (null stays
    // pending). Without the restart the chip would be stuck "Signing in".
    expect(statusCall).toBeGreaterThan(callsBeforeRestart);

    // The transient failure clears and the login settles signed-in; the kept
    // poll must observe it and finalize (success analytics + status change).
    statusMode = 'signed-in';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    const resultCalls = analyticsMocks.track.mock.calls.filter(
      ([event]) => event === 'amr_auth_result',
    );
    expect(resultCalls.length).toBeGreaterThan(0);
    expect(resultCalls[0]?.[1]).toMatchObject({ result: 'success' });

    vi.useRealTimers();
  });

  it('keeps the compact model panel open and dismissable while an AMR error is showing', async () => {
    // Regression (review thread): the `amrLoginError` effect depended on
    // `panel` and re-asserted `setPanel('agent')` whenever the panel was
    // anything else. With an error set, opening the model segment, pressing
    // Escape, or clicking outside immediately reopened the agent panel, so
    // the model list was unreachable and the error could not be dismissed.
    // The reopen must fire only on the no-error → new-error transition.
    const startupError = 'profile "prod" api URL: is not configured';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            profile: 'prod',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: startupError }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.startsWith('/api/integrations/vela/wallet')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    // Pick AMR — the spawn fails and the error effect reopens the agent panel.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await waitFor(() => {
      expect(
        screen.getByTestId('inline-model-switcher-popover').querySelector(
          '.inline-switcher__account-status.is-error',
        ),
      ).toBeTruthy();
    });

    // With an error showing, the user can still open the compact model list —
    // the error effect must not yank it back to the agent panel.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-model'));
    expect(
      within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
        'inline-model-switcher-compact-model-amr-cloud-latest',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('inline-model-switcher-popover')).queryByTestId(
        'inline-model-switcher-account-action',
      ),
    ).toBeNull();

    // Escape closes the panel and the error effect leaves it closed.
    fireEvent.keyDown(screen.getByTestId('inline-model-switcher'), {
      key: 'Escape',
    });
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
  });

  it('does not commit a stale panel-open passive read for a superseded AMR attempt', async () => {
    // Regression (review thread): the open/agents passive read ran
    // `refreshAmrStatus()` without a guard. A response started before a newer
    // attempt took over could resolve afterward and still commit
    // `setAmrStatus` + the `next.loggedIn` bookkeeping (the `pendingStartup`
    // check only guards one clear path), rendering the newer attempt
    // signed-in. The passive read must reject a stale response before
    // committing, exactly like the poll/event/immediate reads.
    const authAttemptA = 'aaaa1111-1111-4111-8111-111111111111';
    const authAttemptB = 'bbbb2222-2222-4222-8222-222222222222';
    let statusCall = 0;
    let releasePassiveRead!: (response: Response) => void;
    const passiveReadResponse = new Promise<Response>((resolve) => {
      releasePassiveRead = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Call 1 is the panel-open passive read; hold it while attempt B
        // takes over.
        if (statusCall === 1) {
          return passiveReadResponse;
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: authAttemptB,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // Open the agent panel: the passive read (call 1) suspends.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(statusCall).toBe(1);

    // Attempt B starts on another surface and broadcasts; its follow-up
    // reports in-flight, so poll B replaces the unguarded read's world.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The stale passive read now resolves as attempt A signed-in. It must
    // not commit: the account row stays on B's "Signing in…", never A's
    // "Signed in".
    await act(async () => {
      releasePassiveRead(new Response(
        JSON.stringify({
          loggedIn: true,
          loginInFlight: false,
          authAttemptId: authAttemptA,
          profile: 'default',
          user: { id: 'user-1', email: 'amr@example.local' },
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('radio', { name: /^Open Design\s+Signed in$/i }),
    ).toBeNull();

    vi.useRealTimers();
  });

  it('adopts an in-flight AMR attempt when the panel opens and no poll is running', async () => {
    // Regression (review thread): the passive open read saw `loginInFlight:
    // true` but never adopted the server attempt id or started a poll, so
    // the compact cancel/retry UI had no cancellable attempt. Opening the
    // panel after a login started elsewhere must claim the attempt and poll.
    const authAttemptId = 'cccc3333-3333-4333-8333-333333333333';
    let statusCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // No broadcast reaches this component (the login started before it was
    // mounted, or on another surface). Opening the panel reads an in-flight
    // attempt and must adopt it: a poll starts (statusCall grows on the
    // interval) and the row shows "Signing in…".
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(statusCall).toBe(1);
    const callsAfterOpen = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBeGreaterThan(callsAfterOpen);
    expect(
      screen.getByRole('radio', { name: /^Open Design\s+Signing in/i }),
    ).toBeTruthy();

    vi.useRealTimers();
  });

  it('does not let a timed-out attempt cancel a newer AMR login', async () => {
    // Regression (review thread): the poll tick's timed-out branch broadcast
    // `login-canceled` from its `cancelVelaLogin` continuation with no
    // attempt/generation ownership check. A delayed cancel response from
    // attempt A could synchronously stop attempt B's poll and clear its
    // pending state in the event handler. The broadcast must be dropped once
    // A no longer owns the login.
    let statusCall = 0;
    let releaseTimeoutCancel!: (response: Response) => void;
    const timeoutCancelResponse = new Promise<Response>((resolve) => {
      releaseTimeoutCancel = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: 'eeee5555-5555-4555-8555-555555555555',
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        return timeoutCancelResponse;
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // Attempt A starts on another surface and broadcasts; its follow-up
    // reports in-flight, so poll A starts.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // A times out; the tick's terminal branch issues the cancel (held) and
    // sets the error, which reopens the agent panel (passive read fires and
    // adopts the in-flight attempt).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The user starts attempt B; its follow-up reports in-flight, so poll B
    // replaces A.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Resolve A's delayed cancel as confirmed. It must NOT broadcast
    // login-canceled (the event handler would stop B's poll synchronously).
    await act(async () => {
      releaseTimeoutCancel(
        new Response(JSON.stringify({ canceled: true, pids: [1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Poll B must still be alive: advancing another interval issues another
    // status request.
    const callsAfterB = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBeGreaterThan(callsAfterB);

    vi.useRealTimers();
  });

  it('drops an AMR pick continuation when the parent switches agents while the status read is held', async () => {
    // Regression (review thread): the pick token only advances on another
    // click, so a prop-driven `config.agentId` change (another surface)
    // during the awaited pre-login status read did not invalidate the
    // continuation — it recreated the AMR pending handoff, closed the panel,
    // and started an AMR login for an agent the user had left.
    const authAttemptId = 'ffff6666-6666-4666-8666-666666666666';
    let loginStarted = false;
    let statusCall = 0;
    let releasePreLogin!: (response: Response) => void;
    const preLoginResponse = new Promise<Response>((resolve) => {
      releasePreLogin = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Call 2 is the AMR pick's pre-login read; hold it while the parent
        // switches agents.
        if (statusCall === 2) {
          return preLoginResponse;
        }
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const t3Agents = [amrAgent, codexAgent];
    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: {},
      });
      return (
        <>
          <button
            type="button"
            data-testid="switch-to-codex"
            onClick={() =>
              setConfig((c) => ({ ...c, agentId: 'codex', mode: 'daemon' }))
            }
          >
            switch
          </button>
          <InlineModelSwitcher
            config={config}
            agents={t3Agents}
            providerModelsCache={{}}
            compact
            daemonLive
            onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
            onAgentChange={(id) =>
              setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
            }
            onAgentModelChange={vi.fn()}
            onApiProtocolChange={vi.fn()}
            onApiModelChange={vi.fn()}
            onOpenSettings={vi.fn()}
          />
        </>
      );
    }

    render(<StatefulCompact />);

    vi.useFakeTimers();
    // Open the agent panel (passive read, call 1) and pick AMR — its
    // pre-login status read (call 2) suspends.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(statusCall).toBe(2);

    // The parent switches the active agent to Codex while the read is held.
    fireEvent.click(screen.getByTestId('switch-to-codex'));

    // The stale continuation resolves signed-out; it must not write the AMR
    // pending handoff, close the panel, or start an AMR login.
    await act(async () => {
      releasePreLogin(new Response(
        JSON.stringify({
          loggedIn: false,
          loginInFlight: false,
          authAttemptId,
          profile: 'default',
          user: null,
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(false);
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeTruthy();

    vi.useRealTimers();
  });

  it('preserves a cancel issued while the login spawn is in flight even when the provisional cancel fails', async () => {
    // Regression (review thread): `handleAmrCancelLogin` cleared the compact
    // handoff before the cancel outcome and, when `cancelVelaLogin` returned
    // `ok: false` during login startup, returned without recording the
    // cancel intent — the spawn continuation then proceeded into
    // login-started/polling and the user's cancel was forgotten.
    const authAttemptId = 'aaaa7777-7777-4777-8777-777777777777';
    let loginStarted = false;
    let statusCall = 0;
    let cancelCalls = 0;
    let releaseLoginStart!: (response: Response) => void;
    const loginStartResponse = new Promise<Response>((resolve) => {
      releaseLoginStart = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: loginStarted,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return loginStartResponse;
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        cancelCalls += 1;
        if (cancelCalls === 1) {
          // The provisional attempt cannot be cancelled yet (spawn pending):
          // `cancelVelaLogin` maps a non-2xx response to `ok: false`.
          return new Response(JSON.stringify({ canceled: false }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ canceled: true, pids: [1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);

    vi.useFakeTimers();
    // Open the agent panel and pick AMR — the spawn POST is held in flight.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(true);
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    // Cancel while the spawn is pending; the provisional cancel fails
    // (`ok: false`). The intent must be preserved and the spawn continuation
    // must issue the canonical cancel once the start resolves.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelCalls).toBe(1);

    // The spawn resolves ok; the preserved intent must trigger the canonical
    // cancel instead of proceeding into login-started/polling.
    await act(async () => {
      releaseLoginStart(
        new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelCalls).toBe(2);

    // No poll was started for the (cancelled) login: advancing an interval
    // issues no new status request.
    const callsAfterCancel = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBe(callsAfterCancel);

    vi.useRealTimers();
  });

  it('does not let a superseded spawn continuation steal an adopted AMR attempt', async () => {
    // Regression (audit #5): while `startVelaLogin` was in flight, the
    // login-started event path could adopt a different attempt (another
    // surface's login). The spawn continuation then unconditionally
    // overwrote the attempt ref, broadcast login-started, and restarted the
    // poll — stealing ownership from the newer attempt. The continuation may
    // only take over when the daemon confirms it joined that same attempt.
    const authAttemptA = '99990000-0000-4000-8000-000000000000';
    const authAttemptB = '88887777-7777-4777-8777-777777777777';
    let loginStarted = false;
    let statusCall = 0;
    let loginStartedBroadcasts = 0;
    let releaseLoginStart!: (response: Response) => void;
    const loginStartResponse = new Promise<Response>((resolve) => {
      releaseLoginStart = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        // Calls 1-2: panel-open passive read + pick pre-login read
        // (signed-out baseline).
        if (statusCall <= 2) {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: false,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        // Attempt B in-flight (the login-started event path adopts it).
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: authAttemptB,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return loginStartResponse;
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const onBroadcast = (event: Event) => {
      if (
        (event as CustomEvent<{ reason?: string }>).detail?.reason ===
        'login-started'
      ) {
        loginStartedBroadcasts += 1;
      }
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onBroadcast);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={t5Agents}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    const t5Agents = [amrAgent, codexAgent];
    render(<StatefulCompact />);

    vi.useFakeTimers();
    // Open the agent panel and pick AMR — the spawn POST is held in flight.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(true);
    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();

    // While the spawn is in flight, another surface's login-started arrives
    // and the event path adopts attempt B (poll B starts).
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loginStartedBroadcasts).toBe(1);

    // A's spawn resolves with its OWN confirmed id (not a join). The stale
    // continuation must not broadcast login-started again or steal the poll.
    await act(async () => {
      releaseLoginStart(
        new Response(JSON.stringify({ pid: 42, authAttemptId: authAttemptA }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStartedBroadcasts).toBe(1);

    window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onBroadcast);
    vi.useRealTimers();
  });

  it('ignores a stale login-canceled broadcast that no longer owns the current attempt', async () => {
    // Regression (audit #7): `AMR_LOGIN_STATUS_EVENT` now carries the
    // broadcaster's attempt id; receivers ignore a `login-canceled` whose id
    // does not match the attempt they are polling. Without the gate, a stale
    // cancel from a superseded attempt (e.g. a delayed timeout cancel on
    // another surface) would synchronously stop our poll and clear the
    // pending handoff before any guarded status read could reject it.
    const authAttemptId = 'aaaa8888-8888-4888-8888-888888888888';
    let statusCall = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        statusCall += 1;
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: true,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (
        url.startsWith('/api/integrations/vela/wallet') ||
        url.startsWith('/api/workspace/')
      ) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSwitcher({ agentId: 'amr' }, [amrAgent], {}, { compact: true });

    vi.useFakeTimers();
    // A login starts on another surface and our component adopts attempt B.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-started' } }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // A stale login-canceled for a DIFFERENT attempt arrives. Our poll must
    // survive: advancing the interval issues another status request.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, {
          detail: {
            reason: 'login-canceled',
            authAttemptId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          },
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterStale = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBeGreaterThan(callsAfterStale);

    // A login-canceled for OUR attempt still resets the local login.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(AMR_LOGIN_STATUS_EVENT, {
          detail: { reason: 'login-canceled', authAttemptId },
        }),
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterOwn = statusCall;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    });
    expect(statusCall).toBe(callsAfterOwn);

    vi.useRealTimers();
  });

  it('drops a stale AMR continuation when another CLI is picked before status resolves', async () => {
    // Regression (review thread): `handleAgentButtonClick('amr')` awaits
    // `refreshAmrStatus()` after `onAgentChange('amr')`. A faster pick of
    // another CLI (Codex here) re-enters the handler, bumps the pick token,
    // and the first continuation's post-await writes — `pendingCompactAmrPickRef`,
    // `setPanel(null)`, and `handleAmrSignIn` — must NOT run for the agent
    // the user has already moved on from. Without the token guard, AMR login
    // could start for the now-unselected agent and overwrites the panel.
    const authAttemptId = '44444444-4444-4444-8444-444444444444';
    let loginStarted = false;
    let releaseStatus!: (response: Response) => void;
    const heldStatusResponse = new Promise<Response>((resolve) => {
      releaseStatus = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return heldStatusResponse;
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 42, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    // The handler is suspended on the held status response. While it's
    // suspended the agent panel is still open (setPanel(null) only runs
    // after the await resolves), so we can pick Codex directly.
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));
    expect(
      screen.getByTestId('inline-model-switcher-compact-model-default'),
    ).toBeTruthy();

    // Release the held status with a logged-out AMR. The stale continuation
    // wakes up, but its token is stale (Codex pick bumped the ref) — no AMR
    // login must start, and the Codex model panel must stay open.
    await act(async () => {
      releaseStatus(new Response(
        JSON.stringify({
          loggedIn: false,
          loginInFlight: false,
          authAttemptId,
          profile: 'default',
          user: null,
          configPath: '/Users/test/.amr/config.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loginStarted).toBe(false);
    expect(
      screen.getByTestId('inline-model-switcher-compact-model-default'),
    ).toBeTruthy();
  });

  it('reopens the compact agent panel on a spawn failure so the error is visible', async () => {
    // Regression (review thread): `handleAmrSignIn` failures (spawn, cancel,
    // poll stop/timeout) set `amrLoginError`, but the error is rendered only
    // inside the AMR account row of the agent panel — and `handleAgentButtonClick`
    // closes that panel before login starts. Without an effect that reopens
    // the panel on error, the user sees an empty chip with no error and no
    // retry affordance.
    const startupError = 'profile "prod" api URL: is not configured';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            profile: 'prod',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: startupError }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    // The panel must come back on the failure path so the error is visible.
    await waitFor(() => {
      const popover = screen.getByTestId('inline-model-switcher-popover');
      expect(
        popover.querySelector('.inline-switcher__account-status.is-error')
          ?.textContent,
      ).toMatch(/api URL: is not configured/i);
    });
  });

  it('reopens the compact agent panel on a polling terminal failure so the error is visible', async () => {
    // Regression (review thread): `handleAmrSignIn` failures set
    // `amrLoginError`, but the error is rendered only inside the AMR
    // account row of the agent panel — and `handleAgentButtonClick` closes
    // that panel before login starts. Without an effect that reopens the
    // panel on error, the user sees an empty chip with no error and no
    // retry affordance. This exercises the polling-driven terminal
    // failure path (distinct from the synchronous spawn failure path);
    // `amrLoginPollOutcome` resolves it as `stopped` once elapsed time
    // passes the startup settle window with `loginInFlight: false`.
    const authAttemptId = '55555555-5555-4555-8555-555555555555';
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: false,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        return new Response(JSON.stringify({ pid: 1, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        return new Response(JSON.stringify({ canceled: true, pids: [1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    // Mock Date.now to return a baseline; advance it past the settle
    // window so the next poll tick observes `stopped`. Real `setInterval`
    // is allowed to keep firing so the poll tick chain runs.
    const baseline = Date.parse('2026-08-07T10:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(baseline);

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    // Flush the click chain under the fake clock so `startedAt` lands on
    // the mocked baseline; this guarantees any later mockReturnValue call
    // returns "elapsed >= settle window".
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Advance the mocked clock past the startup settle window before the
    // next poll tick fires.
    vi.mocked(Date.now).mockReturnValue(
      baseline + AMR_LOGIN_STARTUP_SETTLE_MS + 1000,
    );

    // Wait for a real-time poll tick to fire and observe the terminal
    // outcome. The interval is 2s, so we use a slightly longer wait.
    await waitFor(() => {
      const popover = screen.getByTestId('inline-model-switcher-popover');
      expect(
        popover.querySelector('.inline-switcher__account-status.is-error'),
      ).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('reopens the compact agent panel after cancel so the post-cancel state is visible', async () => {
    const authAttemptId = '66666666-6666-4666-8666-666666666666';
    let loginStarted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/integrations/vela/status') {
        return new Response(
          JSON.stringify({
            loggedIn: false,
            loginInFlight: loginStarted,
            authAttemptId,
            profile: 'default',
            user: null,
            configPath: '/Users/test/.amr/config.json',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
        loginStarted = true;
        return new Response(JSON.stringify({ pid: 1, authAttemptId }), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/integrations/vela/login/cancel' && init?.method === 'POST') {
        loginStarted = false;
        return new Response(JSON.stringify({ canceled: true, pids: [1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'codex',
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    await waitFor(() => {
      expect(loginStarted).toBe(true);
      expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    });

    // Click AMR again — `amrLoginPending` is true, so the click routes to
    // cancel. After cancel success, the panel must reopen.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));

    const popover = await waitFor(() =>
      screen.getByTestId('inline-model-switcher-popover'),
    );
    expect(
      within(popover).getByRole('radio', { name: /^Open Design\s+Sign in$/i }),
    ).toBeTruthy();
  });

  it('does not reopen the compact agent panel over a switched agent when the cancel resolves late', async () => {
    // Regression (review thread): `handleAmrCancelLogin` reopened the compact
    // agent panel with `compact` / `config.agentId` captured in its closure
    // (the dep list omits both). A cancel that is still awaiting
    // `cancelVelaLogin` when the user picks Codex resolves against the STALE
    // `config.agentId === 'amr'` and calls `setPanel('agent')` on top of
    // Codex's model picker. The reopen must be keyed on the CURRENT props so
    // a mid-cancel agent switch drops it.
    const authAttemptId = '77777777-7777-4777-8777-777777777777';
    let loginStarted = false;
    let cancelCalls = 0;
    let releaseCancel!: (response: Response) => void;
    const heldCancelResponse = new Promise<Response>((resolve) => {
      releaseCancel = resolve;
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url === '/api/integrations/vela/status') {
          return new Response(
            JSON.stringify({
              loggedIn: false,
              loginInFlight: loginStarted,
              authAttemptId,
              profile: 'default',
              user: null,
              configPath: '/Users/test/.amr/config.json',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (url === '/api/integrations/vela/login' && init?.method === 'POST') {
          loginStarted = true;
          return new Response(JSON.stringify({ pid: 1, authAttemptId }), {
            status: 202,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (
          url === '/api/integrations/vela/login/cancel' &&
          init?.method === 'POST'
        ) {
          cancelCalls += 1;
          loginStarted = false;
          return heldCancelResponse;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    function StatefulCompact() {
      const [config, setConfig] = useState<AppConfig>({
        ...baseConfig,
        agentId: 'amr',
        agentModels: {},
      });
      return (
        <InlineModelSwitcher
          config={config}
          agents={[amrAgent, codexAgent]}
          providerModelsCache={{}}
          compact
          daemonLive
          onModeChange={(mode) => setConfig((c) => ({ ...c, mode }))}
          onAgentChange={(id) =>
            setConfig((c) => ({ ...c, agentId: id, mode: 'daemon' }))
          }
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      );
    }

    render(<StatefulCompact />);
    // Start AMR login from the compact agent panel (agent panel closes).
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await waitFor(() => {
      expect(loginStarted).toBe(true);
      expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    });

    // Click AMR again — `amrLoginPending` is true, so the click routes to
    // cancel. The cancel request is held in flight.
    fireEvent.click(screen.getByTestId('inline-model-switcher-chip-agent'));
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-amr'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(cancelCalls).toBe(1);

    // While the cancellation is in flight the user picks Codex. With no saved
    // codex model, `finishCompactAgentPick('codex')` opens Codex's model
    // panel. A stale cancel continuation must not replace it with the AMR
    // agent panel.
    fireEvent.click(screen.getByTestId('inline-model-switcher-agent-codex'));
    const codexModelPanel = await waitFor(() =>
      screen.getByTestId('inline-model-switcher-popover'),
    );
    expect(
      within(codexModelPanel).getByTestId(
        'inline-model-switcher-compact-model-default',
      ),
    ).toBeTruthy();

    // Resolve the held cancel after the agent switch.
    await act(async () => {
      releaseCancel(
        new Response(JSON.stringify({ canceled: true, pids: [1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Codex's model panel must remain open; the AMR agent panel must not
    // have been forced over it.
    expect(
      within(screen.getByTestId('inline-model-switcher-popover')).getByTestId(
        'inline-model-switcher-compact-model-default',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByTestId('inline-model-switcher-agent-amr'),
    ).toBeNull();
  });
});
