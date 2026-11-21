// @vitest-environment jsdom
//
// OPEND-2614's sign-in/retry handoff still belongs to App. gen53/r824
// (client VIEW-015/RUN-003) adds a separate prerequisite: current scoped
// funding is confirmed on Home before any project frame is created. Once
// available, the remaining sign-in gate may run behind that pending frame.
// Local agents retain their original direct handoff. A display-wallet cache
// alone is never funding authorization for a Home send.

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
import { useWorkspaceInvalidation } from '../../src/collab/workspace-events';
import { advanceWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { clearWorkspaceRemoval, currentWorkspaceRemoval } from '../../src/collab/workspace-removal';
import type { AgentInfo, AppConfig } from '../../src/types';
import { EntryShellWithGateHost } from '../helpers/entry-shell-gate-host';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>('../../src/providers/registry');
  return { ...actual, openExternalUrl: async (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); return true; } };
});

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>();
  return { ...actual, checkAmrBalanceGate: vi.fn() };
});

vi.mock('../../src/collab/workspace-events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/workspace-events')>();
  return { ...actual, useWorkspaceInvalidation: vi.fn(actual.useWorkspaceInvalidation) };
});

vi.mock('../../src/components/AmrBalanceDialog', () => ({
  AmrBalanceDialog: ({ balanceUsd, onClose, onResolved }: { balanceUsd: string; onClose: () => void; onResolved: () => void }) => (
    <div data-testid="amr-balance-dialog" data-balance-usd={balanceUsd}>
      <button type="button" data-testid="amr-balance-dialog-dismiss" onClick={onClose}>
        later
      </button>
      <button type="button" data-testid="amr-balance-dialog-funded" onClick={onResolved}>
        authoritative wallet recovery
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

const submitCaptureCleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of submitCaptureCleanups.splice(0)) cleanup(); });

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

// gen53 supersedes wallet-cache-only Home admission. These older sign-in /
// handoff tests separately prove funds for this exact member and selected model.
function homeFunding(context: WorkspaceCollabContext, fundingCheck: 'available' | 'insufficient' = 'available') {
  return {
    schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
    modelId: 'default', generatedAt: new Date(Date.now()).toISOString(), balanceUsd: '0', fundingCheck,
    funding: 'coding_plan', modelCovered: true,
    codingPlan: { workspaceId: context.workspaceId, generatedAt: new Date(Date.now()).toISOString(),
      eligible: true, tier: 'pro', windows: [{ policyId: 'fixture-5h', durationSeconds: 18000,
        resetMode: 'anchored_recurring', usedCredits: fundingCheck === 'available' ? '0' : '100',
        limitCredits: '100', remainingCredits: fundingCheck === 'available' ? '100' : '0',
        windowStart: new Date(Date.now() - 1000).toISOString(), resetsAt: new Date(Date.now() + 18000_000).toISOString() }] },
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
function harness(agentId: string, profile?: string) {
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
        config={{ ...config(agentId), ...(profile ? { agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: profile } } } : {}) }}
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


describe('unified optional Home send preflight', () => {
  let verdict: 'proceed' | 'insufficient_funds' | 'concurrency_full' | 'unsupported';
  let previews: Array<{ workspaceId: string; modelId: string | null; clientRequestId: string }>;
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear(); window.history.replaceState(null, '', '/');
    resetWorkspaceContextCache(); resetWorkspaceBillingCache(); resetTeamProjectsCache();
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    verdict = 'proceed'; previews = [];
    const workspace = personalContext();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return jsonResponse(workspaceDirectoryFixture([workspace]));
      if (url.endsWith('/api/workspace/context')) return jsonResponse({ context: workspace });
      if (url.endsWith('/billing/send-preflight')) {
        const body = JSON.parse(String(init?.body)); previews.push(body);
        if (verdict === 'unsupported') return new Response('{}', { status: 404 });
        return jsonResponse({ schemaVersion: 1, requestId: 'server', ...body, decision: verdict === 'proceed' ? 'proceed' : 'reject', ...(verdict === 'proceed' ? {} : { reason: verdict }), details: { running: 'invalid' } });
      }
      if (url.includes('/billing/preflight?') || url.includes('/billing/request-concurrency?')) throw new Error('old send endpoint must not be called');
      if (url.includes('/api/workspace/billing?')) return jsonResponse({ summary: null, workspaceBalance: null });
      if (url.endsWith('/api/workspace/projects/team')) return jsonResponse({ projects: [] });
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      return jsonResponse({ stale: true });
    }) as typeof fetch;
  });
  afterEach(() => { cleanup(); globalThis.fetch = originalFetch; globalThis.ResizeObserver = originalResizeObserver; resetWorkspaceContextCache(); resetWorkspaceBillingCache(); resetTeamProjectsCache(); });
  it.each(['proceed', 'unsupported'] as const)('hands the exact target and completed stage to creation on %s', async (value) => {
    verdict = value;
    const h = harness('amr');
    await waitFor(() => expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).not.toBeNull());
    expect(previews).toHaveLength(0);
    await submitHome('make a page');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(previews).toHaveLength(1);
    expect(h.onCreateProject.mock.calls[0]![0]).toMatchObject({ workspaceTarget: { workspaceId: previews[0]!.workspaceId }, amrSendAttempt: { ...previews[0] } });
  });
  it.each(['insufficient_funds', 'concurrency_full'] as const)('keeps draft and does not create after %s; next click reads again', async (value) => {
    verdict = value;
    const h = harness('amr');
    await waitFor(() => expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).not.toBeNull());
    await submitHome('retain this draft');
    await waitFor(() => expect(previews).toHaveLength(1));
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    verdict = 'proceed';
    await submitHome('retain this draft');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(previews).toHaveLength(2);
  });
  it('keeps the existing local-agent path', async () => {
    const h = harness('codex'); await submitHome('local task');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(previews).toHaveLength(0);
  });
  it('preserves sign-in handoff and continues after the login-only gate resolves', async () => {
    const h = harness('amr');
    await waitFor(() => expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).not.toBeNull());
    h.setGate({ kind: 'hard', reason: 'signed_out', snapshot: emptyWallet() });
    await submitHome('continue after login');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onCreateProject).not.toHaveBeenCalled();
    h.setGate({ kind: 'allow' }); fireEvent.click(screen.getByTestId('amr-balance-dialog-funded'));
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual(['begin', 'gate', 'gate', 'create']);
    expect(previews).toHaveLength(1);
  });
  it('rolls back confirmed sign-out on dismissal and retains Home draft', async () => {
    const h = harness('amr'); h.setGate({ kind: 'hard', reason: 'signed_out', snapshot: { ...emptyWallet(), status: 'signed_out' } });
    await waitFor(() => expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).not.toBeNull());
    await submitHome('retain signed-out draft'); await screen.findByTestId('amr-balance-dialog');
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(h.rollback).toHaveBeenCalledTimes(1));
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('retain signed-out draft');
  });
  it('cancels an old attempt if account changes during login confirmation', async () => {
    const h = harness('amr'); h.setGate({ kind: 'hard', reason: 'signed_out', snapshot: emptyWallet() });
    await waitFor(() => expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).not.toBeNull());
    await submitHome('old account intent'); await screen.findByTestId('amr-balance-dialog');
    advanceWorkspaceAccountGeneration('changed-during-login');
    h.setGate({ kind: 'allow' }); fireEvent.click(screen.getByTestId('amr-balance-dialog-funded'));
    await waitFor(() => expect(h.rollback).toHaveBeenCalledTimes(1));
    expect(h.onCreateProject).not.toHaveBeenCalled();
  });

});
