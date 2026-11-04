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
import { cachedHomeAmrFundingBlock, checkAmrFundingFeedback, invalidateAmrFundingFeedback, recentHomeAmrFundingInsufficiency } from '../../src/runtime/amr-funding-feedback';
import { useWorkspaceInvalidation } from '../../src/collab/workspace-events';
import { advanceWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { clearWorkspaceRemoval, currentWorkspaceRemoval } from '../../src/collab/workspace-removal';
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

describe('OPEND-2614 · funded Home handoff precedes the remaining AMR sign-in gate', () => {
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
      if (url.includes('/billing/preflight?')) return jsonResponse({ preflight: homeFunding(workspace) });
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

  it('keeps exact attachments and only a fresh manual Send retries after real counter release', async () => {
    const context = personalContext();
    const previous = globalThis.fetch;
    let full = true;
    let reads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/billing/request-concurrency?')) {
        reads++;
        return jsonResponse({ requestConcurrencyHint: {
          workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
          observedAt: new Date().toISOString(), status: full ? 'full' : 'available', running: full ? 10 : 0, limit: 10,
        } });
      }
      return previous(input, init);
    }) as typeof fetch;
    const h = harness('amr');
    await screen.findByTestId('home-hero-input');
    const attachment = new File(['original complete bytes'], 'brief.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('home-hero-file-input'), { target: { files: [attachment] } });
    await submitHome('Never auto send this draft');
    await screen.findByTestId('amr-concurrency-dialog');
    full = false;
    fireEvent.click(screen.getByTestId('amr-concurrency-close'));
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(reads).toBe(1);
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.onCreateProject.mock.calls[0]![0]).toMatchObject({ pendingPrompt: 'Never auto send this draft', pendingFiles: [attachment] });
    expect(reads).toBe(2);
  });

  it.each([
    ['local', 'http://localhost:5173'],
    ['test', 'https://open-design.powerformer.net'],
    ['prod', 'https://open-design.ai'],
  ] as const)('Home concurrency upgrade preserves %s profile and rejected workspace', async (profile, origin) => {
    const context = personalContext();
    const previous = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/billing/request-concurrency?')) return jsonResponse({ requestConcurrencyHint: {
        workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        observedAt: new Date().toISOString(), status: 'full', running: 10, limit: 10,
      } });
      return previous(input, init);
    }) as typeof fetch;
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const h = harness('amr', profile);
    await submitHome('Keep this draft in its original workspace');
    fireEvent.click(await screen.findByTestId('amr-concurrency-upgrade'));
    const target = new URL(String(open.mock.calls[0]![0]));
    expect(target.origin).toBe(origin);
    expect(target.searchParams.get('workspaceId')).toBe(context.workspaceId);
    expect(target.searchParams.get('billing')).toBe('plan');
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this draft in its original workspace');
    open.mockRestore();
  });

  it('a pending read cannot dispatch after the account identity changes', async () => {
    const context = personalContext();
    const previous = globalThis.fetch;
    let release!: (response: Response) => void;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/billing/request-concurrency?')) return new Promise<Response>((resolve) => { release = resolve; });
      return previous(input, init);
    }) as typeof fetch;
    const h = harness('amr');
    await submitHome('Identity-fenced original prompt');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => {
      advanceWorkspaceAccountGeneration('hint-account-switch');
      release(jsonResponse({ requestConcurrencyHint: { workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        observedAt: new Date().toISOString(), status: 'available', running: 0, limit: 10 } }));
    });
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Identity-fenced original prompt');
  });

  it.each(['owner', 'admin', 'member'] as const)('real Link full hint holds %s on Home without creating or clearing the prompt', async (role) => {
    const context = { ...personalContext(), role,
      permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) };
    const previous = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return jsonResponse(workspaceDirectoryFixture([context]));
      if (url.endsWith('/api/workspace/context')) return jsonResponse({ context });
      if (url.includes('/billing/request-concurrency?')) return jsonResponse({ requestConcurrencyHint: {
        workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
        observedAt: new Date().toISOString(), status: 'full', running: 10, limit: 10,
      } });
      return previous(input, init);
    }) as typeof fetch;
    const { onBeginProjectCreation, onCreateProject } = harness('amr');
    const started = performance.now();
    await submitHome('Keep this original Home prompt');
    await screen.findByTestId('amr-concurrency-dialog');
    const elapsedMs = performance.now() - started;
    process.stdout.write(JSON.stringify({ evidence: 'controlled-home-hint-latency', role, elapsedMs, thresholdMs: 500 }) + '\n');
    expect(elapsedMs).toBeLessThanOrEqual(500);
    expect(onBeginProjectCreation).not.toHaveBeenCalled();
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input').textContent).toContain('Keep this original Home prompt');
  });

  it('VIEW-015 confirms this explicit Send despite wallet warm publications without another send proof', async () => {
    const context = personalContext();
    const h = harness('amr');
    await screen.findByTestId('home-hero-input');
    await checkAmrFundingFeedback(context, 'default');
    const original = globalThis.fetch;
    const sendReplies: Array<(response: Response) => void> = [];
    let publishing = false;
    let warmReads = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/billing/preflight?')) {
        if (publishing) {
          warmReads++;
          return Promise.resolve(jsonResponse({ preflight: homeFunding(context) }));
        }
        return new Promise<Response>((resolve) => sendReplies.push(resolve));
      }
      return original(input, init);
    }) as typeof fetch;
    try {
      await submitHome('Keep this explicit draft through wallet refresh.');
      await waitFor(() => expect(sendReplies).toHaveLength(1));
      const handlers = [...vi.mocked(useWorkspaceInvalidation).mock.calls].reverse().find(
        ([handlers]) => handlers['team-project-content-ready'],
      )![0];
      await act(async () => {
        publishing = true;
        for (let i = 0; i < 99; i++) handlers['wallet-balance-changed']!({
          type: 'wallet-balance-changed', workspaceId: context.workspaceId,
          workspaceMemberId: context.workspaceMemberId, revision: 'same-wallet-revision',
        });
        window.dispatchEvent(new Event('od:workspace-billing-refresh'));
        await Promise.resolve();
        publishing = false;
      });
      expect(warmReads).toBeGreaterThan(0);
      expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
      expect(h.onCreateProject).not.toHaveBeenCalled();
      await act(async () => sendReplies[0]!(jsonResponse({ preflight: homeFunding(context) })));
      await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
      expect(h.onBeginProjectCreation).toHaveBeenCalledTimes(1);
      expect(sendReplies).toHaveLength(1);
      expect(h.onCreateProject.mock.calls[0]![0]).toMatchObject({
        pendingPrompt: 'Keep this explicit draft through wallet refresh.',
      });
    } finally {
      for (const resolve of sendReplies) resolve(jsonResponse({ preflight: { ...homeFunding(context), fundingCheck: 'unknown' } }));
    }
  });

  it.each(['insufficient', 'unknown', 'forbidden', 'timeout'] as const)(
    'VIEW-015 keeps the draft without creating after explicit %s proof during display refresh', async (result) => {
      const context = personalContext();
      const h = harness('amr');
      await screen.findByTestId('home-hero-input');
      await checkAmrFundingFeedback(context, 'default');
      const original = globalThis.fetch;
      let finish!: (response: Response | Error) => void;
      globalThis.fetch = vi.fn((input, init) => String(input).includes('/billing/preflight?')
        ? new Promise<Response>((resolve, reject) => { finish = response => response instanceof Response ? resolve(response) : reject(response); })
        : original(input, init));
      await submitHome('Keep this draft until this click has valid funds.');
      await waitFor(() => expect(finish).toBeTypeOf('function'));
      await act(async () => {
        window.dispatchEvent(new Event('od:workspace-billing-refresh'));
        let response: Response | Error;
        if (result === 'forbidden') response = new Response(null, { status: 403 });
        else if (result === 'timeout') response = new DOMException('funding timeout', 'TimeoutError');
        else response = jsonResponse({ preflight: { ...homeFunding(context), fundingCheck: result } });
        finish(response);
      });
      if (result === 'insufficient') await screen.findByTestId('amr-balance-dialog');
      else await screen.findByText("Couldn't confirm your OpenDesign Cloud balance. Try sending again.");
      expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
      expect(h.onCreateProject).not.toHaveBeenCalled();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this draft until this click has valid funds.');
    },
  );

  it('withdraws pending Home Send authority on an exact member-removal SSE before its 200 proof returns', async () => {
    clearWorkspaceRemoval();
    const sources: Array<EventTarget & { url: string }> = [];
    class RemovalEventSource extends EventTarget {
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readonly url: string;
      constructor(url: string) { super(); this.url = url; sources.push(this); }
      close() {}
    }
    vi.stubGlobal('EventSource', RemovalEventSource);
    const context = { ...personalContext(), role: 'member' as const,
      permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }) };
    const original = globalThis.fetch;
    let sending = false;
    let finish!: (response: Response) => void;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return Promise.resolve(jsonResponse(workspaceDirectoryFixture([context])));
      if (url.endsWith('/api/workspace/context')) return Promise.resolve(jsonResponse({ context }));
      if (url.includes('/billing/preflight?') && sending) return new Promise<Response>(resolve => { finish = resolve; });
      return original(input, init);
    }) as typeof fetch;
    const h = harness('amr');
    try {
      await screen.findByTestId('home-hero-input');
      await checkAmrFundingFeedback(context, 'default');
      sending = true;
      await submitHome('Do not send this removed member draft.');
      await waitFor(() => expect(finish).toBeTypeOf('function'));
      const source = sources.find(source => source.url.includes('/api/workspace/events?')
        && new URL(source.url, 'http://localhost').searchParams.get('workspaceId') === context.workspaceId);
      expect(source, 'the real workspace hook must subscribe to the scoped SSE').toBeDefined();
      await act(async () => {
        source!.dispatchEvent(new MessageEvent('workspace-context-changed', { data: JSON.stringify({
          type: 'workspace-context-changed', memberRemoval: { reason: 'member-removed',
            workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId },
        }) }));
        expect(currentWorkspaceRemoval()).toMatchObject({ workspaceId: context.workspaceId,
          workspaceMemberId: context.workspaceMemberId });
        finish(jsonResponse({ preflight: homeFunding(context) }));
      });
      expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
      expect(h.onCreateProject).not.toHaveBeenCalled();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Do not send this removed member draft.');
    } finally { clearWorkspaceRemoval(); vi.unstubAllGlobals(); }
  });

  it('RUN-003 shows fresh Home insufficiency before a late Link hint and only retries on another click', async () => {
    const context = personalContext();
    const previous = globalThis.fetch;
    let verdict: 'insufficient' | 'available' = 'insufficient';
    let releaseHint!: (response: Response) => void;
    let holdHint = true;
    let freshReads = 0;
    const hint = (status: 'full' | 'available') => jsonResponse({ requestConcurrencyHint: {
      workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      observedAt: new Date().toISOString(), status,
      running: status === 'full' ? 10 : 0, limit: 10,
    } });
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/billing/request-concurrency?')) {
        return holdHint ? new Promise<Response>((resolve) => { releaseHint = resolve; })
          : Promise.resolve(hint('available'));
      }
      if (url.includes('/billing/preflight?')) {
        freshReads++;
        return new Promise<Response>((resolve) => setTimeout(() =>
          resolve(jsonResponse({ preflight: homeFunding(context, verdict) })), 200));
      }
      return previous(input, init);
    }) as typeof fetch;
    const h = harness('amr');
    await screen.findByTestId('home-hero-input');
    await new Promise((resolve) => setTimeout(resolve, 50));
    setHomeHeroPrompt('Keep this draft through both decisions.');
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId('home-hero-submit'));
      await act(async () => { await vi.advanceTimersByTimeAsync(199); });
      expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(screen.queryByTestId('amr-balance-dialog')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this draft through both decisions.');
    await act(async () => releaseHint(hint('full')));
    expect(screen.getByTestId('amr-balance-dialog')).toBeTruthy();
    expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    verdict = 'available';
    holdHint = false;
    expect(h.onCreateProject).not.toHaveBeenCalled();
    await submitHome('Keep this draft through both decisions.');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(freshReads).toBeGreaterThanOrEqual(2);
  });

  it('RUN-003 uses the current fresh shortfall when it beats a pending hint and an older negative', async () => {
    const h = harness('amr');
    await screen.findByTestId('home-hero-input');
    const context = personalContext();
    const previous = globalThis.fetch;
    let releaseHint!: (response: Response) => void;
    let currentSend = false;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/billing/request-concurrency?')) {
        return new Promise<Response>((resolve) => { releaseHint = resolve; });
      }
      if (url.includes('/billing/preflight?')) {
        return Promise.resolve(jsonResponse({ preflight: {
          ...homeFunding(context, 'insufficient'), balanceUsd: currentSend ? '-3' : '0',
        } }));
      }
      return previous(input, init);
    }) as typeof fetch;
    invalidateAmrFundingFeedback();
    await checkAmrFundingFeedback(context, 'default');
    expect(recentHomeAmrFundingInsufficiency(context, 'default')).not.toBeNull();
    currentSend = true;
    await submitHome('Use this click\'s exact shortfall.');
    const dialog = await screen.findByTestId('amr-balance-dialog');
    expect(dialog).toHaveAttribute('data-balance-usd', '-3');
    await act(async () => releaseHint(jsonResponse({ requestConcurrencyHint: {
      workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
      observedAt: new Date().toISOString(), status: 'full', running: 10, limit: 10,
    } })));
    expect(screen.getByTestId('amr-balance-dialog')).toHaveAttribute('data-balance-usd', '-3');
    expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
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
      if (url.includes('/billing/preflight?')) return jsonResponse({ preflight: homeFunding(workspace) });
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
    let nextExplicitSend = false;
    let serverVerdict: 'available' | 'insufficient' = 'insufficient';
    const confirmations: Array<{ resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
    // A real click determines when this fixture answers the new per-send read.
    // Background recovery remains explicitly controlled and never sends for us.
    const captureSend = (event: MouseEvent) => {
      if ((event.target as Element).closest?.('[data-testid="home-hero-submit"]')) nextExplicitSend = true;
    };
    document.addEventListener('click', captureSend, true);
    submitCaptureCleanups.push(() => document.removeEventListener('click', captureSend, true));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/workspace/billing/preflight?')) {
        const query = new URL(String(input), 'http://localhost').searchParams;
        expect(query.get('workspaceId')).toBe(context.workspaceId);
        expect(query.get('modelId')).toBe('default');
        reads++;
        if (reads === 1 || nextExplicitSend) {
          nextExplicitSend = false;
          return jsonResponse({ preflight: homeFunding(context, serverVerdict) });
        }
        return new Promise<Response>((resolve, reject) => confirmations.push({ resolve, reject }));
      }
      return original(input, init);
    });
    invalidateAmrFundingFeedback();
    await checkAmrFundingFeedback(context, 'default');
    const confirmResponse = (response: Response | Error) => {
      expect(confirmations.length, 'a real background confirmation must be pending').toBeGreaterThan(0);
      for (const pending of confirmations.splice(0)) {
        if (response instanceof Response) pending.resolve(response.clone());
        else pending.reject(response);
      }
    };
    return { ...h,
      fundingReads: () => reads,
      setServerVerdict: (value: 'available' | 'insufficient') => { serverVerdict = value; },
      confirm: (fundingCheck: string) => {
        if (fundingCheck === 'available' || fundingCheck === 'insufficient') serverVerdict = fundingCheck;
        confirmResponse(jsonResponse({ preflight: { ...homeFunding(context, serverVerdict), fundingCheck } }));
      },
      confirmResponse,
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

  it('warms the exact model after an available Home becomes insufficient through consumption', async () => {
    const h = harness('amr');
    await waitForWalletInMemory();
    const context = personalContext();
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) =>
      String(input).includes('/api/workspace/billing/preflight?'))).toBe(true));
    expect(cachedHomeAmrFundingBlock(context, 'default')).toBeNull();
    const original = globalThis.fetch;
    let modelReads = 0;
    globalThis.fetch = vi.fn((input, init) => {
      if (String(input).includes('/api/workspace/billing/preflight?')) {
        modelReads++;
        return Promise.resolve(jsonResponse({ preflight: homeFunding(context, 'insufficient') }));
      }
      return original(input, init);
    }) as typeof fetch;
    const handlers = [...vi.mocked(useWorkspaceInvalidation).mock.calls].reverse().find(
      ([registered]) => registered['team-project-content-ready'],
    )![0];
    const event = { type: 'wallet-balance-changed', workspaceId: context.workspaceId,
      workspaceMemberId: context.workspaceMemberId, revision: '3', eventId: 'consumed' };
    await act(async () => { handlers['wallet-balance-changed']!(event as never); });
    await waitFor(() => expect(cachedHomeAmrFundingBlock(context, 'default')).not.toBeNull());
    expect(modelReads).toBe(1);
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    await submitHome('Hold this draft after consumption.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onCreateProject).not.toHaveBeenCalled();
  });

  it.each(['sse-first', 'billing-first', 'billing-after-proof', 'distinct-revision'] as const)(
    'coalesces %s consumption with its zero-wallet billing publication without clearing the confirmed reason', async (order) => {
    const context = personalContext();
    const baseFetch = globalThis.fetch;
    let balance = '20.00';
    globalThis.fetch = vi.fn((input, init) => {
      if (String(input).includes('/api/workspace/billing?')) {
        billingReads++;
        return Promise.resolve(jsonResponse({ summary: null, workspaceBalance: {
          workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
          balanceUsd: balance, billingScopeVersion: 2, expiresAt: null,
          updatedAt: new Date().toISOString(),
        }, workspaceSnapshot: {
          schemaVersion: 1, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
          billingScopeVersion: 2, billing: { billingState: 'active', planId: 'personal_pro' },
          wallet: { balanceUsd: balance, expiresAt: null, updatedAt: new Date().toISOString() },
          revisions: { billing: 'billing-unchanged', wallet: balance === '0.00' ? 'exhausted' : 'before' },
        } }));
      }
      return baseFetch(input, init);
    }) as typeof fetch;
    const h = harness('amr');
    await waitForWalletInMemory();
    await checkAmrFundingFeedback(context, 'default');
    expect(cachedHomeAmrFundingBlock(context, 'default')).toBeNull();
    balance = '0.00';
    const original = globalThis.fetch;
    const releaseWarm: Array<(response: Response) => void> = [];
    let modelReads = 0;
    globalThis.fetch = vi.fn((input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/workspace/billing/preflight' && url.searchParams.get('modelId') === 'default') {
        modelReads++;
        return new Promise<Response>(resolve => { releaseWarm.push(resolve); });
      }
      return original(input, init);
    }) as typeof fetch;
    const entry = [...vi.mocked(useWorkspaceInvalidation).mock.calls].reverse().find(
      ([registered]) => registered['team-project-content-ready'],
    )![0];
    const event = { type: 'wallet-balance-changed', workspaceId: context.workspaceId,
      workspaceMemberId: context.workspaceMemberId,
      revision: order === 'distinct-revision' ? 'newer-wallet-change' : 'exhausted', eventId: 'exhausted' };
    const beforeBilling = billingReads;
    const publishBilling = async () => {
      // The billing hook publishes the matching wallet projection while the
      // exact-model warm is in flight. The two arrival orders share one proof.
      const now = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1_000);
      try {
        await act(async () => window.dispatchEvent(new Event('pageshow')));
        await waitFor(() => expect(billingReads).toBeGreaterThan(beforeBilling));
      } finally { now.mockRestore(); }
    };
    const publishSse = async () => {
      await act(async () => { entry['wallet-balance-changed']!(event as never); });
    };
    if (order === 'sse-first') {
      await publishSse();
      await waitFor(() => expect(modelReads).toBe(1));
      await publishBilling();
    } else {
      await publishBilling();
      await waitFor(() => expect(modelReads).toBe(1));
      if (order === 'billing-after-proof') {
        await act(async () => releaseWarm[0]!(jsonResponse({ preflight: homeFunding(context, 'insufficient') })));
        await waitFor(() => expect(recentHomeAmrFundingInsufficiency(context, 'default')).not.toBeNull());
      }
      await publishSse();
    }
    if (order !== 'billing-after-proof') {
      await act(async () => releaseWarm[0]!(jsonResponse({ preflight: homeFunding(context, 'insufficient') })));
    }
    if (order === 'distinct-revision') {
      await waitFor(() => expect(modelReads).toBe(2));
      // A genuinely newer producer revision must be re-read, not coalesced
      // with the balance publication's earlier proof.
      await act(async () => releaseWarm[1]!(jsonResponse({ preflight: homeFunding(context, 'insufficient') })));
    }
    await waitFor(() => expect(recentHomeAmrFundingInsufficiency(context, 'default')).not.toBeNull());
    expect(modelReads).toBe(order === 'distinct-revision' ? 2 : 1);
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
  });

  it("uses this click's fresh proof after repeated focus publications without another read", async () => {
    const h = harness('amr');
    await waitForWalletInMemory();
    const context = personalContext();
    const original = globalThis.fetch;
    let release!: (response: Response) => void;
    let reads = 0;
    globalThis.fetch = vi.fn((input, init) => {
      if (String(input).includes('/api/workspace/billing/preflight?')) {
        reads++;
        return new Promise<Response>(resolve => { release = resolve; });
      }
      return original(input, init);
    }) as typeof fetch;
    await submitHome('Send only from this click.');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    await act(async () => release(jsonResponse({ preflight: homeFunding(context, 'available') })));
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(reads).toBe(1);
    expect(h.calls).toEqual(['begin', 'gate', 'create']);
  });

  it('keeps #8240 on Home while current funds are loading, then shows actual insufficiency', async () => {
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
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    await waitFor(() => expect(typeof finish).toBe('function'));
    await act(async () => { finish(jsonResponse({ preflight: homeFunding(context, 'insufficient') })); });
    expect(await screen.findByTestId('amr-balance-dialog')).toBeTruthy();
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

  it('RUN-004 sends on the first explicit retry when fresh funding recovered after a recent block', async () => {
    const h = await primeHomeFunding();
    await submitHome('Retry this draft after funding returns.');
    await screen.findByTestId('amr-balance-dialog');
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    // The wallet changed, but no background read has refreshed the old 5s
    // insufficiency hint. This click must use its own fresh preflight.
    h.setServerVerdict('available');
    await submitHome('Retry this draft after funding returns.');
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.onBeginProjectCreation).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
  });

  it('RUN-004 keeps the draft blocked when the explicit retry is still unfunded', async () => {
    const h = await primeHomeFunding();
    await submitHome('Keep this unfunded retry draft.');
    await screen.findByTestId('amr-balance-dialog');
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    await submitHome('Keep this unfunded retry draft.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this unfunded retry draft.');
  });

  it('RUN-004 keeps real Link-full priority over a recovered funding read', async () => {
    const h = await primeHomeFunding();
    await submitHome('Keep this full-slot retry draft.');
    await screen.findByTestId('amr-balance-dialog');
    fireEvent.click(screen.getByTestId('amr-balance-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
    h.setServerVerdict('available');
    const context = personalContext();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/billing/request-concurrency?')
        ? Promise.resolve(jsonResponse({ requestConcurrencyHint: {
            workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId,
            status: 'full', running: 30, limit: 30, observedAt: new Date().toISOString(),
          } }))
        : original(input, init));
    await submitHome('Keep this full-slot retry draft.');
    await screen.findByTestId('amr-concurrency-dialog');
    expect(screen.queryByTestId('amr-balance-dialog')).toBeNull();
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this full-slot retry draft.');
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

  it('a post-recharge dialog resolution restores the original Home draft/file and creates nothing until a new manual Send', async () => {
    const h = await primeHomeFunding();
    const attachment = new File(['original bytes'], 'brief.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('home-hero-file-input'), { target: { files: [attachment] } });
    await submitHome('Keep this exact draft and attachment.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    await act(async () => { h.confirm('available'); });
    // Simulates the real dialog's authenticated funding-watch callback, not a
    // second user Send. Background availability must never become consent.
    fireEvent.click(screen.getByTestId('amr-balance-dialog-funded'));
    await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
    expect(h.onBeginProjectCreation).not.toHaveBeenCalled();
    expect(h.onCreateProject).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep this exact draft and attachment.');
    expect(screen.getAllByText('brief.txt').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.onCreateProject.mock.calls[0]![0]).toMatchObject({ pendingFiles: [attachment] });
  });

  it('still rechecks sign-in and continues the pending submit when authentication completes', async () => {
    const h = harness('amr');
    await waitForWalletInMemory();
    h.setGate({ kind: 'hard', reason: 'signed_out', snapshot: emptyWallet() });
    await submitHome('Continue only after sign-in.');
    await screen.findByTestId('amr-balance-dialog');
    expect(h.onCreateProject).not.toHaveBeenCalled();
    h.setGate({ kind: 'allow' });
    fireEvent.click(screen.getByTestId('amr-balance-dialog-funded'));
    await waitFor(() => expect(h.onCreateProject).toHaveBeenCalledTimes(1));
    expect(h.calls).toEqual(['begin', 'gate', 'gate', 'create']);
    expect(h.rollback).not.toHaveBeenCalled();
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
    '%s retains confirmed insufficiency without submitting', async (type) => {
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
      if (type === 'wallet-balance-changed' || type === 'coding-plan-usage-changed') {
        await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(readCount));
        // A burst coalesces model-specific preflight rather than starting a
        // request per event. It can refresh the reason, never the draft.
        expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeLessThanOrEqual(readCount + 2);
      } else {
        expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(readCount);
      }
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
        if (url.includes('/billing/preflight?')) return jsonResponse({ preflight: homeFunding(workspace) });
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
