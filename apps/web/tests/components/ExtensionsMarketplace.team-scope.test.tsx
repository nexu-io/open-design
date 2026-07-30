// @vitest-environment jsdom

// Regression for the workspace-team P0 (飞书 rec recvq3NXctqR6L): the 团队
// resource scope disappeared from the 扩展 marketplace for a genuine team
// workspace that happens to be on a free/unpaid tier.
//
// The 团队 pill had been gated on `hasTeamPlan` (a BILLING check). A team on a
// free tier reports `billingState: 'free'`, `planId: null`, and an empty
// `membershipTier`, so the plan gate hid the scope — even though the workspace
// is a real team with a shared resource plane the daemon serves and shares from
// regardless of plan. The gate now matches the daemon: team IDENTITY, via
// `workspaceContextHasTeamIdentity`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SkillSummary } from '@open-design/contracts';

import { ExtensionsMarketplace } from '../../src/components/PluginsView';
import { I18nProvider } from '../../src/i18n';
import { fetchSkills } from '../../src/providers/registry';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

// A real team workspace on a FREE tier: workspaceType 'team' with ids present,
// but billingState 'free' / planId null / empty membershipTier — the exact
// shape the daemon returns for the feature-test team.
const FREE_TEAM_CONTEXT = {
  workspaceId: 'ws-team',
  workspaceType: 'team',
  workspaceMemberId: 'mem-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  teamId: 'ws-team',
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: false,
    canManageSharedResources: true,
  },
};

const PERSONAL_CONTEXT = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'mem-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: false,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: false,
    canManageSharedResources: false,
  },
};

let workspaceContext: unknown = FREE_TEAM_CONTEXT;
let workspaceContextLoading = false;

// Spread the real module: this component also calls its PURE helpers
// (beginWorkspaceScopedRead / workspaceIdentityCacheKey), and a mock that
// replaces the whole module leaves them undefined at call time.
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceContext,
    loading: workspaceContextLoading,
    refresh: vi.fn(),
  }),
  // Deliberately reports no paid plan — the fix must NOT consult this to decide
  // whether the team scope is offered.
  useWorkspaceBilling: () => ({ membershipTier: '' }),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  fetchSkills: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchSkills).mockResolvedValue([]);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/skills') return jsonResponse({ skills: [] });
    if (url.startsWith('/api/plugins')) return jsonResponse({ plugins: [] });
    if (url.startsWith('/api/marketplaces')) return jsonResponse({ marketplaces: [] });
    if (url.includes('/api/workspace/')) return jsonResponse({ ids: [], resources: [] });
    return jsonResponse({});
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  workspaceContext = FREE_TEAM_CONTEXT;
  workspaceContextLoading = false;
});

function renderMarketplace() {
  return render(
    <I18nProvider initial="en">
      <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
    </I18nProvider>,
  );
}

/** The scope pills (官方 / 团队 / 个人的) live in the source-filter row. */
function scopeLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.plugin-marketplace__filters button')].map(
    (button) => (button.textContent ?? '').trim(),
  );
}

