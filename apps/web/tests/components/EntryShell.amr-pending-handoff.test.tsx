// @vitest-environment jsdom
//
// OPEND-2614 · a Home send hands off to the project frame BEFORE the AMR
// balance gate is consulted, and the gate's verdict then lands behind that
// frame: allow → the create reuses the optimistic id; a dismissed hard block or
// an unreadable wallet → the hand-off is rolled back (with a notice only where
// no dialog explained the outcome) and nothing is created. The local-agent
// path never sees the gate but takes the same hand-off.
//
// The Playwright case `e2e/ui/home-amr-pending.test.ts` pins the visible
// behaviour (pending frame within one animation frame of the click); this
// file pins the contract between EntryShell and App that makes it possible.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetTeamProjectsCache,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import type {
  EntryShell,
  OptimisticProjectCreationHandoff,
} from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import type { AgentInfo, AppConfig } from '../../src/types';
import { EntryShellWithGateHost } from '../helpers/entry-shell-gate-host';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>();
  return { ...actual, checkAmrBalanceGate: vi.fn() };
});

vi.mock('../../src/components/AmrBalanceDialog', () => ({
  AmrBalanceDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="amr-balance-dialog">
      <button type="button" data-testid="amr-balance-dialog-dismiss" onClick={onClose}>
        later
      </button>
    </div>
  ),
}));

type CreateInput = Parameters<ComponentProps<typeof EntryShell>['onCreateProject']>[0];

const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function personalContext(): WorkspaceCollabContext {
  const role = 'owner' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: 'ws-personal-2614',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-personal-2614',
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: 'personal_pro',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
  };
}

function agent(id: string): AgentInfo {
  return { id, name: id, bin: id, available: true, models: [{ id: 'default', label: 'Default' }] };
}

function config(agentId: string): AppConfig {
  return {
    mode: 'daemon',
    agentId,
    agentModels: {},
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    skillId: null,
    designSystemId: null,
    theme: 'system',
  };
}

function emptyWallet(): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0.00',
    updatedAt: null,
    fetchedAt: new Date(0).toISOString(),
    stale: false,
    source: 'vela_api',
  };
}

