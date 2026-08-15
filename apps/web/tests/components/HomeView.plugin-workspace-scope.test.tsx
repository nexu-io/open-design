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
    pluginOptions: Array<{ id: string; title: string }>;
    pluginsLoading: boolean;
    prompt: string;
    onStartBlankProject: () => void;
    activePluginTitle: string | null;
    activePluginRecord: { id: string; title: string } | null;
    activeSkillRecord: { id: string; name: string } | null;
    selectedPluginContexts: Array<{ id: string; title: string }>;
    selectedDesignSystemId: string | null;
    onPickExamplePlugin: (record: any, chipId: string, promptText: string) => void;
    onPickPlugin: (record: any, nextPrompt: string | null) => void;
    onPickSkill: (skill: any, nextPrompt: string | null) => void;
    onDesignSystemChange: (id: string | null) => void;
  }, _ref) {
    return (
      <div>
        <output data-testid="plugin-catalog">
          {props.pluginsLoading ? 'loading' : props.pluginOptions.map((plugin) => plugin.id).join(',')}
        </output>
        <output data-testid="prompt">{props.prompt}</output>
        <output data-testid="active-plugin">
          {props.activePluginRecord ? `${props.activePluginRecord.id}:${props.activePluginRecord.title}` : 'none'}
        </output>
        <output data-testid="plugin-contexts">
          {props.selectedPluginContexts.map((record) => `${record.id}:${record.title}`).join(',') || 'none'}
        </output>
        <output data-testid="active-skill">
          {props.activeSkillRecord ? `${props.activeSkillRecord.id}:${props.activeSkillRecord.name}` : 'none'}
        </output>
        <output data-testid="active-design-system">{props.selectedDesignSystemId ?? 'none'}</output>
        {props.pluginOptions.map((record) => (
          <span key={record.id}>
            <button type="button" onClick={() => props.onPickExamplePlugin(record, 'prototype', 'draft')}>active-{record.id}</button>
            <button type="button" onClick={() => props.onPickPlugin(record, null)}>context-{record.id}</button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => props.onPickSkill({ id: 'shared-skill', name: 'Skill A', description: '', triggers: [], mode: 'prototype', previewType: 'none', designSystemRequired: false, defaultFor: [], upstream: null, hasBody: true, examplePrompt: '' }, null)}
        >skill</button>
        <button type="button" onClick={() => props.onDesignSystemChange('shared-ds')}>design-system</button>
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

function plugin(id: string, title = id) {
  return {
    id,
    title,
    version: '1.0.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: `/tmp/${id}`,
    capabilitiesGranted: [],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: { name: id, title, version: '1.0.0', od: { kind: 'scenario' } },
  };
}

function designSystem(id: string, title: string) {
  return {
    id,
    title,
    source: 'user' as const,
    status: 'published' as const,
    category: 'Brand',
    summary: `${title} summary`,
    swatches: ['#111111'],
    surface: 'web' as const,
    isEditable: true,
  };
}

function skill(name: string) {
  return {
    id: 'shared-skill',
    name,
    description: '',
    triggers: [],
    mode: 'prototype' as const,
    previewType: 'none',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
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

  it('rebinds same-id staged resources to B without clearing the draft', async () => {
    let workspaceB = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
        return new Response(JSON.stringify({
          plugins: [plugin('shared-plugin', workspaceB ? 'Plugin B' : 'Plugin A')],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    workspaceMock.state = {
      context: teamContext('workspace-a', 'member-a'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    const view = render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        skills={[skill('Skill A')]}
        designSystems={[designSystem('shared-ds', 'DS A')]}
      />,
    );
    await screen.findByRole('button', { name: 'active-shared-plugin' });
    fireEvent.click(screen.getByRole('button', { name: 'active-shared-plugin' }));
    fireEvent.click(screen.getByRole('button', { name: 'context-shared-plugin' }));
    fireEvent.click(screen.getByRole('button', { name: 'design-system' }));

    workspaceB = true;
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
        skills={[skill('Skill B')]}
        designSystems={[designSystem('shared-ds', 'DS B')]}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('active-plugin').textContent).toBe('shared-plugin:Plugin B'));
    expect(screen.getByTestId('plugin-contexts').textContent).toBe('shared-plugin:Plugin B');
    expect(screen.getByTestId('prompt').textContent).toBe('draft');
    expect(screen.getByTestId('active-design-system').textContent).toBe('shared-ds');
  });

  it('invalidates only staged resources missing from B', async () => {
    let workspaceB = false;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
        return new Response(JSON.stringify({
          plugins: workspaceB ? [] : [plugin('workspace-a-plugin', 'Plugin A')],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    workspaceMock.state = {
      context: teamContext('workspace-a', 'member-a'),
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    const view = render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        skills={[skill('Skill A')]}
        designSystems={[designSystem('shared-ds', 'DS A')]}
      />,
    );
    await screen.findByRole('button', { name: 'active-workspace-a-plugin' });
    fireEvent.click(screen.getByRole('button', { name: 'active-workspace-a-plugin' }));
    fireEvent.click(screen.getByRole('button', { name: 'context-workspace-a-plugin' }));
    fireEvent.click(screen.getByRole('button', { name: 'design-system' }));

    workspaceB = true;
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
        skills={[]}
        designSystems={[]}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('active-plugin').textContent).toBe('none'));
    expect(screen.getByTestId('plugin-contexts').textContent).toBe('none');
    expect(screen.getByTestId('prompt').textContent).toBe('draft');
    expect(screen.getByTestId('active-design-system').textContent).toBe('none');
  });

  it('rebinds a same-id active skill and invalidates it when the next catalog omits it', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input) === '/api/plugins') {
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
      identityChangePending: false,
      failure: undefined,
    };
    const view = render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        skills={[skill('Skill A')]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'skill' }));
    expect(screen.getByTestId('active-skill').textContent).toBe('shared-skill:Skill A');

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
        skills={[skill('Skill B')]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('active-skill').textContent).toBe('shared-skill:Skill B'));

    workspaceMock.state = {
      context: teamContext('workspace-c', 'member-c'),
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
        skills={[]}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('active-skill').textContent).toBe('none'));
  });

  it('creates locally without stale Workspace attribution while identity changes', async () => {
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

    await waitFor(() => expect(projectCreates).toHaveLength(1));
    const requestHeaders = new Headers(projectCreates[0]?.headers);
    expect(requestHeaders.has('x-od-workspace-id')).toBe(false);
    expect(requestHeaders.has('x-od-workspace-member-id')).toBe(false);
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
