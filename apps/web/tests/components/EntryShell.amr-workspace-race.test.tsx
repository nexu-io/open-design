// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceBillingCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { I18nProvider } from '../../src/i18n';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import { ProjectCreateError } from '../../src/state/projects';
import type { AgentInfo, AppConfig } from '../../src/types';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/runtime/amr-balance-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/amr-balance-gate')>();
  return {
    ...actual,
    checkAmrBalanceGate: vi.fn(),
  };
});

vi.mock('../../src/components/AmrBalanceDialog', () => ({
  AmrBalanceDialog: ({
    reason,
    onClose,
  }: {
    reason: 'insufficient' | 'signed_out';
    onClose: () => void;
  }) => (
    <div data-testid="amr-balance-dialog" data-reason={reason}>
      <button type="button" onClick={onClose}>Close gate</button>
    </div>
  ),
}));

const mockedCheckAmrBalanceGate = vi.mocked(checkAmrBalanceGate);
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function teamContext(workspaceId: string, workspaceMemberId: string): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
  };
}

function amrAgent(): AgentInfo {
  return {
    id: 'amr',
    name: 'OpenDesign AMR',
    bin: 'amr',
    available: true,
    models: [{ id: 'glm-5', label: 'GLM 5' }],
  };
}

function amrConfig(): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'amr',
    agentModels: { amr: { model: 'glm-5' } },
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

