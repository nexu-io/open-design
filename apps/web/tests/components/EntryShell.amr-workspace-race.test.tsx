// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    name: 'Open Design AMR',
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

  it('keeps a locally signed-in account in syncing state while Cloud is unavailable', async () => {
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
    expect(screen.getByTestId('entry-rail-account-sync-tip')).toBeTruthy();
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
    fireEvent.click(await screen.findByTestId('home-hero-submit'));
    await waitFor(() => {
      expect(mockedCheckAmrBalanceGate).toHaveBeenNthCalledWith(1, {
        workspaceType: 'team',
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
      });
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
      });
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
