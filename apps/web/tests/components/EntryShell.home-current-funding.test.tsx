// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryShellWithGateHost } from '../helpers/entry-shell-gate-host';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { I18nProvider } from '../../src/i18n';
import { notifyWorkspaceContextRefresh, resetTeamProjectsCache, resetWorkspaceBillingCache, resetWorkspaceContextCache } from '../../src/collab/useWorkspaceContext';
import { advanceWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import { invalidateAmrFundingFeedback } from '../../src/runtime/amr-funding-feedback';
import type { AgentInfo, AppConfig } from '../../src/types';

const concurrencyAnalytics = vi.hoisted(() => ({ track: vi.fn() }));
beforeEach(() => concurrencyAnalytics.track.mockClear());
vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ ...actual.useAnalytics(), track: concurrencyAnalytics.track }) };
});
function concurrencyViews() {
  return concurrencyAnalytics.track.mock.calls.filter(([event, props]) => event === 'surface_view' && props.area === 'concurrency_limit_dialog');
}
vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>()), checkAmrBalanceGate: vi.fn(),
}));
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
function response(value: unknown) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }
function context(id: string): WorkspaceCollabContext {
  return { workspaceId: id, workspaceMemberId: `${id}-owner`, workspaceType: 'team', role: 'owner', memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: 'team_go', providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }), permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }) };
}
const agent: AgentInfo = { id: 'amr', name: 'AMR', bin: 'amr', available: true, models: [{ id: 'glm-5', label: 'GLM 5' }] };
const config: AppConfig = { mode: 'daemon', agentId: 'amr', agentModels: { amr: { model: 'glm-5' } }, apiProtocol: 'anthropic', apiProtocolConfigs: {}, apiKey: '', baseUrl: '', model: '', skillId: null, designSystemId: null, theme: 'system' };
function preflight(ctx: WorkspaceCollabContext, fundingCheck: 'available' | 'insufficient' | 'unknown', balanceUsd: string) {
  return { schemaVersion: 1, workspaceId: ctx.workspaceId, workspaceMemberId: ctx.workspaceMemberId, modelId: 'glm-5', generatedAt: new Date().toISOString(), balanceUsd, modelCovered: true, fundingCheck, funding: balanceUsd === '0' && fundingCheck === 'available' ? 'coding_plan' : 'gateway', codingPlan: { workspaceId: ctx.workspaceId, generatedAt: new Date().toISOString(), eligible: true, tier: 'go', windows: [{ policyId: 'window', durationSeconds: 18000, resetMode: 'anchored_recurring', usedCredits: fundingCheck === 'available' ? '0' : '100', limitCredits: '100', remainingCredits: fundingCheck === 'available' ? '100' : '0', windowStart: new Date().toISOString(), resetsAt: new Date(Date.now() + 18000_000).toISOString() }] } };
}

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as typeof ResizeObserver;
  window.localStorage.clear(); window.sessionStorage.clear(); window.history.replaceState(null, '', '/');
  resetWorkspaceContextCache(); resetWorkspaceBillingCache(); resetTeamProjectsCache(); invalidateAmrFundingFeedback();
  vi.mocked(checkAmrBalanceGate).mockResolvedValue({ kind: 'allow' });
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; globalThis.ResizeObserver = originalResizeObserver; vi.mocked(checkAmrBalanceGate).mockReset(); resetWorkspaceContextCache(); resetWorkspaceBillingCache(); resetTeamProjectsCache(); invalidateAmrFundingFeedback(); });