/** Records the ORDER in which the shell touches the App-owned hooks. */
function harness(agentId: string) {
  const calls: string[] = [];
  const rollback = vi.fn((options?: { notice?: string }) => {
    calls.push(`rollback:${options?.notice ?? ''}`);
  });
  const handoff: OptimisticProjectCreationHandoff = { projectId: 'optimistic-2614', rollback };
  const onBeginProjectCreation = vi.fn(() => {
    calls.push('begin');
    return handoff;
  });
  const onCreateProject = vi.fn(async (_input: CreateInput) => {
    calls.push('create');
    return true;
  });
  mockedCheckAmrBalanceGate.mockImplementation(async () => {
    calls.push('gate');
    return gateResult;
  });
  let gateResult: Awaited<ReturnType<typeof checkAmrBalanceGate>> = { kind: 'allow' };
  const setGate = (next: typeof gateResult) => {
    gateResult = next;
  };
  render(
    <I18nProvider initial="en">
      <EntryShellWithGateHost
        skills={[]}
        designTemplates={[]}
        designSystems={[]}
        projects={[]}
        templates={[]}
        promptTemplates={[]}
        defaultDesignSystemId={null}
        connectors={[]}
        connectorsLoading={false}
        config={config(agentId)}
        agents={[agent(agentId)]}
        daemonLive
        onModeChange={vi.fn()}
        onAgentChange={vi.fn()}
        onAgentModelChange={vi.fn()}
        onApiProtocolChange={vi.fn()}
        onApiModelChange={vi.fn()}
        onConfigPersist={vi.fn()}
        onRefreshAgents={vi.fn(() => [agent(agentId)])}
        onCreateProject={onCreateProject}
        onBeginProjectCreation={onBeginProjectCreation}
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
  return { calls, onBeginProjectCreation, onCreateProject, rollback, setGate };
}

async function submitHome(prompt: string) {
  await screen.findByTestId('home-hero-input');
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  setHomeHeroPrompt(prompt);
  fireEvent.click(await screen.findByTestId('home-hero-submit'));
}

describe('OPEND-2614 · Home send hands off before the AMR gate', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    const workspace = personalContext();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspace]));
      }
      if (url.endsWith('/api/workspace/context')) return jsonResponse({ context: workspace });
      if (url.includes('/api/workspace/billing?')) {
        return jsonResponse({ summary: null, workspaceBalance: null });
      }
      if (url.endsWith('/api/workspace/projects/team')) return jsonResponse({ projects: [] });
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it('allow: begin → gate → create, and the create reuses the optimistic id with the gate witness', async () => {
    const h = harness('amr');
    await submitHome('Draft a landing page.');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual(['begin', 'gate', 'create']);
    expect(h.onCreateProject.mock.calls[0]?.[0]).toMatchObject({
      optimisticProjectId: 'optimistic-2614',
      autoSendFirstMessage: true,
      amrGatePrecheckWitness: {
        workspaceType: 'personal',
        workspaceId: 'ws-personal-2614',
        workspaceMemberId: 'wm-personal-2614',
      },
    });
    expect(h.rollback).not.toHaveBeenCalled();
  });

  it('hard block: the dialog shows behind the hand-off; dismiss rolls back without a notice and creates nothing', async () => {
    const h = harness('amr');
    h.setGate({ kind: 'hard', reason: 'insufficient', snapshot: emptyWallet() });
    await submitHome('Design a pricing page.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onBeginProjectCreation).toHaveBeenCalledTimes(1);
    expect(h.rollback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(h.rollback).toHaveBeenCalledTimes(1));
    expect(h.rollback).toHaveBeenCalledWith();
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(h.calls).toEqual(['begin', 'gate', 'rollback:']);
  });

  it('unreadable wallet: the hand-off is rolled back with an explicit notice and nothing is created', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const h = harness('amr');
      h.setGate({ kind: 'unavailable' });
      await submitHome('Draft a deck.');
      await waitFor(() => expect(h.onBeginProjectCreation).toHaveBeenCalledTimes(1));
      // Home retries an unavailable read twice (400ms + 1200ms) before giving up.
      await vi.advanceTimersByTimeAsync(2_000);
      await waitFor(() => expect(h.rollback).toHaveBeenCalledTimes(1));
      expect(h.rollback.mock.calls[0]?.[0]?.notice).toBe(
        "Couldn't confirm your OpenDesign Cloud balance. Try sending again.",
      );
      expect(h.onCreateProject).not.toHaveBeenCalled();
      expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('local agent: same hand-off, no gate', async () => {
    const h = harness('codex');
    await submitHome('Draft a landing page locally.');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual(['begin', 'create']);
    expect(mockedCheckAmrBalanceGate).not.toHaveBeenCalled();
    expect(h.onCreateProject.mock.calls[0]?.[0]).toMatchObject({
      optimisticProjectId: 'optimistic-2614',
    });
    expect(h.onCreateProject.mock.calls[0]?.[0]).not.toHaveProperty('amrGatePrecheckWitness');
  });
});

/**
 * OPEND-3300 / 3309 · a wallet the shell already knows is empty is answered on
 * Home, before the hand-off: the rail's 额度 reading for the exact send scope
 * is `$0`, so the dialog opens on the click tick with no frame and no create.
 * One background confirmation runs behind it; only a non-blocking answer (the
 * projection was stale) moves the send onto the ordinary hand-off path.
 */