function skill(id: string): SkillSummary {
  return {
    id,
    name: id,
    description: id,
    triggers: [],
    mode: 'prototype',
    source: 'builtin',
  } as unknown as SkillSummary;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ExtensionsMarketplace 团队 scope visibility', () => {
  it('offers the Team scope for a real team workspace even on a free tier', async () => {
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelector('.plugin-marketplace__filters')).toBeTruthy();
    });
    expect(scopeLabels(container)).toContain('Team');
  });

  it('does not offer the Team scope for a personal workspace', async () => {
    workspaceContext = PERSONAL_CONTEXT;
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelector('.plugin-marketplace__filters')).toBeTruthy();
    });
    expect(scopeLabels(container)).not.toContain('Team');
  });

  it('does not offer the Team scope when signed out (no workspace context)', async () => {
    workspaceContext = null;
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelector('.plugin-marketplace__filters')).toBeTruthy();
    });
    expect(scopeLabels(container)).not.toContain('Team');
  });

  it('waits for cold-mount identity, then discards the previous workspace response', async () => {
    const readA = deferred<SkillSummary[]>();
    const readB = deferred<SkillSummary[]>();
    workspaceContext = null;
    workspaceContextLoading = true;
    vi.mocked(fetchSkills).mockImplementation((context) =>
      context?.workspaceId === 'ws-b' ? readB.promise : readA.promise,
    );

    const view = renderMarketplace();
    await act(async () => {
      await Promise.resolve();
    });
    // No headerless cold-mount read: the identity has not settled yet.
    expect(fetchSkills).not.toHaveBeenCalled();

    workspaceContext = { ...FREE_TEAM_CONTEXT, workspaceId: 'ws-a', teamId: 'ws-a' };
    workspaceContextLoading = false;
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(([context]) => context?.workspaceId === 'ws-a'),
      ).toBe(true),
    );

    workspaceContext = { ...FREE_TEAM_CONTEXT, workspaceId: 'ws-b', teamId: 'ws-b' };
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(([context]) => context?.workspaceId === 'ws-b'),
      ).toBe(true),
    );

    await act(async () => {
      readB.resolve([skill('skill-from-b')]);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    await waitFor(() => expect(screen.getByTestId('plugins-card-skill-from-b')).toBeTruthy());

    await act(async () => {
      readA.resolve([skill('skill-from-a')]);
      await Promise.resolve();
    });

    expect(screen.getByTestId('plugins-card-skill-from-b')).toBeTruthy();
    expect(screen.queryByTestId('plugins-card-skill-from-a')).toBeNull();
    expect(
      vi.mocked(fetchSkills).mock.calls.map(([context]) => context?.workspaceId),
    ).toEqual(['ws-a', 'ws-b']);
  });

  it('replaces shared IDs and metadata on an identity change and discards late results', async () => {
    const sharedA = {
      plugins: deferred<Response>(),
      skills: deferred<Response>(),
    };
    const sharedB = {
      plugins: deferred<Response>(),
      skills: deferred<Response>(),
    };
    const counts = { plugins: 0, skills: 0 };
    const requestScopes: Array<{ kind: 'plugins' | 'skills'; workspaceId: string | null }> = [];
    workspaceContext = { ...FREE_TEAM_CONTEXT, workspaceId: 'ws-a', teamId: 'ws-a' };
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/workspace/plugins/team')) {
        requestScopes.push({
          kind: 'plugins',
          workspaceId: new Headers(init?.headers).get('x-od-workspace-id'),
        });
        counts.plugins += 1;
        return counts.plugins === 1 ? sharedA.plugins.promise : sharedB.plugins.promise;
      }
      if (url.endsWith('/workspace/skills/team')) {
        requestScopes.push({
          kind: 'skills',
          workspaceId: new Headers(init?.headers).get('x-od-workspace-id'),
        });
        counts.skills += 1;
        return counts.skills === 1 ? sharedA.skills.promise : sharedB.skills.promise;
      }
      if (url.startsWith('/api/plugins')) {
        return Promise.resolve(jsonResponse({ plugins: [] }));
      }
      if (url.startsWith('/api/marketplaces')) {
        return Promise.resolve(jsonResponse({ marketplaces: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

    const view = renderMarketplace();
    await waitFor(() => expect(counts).toEqual({ plugins: 1, skills: 1 }));

    workspaceContext = { ...FREE_TEAM_CONTEXT, workspaceId: 'ws-b', teamId: 'ws-b' };
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts).toEqual({ plugins: 2, skills: 2 }));
    expect(requestScopes).toEqual([
      { kind: 'plugins', workspaceId: 'ws-a' },
      { kind: 'skills', workspaceId: 'ws-a' },
      { kind: 'plugins', workspaceId: 'ws-b' },
      { kind: 'skills', workspaceId: 'ws-b' },
    ]);

    await act(async () => {
      sharedB.plugins.resolve(jsonResponse({
        ids: ['plugin-from-b'],
        resources: [{
          id: 'plugin-from-b',
          title: 'Plugin from B',
          description: 'Metadata from B',
          canUnshare: true,
          ownerMemberId: 'mem-1',
        }],
      }));
      sharedB.skills.resolve(jsonResponse({
        ids: ['skill-from-b'],
        resources: [{
          id: 'skill-from-b',
          title: 'Skill from B',
          description: 'Skill metadata from B',
          canUnshare: true,
          ownerMemberId: 'mem-1',
        }],
      }));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    await waitFor(() => expect(screen.getByText('Plugin from B')).toBeTruthy());
    expect(screen.getByText('Metadata from B')).toBeTruthy();

    await act(async () => {
      sharedA.plugins.resolve(jsonResponse({
        ids: ['plugin-from-a'],
        resources: [{
          id: 'plugin-from-a',
          title: 'Plugin from A',
          description: 'Metadata from A',
          canUnshare: true,
          ownerMemberId: 'mem-1',
        }],
      }));
      sharedA.skills.resolve(jsonResponse({
        ids: ['skill-from-a'],
        resources: [{
          id: 'skill-from-a',
          title: 'Skill from A',
          description: 'Skill metadata from A',
          canUnshare: true,
          ownerMemberId: 'mem-1',
        }],
      }));
      await Promise.resolve();
    });

    expect(screen.getByText('Plugin from B')).toBeTruthy();
    expect(screen.queryByText('Plugin from A')).toBeNull();
    expect(screen.getByText('Metadata from B')).toBeTruthy();
    expect(screen.queryByText('Metadata from A')).toBeNull();
  });
});
