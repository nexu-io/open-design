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
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InstalledPluginRecord, SkillSummary } from '@open-design/contracts';

import { ExtensionsMarketplace } from '../../src/components/PluginsView';
import { I18nProvider } from '../../src/i18n';
import { fetchSkills } from '../../src/providers/registry';

const workspaceInvalidationHarness = vi.hoisted(() => ({
  handlers: [] as Array<Record<string, (payload: any) => void>>,
  onActive: [] as Array<() => void>,
  autoActivate: true,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((
    handlers: Record<string, (payload: any) => void>,
    options?: { onActive?: () => void; enabled?: boolean; workspaceContext?: unknown },
  ) => {
    workspaceInvalidationHarness.handlers.push(handlers);
    if (options?.onActive) workspaceInvalidationHarness.onActive.push(options.onActive);
    const identity = JSON.stringify(options?.workspaceContext ?? null);
    React.useEffect(() => {
      if (workspaceInvalidationHarness.autoActivate && options?.enabled !== false && options?.workspaceContext) {
        options.onActive?.();
      }
    }, [identity, options?.enabled]);
    return { connected: false };
  }),
}));

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
let workspaceContextFailure: 'unsupported' | 'unavailable' | undefined;
let workspaceAccountGeneration = 0;

// Spread the real module: this component also calls its PURE helpers
// (beginWorkspaceScopedRead / workspaceIdentityCacheKey), and a mock that
// replaces the whole module leaves them undefined at call time.
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceContext,
    loading: workspaceContextLoading,
    failure: workspaceContextFailure,
    refresh: vi.fn(),
  }),
  currentWorkspaceAccountGeneration: () => workspaceAccountGeneration,
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
  workspaceInvalidationHarness.handlers.length = 0;
  workspaceInvalidationHarness.onActive.length = 0;
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
  workspaceContextFailure = undefined;
  workspaceAccountGeneration = 0;
});