describe('D0 gen53 / client VIEW-015 and RUN-003 current Home funding', () => {
  it.each([
    { decision: 'insufficient', mutation: 'none' },
    { decision: 'unknown', mutation: 'none' },
    { decision: 'available', mutation: 'none' },
    { decision: 'available', mutation: 'prompt' },
    { decision: 'available', mutation: 'file' },
    { decision: 'available', mutation: 'workspace' },
    { decision: 'available', mutation: 'account' },
    { decision: 'insufficient', mutation: 'late-display' },
  ] as const)('A 100 USD → loading B zero cash ($decision, $mutation): current funds precede project handoff', async ({ decision, mutation }) => {
    const a = context(`gen53-A-${decision}-${mutation}`), b = context(`gen53-B-${decision}-${mutation}`);
    let current = a, aReads = 0, sent = false;
    const firstAction = deferred<'funding' | 'begin'>();
    const bFunding: Array<(r: Response) => void> = [];
    const displayB = deferred<Response>();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return response(workspaceDirectoryFixture([a, b]));
      if (url.endsWith('/api/workspace/context')) return response({ context: current });
      if (url.includes('/billing/preflight?')) {
        if (url.includes(encodeURIComponent(a.workspaceId))) { aReads++; return response({ preflight: preflight(a, 'available', '100') }); }
        if (sent) firstAction.resolve('funding');
        return new Promise<Response>((resolve) => bFunding.push(resolve));
      }
      if (url.includes('/billing/request-concurrency?')) return response({});
      if (url.includes('/api/workspace/billing?')) {
        if (current === b) return displayB.promise;
        return response({ summary: null, workspaceBalance: { workspaceId: a.workspaceId, workspaceMemberId: a.workspaceMemberId, balanceUsd: '100', billingScopeVersion: 2, expiresAt: null, updatedAt: null } });
      }
      if (url.endsWith('/api/workspace/projects/team')) return response({ projects: [] });
      if (url.endsWith('/api/plugins')) return response({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return response({ servers: [] });
      return response({ stale: true });
    }) as typeof fetch;
    const begin = vi.fn(() => { if (sent) firstAction.resolve('begin'); return { projectId: 'should-only-exist-after-proof', rollback: vi.fn() }; });
    const create = vi.fn(async (_input: unknown) => true);
    render(<I18nProvider initial="en"><EntryShellWithGateHost skills={[]} designTemplates={[]} designSystems={[]} projects={[]} templates={[]} promptTemplates={[]} defaultDesignSystemId={null} connectors={[]} connectorsLoading={false} config={config} agents={[agent]} daemonLive onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()} onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onConfigPersist={vi.fn()} onRefreshAgents={vi.fn(() => [agent])} onCreateProject={create} onBeginProjectCreation={begin} onCreatePluginShareProject={vi.fn()} onImportClaudeDesign={vi.fn()} onOpenProject={vi.fn()} onOpenLiveArtifact={vi.fn()} onDeleteProject={vi.fn()} onRenameProject={vi.fn()} onChangeDefaultDesignSystem={vi.fn()} onPersistComposioKey={vi.fn()} onOpenSettings={vi.fn()} onCompleteOnboarding={vi.fn()} /></I18nProvider>);
    await waitFor(() => expect(aReads).toBeGreaterThan(0));
    current = b;
    act(() => notifyWorkspaceContextRefresh({ context: b }));
    await waitFor(() => expect(bFunding.length).toBeGreaterThan(0));
    const file = new File(['exact original bytes'], 'home.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByTestId('home-hero-file-input'), { target: { files: [file] } });
    setHomeHeroPrompt('Keep the B draft and file at Home');
    await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
    sent = true;
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    // Observe the first real boundary, with no sleep: the old implementation
    // invokes App's optimistic handoff before starting a current B funding read.
    expect(await firstAction.promise).toBe('funding');
    expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    if (mutation === 'prompt') {
      setHomeHeroPrompt('New draft typed while funding is pending');
      await waitFor(() => expect(screen.getByTestId('home-hero-input')).toHaveTextContent('New draft typed while funding is pending'));
    }
    if (mutation === 'file') {
      fireEvent.change(screen.getByTestId('home-hero-file-input'), { target: { files: [new File(['new bytes'], 'new-file.txt', { type: 'text/plain' })] } });
      await screen.findByText('new-file.txt');
    }
    if (mutation === 'workspace') {
      current = a;
      act(() => notifyWorkspaceContextRefresh({ context: a }));
    }
    if (mutation === 'account') act(() => { advanceWorkspaceAccountGeneration('gen53-account-changed'); });
    if (mutation === 'late-display') {
      await act(async () => { displayB.resolve(response({ summary: null, workspaceBalance: { workspaceId: a.workspaceId, workspaceMemberId: a.workspaceMemberId, balanceUsd: '100', billingScopeVersion: 2, expiresAt: null, updatedAt: null } })); });
    }
    await act(async () => { for (const resolve of bFunding) resolve(response({ preflight: preflight(b, decision, '0') })); });
    if (decision === 'available' && mutation === 'none') {
      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(begin).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0]?.[0]).toMatchObject({ pendingPrompt: 'Keep the B draft and file at Home', pendingFiles: [file] });
    } else {
      if (decision === 'insufficient') await screen.findByTestId('amr-balance-dialog');
      else await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
      expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent(mutation === 'prompt' ? 'New draft typed while funding is pending' : 'Keep the B draft and file at Home');
      if (mutation === 'file') expect(screen.getByText('new-file.txt')).toBeInTheDocument();
    }
  });
});

