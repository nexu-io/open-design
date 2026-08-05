// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

const workspaceMock = vi.hoisted(() => ({
  state: {
    context: null as WorkspaceCollabContext | null,
    loading: false,
    identityChangePending: false,
    failure: undefined as 'unsupported' | 'unavailable' | undefined,
  },
}));

const workspaceInvalidationHarness = vi.hoisted(() => ({
  onActive: [] as Array<() => void>,
  autoActivate: true,
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((
    _handlers: Record<string, (payload: any) => void>,
    options?: { onActive?: () => void; enabled?: boolean; workspaceContext?: WorkspaceCollabContext | null },
  ) => {
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

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => workspaceMock.state,
    useTeamProjects: () => ({ projects: [], loading: false, reload: vi.fn() }),
  };
});

vi.mock('../../src/components/HomeHero', () => ({
  HomeHero: React.forwardRef(function HomeHeroMock(props: {
    pluginOptions: Array<{ id: string }>;
    pluginsLoading: boolean;
    onStartBlankProject: () => void;
  }) {
    return (
      <div>
        <output data-testid="plugin-catalog">
          {props.pluginsLoading ? 'loading' : props.pluginOptions.map((plugin) => plugin.id).join(',')}
        </output>
        <button type="button" onClick={props.onStartBlankProject}>blank</button>
      </div>
    );
  }),
}));

vi.mock('../../src/components/AppWashKineticGrid', () => ({
  AppWashKineticGrid: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import {
  notifyWorkspaceContextRefresh,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';

function teamContext(workspaceId: string, workspaceMemberId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_basic',
    providerMode: 'platform_credits',
    teamId: `team-${workspaceId}`,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  };
}

function plugin(id: string) {
  return {
    id,
    title: id,
    version: '1.0.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: `/tmp/${id}`,
    capabilitiesGranted: [],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: { name: id, title: id, version: '1.0.0', od: { kind: 'scenario' } },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderHome() {
  return render(
    <HomeView
      projects={[]}
      onSubmit={() => undefined}
      onOpenProject={() => undefined}
      onViewAllProjects={() => undefined}
    />,
  );
}

describe('HomeView workspace-scoped plugin catalog', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetWorkspaceContextCache();
    workspaceMock.state = {
      context: null,
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    workspaceInvalidationHarness.onActive.length = 0;
    workspaceInvalidationHarness.autoActivate = true;
  });

  it('parks hidden plugin invalidations and performs one bounded catch-up when Home activates', async () => {
    let pluginReads = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
        pluginReads += 1;
        return new Response(JSON.stringify({ plugins: [plugin(`plugin-${pluginReads}`)] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    workspaceMock.state = {
      context: teamContext('workspace-focus', 'member-focus'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    const view = render(
      <HomeView
        isActive={false}
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await act(async () => Promise.resolve());
    expect(pluginReads).toBe(0);
    act(() => window.dispatchEvent(new CustomEvent('open-design:plugins-changed')));
    await act(async () => Promise.resolve());
    expect(pluginReads).toBe(0);

    view.rerender(
      <HomeView
        isActive
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );
    await waitFor(() => expect(pluginReads).toBe(1));
    await waitFor(() => {
      expect(screen.getByTestId('plugin-catalog').textContent).toBe('plugin-1');
    });

    pluginReads = 0;
    const onActive = workspaceInvalidationHarness.onActive.at(-1);
    expect(onActive).toBeTypeOf('function');
    act(() => onActive?.());
    await waitFor(() => expect(pluginReads).toBe(1));
  });

  it('masks A immediately, fetches B with exact headers, and ignores A resolving late', async () => {
    const a = deferred<Response>();
    const b = deferred<Response>();
    const pluginRequests: Array<{ headers: Headers; resolve: typeof a.resolve }> = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/plugins') {
        const request = pluginRequests.length === 0 ? a : b;
        pluginRequests.push({ headers: new Headers(init?.headers), resolve: request.resolve });
        return request.promise;
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    workspaceMock.state = {
      context: teamContext('workspace-a', 'member-a'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    const view = renderHome();
    await waitFor(() => expect(pluginRequests).toHaveLength(1));

    workspaceMock.state = {
      context: teamContext('workspace-b', 'member-b'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    view.rerender(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    expect(screen.getByTestId('plugin-catalog').textContent).not.toContain('plugin-a');
    await waitFor(() => expect(pluginRequests).toHaveLength(2));
    expect(pluginRequests[1]?.headers.get('x-od-workspace-id')).toBe('workspace-b');
    expect(pluginRequests[1]?.headers.get('x-od-workspace-member-id')).toBe('member-b');

    b.resolve(new Response(JSON.stringify({ plugins: [plugin('plugin-b')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await waitFor(() => expect(screen.getByTestId('plugin-catalog').textContent).toBe('plugin-b'));

    a.resolve(new Response(JSON.stringify({ plugins: [plugin('plugin-a')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await Promise.resolve();
    expect(screen.getByTestId('plugin-catalog').textContent).toBe('plugin-b');
  });

  it('does not create through the previous workspace while an identity change is pending', async () => {
    const projectCreates: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects' && init?.method === 'POST') projectCreates.push(init);
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    workspaceMock.state = {
      context: teamContext('workspace-a', 'member-a'),
      loading: false,
      identityChangePending: true,
      failure: undefined,
    };
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'blank' }));

    await Promise.resolve();
    expect(projectCreates).toHaveLength(0);
  });

  it('restarts a cold plugin read after a transient identity mask instead of joining the cancelled request', async () => {
    const firstRead = deferred<Response>();
    const recoveredRead = deferred<Response>();
    let pluginReads = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
        pluginReads += 1;
        return pluginReads === 1 ? firstRead.promise : recoveredRead.promise;
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    workspaceMock.state = {
      context: null,
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    const view = renderHome();
    await waitFor(() => expect(pluginReads).toBe(1));

    workspaceMock.state = {
      ...workspaceMock.state,
      identityChangePending: true,
    };
    view.rerender(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );
    expect(screen.getByTestId('plugin-catalog').textContent).toBe('loading');

    workspaceMock.state = {
      ...workspaceMock.state,
      identityChangePending: false,
    };
    view.rerender(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    await waitFor(() => expect(pluginReads).toBe(2));
    recoveredRead.resolve(new Response(JSON.stringify({ plugins: [plugin('recovered-plugin')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await waitFor(() => {
      expect(screen.getByTestId('plugin-catalog').textContent).toBe('recovered-plugin');
    });

    firstRead.resolve(new Response(JSON.stringify({ plugins: [plugin('cancelled-plugin')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId('plugin-catalog').textContent).toBe('recovered-plugin');
  });

  it('does not reuse a warm catalog across accounts with identical workspace fields', async () => {
    let requestCount = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
        requestCount += 1;
        return new Response(JSON.stringify({
          plugins: [plugin(`account-${requestCount}`)],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    workspaceMock.state = {
      context: teamContext('workspace-same', 'member-same'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    const view = renderHome();
    await waitFor(() => expect(screen.getByTestId('plugin-catalog').textContent).toBe('account-1'));

    // A sign-in/sign-out boundary advances the account generation even when
    // the next account happens to expose the same Workspace/member fields.
    notifyWorkspaceContextRefresh();
    view.rerender(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    expect(screen.getByTestId('plugin-catalog').textContent).not.toContain('account-1');
    await waitFor(() => expect(screen.getByTestId('plugin-catalog').textContent).toBe('account-2'));
    expect(requestCount).toBe(2);
  });

  it('keeps the event-refreshed catalog when the same-identity mount read resolves late', async () => {
    const mountRead = deferred<Response>();
    const eventRead = deferred<Response>();
    let requestCount = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
        requestCount += 1;
        return requestCount === 1 ? mountRead.promise : eventRead.promise;
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    workspaceMock.state = {
      context: teamContext('workspace-a', 'member-a'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };

    renderHome();
    await waitFor(() => expect(requestCount).toBe(1));
    act(() => window.dispatchEvent(new CustomEvent('open-design:plugins-changed')));
    await waitFor(() => expect(requestCount).toBe(2));

    eventRead.resolve(new Response(JSON.stringify({ plugins: [plugin('fresh-plugin')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await waitFor(() => expect(screen.getByTestId('plugin-catalog').textContent).toBe('fresh-plugin'));

    mountRead.resolve(new Response(JSON.stringify({ plugins: [plugin('stale-plugin')] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId('plugin-catalog').textContent).toBe('fresh-plugin');
  });
});