describe('EntryShell AMR workspace precheck race', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.sessionStorage.clear();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
    globalThis.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    mockedCheckAmrBalanceGate.mockReset();
    resetWorkspaceContextCache();
    resetWorkspaceBillingCache();
    resetTeamProjectsCache();
  });

  it.each(['get', 'set'] as const)(
    'starts the team gate from in-memory directory identity when sessionStorage %sItem fails',
    async (blockedOperation) => {
      window.history.replaceState(null, '', '/');
      if (blockedOperation === 'get') {
        const originalStorageGetItem = Storage.prototype.getItem;
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(
          this: Storage,
          key,
        ) {
          if (key === 'od.workspaceSelection.v1') {
            throw new DOMException('Storage is unavailable', 'SecurityError');
          }
          return originalStorageGetItem.call(this, key);
        });
      } else {
        const originalStorageSetItem = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(
          this: Storage,
          key,
          value,
        ) {
          if (key === 'od.workspaceSelection.v1') {
            throw new DOMException('Storage is read-only', 'QuotaExceededError');
          }
          return originalStorageSetItem.call(this, key, value);
        });
      }
      const workspace = teamContext('workspace-cold', 'member-cold');
      const contextRead = deferred<Response>();
      let directoryReads = 0;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/workspace/directory')) {
          directoryReads += 1;
          return jsonResponse(workspaceDirectoryFixture([workspace]));
        }
        if (url.endsWith('/api/workspace/context')) return contextRead.promise;
        if (url.includes('/api/workspace/billing?')) {
          return jsonResponse({ summary: null, workspaceBalance: null });
        }
        if (url.endsWith('/api/workspace/projects/team')) {
          return jsonResponse({ projects: [] });
        }
        if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
        if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
        if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
        if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
        return jsonResponse({});
      }) as typeof fetch;
      mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
      const onCreateProject = vi.fn(async () => true);

      render(
        <I18nProvider initial="en">
          <EntryShell
            skills={[]}
            designTemplates={[]}
            designSystems={[]}
            projects={[]}
            templates={[]}
            promptTemplates={[]}
            defaultDesignSystemId={null}
            connectors={[]}
            connectorsLoading={false}
            config={amrConfig()}
            agents={[amrAgent()]}
            daemonLive
            onModeChange={vi.fn()}
            onAgentChange={vi.fn()}
            onAgentModelChange={vi.fn()}
            onApiProtocolChange={vi.fn()}
            onApiModelChange={vi.fn()}
            onConfigPersist={vi.fn()}
            onRefreshAgents={vi.fn(() => [amrAgent()])}
            onCreateProject={onCreateProject}
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

      await waitFor(() => expect(directoryReads).toBe(1));
      setHomeHeroPrompt('Create a launch poster without waiting for account chrome.');
      fireEvent.click(await screen.findByTestId('home-hero-submit'));

      await waitFor(() => expect(mockedCheckAmrBalanceGate).toHaveBeenCalled());
      await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
      expect(directoryReads).toBe(1);
    },
  );

  it('opens the existing sign-in gate when the confirmed directory is empty', async () => {
    window.history.replaceState(null, '', '/');
    let directoryReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        directoryReads += 1;
        return jsonResponse(workspaceDirectoryFixture([]));
      }
      if (url.endsWith('/api/workspace/projects/team')) {
        return jsonResponse({ projects: [] });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
    mockedCheckAmrBalanceGate.mockResolvedValue({
      kind: 'hard',
      reason: 'signed_out',
      snapshot: {
        status: 'signed_out',
        profile: 'default',
        user: null,
        balanceUsd: null,
        updatedAt: null,
        fetchedAt: new Date(0).toISOString(),
        stale: false,
        source: 'unavailable',
        error: { code: 'signed_out', message: 'Sign in to view wallet balance.' },
      },
    });
    const onCreateProject = vi.fn(async () => true);

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={onCreateProject}
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

    await waitFor(() => expect(directoryReads).toBeGreaterThan(0));
    setHomeHeroPrompt('Create a poster after I sign in.');
    fireEvent.click(await screen.findByTestId('home-hero-submit'));

    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith(undefined, 'glm-5');
    });
    const dialog = await screen.findByTestId('amr-balance-dialog');
    expect(dialog.getAttribute('data-reason')).toBe('signed_out');
    expect(onCreateProject).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByText('Close gate'));
    await waitFor(() => expect(screen.queryByTestId('amr-balance-dialog')).toBeNull());
  });

  it('keeps the account-scoped gate when an unsupported daemon retains a team context', async () => {
    window.history.replaceState(null, '', '/');
    const workspace = teamContext('workspace-retained', 'member-retained');
    let directoryReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        directoryReads += 1;
        if (directoryReads === 1) {
          return jsonResponse(workspaceDirectoryFixture([workspace]));
        }
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/api/workspace/context')) {
        return jsonResponse({ context: workspace });
      }
      if (url.endsWith('/api/workspace/projects/team')) {
        return jsonResponse({ projects: [] });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={onCreateProject}
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

    await waitFor(() => expect(directoryReads).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(directoryReads).toBeGreaterThan(1));
    setHomeHeroPrompt('Create through the old daemon compatibility lane.');
    fireEvent.click(await screen.findByTestId('home-hero-submit'));

    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenCalledWith(undefined, 'glm-5');
    });
    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
  });

  it('rejects an unsupported-daemon submit when identity refreshes during balance retry', async () => {
    window.history.replaceState(null, '', '/');
    let directoryReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        directoryReads += 1;
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;
    mockedCheckAmrBalanceGate
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={onCreateProject}
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

    await waitFor(() => expect(directoryReads).toBeGreaterThan(0));
    setHomeHeroPrompt('Do not cross an identity refresh.');
    const submitButton = await screen.findByTestId('home-hero-submit');
    vi.useFakeTimers();
    fireEvent.click(submitButton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1);

    act(() => notifyWorkspaceContextRefresh());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
      await Promise.resolve();
    });

    expect(onCreateProject).not.toHaveBeenCalled();
  });

  it('keeps one Home submit loading until a transient team billing read recovers', async () => {
    window.history.replaceState(null, '', '/');
    const workspace = teamContext('workspace-a', 'member-a');
    let contextReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspace]));
      }
      if (url.endsWith('/api/workspace/context')) {
        contextReads += 1;
        return jsonResponse({ context: workspace });
      }
      if (url.includes('/api/workspace/billing?')) {
        return jsonResponse({ summary: null, workspaceBalance: null });
      }
      if (url.endsWith('/api/workspace/projects/team')) {
        return jsonResponse({ projects: [] });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;

    mockedCheckAmrBalanceGate
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={onCreateProject}
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

    await waitFor(() => expect(contextReads).toBeGreaterThan(0));
    const submitButton = await screen.findByTestId('home-hero-submit');
    setHomeHeroPrompt('Create an image of a quiet reading room.');
    await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false));
    vi.useFakeTimers();
    fireEvent.click(submitButton);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('home-hero-submit').getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(2);
    expect(onCreateProject).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(mockedCheckAmrBalanceGate).toHaveBeenCalledTimes(3);
    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it('moves a locally signed-in account from initial syncing to compact auto recovery', async () => {
    window.history.replaceState(null, '', '/');
    const workspace = teamContext('workspace-a', 'member-a');
    const contextFailure = deferred<Response>();
    let contextReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspace]));
      }
      if (url.endsWith('/api/workspace/context')) {
        contextReads += 1;
        return contextFailure.promise;
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          amrLoggedIn
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={vi.fn()}
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

    expect(await screen.findByTestId('entry-rail-account-sync-tip')).toBeTruthy();
    expect(contextReads).toBe(1);

    await act(async () => {
      contextFailure.resolve(new Response(null, { status: 503 }));
      await contextFailure.promise;
      await Promise.resolve();
    });

    expect(screen.queryByTestId('entry-cloud-signin-tip')).toBeNull();
    expect(screen.getByTestId('entry-rail-account-recovery-tip')).toBeTruthy();
  });

  it('returns a definitively expired Cloud session to the existing sign-in gate', async () => {
    window.history.replaceState(null, '', '/');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return new Response(JSON.stringify({ error: 'unauthenticated' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          amrLoggedIn
          amrSessionState="reauth_required"
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={vi.fn()}
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

    expect(
      await screen.findByRole('heading', { name: 'Sign in to OpenDesign' }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe('/onboarding');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('returns a submit-time auth rejection to sign-in without losing the Home draft', async () => {
    window.history.replaceState(null, '', '/');
    const workspace = teamContext('workspace-auth', 'member-auth');
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspace]));
      }
      if (url.endsWith('/api/workspace/context')) return jsonResponse({ context: workspace });
      if (url.includes('/api/workspace/billing?')) {
        return jsonResponse({
          summary: null,
          workspaceBalance: {
            billingScopeVersion: 2,
            workspaceId: workspace.workspaceId,
            workspaceMemberId: workspace.workspaceMemberId,
            balanceUsd: '25.00',
            expiresAt: null,
            updatedAt: null,
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
    mockedCheckAmrBalanceGate.mockResolvedValue({ kind: 'allow' });
    const onCreateProject = vi.fn().mockRejectedValue(new ProjectCreateError(
      'Cloud sign-in expired',
      401,
      'AMR_AUTH_REQUIRED',
      false,
      'request-expired',
    ));

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          amrLoggedIn
          amrSessionState="authenticated"
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={onCreateProject}
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

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Keep this draft through Cloud reauthentication');
    const submitButton = await screen.findByTestId('home-hero-submit');
    await waitFor(() => expect((submitButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submitButton);

    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
    expect(
      await screen.findByRole('heading', { name: 'Sign in to OpenDesign' }),
    ).toBeTruthy();
    expect(window.localStorage.getItem('open-design:home-composer:prompt')).toBe(
      'Keep this draft through Cloud reauthentication',
    );
  });

  it('rechecks workspace B when the workspace switches after workspace A passes the gate', async () => {
    window.history.replaceState(null, '', '/');
    const workspaceA = teamContext('workspace-a', 'member-a');
    const workspaceB = teamContext('workspace-b', 'member-b');
    let currentContext = workspaceA;
    let contextReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([workspaceA, workspaceB]));
      }
      if (url.endsWith('/api/workspace/context')) {
        contextReads += 1;
        return jsonResponse({ context: currentContext });
      }
      if (url.includes('/api/workspace/billing?')) {
        return jsonResponse({
          summary: null,
          workspaceBalance: {
            billingScopeVersion: 2,
            workspaceId: currentContext.workspaceId,
            workspaceMemberId: currentContext.workspaceMemberId,
            balanceUsd: '25.00',
            expiresAt: null,
            updatedAt: null,
          },
        });
      }
      if (url.endsWith('/api/workspace/projects/team')) {
        return jsonResponse({ projects: [] });
      }
      if (url.endsWith('/api/plugins')) return jsonResponse({ plugins: [] });
      if (url.endsWith('/api/mcp/servers')) return jsonResponse({ servers: [] });
      if (url.endsWith('/api/community/discord')) return jsonResponse({ stale: true });
      if (url.endsWith('/api/github/open-design')) return jsonResponse({ stale: true });
      return jsonResponse({});
    }) as typeof fetch;

    const gateA = deferred<{ kind: 'allow' }>();
    mockedCheckAmrBalanceGate
      .mockImplementationOnce(() => gateA.promise)
      .mockResolvedValueOnce({ kind: 'allow' });
    const onCreateProject = vi.fn(async () => true);

    render(
      <I18nProvider initial="en">
        <EntryShell
          skills={[]}
          designTemplates={[]}
          designSystems={[]}
          projects={[]}
          templates={[]}
          promptTemplates={[]}
          defaultDesignSystemId={null}
          connectors={[]}
          connectorsLoading={false}
          config={amrConfig()}
          agents={[amrAgent()]}
          daemonLive
          onModeChange={vi.fn()}
          onAgentChange={vi.fn()}
          onAgentModelChange={vi.fn()}
          onApiProtocolChange={vi.fn()}
          onApiModelChange={vi.fn()}
          onConfigPersist={vi.fn()}
          onRefreshAgents={vi.fn(() => [amrAgent()])}
          onCreateProject={onCreateProject}
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

    await waitFor(() => expect(contextReads).toBeGreaterThan(0));
    setHomeHeroPrompt('Build a workspace-scoped landing page');
    const submit = await screen.findByTestId('home-hero-submit');
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenNthCalledWith(1, {
        workspaceType: 'team',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
      }, 'glm-5');
    });

    currentContext = workspaceB;
    act(() => notifyWorkspaceContextRefresh({ context: workspaceB }));
    await act(async () => {
      gateA.resolve({ kind: 'allow' });
      await gateA.promise;
    });

    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenNthCalledWith(2, {
        workspaceType: 'team',
        workspaceId: 'workspace-b',
        workspaceMemberId: 'member-b',
      }, 'glm-5');
    });
    await waitFor(() => expect(onCreateProject).toHaveBeenCalledTimes(1));
    expect(onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        amrGatePrecheckWitness: {
          workspaceType: 'team',
          workspaceId: 'workspace-b',
          workspaceMemberId: 'member-b',
        },
      }),
    );
  });
});