describe('client RUN-003 parallel authoritative Home reads', () => {
  it.each([
    'full with pending funding',
    'full with rejected funding',
    'counter failure keeps authoritative funding',
    'counter rejection keeps authoritative funding',
    'available starts once',
    'insufficient keeps the draft',
    'workspace changes before the counter resolves',
    'model changes before the counter resolves',
    'account changes before the counter resolves',
  ] as const)('%s', async (scenario) => {
    const a = context(`parallel-A-${scenario}`), b = context(`parallel-B-${scenario}`);
    const counter = deferred<Response>();
    let rejectFunding!: (reason: Error) => void;
    let resolveFunding!: (value: Response) => void;
    const funding = new Promise<Response>((resolve, reject) => { resolveFunding = resolve; rejectFunding = reject; });
    let current = a, sent = false, backgroundReads = 0, sendFundingReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return response(workspaceDirectoryFixture([a, b]));
      if (url.endsWith('/api/workspace/context')) return response({ context: current });
      if (url.includes('/billing/request-concurrency?')) return counter.promise;
      if (url.includes('/billing/preflight?')) {
        if (sent) { sendFundingReads++; return funding; }
        backgroundReads++;
        return response({ preflight: preflight(a, 'available', '100') });
      }
      if (url.includes('/api/workspace/billing?')) return response({ summary: null,
        workspaceBalance: { workspaceId: current.workspaceId, workspaceMemberId: current.workspaceMemberId,
          balanceUsd: '100', billingScopeVersion: 2, expiresAt: null, updatedAt: null } });
      if (url.endsWith('/api/workspace/projects/team')) return response({ projects: [] });
      if (url.endsWith('/api/plugins')) return response({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return response({ servers: [] });
      return response({ stale: true });
    }) as typeof fetch;
    const begin = vi.fn(() => ({ projectId: 'parallel-proof', rollback: vi.fn() }));
    const create = vi.fn(async (_input: unknown) => true);
    const renderHome = (selectedConfig: AppConfig) => <I18nProvider initial="en"><EntryShellWithGateHost skills={[]} designTemplates={[]} designSystems={[]} projects={[]} templates={[]} promptTemplates={[]} defaultDesignSystemId={null} connectors={[]} connectorsLoading={false} config={selectedConfig} agents={[{ ...agent, models: [...agent.models!, { id: 'other-model', label: 'Other model' }] }]} daemonLive onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()} onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onConfigPersist={vi.fn()} onRefreshAgents={vi.fn(() => [agent])} onCreateProject={create} onBeginProjectCreation={begin} onCreatePluginShareProject={vi.fn()} onImportClaudeDesign={vi.fn()} onOpenProject={vi.fn()} onOpenLiveArtifact={vi.fn()} onDeleteProject={vi.fn()} onRenameProject={vi.fn()} onChangeDefaultDesignSystem={vi.fn()} onPersistComposioKey={vi.fn()} onOpenSettings={vi.fn()} onCompleteOnboarding={vi.fn()} /></I18nProvider>;
    const view = render(renderHome(config));
    try {
      await waitFor(() => expect(backgroundReads).toBeGreaterThan(0));
      setHomeHeroPrompt('Retain my parallel-check draft');
      await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
      sent = true;
      fireEvent.click(screen.getByTestId('home-hero-submit'));
      if (scenario === 'available starts once') fireEvent.click(screen.getByTestId('home-hero-submit'));
      // The counter is deliberately unresolved: a fresh funding read must
      // already have started, without a timer or a reused positive verdict.
      await waitFor(() => expect(sendFundingReads).toBe(1));
      expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
      if (scenario === 'workspace changes before the counter resolves') {
        current = b;
        act(() => notifyWorkspaceContextRefresh({ context: b }));
      } else if (scenario === 'model changes before the counter resolves') {
        view.rerender(renderHome({ ...config, agentModels: { amr: { model: 'other-model' } } }));
      } else if (scenario === 'account changes before the counter resolves') {
        act(() => advanceWorkspaceAccountGeneration('parallel-account-replaced'));
      }
      const isFull = scenario.startsWith('full');
      if (scenario === 'counter rejection keeps authoritative funding') await act(async () => counter.reject(new Error('controlled counter transport failure')));
      else await act(async () => counter.resolve(scenario === 'counter failure keeps authoritative funding'
        ? new Response('{}', { status: 503 })
        : response({ requestConcurrencyHint: { workspaceId: a.workspaceId,
          workspaceMemberId: a.workspaceMemberId, status: isFull ? 'full' : 'available',
          running: isFull ? 10 : 0, limit: 10, observedAt: new Date().toISOString() } })));
      if (isFull) {
        // A slow/hung/failed funds read must not delay an authoritative full
        // counter, and its late completion cannot create a project or send.
        await screen.findByTestId('amr-concurrency-dialog');
        expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
        await act(async () => {
          if (scenario === 'full with rejected funding') rejectFunding(new Error('controlled failed funding transport'));
          else resolveFunding(response({ preflight: preflight(a, 'available', '100') }));
        });
        expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
      } else {
        await act(async () => resolveFunding(response({ preflight: preflight(a,
          scenario === 'insufficient keeps the draft' ? 'insufficient' : 'available',
          scenario === 'insufficient keeps the draft' ? '0' : '100') })));
        if (scenario === 'available starts once' || scenario === 'counter failure keeps authoritative funding' || scenario === 'counter rejection keeps authoritative funding') {
          await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
          expect(begin).toHaveBeenCalledTimes(1);
        } else {
          if (scenario === 'insufficient keeps the draft') await screen.findByTestId('amr-balance-dialog');
          else await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
          expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
        }
      }
      if (!create.mock.calls.length) expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Retain my parallel-check draft');
    } finally {
      // Release only this test's deferred I/O, including after a red assertion.
      await act(async () => { resolveFunding(response({ preflight: preflight(a, 'available', '100') })); counter.resolve(response({})); });
    }
  });
});

