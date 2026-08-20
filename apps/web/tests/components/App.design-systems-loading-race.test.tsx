// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DesignSystemSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  loadConfig,
  mergeDaemonConfig,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
} from '../../src/state/config';
import { listProjects, listTemplates } from '../../src/state/projects';
import type { AppConfig } from '../../src/types';
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

const workspaceInvalidationHarness = vi.hoisted(() => ({
  handlers: [] as Array<Record<string, (payload: any) => void>>,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((handlers: Record<string, (payload: any) => void>) => {
    workspaceInvalidationHarness.handlers.push(handlers);
    return { connected: false };
  }),
}));

vi.mock('../../src/router', () => ({
  navigate: vi.fn(),
  useRoute: () => ({ kind: 'home' as const, view: 'design-systems' as const }),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    designSystems,
    designSystemsLoading,
  }: {
    designSystems: DesignSystemSummary[];
    designSystemsLoading?: boolean;
  }) => (
    <div
      data-testid="design-systems-state"
      data-loading={designSystemsLoading ? 'true' : 'false'}
    >
      {designSystems.map((system) => (
        <span key={system.id}>{system.title}</span>
      ))}
    </div>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <div>Project view</div>,
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    daemonIsLive: vi.fn(),
    fetchAgentsStream: vi.fn(),
    fetchAppVersionInfo: vi.fn(),
    fetchDesignSystems: vi.fn(),
    fetchDesignTemplates: vi.fn(),
    fetchPromptTemplates: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    listProjects: vi.fn(),
    listTemplates: vi.fn(),
  };
});

vi.mock('../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/config')>(
    '../../src/state/config',
  );
  return {
    ...actual,
    fetchComposioConfigFromDaemon: vi.fn(),
    fetchDaemonConfig: vi.fn(),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn(),
    syncConfigToDaemon: vi.fn(),
  };
});

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  privacyDecisionAt: 1778244000000,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
};

const readySystem: DesignSystemSummary = {
  id: 'user:ready',
  title: 'Ready design system',
  category: 'Custom',
  summary: 'Loaded from the successful workspace-scoped request.',
  surface: 'web',
  source: 'user',
  status: 'published',
  isEditable: true,
};

function workspaceContext(workspaceId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: `member-${workspaceId}`,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: false,
      canManageSharedResources: false,
    },
    displayName: workspaceId,
  };
}

function designSystem(id: string): DesignSystemSummary {
  return {
    ...readySystem,
    id,
    title: id,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  resetCoalescedGet();
  workspaceInvalidationHarness.handlers.length = 0;
  vi.mocked(daemonIsLive).mockResolvedValue(true);
  vi.mocked(fetchAgentsStream).mockResolvedValue([]);
  vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
  vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
  vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
  vi.mocked(fetchSkills).mockResolvedValue([]);
  vi.mocked(listProjects).mockResolvedValue([]);
  vi.mocked(listTemplates).mockResolvedValue([]);
  vi.mocked(fetchDaemonConfig).mockResolvedValue({});
  vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
  vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
  vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
  vi.mocked(syncConfigToDaemon).mockResolvedValue(undefined);
  vi.mocked(syncComposioConfigToDaemon).mockResolvedValue(true);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  resetWorkspaceContextCache();
  workspaceInvalidationHarness.handlers.length = 0;
  resetTeamProjectsCache();
  resetCoalescedGet();
});

