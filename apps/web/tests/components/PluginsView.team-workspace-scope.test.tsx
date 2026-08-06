// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  InstalledPluginRecord,
  SkillSummary,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginsView } from '../../src/components/PluginsView';
import {
  notifyWorkspaceContextRefresh,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { I18nProvider } from '../../src/i18n';
import { fetchSkills } from '../../src/providers/registry';
import { listPluginMarketplaces, listPlugins } from '../../src/state/projects';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: currentWorkspaceContext,
    loading: currentWorkspaceLoading,
    identityChangePending: currentIdentityChangePending,
    failure: currentWorkspaceFailure,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  fetchSkills: vi.fn(),
}));

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/state/projects')>()),
  listPluginMarketplaces: vi.fn(),
  listPlugins: vi.fn(),
}));

function workspaceContext(workspaceId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId: `member-${workspaceId}`,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
    displayName: workspaceId,
  };
}

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let currentWorkspaceContext: WorkspaceCollabContext | null = workspaceContext('ws-a');
let currentWorkspaceLoading = false;
let currentIdentityChangePending = false;
let currentWorkspaceFailure: 'unsupported' | 'unavailable' | undefined;

function renderPluginsView() {
  return render(
    <I18nProvider initial="en">
      <PluginsView />
    </I18nProvider>,
  );
}