describe('F08 same-send authoritative plan before display metadata', () => {
  it.each([
    { role: 'owner', tier: 'max', expected: null },
    { role: 'owner', tier: 'pro', expected: 'plan' },
    { role: 'owner', tier: null, expected: 'plan' },
    { role: 'admin', tier: 'max', expected: null },
    { role: 'member', tier: 'max', expected: null },
  ] as const)('$role / $tier uses the current preflight while the display snapshot is pending', async ({ role, tier, expected }) => {
    const ctx = { ...context('f08-current-'+role+'-'+tier), role, planId: null,
      billingState: tier ? 'active' as const : 'free' as const,
      permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) };
    const display = deferred<Response>();
    let sent = false, backgroundReads = 0;
    const open = vi.fn(); vi.stubGlobal('open', open);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return response(workspaceDirectoryFixture([ctx]));
      if (url.endsWith('/api/workspace/context')) return response({ context: ctx });
      if (url.includes('/billing/request-concurrency?')) return response({});
      if (url.includes('/billing/preflight?')) {
        if (!sent) backgroundReads++;
        const result = preflight(ctx, sent ? 'insufficient' : 'available', sent ? '0' : '100');
        return response({ preflight: { ...result, codingPlan: { ...result.codingPlan, tier, eligible: tier !== null } } });
      }
      if (url.includes('/api/workspace/billing?')) return display.promise;
      if (url.endsWith('/api/workspace/projects/team')) return response({ projects: [] });
      if (url.endsWith('/api/plugins')) return response({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return response({ servers: [] });
      return response({ stale: true });
    }) as typeof fetch;
    const begin = vi.fn(() => ({ projectId: 'must-not-start', rollback: vi.fn() }));
    const create = vi.fn(async () => true);
    render(<I18nProvider initial="en"><EntryShellWithGateHost skills={[]} designTemplates={[]} designSystems={[]} projects={[]} templates={[]} promptTemplates={[]} defaultDesignSystemId={null} connectors={[]} connectorsLoading={false} config={{...config,agentCliEnv:{amr:{OPEN_DESIGN_AMR_PROFILE:'local'}}}} agents={[agent]} daemonLive onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()} onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onConfigPersist={vi.fn()} onRefreshAgents={vi.fn(() => [agent])} onCreateProject={create} onBeginProjectCreation={begin} onCreatePluginShareProject={vi.fn()} onImportClaudeDesign={vi.fn()} onOpenProject={vi.fn()} onOpenLiveArtifact={vi.fn()} onDeleteProject={vi.fn()} onRenameProject={vi.fn()} onChangeDefaultDesignSystem={vi.fn()} onPersistComposioKey={vi.fn()} onOpenSettings={vi.fn()} onCompleteOnboarding={vi.fn()} /></I18nProvider>);
    try {
      await waitFor(() => expect(backgroundReads).toBeGreaterThan(0));
      setHomeHeroPrompt('Keep the original fresh-plan draft');
      await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
      sent = true;
      fireEvent.click(screen.getByTestId('home-hero-submit'));
      if (role === 'owner') {
        await screen.findByTestId('amr-balance-dialog');
        if (expected) {
          fireEvent.click(screen.getByTestId('amr-balance-dialog-plans'));
          expect(open).toHaveBeenCalledOnce();
          const url = new URL(String(open.mock.calls[0]![0]));
          expect(url.searchParams.get('billing')).toBe(expected);
          expect(url.searchParams.get('workspaceId')).toBe(ctx.workspaceId);
        } else {
          // Frozen client QA r2282 / product r271: Max has no higher plan
          // and the funding dialog no longer offers auto-recharge shortcuts.
          expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
          expect(open).not.toHaveBeenCalled();
        }
      } else {
        await screen.findByTestId('amr-balance-owner-dialog');
        expect(screen.queryByTestId('amr-balance-dialog-plans')).toBeNull();
        expect(open).not.toHaveBeenCalled();
      }
      expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent('Keep the original fresh-plan draft');
      // The real first failure had display metadata arrive105ms after the
      // dialog. Control that dependency instead of sleeping for the duration.
      await act(async () => display.resolve(response({ summary: null })));
      expect(begin).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

// RUN014's plan source can settle before display metadata. Link's full hint
// must block immediately without inventing an upgrade above a proven Max.
describe('RUN014 same-send plan with a full request counter', () => {
  async function mountHome(options: {
    role: 'owner' | 'admin' | 'member';
    tier: 'go' | 'plus' | 'pro' | 'max';
    fundingForSubmit?: (ctx: WorkspaceCollabContext, submission: number) => Promise<Response>;
  }) {
    const { role, tier } = options;
    const ctx = { ...context(`run014-${role}-${tier}`), role, planId: null,
      permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }) };
    const display = deferred<Response>();
    let backgroundReads = 0, submission = 0;
    const open = vi.fn(); vi.stubGlobal('open', open);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) return response(workspaceDirectoryFixture([ctx]));
      if (url.endsWith('/api/workspace/context')) return response({ context: ctx });
      if (url.includes('/billing/request-concurrency?')) return response({ requestConcurrencyHint: {
        workspaceId: ctx.workspaceId, workspaceMemberId: ctx.workspaceMemberId,
        status: 'full', running: { go: 10, plus: 20, pro: 30, max: 50 }[tier],
        limit: { go: 10, plus: 20, pro: 30, max: 50 }[tier], observedAt: new Date().toISOString(),
      } });
      if (url.includes('/billing/preflight?')) {
        if (submission && options.fundingForSubmit) return options.fundingForSubmit(ctx, submission);
        if (!submission) backgroundReads++;
        return fundingResponse(ctx, tier);
      }
      if (url.includes('/api/workspace/billing?')) return display.promise;
      if (url.endsWith('/api/workspace/projects/team')) return response({ projects: [] });
      if (url.endsWith('/api/plugins')) return response({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return response({ servers: [] });
      return response({ stale: true });
    }) as typeof fetch;
    const begin = vi.fn(() => ({ projectId: 'must-not-start', rollback: vi.fn() }));
    const create = vi.fn(async () => true);
    render(<I18nProvider initial="en"><EntryShellWithGateHost skills={[]} designTemplates={[]} designSystems={[]} projects={[]} templates={[]} promptTemplates={[]} defaultDesignSystemId={null} connectors={[]} connectorsLoading={false} config={{...config,agentCliEnv:{amr:{OPEN_DESIGN_AMR_PROFILE:'local'}}}} agents={[agent]} daemonLive onModeChange={vi.fn()} onAgentChange={vi.fn()} onAgentModelChange={vi.fn()} onApiProtocolChange={vi.fn()} onApiModelChange={vi.fn()} onConfigPersist={vi.fn()} onRefreshAgents={vi.fn(() => [agent])} onCreateProject={create} onBeginProjectCreation={begin} onCreatePluginShareProject={vi.fn()} onImportClaudeDesign={vi.fn()} onOpenProject={vi.fn()} onOpenLiveArtifact={vi.fn()} onDeleteProject={vi.fn()} onRenameProject={vi.fn()} onChangeDefaultDesignSystem={vi.fn()} onPersistComposioKey={vi.fn()} onOpenSettings={vi.fn()} onCompleteOnboarding={vi.fn()} /></I18nProvider>);
    await waitFor(() => expect(backgroundReads).toBeGreaterThan(0));
    setHomeHeroPrompt('RUN014 exact retained text');
    fireEvent.change(screen.getByTestId('home-hero-file-input'), { target: { files: [new File(['original bytes'], 'run014.txt', { type: 'text/plain' })] } });
    const submit = async () => {
      await waitFor(() => expect(screen.getByTestId('home-hero-submit')).toBeEnabled());
      submission++;
      await act(async () => fireEvent.click(screen.getByTestId('home-hero-submit')));
      return screen.findByTestId('amr-concurrency-dialog');
    };
    const finish = async () => {
      await act(async () => display.resolve(response({ summary: null })));
      vi.unstubAllGlobals();
    };
    return { ctx, open, begin, create, submit, finish };
  }

  function fundingResponse(ctx: WorkspaceCollabContext, tier: 'go' | 'plus' | 'pro' | 'max') {
    const pf = preflight(ctx, 'available', '100');
    return response({ preflight: { ...pf, codingPlan: { ...pf.codingPlan, tier } } });
  }

  it.each([
    { role: 'owner', tier: 'go', upgrade: true },
    { role: 'owner', tier: 'plus', upgrade: true },
    { role: 'owner', tier: 'pro', upgrade: true },
    { role: 'owner', tier: 'max', upgrade: false },
    { role: 'admin', tier: 'pro', upgrade: false },
    { role: 'member', tier: 'pro', upgrade: false },
  ] as const)('$role / $tier retains the blocked turn and only offers an existing authorized upgrade', async ({ role, tier, upgrade }) => {
    const home = await mountHome({ role, tier });
    try {
      const dialog = await home.submit();
      expect(concurrencyViews().at(-1)?.[1]).toMatchObject({ page_name: 'home', stage: 'before_run' });
      expect(Boolean(screen.queryByTestId('amr-concurrency-upgrade'))).toBe(upgrade);
      if (role !== 'owner') expect(dialog).toHaveTextContent('Ask the team workspace Owner');
      if (upgrade) {
        fireEvent.click(screen.getByTestId('amr-concurrency-upgrade'));
        const target = new URL(String(home.open.mock.calls[0]?.[0]));
        expect(target.searchParams.get('workspaceId')).toBe(home.ctx.workspaceId);
        expect(target.searchParams.get('billing')).toBe('plan');
      } else expect(home.open).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('amr-concurrency-close'));
      expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent('RUN014 exact retained text');
      expect(screen.getByText('run014.txt')).toBeInTheDocument();
      expect(home.begin).not.toHaveBeenCalled(); expect(home.create).not.toHaveBeenCalled();
    } finally { await home.finish(); }
  });

  it('blocks immediately with unknown plan and never reopens after late funding resolves', async () => {
    const funding = deferred<Response>();
    const home = await mountHome({ role: 'owner', tier: 'go', fundingForSubmit: () => funding.promise });
    try {
      await home.submit(); // This must complete while funding is still unresolved.
      expect(screen.queryByTestId('amr-concurrency-upgrade')).toBeNull();
      fireEvent.click(screen.getByTestId('amr-concurrency-close'));
      await act(async () => funding.resolve(fundingResponse(home.ctx, 'go')));
      expect(screen.queryByTestId('amr-concurrency-dialog')).toBeNull();
      expect(home.open).not.toHaveBeenCalled();
      expect(home.begin).not.toHaveBeenCalled(); expect(home.create).not.toHaveBeenCalled();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent('RUN014 exact retained text');
      expect(screen.getByText('run014.txt')).toBeInTheDocument();
    } finally { await home.finish(); }
  });

  it.each([
    { first: 'max', second: 'go', upgrade: true },
    { first: 'go', second: 'max', upgrade: false },
  ] as const)('late $first proof cannot change the next $second refusal in the same workspace', async ({ first, second, upgrade }) => {
    const oldFunding = deferred<Response>();
    const home = await mountHome({ role: 'owner', tier: second,
      fundingForSubmit: async (ctx, submission) => submission === 1 ? oldFunding.promise : fundingResponse(ctx, second) });
    try {
      await home.submit();
      fireEvent.click(screen.getByTestId('amr-concurrency-close'));
      await home.submit();
      expect(Boolean(screen.queryByTestId('amr-concurrency-upgrade'))).toBe(upgrade);
      await act(async () => oldFunding.resolve(fundingResponse(home.ctx, first)));
      expect(Boolean(screen.queryByTestId('amr-concurrency-upgrade'))).toBe(upgrade);
      expect(home.open).not.toHaveBeenCalled();
      expect(home.begin).not.toHaveBeenCalled(); expect(home.create).not.toHaveBeenCalled();
      expect(screen.getByTestId('home-hero-input')).toHaveTextContent('RUN014 exact retained text');
      expect(screen.getByText('run014.txt')).toBeInTheDocument();
    } finally {
      await act(async () => oldFunding.resolve(fundingResponse(home.ctx, first)));
      await home.finish();
    }
  });
});
