// @vitest-environment jsdom
//
// The app-level skills list must be read under the caller's workspace identity,
// and re-read when that identity changes.
//
// `fetchSkills(workspaceContext)` exists to attach `workspaceProjectHeaders` so
// the daemon's `GET /api/skills` can apply `skillVisibleFromWorkspace`. Two
// callers pass it (SkillsSection, ExtensionsMarketplace); App.tsx's three did
// not — and the daemon's rule is FAIL-CLOSED on a missing `x-od-workspace-id`
// (`skills.ts`: `if (!scopeId) return !ownerId;`), not "unfiltered". So a
// headerless read does not return everything; it returns everything EXCEPT the
// claimed skills — hiding a skill from the very workspace that claimed it.
//
// Second half of the same defect: nothing refetched skills when the active
// workspace changed. Design systems got exactly this effect (App.tsx, keyed on
// `workspaceContext?.workspaceId`) because the switcher lives ON the home view,
// so `route.kind` stays 'home' and no route change fires. Skills never did.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { SkillSummary, WorkspaceCollabContext } from '@open-design/contracts';
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

const workspaceInvalidationHarness = vi.hoisted(() => ({
  handlers: [] as Array<Record<string, (payload: any) => void>>,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((handlers: Record<string, (payload: any) => void>) => {
    workspaceInvalidationHarness.handlers.push(handlers);
    return { connected: false };
  }),
}));

