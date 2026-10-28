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

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type AmrWalletSnapshot,
  type WorkspaceBillingPreflight,
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
import { cachedHomeAmrFundingBlock, checkAmrFundingFeedback, invalidateAmrFundingFeedback } from '../../src/runtime/amr-funding-feedback';
import { useWorkspaceInvalidation } from '../../src/collab/workspace-events';
import { advanceWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import type { AgentInfo, AppConfig } from '../../src/types';
import { EntryShellWithGateHost } from '../helpers/entry-shell-gate-host';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>();
  return { ...actual, checkAmrBalanceGate: vi.fn() };
});

vi.mock('../../src/collab/workspace-events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/workspace-events')>();
  return { ...actual, useWorkspaceInvalidation: vi.fn(actual.useWorkspaceInvalidation) };
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
let testAccountSequence = 0;
beforeEach(() => {
  testAccountSequence++;
});

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
    workspaceId: `ws-personal-2614-${testAccountSequence}`,
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
    invalidateAmrFundingFeedback();
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
        workspaceId: `ws-personal-2614-${testAccountSequence}`,
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

describe('Home memory funding gate', () => {
  let billingReads = 0;
  let memoryPreflight: WorkspaceBillingPreflight | null = null;

  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
    billingReads = 0;
    memoryPreflight = null;
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
          preflight: memoryPreflight,
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
    invalidateAmrFundingFeedback();
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

  async function primeHomeFunding() {
    const h = harness('amr');
    await waitForWalletInMemory();
    const context = personalContext();
    const original = globalThis.fetch;
    let reads = 0;
    let finishConfirmation!: (response: Response | Error) => void;
    const preflight = {
      schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      modelId: 'default', generatedAt: new Date().toISOString(), balanceUsd: '0', fundingCheck: 'insufficient',
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/workspace/billing/preflight?')) {
        reads++;
        if (reads > 1) return new Promise<Response>((resolve, reject) => {
          finishConfirmation = (response) => response instanceof Error ? reject(response) : resolve(response);
        });
        return jsonResponse({ preflight });
      }
      return original(input, init);
    });
    await checkAmrFundingFeedback(context, 'default');
    return { ...h,
      fundingReads: () => reads,
      confirm: (fundingCheck: string) => finishConfirmation(jsonResponse({ preflight: { ...preflight, fundingCheck } })),
      confirmResponse: (response: Response | Error) => finishConfirmation(response),
    };
  }

  it('refreshes a retained Home block after billing refresh without another send', async () => {
    const h = await primeHomeFunding();
    const before = billingReads;
    // Move beyond the existing billing fetch burst window without sleeping.
    const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1_000);
    try {
      await act(async () => {
        window.dispatchEvent(new Event('od:workspace-billing-refresh'));
      });
      await waitFor(() => expect(billingReads).toBeGreaterThan(before));
      await waitFor(() => expect(h.fundingReads()).toBe(2));
      expect(cachedHomeAmrFundingBlock(personalContext(), 'default')).not.toBeNull();
      await act(async () => h.confirm('available'));
      expect(cachedHomeAmrFundingBlock(personalContext(), 'default')).toBeNull();
      expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
      await submitHome('Send only after the user asks.');
      await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    } finally { now.mockRestore(); }
  });


  it('retries unknown on the next billing publication without a fixed cooldown, then stops after recovery', async () => {
    const h = await primeHomeFunding();
    let tick = performance.now();
    const now = vi.spyOn(performance, 'now').mockImplementation(() => tick);
    try {
      for (const [index, verdict] of ['unknown', 'available'].entries()) {
        tick += 1_000; // Only advance the existing display-fetch burst clock.
        await act(async () => window.dispatchEvent(new Event('od:workspace-billing-refresh')));
        await waitFor(() => expect(h.fundingReads()).toBe(index + 2));
        await act(async () => h.confirm(verdict));
        expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
      }
      const reads = billingReads;
      tick += 1_000;
      await act(async () => window.dispatchEvent(new Event('od:workspace-billing-refresh')));
      await waitFor(() => expect(billingReads).toBeGreaterThan(reads));
      expect(h.fundingReads()).toBe(3);
    } finally { now.mockRestore(); }
  });

  it('restores #8240 from the displayed wallet and plan without an independent hint', async () => {
    const context = personalContext();
    memoryPreflight = {
      schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      modelId: null, generatedAt: new Date().toISOString(), balanceUsd: '0', funding: 'gateway', modelCovered: null,
      codingPlan: { workspaceId: context.workspaceId, generatedAt: new Date().toISOString(), eligible: false, tier: null, windows: [] },
    };
    const h = harness('amr');
    await waitForWalletInMemory();
    invalidateAmrFundingFeedback();
    const original = globalThis.fetch;
    let finish!: (response: Response) => void;
    globalThis.fetch = vi.fn((input, init) => String(input).includes('/api/workspace/billing/preflight?')
      ? new Promise<Response>((resolve) => { finish = resolve; }) : original(input, init));
    await submitHome('Restore the in-memory Home gate.');
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(await screen.findByTestId('amr-balance-dialog')).toBeTruthy();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    await act(async () => { finish(jsonResponse({ preflight: null })); });
    expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy();
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
  });

  it('keeps a cached backend insufficient verdict on Home before any project hand-off', async () => {
    const h = await primeHomeFunding();
    await submitHome('Keep this draft on Home.');
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(await screen.findByTestId('amr-balance-dialog')).toBeTruthy();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    h.confirm('available');
    await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
    expect(h.rollback).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this draft on Home.');
  });

  it('updates available funding without submitting until the user sends again', async () => {
    const h = await primeHomeFunding();
    await submitHome('Continue this draft.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    await act(async () => { h.confirm('available'); });
    expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
    await submitHome('Continue this draft.');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual(['begin', 'gate', 'create']);
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
  });

  it.each(['unknown', 'missing', 'unavailable', 'timeout'] as const)('keeps Home blocked after %s confirmation and permits a fresh retry', async (result) => {
    const h = await primeHomeFunding();
    await submitHome('Keep this draft until funding is confirmed.');
    await screen.findByTestId('amr-balance-dialog');
    await act(async () => {
      if (result === 'unknown') h.confirm('unknown');
      else if (result === 'timeout') h.confirmResponse(new DOMException('Funding check timed out', 'TimeoutError'));
      else h.confirmResponse(result === 'missing' ? jsonResponse({ preflight: null }) : new Response(null, { status: 503 }));
    });
    expect(screen.queryByTestId('amr-balance-dialog')).not.toBeNull();
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this draft until funding is confirmed.');
    await submitHome('Keep this draft until funding is confirmed.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    await act(async () => { h.confirm('available'); });
    expect(h.onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
    await submitHome('Keep this draft until funding is confirmed.');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
  });

  it.each(['billing-changed', 'billing-subscription-changed', 'wallet-balance-changed', 'coding-plan-usage-changed'] as const)(
    '%s retains confirmed insufficiency without fetching or submitting', async (type) => {
      const h = await primeHomeFunding();
      const context = personalContext();
      const handlers = [...vi.mocked(useWorkspaceInvalidation).mock.calls].reverse().find(
        ([handlers]) => handlers['team-project-content-ready'],
      )![0];
      const invalidate = handlers[type]!;
      const event = {
        type, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        revision: '2', eventId: 'quota-2',
      };
      const readCount = vi.mocked(globalThis.fetch).mock.calls.length;
      await act(async () => {
        invalidate({ ...event, workspaceId: 'other-workspace' } as never);
      });
      expect(cachedHomeAmrFundingBlock(context, 'default')).not.toBeNull();
      if (type === 'wallet-balance-changed' || type === 'coding-plan-usage-changed') {
        await act(async () => { invalidate({ ...event, workspaceMemberId: 'other-member' } as never); });
        expect(cachedHomeAmrFundingBlock(context, 'default')).not.toBeNull();
      }
      await act(async () => {
        // Repeated notifications only invalidate memory; they do not create a
        // new funding request per event.
        for (let i = 0; i < 8; i++) invalidate(event as never);
      });
      expect(cachedHomeAmrFundingBlock(context, 'default')).not.toBeNull();
      expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(readCount);
      expect(h.onCreateProject).not.toHaveBeenCalled();
    },
  );

  it('does not continue an old send after the account changes during confirmation', async () => {
    const h = await primeHomeFunding();
    await submitHome('Keep the old account draft.');
    await screen.findByTestId('amr-balance-dialog');
    advanceWorkspaceAccountGeneration('new-home-account');
    h.confirm('available');
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
  });

  it.each(['unchanged', 'billing-event', 'ttl-expiry'] as const)(
    'keeps twenty explicit sends blocked after insufficiency with %s', async (transition) => {
      const h = await primeHomeFunding();
      const now = Date.now();
      let dateNow: ReturnType<typeof vi.spyOn> | undefined;
      try {
        for (let attempt = 1; attempt <= 20; attempt++) {
          if (attempt === 9 && transition === 'billing-event') {
            const handlers = [...vi.mocked(useWorkspaceInvalidation).mock.calls].reverse().find(
              ([handlers]) => handlers['team-project-content-ready'],
            )![0];
            const context = personalContext();
            await act(async () => handlers['wallet-balance-changed']!({
              type: 'wallet-balance-changed', workspaceId: context.workspaceId,
              workspaceMemberId: context.workspaceMemberId, revision: '9',
            }));
          }
          if (attempt === 9 && transition === 'ttl-expiry') {
            dateNow = vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
          }
          await submitHome(`Unfunded attempt ${attempt}`);
          expect(h.onBeginProjectCreation, `attempt ${attempt} must stay on Home`).not.toHaveBeenCalled();
          await screen.findByTestId('amr-balance-dialog');
          await act(async () => h.confirm('insufficient'));
          expect(h.onCreateProject).not.toHaveBeenCalled();
          fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
          await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
        }
      } finally {
        dateNow?.mockRestore();
      }
    },
  );

  it('confirmed sign-out still rolls back the pending frame and preserves the draft', async () => {
    const h = harness('amr');
    h.setGate({ kind: 'hard', reason: 'signed_out', snapshot: { ...emptyWallet(), status: 'signed_out' } });
    await waitForWalletInMemory();
    await submitHome('Design a pricing page.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onBeginProjectCreation).toHaveBeenCalledTimes(1);
    expect(h.onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(h.rollback).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual(['begin', 'gate', 'rollback:']);
  });

  it('zero wallet proceeds without a preliminary dialog or duplicate preflight', async () => {
    const h = harness('amr');
    await waitForWalletInMemory();
    await submitHome('Draft a landing page.');
    await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(h.calls).toEqual(['begin', 'gate', 'create']);
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
    invalidateAmrFundingFeedback();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it.each(['member', 'admin'] as const)(
    'does not show a wallet-only block for Team %s with $0',
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
      await waitFor(() => expect(billingReads).toBeGreaterThan(0));
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      await submitHome('Design the onboarding flow.');
      await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('amr-balance-owner-dialog')).toBeNull();
      expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
      expect(h.onBeginProjectCreation).toHaveBeenCalledTimes(1);
      const contextCall = vi.mocked(globalThis.fetch).mock.calls.find(
        ([input]) => String(input).endsWith('/api/workspace/context'),
      );
      const headers = new Headers(contextCall?.[1]?.headers);
      expect(headers.get('x-od-workspace-type')).toBe('team');
      expect(headers.get('x-od-workspace-role')).toBe(role);
    },
  );
});
