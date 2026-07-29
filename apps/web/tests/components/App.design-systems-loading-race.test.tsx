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
  resetTeamProjectsCache();
  resetCoalescedGet();
});

describe('App design-system catalog loading race', () => {
  it('clears loading when any concurrent initial catalog request succeeds', async () => {
    const neverSettles = new Promise<DesignSystemSummary[]>(() => {});
    vi.mocked(fetchDesignSystems)
      // The workspace-scoped effect fires synchronously; this is the observed
      // 200 response that already supplied a usable catalog.
      .mockResolvedValueOnce([readySystem])
      // Bootstrap resumes after daemonIsLive and can restart as its nominally
      // stable dependencies settle. Those duplicate requests own the old
      // loading flag; if they stall, they must not hide the first result.
      .mockReturnValue(neverSettles);

    render(<App />);

    await waitFor(() => {
      expect(vi.mocked(fetchDesignSystems).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Ready design system')).toBeTruthy();
    });

    expect(screen.getByTestId('design-systems-state').dataset.loading).toBe('false');
  });

  it('discards a late catalog response for the workspace the user has left', async () => {
    const readA = deferred<DesignSystemSummary[]>();
    const readB = deferred<DesignSystemSummary[]>();
    let activeContext = workspaceContext('ws-initial');
    type ReadPhase = 'startup' | 'a' | 'b';
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
      return Promise.resolve([]);
    });

    render(<App />);

    // Let every pre-existing launch read settle before creating the race, so
    // call order among bootstrap and the two home effects is irrelevant.
    await waitFor(() =>
      expect(readPhases.filter((readPhase) => readPhase === 'startup').length)
        .toBeGreaterThanOrEqual(3),
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
    // One request per switch; the guard does not add a retry or another read.
    expect(readPhases.filter((readPhase) => readPhase !== 'startup')).toEqual(['a', 'b']);
  });
});