describe('PluginsView Team panel workspace scope', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
    currentWorkspaceContext = workspaceContext('ws-a');
    currentWorkspaceLoading = false;
    currentIdentityChangePending = false;
    currentWorkspaceFailure = undefined;
    vi.mocked(listPlugins).mockResolvedValue([]);
    vi.mocked(listPluginMarketplaces).mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/team')) return jsonResponse({ ids: [] });
        return jsonResponse({});
      }),
    );
  });

  it('hides installed rows across an account boundary and does not query with the retired identity while pending', async () => {
    vi.mocked(fetchSkills).mockResolvedValue([]);
    let successorReadsFail = false;
    vi.mocked(listPlugins).mockImplementation(async (options = {}) => {
      if (successorReadsFail) throw new Error('successor account plugin catalog unavailable');
      if (options.workspaceContext?.workspaceId === 'ws-a') return [plugin('plugin-from-account-a')];
      return [];
    });

    const view = renderPluginsView();
    expect((await screen.findAllByText('plugin-from-account-a')).length).toBeGreaterThan(0);
    expect(vi.mocked(listPlugins)).toHaveBeenCalledTimes(2);

    act(() => {
      notifyWorkspaceContextRefresh();
      currentWorkspaceLoading = true;
      currentIdentityChangePending = true;
      view.rerender(
        <I18nProvider initial="en">
          <PluginsView />
        </I18nProvider>,
      );
    });

    expect(screen.queryAllByText('plugin-from-account-a')).toHaveLength(0);
    await act(async () => Promise.resolve());
    expect(vi.mocked(listPlugins)).toHaveBeenCalledTimes(2);

    // The successor account can legitimately expose the same Workspace/member
    // field values. Account generation, not those reusable strings, is the
    // boundary. Its failed read must still produce a safe empty catalog.
    successorReadsFail = true;
    currentWorkspaceLoading = false;
    currentIdentityChangePending = false;
    view.rerender(
      <I18nProvider initial="en">
        <PluginsView />
      </I18nProvider>,
    );
    await waitFor(() => expect(vi.mocked(listPlugins)).toHaveBeenCalledTimes(4));
    expect(screen.queryAllByText('plugin-from-account-a')).toHaveLength(0);

    currentWorkspaceContext = null;
    currentWorkspaceFailure = 'unavailable';
    view.rerender(
      <I18nProvider initial="en">
        <PluginsView />
      </I18nProvider>,
    );

    expect(screen.queryAllByText('plugin-from-account-a')).toHaveLength(0);
    await act(async () => Promise.resolve());
    expect(vi.mocked(listPlugins)).toHaveBeenCalledTimes(4);
  });

  it('does not retain another workspace skill or shared badge when the successor reads fail', async () => {
    vi.mocked(fetchSkills).mockImplementation(async (context) => {
      if (context?.workspaceId === 'ws-b') throw new Error('workspace B skills unavailable');
      return [skill('skill-from-a')];
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        const workspaceId = headers.get('x-od-workspace-id');
        if (url.endsWith('/plugins/team')) {
          if (workspaceId === 'ws-b') throw new Error('workspace B hub unavailable');
          return jsonResponse({ ids: [] });
        }
        if (url.endsWith('/skills/team')) {
          if (workspaceId === 'ws-b') throw new Error('workspace B hub unavailable');
          return jsonResponse({ ids: ['skill-from-a'] });
        }
        return jsonResponse({});
      }),
    );

    const view = renderPluginsView();
    fireEvent.click(await screen.findByTestId('plugins-tab-team'));
    const skillFromA = await screen.findByText('skill-from-a');
    expect(within(skillFromA.closest('article')!).getByText('Team')).toBeTruthy();

    currentWorkspaceContext = workspaceContext('ws-b');
    view.rerender(
      <I18nProvider initial="en">
        <PluginsView />
      </I18nProvider>,
    );

    expect(screen.queryByText('skill-from-a')).toBeNull();
    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(([context]) => context?.workspaceId === 'ws-b'),
      ).toBe(true),
    );
    expect(screen.queryByText('skill-from-a')).toBeNull();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('scopes each skills read and discards a late response for the previous workspace', async () => {
    const readA = deferred<SkillSummary[]>();
    const readB = deferred<SkillSummary[]>();
    vi.mocked(fetchSkills).mockImplementation((context) =>
      context?.workspaceId === 'ws-b' ? readB.promise : readA.promise,
    );

    const view = renderPluginsView();
    fireEvent.click(await screen.findByTestId('plugins-tab-team'));

    await waitFor(() =>
      expect(
        vi.mocked(fetchSkills).mock.calls.some(([context]) => context?.workspaceId === 'ws-a'),
      ).toBe(true),
    );

    // Keep ws-a pending and move the mounted panel to ws-b. The identity change
    // itself must start the successor read; correctness cannot wait for focus
    // or the 10-second poll.
    currentWorkspaceContext = workspaceContext('ws-b');
    view.rerender(
      <I18nProvider initial="en">
        <PluginsView />
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
    await waitFor(() => expect(screen.getByText('skill-from-b')).toBeTruthy());

    await act(async () => {
      readA.resolve([skill('skill-from-a')]);
      await Promise.resolve();
    });

    expect(screen.getByText('skill-from-b')).toBeTruthy();
    expect(screen.queryByText('skill-from-a')).toBeNull();
    expect(
      vi.mocked(fetchSkills).mock.calls.map(([context]) => context?.workspaceId),
    ).toEqual(['ws-a', 'ws-b']);
  });

  it('discards late parent plugin rows from the previous workspace', async () => {
    const readA = deferred<InstalledPluginRecord[]>();
    const readB = deferred<InstalledPluginRecord[]>();
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(listPlugins).mockImplementation((options = {}) =>
      options.workspaceContext?.workspaceId === 'ws-b' ? readB.promise : readA.promise,
    );

    const view = renderPluginsView();
    fireEvent.click(await screen.findByTestId('plugins-tab-team'));
    await waitFor(() =>
      expect(
        vi.mocked(listPlugins).mock.calls.filter(
          ([options]) => options?.workspaceContext?.workspaceId === 'ws-a',
        ),
      ).toHaveLength(2),
    );

    currentWorkspaceContext = workspaceContext('ws-b');
    view.rerender(
      <I18nProvider initial="en">
        <PluginsView />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect(
        vi.mocked(listPlugins).mock.calls.filter(
          ([options]) => options?.workspaceContext?.workspaceId === 'ws-b',
        ),
      ).toHaveLength(2),
    );

    await act(async () => {
      readB.resolve([plugin('plugin-from-b')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('plugin-from-b')).toBeTruthy());

    await act(async () => {
      readA.resolve([plugin('plugin-from-a')]);
      await Promise.resolve();
    });

    expect(screen.getByText('plugin-from-b')).toBeTruthy();
    expect(screen.queryByText('plugin-from-a')).toBeNull();
  });

  it('keeps the event-refreshed plugin rows when a same-identity read resolves late', async () => {
    const initialRead = deferred<InstalledPluginRecord[]>();
    const eventRead = deferred<InstalledPluginRecord[]>();
    vi.mocked(fetchSkills).mockResolvedValue([]);
    vi.mocked(listPlugins).mockImplementation(() => (
      vi.mocked(listPlugins).mock.calls.length <= 2
        ? initialRead.promise
        : eventRead.promise
    ));

    renderPluginsView();
    await waitFor(() => expect(vi.mocked(listPlugins)).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new CustomEvent('open-design:plugins-changed')));
    await waitFor(() => expect(vi.mocked(listPlugins)).toHaveBeenCalledTimes(4));

    await act(async () => {
      eventRead.resolve([plugin('fresh-plugin')]);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getAllByText('fresh-plugin').length).toBeGreaterThan(0));

    await act(async () => {
      initialRead.resolve([plugin('stale-plugin')]);
      await Promise.resolve();
    });
    expect(screen.getAllByText('fresh-plugin').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('stale-plugin')).toHaveLength(0);
  });

  it('discards late shared IDs issued for the previous workspace', async () => {
    const sharedA = {
      plugins: deferred<Response>(),
      skills: deferred<Response>(),
    };
    const sharedB = {
      plugins: deferred<Response>(),
      skills: deferred<Response>(),
    };
    const requestCounts = { plugins: 0, skills: 0 };
    vi.mocked(fetchSkills).mockImplementation(async (context) => [
      skill(`skill-from-${context?.workspaceId === 'ws-b' ? 'b' : 'a'}`),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/skills/skill-from-a/share')) {
          return Promise.resolve(jsonResponse({ shared: true }));
        }
        if (url.endsWith('/plugins/team')) {
          requestCounts.plugins += 1;
          if (requestCounts.plugins === 1) return Promise.resolve(jsonResponse({ ids: [] }));
          return requestCounts.plugins === 2 ? sharedA.plugins.promise : sharedB.plugins.promise;
        }
        if (url.endsWith('/skills/team')) {
          requestCounts.skills += 1;
          if (requestCounts.skills === 1) return Promise.resolve(jsonResponse({ ids: [] }));
          return requestCounts.skills === 2 ? sharedA.skills.promise : sharedB.skills.promise;
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );

    const view = renderPluginsView();
    fireEvent.click(await screen.findByTestId('plugins-tab-team'));
    const skillFromA = await screen.findByText('skill-from-a');
    await waitFor(() => expect(requestCounts).toEqual({ plugins: 1, skills: 1 }));
    fireEvent.click(within(skillFromA.closest('article')!).getByRole('button'));
    await waitFor(() => expect(requestCounts).toEqual({ plugins: 2, skills: 2 }));

    currentWorkspaceContext = workspaceContext('ws-b');
    view.rerender(
      <I18nProvider initial="en">
        <PluginsView />
      </I18nProvider>,
    );
    await waitFor(() => expect(requestCounts).toEqual({ plugins: 3, skills: 3 }));

    await act(async () => {
      sharedB.plugins.resolve(jsonResponse({ ids: [] }));
      sharedB.skills.resolve(jsonResponse({ ids: ['skill-from-b'] }));
      await Promise.resolve();
    });
    const skillFromB = await screen.findByText('skill-from-b');
    expect(within(skillFromB.closest('article')!).getByText('Team')).toBeTruthy();

    await act(async () => {
      sharedA.plugins.resolve(jsonResponse({ ids: [] }));
      sharedA.skills.resolve(jsonResponse({ ids: [] }));
      await Promise.resolve();
    });

    expect(within(skillFromB.closest('article')!).getByText('Team')).toBeTruthy();
    expect(
      vi.mocked(fetchSkills).mock.calls.map(([context]) => context?.workspaceId),
    ).toEqual(['ws-a', 'ws-a', 'ws-b']);
  });
});