function renderMarketplace(isActive = true) {
  return render(
    <I18nProvider initial="en">
      <ExtensionsMarketplace
        isActive={isActive}
        onCreatePlugin={vi.fn()}
        onUsePlugin={vi.fn()}
      />
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

function plugin(id: string): InstalledPluginRecord {
  return {
    id,
    title: id,
    version: '1.0.0',
    sourceKind: 'local',
    source: `/local/${id}`,
    trust: 'restricted',
    capabilitiesGranted: [],
    manifest: { name: id, title: id, version: '1.0.0' },
    fsPath: `/local/${id}`,
    installedAt: 0,
    updatedAt: 0,
  } as InstalledPluginRecord;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ExtensionsMarketplace 团队 scope visibility', () => {
  it('does not refresh while hidden and performs one bounded active-surface catch-up', async () => {
    const view = renderMarketplace(false);
    await act(async () => Promise.resolve());
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(fetchSkills).not.toHaveBeenCalled();

    const resourceHandler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-resources-changed'])
      .find((candidate) => typeof candidate === 'function');
    expect(resourceHandler).toBeTypeOf('function');
    act(() => resourceHandler?.({
      type: 'team-resources-changed',
      resourceKind: 'skill',
      resourceId: 'remote-skill',
    }));
    await act(async () => Promise.resolve());
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();

    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace isActive onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(5));
    vi.mocked(globalThis.fetch).mockClear();
    vi.mocked(fetchSkills).mockClear();

    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    expect(onActive).toBeTypeOf('function');
    act(() => onActive?.());
    await waitFor(() => expect(fetchSkills).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(5));
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input));
    expect(urls.filter((url) => url === '/api/plugins')).toHaveLength(2);
    expect(urls.filter((url) => url === '/api/marketplaces')).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith('/plugins/team'))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith('/skills/team'))).toHaveLength(1);
  });

  it('offers the Team scope for a real team workspace even on a free tier', async () => {
    const { container } = renderMarketplace();
    await waitFor(() => {
      expect(container.querySelector('.plugin-marketplace__filters')).toBeTruthy();
    });
    expect(scopeLabels(container)).toContain('Team');
  });

  it('refreshes the Team shared index immediately after a remote plugin event', async () => {
    let teamIndexReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') return jsonResponse({ plugins: [plugin('remote-plugin')] });
      if (url.startsWith('/api/marketplaces')) return jsonResponse({ marketplaces: [] });
      if (url.endsWith('/plugins/team')) {
        teamIndexReads += 1;
        return jsonResponse({
          ids: teamIndexReads === 1 ? [] : ['remote-plugin'],
          resources: teamIndexReads === 1 ? [] : [{ id: 'remote-plugin', canUnshare: true }],
        });
      }
      if (url.endsWith('/skills/team')) return jsonResponse({ ids: [], resources: [] });
      return jsonResponse({});
    }) as typeof fetch;
    renderMarketplace();
    await waitFor(() => expect(teamIndexReads).toBe(1));

    const handler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-resources-changed'])
      .find((candidate) => typeof candidate === 'function');
    expect(handler).toBeTypeOf('function');
    act(() => handler!({
      type: 'team-resources-changed',
      resourceKind: 'plugin',
      resourceId: 'remote-plugin',
    }));
    await waitFor(() => expect(teamIndexReads).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(await screen.findByText('remote-plugin')).toBeTruthy();
  });

  it('keeps the event-refreshed Team index when the older same-identity read resolves late', async () => {
    const initialIndex = deferred<Response>();
    const eventIndex = deferred<Response>();
    let teamIndexReads = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') {
        return Promise.resolve(jsonResponse({ plugins: [plugin('fresh-team-plugin')] }));
      }
      if (url.startsWith('/api/marketplaces')) {
        return Promise.resolve(jsonResponse({ marketplaces: [] }));
      }
      if (url.endsWith('/plugins/team')) {
        teamIndexReads += 1;
        return teamIndexReads === 1 ? initialIndex.promise : eventIndex.promise;
      }
      if (url.endsWith('/skills/team')) {
        return Promise.resolve(jsonResponse({ ids: [], resources: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;
    renderMarketplace();
    await waitFor(() => expect(teamIndexReads).toBe(1));

    const handler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-resources-changed'])
      .find((candidate) => typeof candidate === 'function');
    act(() => handler!({
      type: 'team-resources-changed',
      resourceKind: 'plugin',
      resourceId: 'fresh-team-plugin',
    }));
    await waitFor(() => expect(teamIndexReads).toBe(2));

    eventIndex.resolve(jsonResponse({
      ids: ['fresh-team-plugin'],
      resources: [{ id: 'fresh-team-plugin', canUnshare: true }],
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(await screen.findByText('fresh-team-plugin')).toBeTruthy();

    initialIndex.resolve(jsonResponse({ ids: [], resources: [] }));
    await act(async () => Promise.resolve());
    expect(screen.getByText('fresh-team-plugin')).toBeTruthy();
  });

  it('refreshes both the skills catalog and shared index after a remote skill event', async () => {
    let teamSkillReads = 0;
    vi.mocked(fetchSkills)
      .mockResolvedValueOnce([])
      .mockResolvedValue([skill('remote-skill')]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') return jsonResponse({ plugins: [] });
      if (url.startsWith('/api/marketplaces')) return jsonResponse({ marketplaces: [] });
      if (url.endsWith('/plugins/team')) return jsonResponse({ ids: [], resources: [] });
      if (url.endsWith('/skills/team')) {
        teamSkillReads += 1;
        return jsonResponse({
          ids: teamSkillReads === 1 ? [] : ['remote-skill'],
          resources: teamSkillReads === 1 ? [] : [{ id: 'remote-skill', canUnshare: true }],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;
    renderMarketplace();
    await waitFor(() => expect(teamSkillReads).toBe(1));

    const handler = workspaceInvalidationHarness.handlers
      .map((handlers) => handlers['team-resources-changed'])
      .find((candidate) => typeof candidate === 'function');
    expect(handler).toBeTypeOf('function');
    act(() => handler!({
      type: 'team-resources-changed',
      resourceKind: 'skill',
      resourceId: 'remote-skill',
    }));
    await waitFor(() => {
      expect(teamSkillReads).toBe(2);
      expect(fetchSkills).toHaveBeenCalledTimes(2);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(await screen.findByTestId('plugins-card-remote-skill')).toBeTruthy();
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

  it('scopes both plugin catalog reads and rejects a late previous-workspace result', async () => {
    const reads = [
      deferred<Response>(),
      deferred<Response>(),
      deferred<Response>(),
      deferred<Response>(),
    ];
    const requestScopes: Array<string | null> = [];
    let pluginRequest = 0;
    workspaceContext = { ...FREE_TEAM_CONTEXT, workspaceId: 'ws-a', teamId: 'ws-a' };
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/plugins') {
        requestScopes.push(new Headers(init?.headers).get('x-od-workspace-id'));
        return reads[pluginRequest++]!.promise;
      }
      if (url.startsWith('/api/marketplaces')) {
        return Promise.resolve(jsonResponse({ marketplaces: [] }));
      }
      if (url.includes('/api/workspace/')) {
        return Promise.resolve(jsonResponse({ ids: [], resources: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

    const view = renderMarketplace();
    await waitFor(() => expect(pluginRequest).toBe(2));

    workspaceContext = { ...FREE_TEAM_CONTEXT, workspaceId: 'ws-b', teamId: 'ws-b' };
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    await waitFor(() => expect(pluginRequest).toBe(4));
    expect(requestScopes).toEqual(['ws-a', 'ws-a', 'ws-b', 'ws-b']);

    await act(async () => {
      reads[2]!.resolve(jsonResponse({ plugins: [plugin('plugin-from-b')] }));
      reads[3]!.resolve(jsonResponse({ plugins: [plugin('plugin-from-b')] }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
    await waitFor(() => expect(screen.getByText('plugin-from-b')).toBeTruthy());

    await act(async () => {
      reads[0]!.resolve(jsonResponse({ plugins: [plugin('plugin-from-a')] }));
      reads[1]!.resolve(jsonResponse({ plugins: [plugin('plugin-from-a')] }));
      await Promise.resolve();
    });
    expect(screen.getByText('plugin-from-b')).toBeTruthy();
    expect(screen.queryByText('plugin-from-a')).toBeNull();
  });

  it('hides old plugin rows and rejects them across an account generation change', async () => {
    const reads = [
      deferred<Response>(),
      deferred<Response>(),
      deferred<Response>(),
      deferred<Response>(),
    ];
    let pluginRequest = 0;
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/plugins') return reads[pluginRequest++]!.promise;
      if (url.startsWith('/api/marketplaces')) {
        return Promise.resolve(jsonResponse({ marketplaces: [] }));
      }
      if (url.includes('/api/workspace/')) {
        return Promise.resolve(jsonResponse({ ids: [], resources: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

    const view = renderMarketplace();
    await waitFor(() => expect(pluginRequest).toBe(2));
    await act(async () => {
      reads[0]!.resolve(jsonResponse({ plugins: [plugin('account-a-plugin')] }));
      reads[1]!.resolve(jsonResponse({ plugins: [plugin('account-a-plugin')] }));
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
    await waitFor(() => expect(screen.getByText('account-a-plugin')).toBeTruthy());

    workspaceAccountGeneration = 1;
    view.rerender(
      <I18nProvider initial="en">
        <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByText('account-a-plugin')).toBeNull();
    await waitFor(() => expect(pluginRequest).toBe(4));

    await act(async () => {
      reads[2]!.resolve(jsonResponse({ plugins: [plugin('account-b-plugin')] }));
      reads[3]!.resolve(jsonResponse({ plugins: [plugin('account-b-plugin')] }));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('account-b-plugin')).toBeTruthy());
  });

  it('does not issue headerless catalog reads while modern workspace authority is unavailable', async () => {
    workspaceContext = null;
    workspaceContextLoading = false;
    workspaceContextFailure = 'unavailable';
    renderMarketplace();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSkills).not.toHaveBeenCalled();
    expect(
      vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input) === '/api/plugins'),
    ).toBe(false);
  });

  it.each([undefined, 'unsupported'] as const)(
    'keeps the legal headerless catalog path for settled signed-out/legacy state (%s)',
    async (failure) => {
      workspaceContext = null;
      workspaceContextLoading = false;
      workspaceContextFailure = failure;
      renderMarketplace();

      await waitFor(() => expect(fetchSkills).toHaveBeenCalledWith(null));
      await waitFor(() =>
        expect(
          vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input) === '/api/plugins'),
        ).toBe(true),
      );
    },
  );

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
