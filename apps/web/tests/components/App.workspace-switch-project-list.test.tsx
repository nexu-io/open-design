// @vitest-environment jsdom
//
// Switching workspaces must not leave the previous workspace's projects on
// screen.
//
// Reported shape (owner, packaged client): 「在切换 workspace 时, 首页的"最近项目"
// 总是要慢一拍, 我切换过去后 首页下面的最近项目会继续显示我上个 workspace 的项目,
// 然后过一会儿再变」. The strip keeps rendering workspace A's cards under
// workspace B's identity for as long as B's list takes to arrive — which is
// worse than a spinner, because another workspace's data is presented as this
// one's.
//
// It is NOT a request-cache problem, and this test is what rules that out: it
// mocks `listProjects` outright, so `coalescedGet` never runs, and the previous
// workspace's card still rendered. The read the home strip goes through is
// `App.projects` ← `reconcileFetchedProjects` ← `listCurrentWorkspaceProjects`
// ← `listProjects({ workspaceContext })` → `listWorkspaceProjectSummaries`,
// whose coalesce key already carries workspaceId + memberId + role +
// memberStatus + lifecycleState + view (state/projects.ts). The hardcoded
// `'local-projects'` key sits on the other branch, unreachable once a context
// exists, so it cannot answer workspace B with workspace A's rows either.
//
// What was missing is simpler: `reconcileFetchedProjects` refuses to APPLY a
// response whose scope has moved on, but nothing DISCARDED the rows already on
// screen, and the re-list runs in an effect — i.e. after the commit the browser
// has already painted. So the fix is client-side state, not a request: no extra
// backend round-trip, and no dependency on a workspace-invalidation SSE event
// (a local switch must correct itself locally).

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { buildWorkspacePermissions } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App';
import type { AppConfig, Project } from '../../src/types';
import {
  fetchComposioConfigFromDaemon,
  fetchDaemonConfig,
  loadConfig,
  mergeDaemonConfig,
} from '../../src/state/config';
import {
  daemonIsLive,
  fetchAgentsStream,
  fetchAppVersionInfo,
  fetchDesignSystems,
  fetchDesignTemplates,
  fetchPromptTemplates,
  fetchSkills,
} from '../../src/providers/registry';
import { listProjects, listTemplates } from '../../src/state/projects';
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({ projects }: { projects: Project[] }) => (
    <main>
      <div data-testid="entry-home-surface" />
      {projects.map((project) => (
        <div key={project.id} data-testid={`entry-project-${project.id}`}>
          {project.name}
        </div>
      ))}
    </main>
  ),
}));

vi.mock('../../src/components/ProjectView', () => ({
  ProjectView: () => <main data-testid="project-view" />,
}));

vi.mock('../../src/components/WorkspaceTabsBar', () => ({
  WorkspaceTabsBar: () => null,
  openWorkspaceTab: () => {},
}));

vi.mock('../../src/components/pet/PetOverlay', () => ({
  PetOverlay: () => null,
}));

vi.mock('../../src/components/pet/pets', () => ({
  migrateCustomPetAtlas: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/components/SettingsDialog', () => ({
  SettingsDialog: () => null,
  switchApiProtocolConfig: (config: AppConfig) => config,
  updateCurrentApiProtocolConfig: (config: AppConfig) => config,
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
    fetchDaemonConfig: vi.fn().mockResolvedValue({}),
    fetchComposioConfigFromDaemon: vi.fn().mockResolvedValue(null),
    loadConfig: vi.fn(),
    mergeDaemonConfig: vi.fn(),
    saveConfig: vi.fn(),
    syncComposioConfigToDaemon: vi.fn().mockResolvedValue(true),
    syncConfigToDaemon: vi.fn().mockResolvedValue(undefined),
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

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: 1778244000000,
    updatedAt: 1778244000000,
    metadata: { kind: 'prototype' },
  };
}

const WORKSPACE_A_PROJECT = project('project-in-a', 'Workspace A project');
const WORKSPACE_B_PROJECT = project('project-in-b', 'Workspace B project');

function workspaceContext(workspaceId: string) {
  return {
    workspaceId,
    workspaceType: 'team' as const,
    workspaceMemberId: `member-${workspaceId}`,
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    billingState: 'active' as const,
    planId: null,
    providerMode: 'platform_credits' as const,
    seatSummary: {
      seatLimit: 5,
      usedSeats: 1,
      availableSeats: 4,
      isSeatFull: false,
    },
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
    displayName: workspaceId,
  };
}

function workspaceContextPayload(workspaceId: string) {
  return { context: workspaceContext(workspaceId) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('App project list across a workspace switch', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetCoalescedGet();
    window.history.replaceState(null, '', '/');
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgentsStream).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(listTemplates).mockResolvedValue([]);
    vi.mocked(fetchDaemonConfig).mockResolvedValue({});
    vi.mocked(fetchComposioConfigFromDaemon).mockResolvedValue(null);
    vi.mocked(mergeDaemonConfig).mockImplementation((local) => local);
    vi.mocked(loadConfig).mockReturnValue({ ...baseConfig });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetCoalescedGet();
  });

  it('never renders the previous workspace\'s projects while the new list is in flight', async () => {
    let activeWorkspaceId = 'ws-a';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-a'),
                  workspaceContext('ws-b'),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload(activeWorkspaceId)
                : {},
        } as Response;
      }),
    );

    const workspaceB = deferred<Project[]>();
    vi.mocked(listProjects).mockImplementation(async (options) => {
      const workspaceId = options?.workspaceContext?.workspaceId ?? null;
      if (workspaceId === 'ws-b') return workspaceB.promise;
      return [WORKSPACE_A_PROJECT];
    });

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeTruthy(),
    );

    // The switch itself: B's context resolves, B's project list has NOT.
    activeWorkspaceId = 'ws-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        vi.mocked(listProjects).mock.calls.some(
          ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
        ),
      ).toBe(true),
    );

    // Workspace B is the active identity now. Whatever the strip shows must
    // belong to B — an empty strip is fine, A's project is not.
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();

    await act(async () => {
      workspaceB.resolve([WORKSPACE_B_PROJECT]);
      await workspaceB.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId(`entry-project-${WORKSPACE_B_PROJECT.id}`)).toBeTruthy(),
    );
    expect(screen.queryByTestId(`entry-project-${WORKSPACE_A_PROJECT.id}`)).toBeNull();
  });
});