vi.mock('../../src/components/EntryView', () => ({
  EntryView: ({
    skills,
    skillsLoading,
  }: {
    skills: Array<{ id: string }>;
    skillsLoading: boolean;
  }) => (
    <main>
      <div data-testid="entry-home-surface" />
      <div data-testid="entry-skills-loading">{String(skillsLoading)}</div>
      {skills.map((skill) => (
        <div key={skill.id} data-testid={`entry-skill-${skill.id}`} />
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

function workspaceContext(
  workspaceId: string,
  workspaceMemberId = `member-${workspaceId}`,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
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

function workspaceContextPayload(workspaceId: string, workspaceMemberId?: string) {
  return { context: workspaceContext(workspaceId, workspaceMemberId) };
}

/** Workspace ids `fetchSkills` was called for, in order. `undefined` marks a
 *  headerless read — the fail-closed one that hides claimed skills. */
function skillsReadScopes(): Array<string | undefined> {
  return vi
    .mocked(fetchSkills)
    .mock.calls.map(([context]) => context?.workspaceId ?? undefined);
}

const projects: Project[] = [];

function skill(id: string): SkillSummary {
  return {
    id,
    name: id,
    description: id,
    triggers: [],
    mode: 'prototype',
    source: 'user',
  } as unknown as SkillSummary;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('App skills list — workspace scope', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    resetCoalescedGet();
    workspaceInvalidationHarness.handlers.length = 0;
    window.history.replaceState(null, '', '/');
    vi.mocked(daemonIsLive).mockResolvedValue(true);
    vi.mocked(fetchAgentsStream).mockResolvedValue([]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
    vi.mocked(fetchDesignSystems).mockResolvedValue([]);
    vi.mocked(fetchPromptTemplates).mockResolvedValue([]);
    vi.mocked(fetchAppVersionInfo).mockResolvedValue(null);
    vi.mocked(listProjects).mockResolvedValue(projects);
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
    workspaceInvalidationHarness.handlers.length = 0;
    resetTeamProjectsCache();
    resetCoalescedGet();
  });

  it('reads skills under the active workspace identity, once, and again on a switch', async () => {
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

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('entry-home-surface')).toBeTruthy());

    // Startup: the skills list is read for the workspace that is actually
    // active — not headerless, which the daemon answers by hiding every
    // claimed skill.
    await waitFor(() => expect(skillsReadScopes()).toContain('ws-a'));

    // …and exactly once. A boot read plus a workspace-keyed read would be a
    // second request on the startup path.
    expect(skillsReadScopes()).toEqual(['ws-a']);

    // The switch: the switcher lives on the home view, so no route change
    // fires. Only a workspace-keyed refresh can correct the list.
    activeWorkspaceId = 'ws-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });

    await waitFor(() => expect(skillsReadScopes()).toContain('ws-b'));
    expect(skillsReadScopes()).toEqual(['ws-a', 'ws-b']);
  });

  // Issuing the right request is only half the guarantee. Each read resolves
  // later, and nothing stopped a read issued FOR the workspace the user has
  // since left from committing when it finally landed — restoring that
  // workspace's catalog over the current one, which is the very staleness this
  // change exists to remove, arriving through the back door.
  it("discards a slow read belonging to the workspace the user has left", async () => {
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

    const readA = deferred<SkillSummary[]>();
    const readB = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills).mockImplementation((context) =>
      context?.workspaceId === 'ws-b' ? readB.promise : readA.promise,
    );

    render(<App />);
    await waitFor(() => expect(skillsReadScopes()).toContain('ws-a'));

    // Switch while ws-a's read is still in flight.
    activeWorkspaceId = 'ws-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({ context: workspaceContext('ws-b') });
      await Promise.resolve();
    });
    await waitFor(() => expect(skillsReadScopes()).toContain('ws-b'));

    // Reverse order: the workspace the user is actually IN answers first…
    await act(async () => {
      readB.resolve([skill('skill-from-b')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('entry-skill-skill-from-b')).toBeTruthy());

    // …and the abandoned workspace answers second. It must change nothing.
    await act(async () => {
      readA.resolve([skill('skill-from-a')]);
      await Promise.resolve();
    });

    expect(screen.getByTestId('entry-skill-skill-from-b')).toBeTruthy();
    expect(screen.queryByTestId('entry-skill-skill-from-a')).toBeNull();
  });

  // A commit-time guard only prevents a late A response from overwriting B.
  // It does not make the already-committed A snapshot safe to render while B's
  // replacement request is pending. Workspace-scoped resources must carry the
  // identity they belong to so the render that first observes B fails closed:
  // no A skill reaches EntryView/ProjectView, and B is visibly loading.
  it('hides a warm catalog synchronously while the replacement identity is loading', async () => {
    let memberId = 'member-a';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-shared-team', memberId),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-shared-team', memberId)
                : {},
        } as Response;
      }),
    );

    const readB = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills).mockImplementation((context) =>
      context?.workspaceMemberId === 'member-b'
        ? readB.promise
        : Promise.resolve([skill('skill-from-a')]),
    );

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('entry-skill-skill-from-a')).toBeTruthy());
    expect(screen.getByTestId('entry-skills-loading').textContent).toBe('false');

    memberId = 'member-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({
        context: workspaceContext('ws-shared-team', memberId),
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(
          ([c]) => c?.workspaceMemberId === 'member-b',
        ),
      ).toBe(true),
    );

    // B's request is deliberately still pending. The previous identity's
    // successful catalog must already be invisible and cannot make B look done.
    expect(screen.queryByTestId('entry-skill-skill-from-a')).toBeNull();
    expect(screen.getByTestId('entry-skills-loading').textContent).toBe('true');

    await act(async () => {
      readB.resolve([skill('skill-from-b')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('entry-skill-skill-from-b')).toBeTruthy());
    expect(screen.getByTestId('entry-skills-loading').textContent).toBe('false');
  });

  // A guard that discards without guaranteeing a successor is worse than the
  // staleness it replaces: the list can be left loading forever.
  //
  // The commit guard compares `workspaceIdentityCacheKey`, which includes the
  // MEMBER id — so two accounts active in the same shared team workspace are two
  // identities even though `workspaceId` never changes. A trigger keyed only on
  // `workspaceId` would discard account A's pending response and then suppress
  // account B's replacement read, because the workspace id it watched did not
  // move.
  it('starts and completes a successor read when only the member id changes', async () => {
    let memberId = 'member-a';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), 'http://d.local').pathname;
        return {
          ok: true,
          json: async () =>
            pathname.endsWith('/workspace/directory')
              ? workspaceDirectoryFixture([
                  workspaceContext('ws-shared-team', memberId),
                ])
              : pathname.endsWith('/workspace/context')
                ? workspaceContextPayload('ws-shared-team', memberId)
                : {},
        } as Response;
      }),
    );

    const readA = deferred<SkillSummary[]>();
    const readB = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills).mockImplementation((context) =>
      context?.workspaceMemberId === 'member-b' ? readB.promise : readA.promise,
    );

    render(<App />);
    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(
          ([c]) => c?.workspaceMemberId === 'member-a',
        ),
      ).toBe(true),
    );

    // Same workspace, different account. A's read is still in flight.
    memberId = 'member-b';
    await act(async () => {
      notifyWorkspaceContextRefresh({
        context: workspaceContext('ws-shared-team', memberId),
      });
      await Promise.resolve();
    });

    // A successor read must START for B…
    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(
          ([c]) => c?.workspaceMemberId === 'member-b',
        ),
      ).toBe(true),
    );

    // …A's late answer is discarded…
    await act(async () => {
      readA.resolve([skill('skill-from-a')]);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('entry-skill-skill-from-a')).toBeNull();

    // …and B's answer COMPLETES, so the registry is not left loading forever.
    await act(async () => {
      readB.resolve([skill('skill-from-b')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('entry-skill-skill-from-b')).toBeTruthy());
    expect(screen.queryByTestId('entry-skill-skill-from-a')).toBeNull();
  });

  it('hides the previous account catalog while an unseeded identity refresh is pending', async () => {
    const sharedContext = workspaceContext('ws-same', 'member-same');
    const directoryB = deferred<Response>();
    const contextB = deferred<Response>();
    const readB = deferred<SkillSummary[]>();
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
              ? workspaceDirectoryFixture([sharedContext])
              : pathname.endsWith('/workspace/context')
                ? { context: sharedContext }
                : {},
        } as Response);
      }),
    );
    vi.mocked(fetchSkills).mockImplementation(() =>
      accountPhase === 'a'
        ? Promise.resolve([skill('skill-from-account-a')])
        : readB.promise,
    );

    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('entry-skill-skill-from-account-a')).toBeTruthy(),
    );

    accountPhase = 'b';
    await act(async () => {
      notifyWorkspaceContextRefresh();
      await Promise.resolve();
    });

    // The next account deliberately resolves to the same Workspace/member
    // fields. Account generation and the pending boundary must still hide A
    // synchronously rather than treating those equal fields as one identity.
    expect(screen.queryByTestId('entry-skill-skill-from-account-a')).toBeNull();
    expect(screen.getByTestId('entry-skills-loading').textContent).toBe('true');
    expect(vi.mocked(fetchSkills)).toHaveBeenCalledTimes(1);

    await act(async () => {
      directoryB.resolve({
        ok: true,
        json: async () => workspaceDirectoryFixture([sharedContext]),
      } as Response);
      contextB.resolve({
        ok: true,
        json: async () => ({ context: sharedContext }),
      } as Response);
      await Promise.all([directoryB.promise, contextB.promise]);
    });
    await waitFor(() => expect(vi.mocked(fetchSkills)).toHaveBeenCalledTimes(2));

    await act(async () => {
      readB.resolve([skill('skill-from-account-b')]);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId('entry-skill-skill-from-account-b')).toBeTruthy(),
    );
    expect(screen.queryByTestId('entry-skill-skill-from-account-a')).toBeNull();
  });

  it('keeps the newest same-identity skill refresh when an older request finishes last', async () => {
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
    vi.mocked(fetchSkills).mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(vi.mocked(fetchSkills)).toHaveBeenCalled());

    const older = deferred<SkillSummary[]>();
    const newer = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills)
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const resourceHandler = [...workspaceInvalidationHarness.handlers]
      .reverse()
      .find((handlers) => handlers['team-resources-changed'])?.['team-resources-changed'];
    expect(resourceHandler).toBeTypeOf('function');

    act(() => resourceHandler?.({ type: 'team-resources-changed', resourceKind: 'skill' }));
    act(() => resourceHandler?.({ type: 'team-resources-changed', resourceKind: 'skill' }));
    await waitFor(() => expect(vi.mocked(fetchSkills).mock.calls.length).toBeGreaterThanOrEqual(3));

    await act(async () => {
      newer.resolve([skill('newer-skill')]);
      await newer.promise;
    });
    await waitFor(() => expect(screen.getByTestId('entry-skill-newer-skill')).toBeTruthy());

    await act(async () => {
      older.resolve([skill('older-skill')]);
      await older.promise;
    });
    expect(screen.getByTestId('entry-skill-newer-skill')).toBeTruthy();
    expect(screen.queryByTestId('entry-skill-older-skill')).toBeNull();
  });
});