describe('OPEND-3300 · an empty in-memory wallet blocks on Home before the hand-off', () => {
  let billingReads = 0;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    billingReads = 0;
    const workspace = personalContext();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspace]));
      }
      if (url.endsWith('/api/workspace/context')) return jsonResponse({ context: workspace });
      if (url.includes('/api/workspace/billing?')) {
        billingReads += 1;
        // The projection the rail shows: this member's wallet is at $0.
        return jsonResponse({
          summary: null,
          workspaceBalance: {
            workspaceId: workspace.workspaceId,
            workspaceMemberId: workspace.workspaceMemberId,
            balanceUsd: '0.00',
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: '2026-09-17T00:00:00.000Z',
          },
        });
      }
      if (url.endsWith('/api/workspace/projects/team')) return jsonResponse({ projects: [] });
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  /** The shell has the $0 projection in memory once the billing read landed. */
  async function waitForWalletInMemory() {
    await waitFor(() => expect(billingReads).toBeGreaterThan(0));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }

  it('still empty on confirmation: dialog on Home, no hand-off, dismiss leaves the draft', async () => {
    const h = harness('amr');
    h.setGate({ kind: 'hard', reason: 'insufficient', snapshot: emptyWallet() });
    await waitForWalletInMemory();
    await submitHome('Design a pricing page.');
    await screen.findByTestId('amr-balance-dialog');
    // The frame never opened: nothing to roll back, nothing created.
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    // Exactly one background confirmation, started with the dialog.
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(h.rollback).not.toHaveBeenCalled();
    expect(h.calls).toEqual(['gate']);
  });

  it('confirmation reads a fundable wallet: the dialog closes itself and the ordinary hand-off follows', async () => {
    const h = harness('amr');
    await waitForWalletInMemory();
    await submitHome('Draft a landing page.');
    // The stale projection said $0, so the dialog opened on Home first …
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));
    // … and the confirmation (allow) moved the send onto the normal path.
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(h.calls).toEqual(['gate', 'begin', 'gate', 'create']);
    expect(h.onCreateProject.mock.calls[0]?.[0]).toMatchObject({
      optimisticProjectId: 'optimistic-2614',
    });
    expect(h.rollback).not.toHaveBeenCalled();
  });
});

describe('OPEND-3300 · local Team authority on a $0 Home send', () => {
  const originalFetch = globalThis.fetch;
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it.each(['member', 'admin'] as const)(
    'shows the owner top-up dialog for a Team %s with $0 on Home',
    async (role) => {
      const workspace: WorkspaceCollabContext = {
        workspaceId: 'ws-team-3300',
        workspaceType: 'team',
        workspaceMemberId: 'wm-team-3300',
        role,
        memberStatus: 'active',
        lifecycleState: 'active',
        billingState: 'active',
        planId: 'team_pro',
        providerMode: 'platform_credits',
        seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
        permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
        teamId: 'ws-team-3300',
        teamName: 'Acme Design',
        workspaceName: 'Acme Design',
      };
      let billingReads = 0;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/workspace/directory')) {
          return jsonResponse(workspaceDirectoryFixture([workspace]));
        }
        if (url.endsWith('/api/workspace/context')) {
          // The local daemon derives authority from explicit headers. Without
          // the type assertion it defaults this membership to personal.
          const headers = new Headers(init?.headers);
          const workspaceType = headers.get('x-od-workspace-type') === 'team'
            ? 'team'
            : 'personal';
          return jsonResponse({ context: {
            ...workspace,
            workspaceType,
            role: headers.get('x-od-workspace-role') === 'admin' ? 'admin' : 'member',
          } });
        }
        if (url.includes('/api/workspace/billing?')) {
          billingReads += 1;
          return jsonResponse({
            summary: null,
            workspaceBalance: {
              workspaceId: workspace.workspaceId,
              workspaceMemberId: workspace.workspaceMemberId,
              balanceUsd: '0.00',
              billingScopeVersion: 2,
              expiresAt: null,
              updatedAt: '2026-09-18T00:00:00.000Z',
            },
          });
        }
        if (url.endsWith('/api/workspace/projects/team')) return jsonResponse({ projects: [] });
        if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
        if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
        if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
        if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
        return jsonResponse({});
      }) as typeof fetch;

      const h = harness('amr');
      h.setGate({ kind: 'hard', reason: 'insufficient', snapshot: emptyWallet() });
      await waitFor(() => expect(billingReads).toBeGreaterThan(0));
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      await submitHome('Design the onboarding flow.');
      await screen.findByTestId('amr-balance-owner-dialog');
      expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
      expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
      const contextCall = vi.mocked(globalThis.fetch).mock.calls.find(
        ([input]) => String(input).endsWith('/api/workspace/context'),
      );
      const headers = new Headers(contextCall?.[1]?.headers);
      expect(headers.get('x-od-workspace-type')).toBe('team');
      expect(headers.get('x-od-workspace-role')).toBe(role);
    },
  );
});