describe('App design-system catalog loading race', () => {
  it('waits for the newest concurrent initial catalog request and ignores an older success', async () => {
    const newest = deferred<DesignSystemSummary[]>();
    vi.mocked(fetchDesignSystems)
      // The first request is stale once bootstrap starts its same-identity
      // successor, so its result must not flash before the newest read lands.
      .mockResolvedValueOnce([readySystem])
      .mockReturnValue(newest.promise);

    render(<App />);

    await waitFor(() => {
      expect(vi.mocked(fetchDesignSystems).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByText('Ready design system')).toBeNull();
    expect(screen.getByTestId('design-systems-state').dataset.loading).toBe('true');

    await act(async () => {
      newest.resolve([designSystem('newest-design-system')]);
      await newest.promise;
    });
    await waitFor(() => expect(screen.getByText('newest-design-system')).toBeTruthy());
    expect(screen.getByTestId('design-systems-state').dataset.loading).toBe('false');
  });

  it('discards a late catalog response for the workspace the user has left', async () => {
    const readA = deferred<DesignSystemSummary[]>();
    const readB = deferred<DesignSystemSummary[]>();
    const readC = deferred<DesignSystemSummary[]>();
    let activeContext = workspaceContext('ws-initial');
    type ReadPhase = 'startup' | 'a' | 'b' | 'c';
    let phase: ReadPhase = 'startup';
    const readPhases: ReadPhase[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/context')
              ? { context: activeContext }
              : {},
        } as Response;
      }),
    );
    notifyWorkspaceContextRefresh({ context: activeContext });
    vi.mocked(fetchDesignSystems).mockImplementation(() => {
      readPhases.push(phase);
      if (phase === 'a') return readA.promise;
      if (phase === 'b') return readB.promise;
      if (phase === 'c') return readC.promise;
      return Promise.resolve([]);
    });

    render(<App />);

    // Let the initial stream/fallback-owned read settle before creating the
    // identity race. The old eager bootstrap/home reads were intentionally
    // removed, so startup no longer needs three duplicate snapshots.
    await waitFor(() =>
      expect(readPhases.filter((readPhase) => readPhase === 'startup').length)
        .toBeGreaterThanOrEqual(2),
    );

    phase = 'a';
    await act(async () => {
      activeContext = workspaceContext('ws-a');
      notifyWorkspaceContextRefresh({ context: activeContext });
      await Promise.resolve();
    });
    await waitFor(() => expect(readPhases.filter((readPhase) => readPhase === 'a')).toHaveLength(1));

    phase = 'b';
    await act(async () => {
      activeContext = workspaceContext('ws-b');
      notifyWorkspaceContextRefresh({ context: activeContext });
      await Promise.resolve();
    });
    await waitFor(() => expect(readPhases.filter((readPhase) => readPhase === 'b')).toHaveLength(1));

    // Resolve in reverse order: the active workspace lands first.
    await act(async () => {
      readB.resolve([designSystem('system-from-b')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('system-from-b')).toBeTruthy());

    // The abandoned workspace answers last and must not overwrite ws-b.
    await act(async () => {
      readA.resolve([designSystem('system-from-a')]);
      await Promise.resolve();
    });

    expect(screen.getByText('system-from-b')).toBeTruthy();
    expect(screen.queryByText('system-from-a')).toBeNull();

    // Moving again must fail closed immediately: while C is still loading, B's
    // catalog must not paint under the new Workspace identity.
    phase = 'c';
    await act(async () => {
      activeContext = workspaceContext('ws-c');
      notifyWorkspaceContextRefresh({ context: activeContext });
      await Promise.resolve();
    });
    await waitFor(() => expect(readPhases.filter((readPhase) => readPhase === 'c')).toHaveLength(1));
    expect(screen.queryByText('system-from-b')).toBeNull();

    await act(async () => {
      readC.resolve([designSystem('system-from-c')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('system-from-c')).toBeTruthy());
    // One request per switch; the guard does not add a retry or another read.
    expect(readPhases.filter((readPhase) => readPhase !== 'startup')).toEqual(['a', 'b', 'c']);
  });

  it('reissues and isolates catalog reads when membership identity changes', async () => {
    const memberARead = deferred<DesignSystemSummary[]>();
    const memberBRead = deferred<DesignSystemSummary[]>();
    let activeContext = workspaceContext('ws-initial');
    let pendingPhase = false;
    let pendingReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/context')
              ? { context: activeContext }
              : {},
        } as Response;
      }),
    );
    notifyWorkspaceContextRefresh({ context: activeContext });
    vi.mocked(fetchDesignSystems).mockImplementation((context) => {
      if (!pendingPhase) return Promise.resolve([]);
      pendingReads += 1;
      return context?.workspaceMemberId === 'member-a'
        ? memberARead.promise
        : memberBRead.promise;
    });

    render(<App />);
    await waitFor(() => expect(fetchDesignSystems).toHaveBeenCalled());

    pendingPhase = true;
    activeContext = {
      ...workspaceContext('ws-shared'),
      workspaceMemberId: 'member-a',
    };
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: activeContext });
      await Promise.resolve();
    });
    await waitFor(() => expect(pendingReads).toBe(1));

    // The daemon verifies both Workspace and membership identity. A transition
    // to another membership in the same Workspace must issue a new request and
    // prevent the old membership's response from committing.
    activeContext = {
      ...activeContext,
      workspaceMemberId: 'member-b',
      permissions: {
        ...activeContext.permissions,
        canShareProjects: false,
      },
    };
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: activeContext });
      await Promise.resolve();
    });
    await waitFor(() => expect(pendingReads).toBe(2));

    await act(async () => {
      memberARead.resolve([designSystem('system-from-member-a')]);
      await Promise.resolve();
    });
    expect(screen.queryByText('system-from-member-a')).toBeNull();

    await act(async () => {
      memberBRead.resolve([designSystem('system-from-member-b')]);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('system-from-member-b')).toBeTruthy());
    expect(screen.getByTestId('design-systems-state').dataset.loading).toBe('false');
    expect(pendingReads).toBe(2);
  });

  it('hides the previous account systems while an unseeded identity refresh is pending', async () => {
    const sharedContext = {
      ...workspaceContext('ws-same'),
      workspaceMemberId: 'member-same',
    };
    const directoryB = deferred<Response>();
    const contextB = deferred<Response>();
    const readB = deferred<DesignSystemSummary[]>();
    let accountPhase: 'a' | 'b' = 'a';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        if (accountPhase === 'b' && pathname.endsWith('/workspace/directory')) {
          return directoryB.promise;
        }
        if (accountPhase === 'b' && pathname.endsWith('/workspace/context')) {
          return contextB.promise;
        }
        return Promise.resolve({
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? {
                  items: [{
                    workspaceId: sharedContext.workspaceId,
                    workspaceName: sharedContext.displayName,
                    workspaceType: sharedContext.workspaceType,
                    workspaceMemberId: sharedContext.workspaceMemberId,
                    role: sharedContext.role,
                    memberStatus: sharedContext.memberStatus,
                    lifecycleState: sharedContext.lifecycleState,
                  }],
                }
              : pathname.endsWith('/workspace/context')
                ? { context: sharedContext }
                : {},
        } as Response);
      }),
    );
    vi.mocked(fetchDesignSystems).mockImplementation(() =>
      accountPhase === 'a'
        ? Promise.resolve([designSystem('system-from-account-a')])
        : readB.promise,
    );

    render(<App />);
    await waitFor(() => expect(screen.getByText('system-from-account-a')).toBeTruthy());

    accountPhase = 'b';
    await act(async () => {
      notifyWorkspaceContextRefresh();
      await Promise.resolve();
    });

    expect(screen.queryByText('system-from-account-a')).toBeNull();
    expect(screen.getByTestId('design-systems-state').dataset.loading).toBe('true');

    await act(async () => {
      directoryB.resolve({
        ok: true,
        json: async () => ({
          items: [{
            workspaceId: sharedContext.workspaceId,
            workspaceName: sharedContext.displayName,
            workspaceType: sharedContext.workspaceType,
            workspaceMemberId: sharedContext.workspaceMemberId,
            role: sharedContext.role,
            memberStatus: sharedContext.memberStatus,
            lifecycleState: sharedContext.lifecycleState,
          }],
        }),
      } as Response);
      contextB.resolve({
        ok: true,
        json: async () => ({ context: sharedContext }),
      } as Response);
      await Promise.all([directoryB.promise, contextB.promise]);
    });
    await waitFor(() => expect(vi.mocked(fetchDesignSystems).mock.calls.length).toBeGreaterThan(1));

    await act(async () => {
      readB.resolve([designSystem('system-from-account-b')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('system-from-account-b')).toBeTruthy());
    expect(screen.queryByText('system-from-account-a')).toBeNull();
  });

  it('keeps the newest same-identity design-system refresh when an older request finishes last', async () => {
    const context = workspaceContext('ws-same-identity');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([context])
              : pathname.endsWith('/workspace/context')
                ? { context }
                : {},
        } as Response;
      }),
    );
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    render(<App />);
    await waitFor(() => {
      expect(vi.mocked(fetchDesignSystems)).toHaveBeenCalled();
      expect(screen.getByTestId('design-systems-state').dataset.loading).toBe('false');
    });

    const older = deferred<DesignSystemSummary[]>();
    const newer = deferred<DesignSystemSummary[]>();
    vi.mocked(fetchDesignSystems)
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const resourceHandler = [...workspaceInvalidationHarness.handlers]
      .reverse()
      .find((handlers) => handlers['team-resources-changed'])?.['team-resources-changed'];
    expect(resourceHandler).toBeTypeOf('function');

    act(() => resourceHandler?.({
      type: 'team-resources-changed',
      resourceKind: 'design_system',
    }));
    act(() => resourceHandler?.({
      type: 'team-resources-changed',
      resourceKind: 'design_system',
    }));
    await waitFor(() => expect(vi.mocked(fetchDesignSystems).mock.calls.length).toBeGreaterThanOrEqual(4));
    expect(vi.mocked(fetchDesignSystems).mock.calls.slice(-2)).toEqual([
      [expect.objectContaining({ workspaceId: context.workspaceId }), {
        forceTeamMaterialization: true,
      }],
      [expect.objectContaining({ workspaceId: context.workspaceId }), {
        forceTeamMaterialization: true,
      }],
    ]);

    await act(async () => {
      newer.resolve([designSystem('newer-system')]);
      await newer.promise;
    });
    await waitFor(() => expect(screen.getByText('newer-system')).toBeTruthy());

    await act(async () => {
      older.resolve([designSystem('older-system')]);
      await older.promise;
    });
    expect(screen.getByText('newer-system')).toBeTruthy();
    expect(screen.queryByText('older-system')).toBeNull();
  });
});
