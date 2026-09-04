// @vitest-environment jsdom
//
// recvpZCr4MAqNQ: a project's name stayed "未命名" forever, even after its
// first prompt ran and produced real content. Root cause: the Drafts / All-
// projects empty-state "New project" CTA (`EntryShell.startBlankProjectFromRail`)
// created a project with the literal placeholder name and NO `nameSource`
// metadata at all. `canAutoRenameProjectFromPrompt` (utils/projectName.ts)
// only re-engages for `nameSource: 'generated' | 'prompt'` — a project
// missing the field entirely fails closed forever, unlike every other blank/
// no-name create path (`handleCreateProjectFromDesignSystem`, the New Project
// panel's blank pick), which already tag `nameSource: 'generated'`.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, AppConfig } from '../../src/types';
import {
  notifyWorkspaceContextRefresh,
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
} from '../../src/collab/useWorkspaceContext';
import { workspaceDirectoryFixture } from '../helpers/workspace-context';
import {
  fetchProjectFiles,
  invalidateProjectFilesCache,
} from '../../src/providers/registry';

const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

type EventSourceListener = (event: unknown) => void;
class MockWorkspaceEventSource {
  static instances: MockWorkspaceEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Set<EventSourceListener>>();

  constructor(readonly url: string) {
    MockWorkspaceEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: EventSourceListener): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }

  removeEventListener(name: string, listener: EventSourceListener): void {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string, data: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(data) });
    }
  }

  close(): void {}
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Drafts / All-projects are workspace-only views: EntryShell redirects them
// back to Home once the workspace-context read resolves with nothing. Give
// every test a resolved team context up front — the real bug reproduces
// inside a team workspace ("OD Feature Team" in the live acceptance check) —
// so the empty-state CTA renders deterministically instead of racing a
// same-tick redirect.
function teamContext(
  overrides: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    displayName: 'Ma Shu',
    ...overrides,
  };
}

function installFetchMock() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/workspace/directory')) {
      return jsonResponse(workspaceDirectoryFixture([teamContext()]));
    }
    if (pathname.endsWith('/workspace/context')) {
      return jsonResponse({ context: teamContext() });
    }
    if (pathname.endsWith('/workspace/projects/team')) {
      return jsonResponse({ projects: [] });
    }
    return jsonResponse({});
  }) as typeof fetch;
}

function cliAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude-code',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '1.0.0',
    models: [{ id: 'sonnet', label: 'Sonnet' }],
    ...overrides,
  };
}

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'claude-code',
    agentModels: { 'claude-code': { model: 'sonnet' } },
    apiProtocol: 'anthropic',
    apiProtocolConfigs: {},
    apiKey: '',
    baseUrl: '',
    model: '',
    theme: 'system',
    ...overrides,
  } as AppConfig;
}

function renderAt(path: string, overrides: Partial<React.ComponentProps<typeof EntryShell>> = {}) {
  window.history.replaceState(null, '', path);
  const props: React.ComponentProps<typeof EntryShell> = {
    skills: [],
    designTemplates: [],
    designSystems: [],
    projects: [],
    templates: [],
    promptTemplates: [],
    defaultDesignSystemId: null,
    connectors: [],
    connectorsLoading: false,
    config: baseConfig(),
    agents: [cliAgent()],
    daemonLive: true,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onAgentModelChange: vi.fn(),
    onApiProtocolChange: vi.fn(),
    onApiModelChange: vi.fn(),
    onConfigPersist: vi.fn(),
    onRefreshAgents: vi.fn(() => [cliAgent()]),
    onCreateProject: vi.fn(() => Promise.resolve(true)),
    onCreatePluginShareProject: vi.fn(),
    onImportClaudeDesign: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteProject: vi.fn(),
    onRenameProject: vi.fn(),
    onChangeDefaultDesignSystem: vi.fn(),
    onPersistComposioKey: vi.fn(),
    onOpenSettings: vi.fn(),
    onCompleteOnboarding: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider initial="en">
      <EntryShell {...props} />
    </I18nProvider>,
  );

  return props;
}

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  MockWorkspaceEventSource.instances = [];
  installFetchMock();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalResizeObserver;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  vi.unstubAllGlobals();
});

describe('EntryShell team project content readiness', () => {
  it('renders another member\'s catalog name and timestamp on Home instead of the fresh pulled placeholder', async () => {
    const catalogUpdatedAt = Date.now() - (2 * 24 * 60 * 60 * 1000);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: teamContext() });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'shared-pulled',
            ownerMemberId: 'wm-owner',
            sharedAt: '2026-07-25T00:00:00.000Z',
            name: 'Owner catalog name',
            updatedAt: catalogUpdatedAt,
          }],
        });
      }
      if (pathname.endsWith('/files')) return jsonResponse({ files: [] });
      return jsonResponse({});
    }) as typeof fetch;

    renderAt('/', {
      projects: [{
        id: 'shared-pulled',
        name: '共享项目',
        skillId: null,
        designSystemId: null,
        workspaceId: 'ws-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    });

    const card = await screen.findByTitle('Owner catalog name');
    expect(card.textContent).toContain('Owner catalog name');
    expect(card.textContent).toContain('2d ago');
    expect(card.textContent).not.toContain('just now');
  });

  it('opens a materialized local Team row without hydration or pull', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: teamContext() });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'shared-ready',
            ownerMemberId: 'wm-owner',
            sharedAt: '2026-07-25T00:00:00.000Z',
            name: 'Ready shared project',
            updatedAt: 42,
          }],
        });
      }
      if (pathname.endsWith('/files')) return jsonResponse({ files: [] });
      return jsonResponse({});
    }) as typeof fetch;
    const onTeamProjectContentReady = vi.fn(async () => true);
    const onOpenProject = vi.fn(async () => true);
    renderAt('/all-projects', {
      projects: [{
        id: 'shared-ready',
        name: '共享项目',
        skillId: null,
        designSystemId: null,
        workspaceId: 'ws-1',
        createdAt: 100,
        updatedAt: 100,
      }],
      onOpenProject,
      onTeamProjectContentReady,
    });

    const activeCard = await screen.findByRole('button', {
      name: /Ready shared project/,
    });
    fireEvent.click(activeCard);

    await waitFor(() => {
      expect(onOpenProject).toHaveBeenCalledWith(
        'shared-ready',
        undefined,
        {
          authoritative: true,
          name: 'Ready shared project',
          workspaceId: 'ws-1',
          workspaceMemberId: 'wm-1',
        },
      );
    });
    expect(onTeamProjectContentReady).not.toHaveBeenCalled();
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([input, init]) => (
      init?.method === 'POST'
      && String(input).includes('/api/projects/shared-ready/collab/pull')
    ))).toBe(false);
  });

  it('hydrates a local shared-project placeholder before opening it', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: teamContext() });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'shared-ready',
            ownerMemberId: 'wm-owner',
            sharedAt: '2026-07-25T00:00:00.000Z',
            name: 'Ready shared project',
            updatedAt: 42,
          }],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;
    let finishHydration!: (hydrated: boolean) => void;
    const hydration = new Promise<boolean>((resolve) => {
      finishHydration = resolve;
    });
    const onTeamProjectContentReady = vi.fn(async () => hydration);
    const onOpenProject = vi.fn(async () => true);
    renderAt('/all-projects', {
      projects: [{
        id: 'shared-ready',
        name: '共享项目',
        skillId: null,
        designSystemId: null,
        workspaceId: 'ws-1',
        metadata: { kind: 'prototype', sharedProjectPlaceholderAt: 100 },
        createdAt: 100,
        updatedAt: 100,
      }],
      onOpenProject,
      onTeamProjectContentReady,
    });

    const readyProjectCard = await screen.findByRole('button', {
      name: /Ready shared project/,
    });
    fireEvent.click(readyProjectCard);

    await waitFor(() => {
      expect(onTeamProjectContentReady).toHaveBeenCalledWith(
        'shared-ready',
        'ws-1',
        'wm-1',
      );
    });
    expect(onOpenProject).not.toHaveBeenCalled();

    await act(async () => {
      finishHydration(true);
      await hydration;
    });
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith(
      'shared-ready',
      undefined,
      {
        authoritative: true,
        name: 'Ready shared project',
        workspaceId: 'ws-1',
        workspaceMemberId: 'wm-1',
      },
    ));
  });

  it('hydrates only a catalog-confirmed ready project and opens it without a second pull', async () => {
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    const requests: Array<{
      url: string;
      method: string;
      workspaceId: string | null;
      workspaceMemberId: string | null;
    }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const pathname = new URL(url, 'http://d.local').pathname;
      const headers = new Headers(init?.headers);
      requests.push({
        url,
        method: init?.method ?? 'GET',
        workspaceId: headers.get('x-od-workspace-id'),
        workspaceMemberId: headers.get('x-od-workspace-member-id'),
      });
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: teamContext() });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'shared-ready',
            ownerMemberId: 'wm-owner',
            sharedAt: '2026-07-25T00:00:00.000Z',
            name: 'Ready shared project',
          }],
        });
      }
      if (pathname.endsWith('/files')) return jsonResponse({ files: [] });
      return jsonResponse({});
    }) as typeof fetch;
    const onOpenProject = vi.fn(async () => true);
    const onProjectsRefresh = vi.fn();
    let finishHydration!: (hydrated: boolean) => void;
    const hydration = new Promise<boolean>((resolve) => {
      finishHydration = resolve;
    });
    const onTeamProjectContentReady = vi.fn(async () => hydration);
    renderAt('/all-projects', {
      onOpenProject,
      onProjectsRefresh,
      onTeamProjectContentReady,
    });

    expect(await screen.findByText('Ready shared project')).toBeTruthy();
    expect(MockWorkspaceEventSource.instances).toHaveLength(1);
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'shared-ready',
        workspaceId: 'ws-1',
      });
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'shared-ready',
        workspaceId: 'ws-1',
      });
    });
    await waitFor(() => {
      expect(onTeamProjectContentReady).toHaveBeenCalledWith('shared-ready', 'ws-1', 'wm-1');
    });
    expect(onTeamProjectContentReady).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Ready shared project'));
    expect(onOpenProject).not.toHaveBeenCalled();
    expect(
      requests.some(({ url, method }) =>
        method === 'POST' && url.includes('/api/projects/shared-ready/collab/pull')),
    ).toBe(false);
    await act(async () => {
      finishHydration(true);
      await hydration;
    });
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith(
      'shared-ready',
      undefined,
      {
        authoritative: true,
        name: 'Ready shared project',
        workspaceId: 'ws-1',
        workspaceMemberId: 'wm-1',
      },
    ));
    expect(onProjectsRefresh).not.toHaveBeenCalled();
    expect(
      requests.some(({ url, method }) =>
        method === 'POST' && url.includes('/api/projects/shared-ready/collab/pull')),
    ).toBe(false);
  });

  it('bootstraps a progressive open when ready hydration does not succeed', async () => {
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    const workspace = teamContext();
    const materializedFile = {
      name: 'index.html',
      path: 'index.html',
      size: 128,
      mtime: 123,
      isDirectory: false,
      kind: 'code' as const,
      mime: 'text/html',
    };
    let bootstrapSucceeded = false;
    const requests: Array<{
      url: string;
      method: string;
      workspaceId: string | null;
      workspaceMemberId: string | null;
    }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const pathname = new URL(url, 'http://d.local').pathname;
      const headers = new Headers(init?.headers);
      requests.push({
        url,
        method: init?.method ?? 'GET',
        workspaceId: headers.get('x-od-workspace-id'),
        workspaceMemberId: headers.get('x-od-workspace-member-id'),
      });
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: workspace });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'shared-ready',
            ownerMemberId: 'wm-owner',
            sharedAt: '2026-07-25T00:00:00.000Z',
            name: 'Ready shared project',
          }],
        });
      }
      if (pathname.endsWith('/collab/bootstrap') && init?.method === 'PUT') {
        bootstrapSucceeded = true;
        return jsonResponse({ ok: true, awaitingFirstMaterialization: true }, 202);
      }
      if (pathname.endsWith('/files')) {
        return jsonResponse({ files: bootstrapSucceeded ? [materializedFile] : [] });
      }
      return jsonResponse({});
    }) as typeof fetch;
    const onOpenProject = vi.fn(async () => true);
    const onProjectsRefresh = vi.fn();
    let finishHydration!: (hydrated: boolean) => void;
    const hydration = new Promise<boolean>((resolve) => {
      finishHydration = resolve;
    });
    const onTeamProjectContentReady = vi.fn(async () => hydration);
    renderAt('/all-projects', {
      onOpenProject,
      onProjectsRefresh,
      onTeamProjectContentReady,
    });

    await expect(fetchProjectFiles('shared-ready', {
      workspaceContext: workspace,
      fresh: true,
    })).resolves.toEqual([]);

    expect(await screen.findByText('Ready shared project')).toBeTruthy();
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'shared-ready',
        workspaceId: 'ws-1',
      });
    });
    await waitFor(() => expect(onTeamProjectContentReady).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTitle('Ready shared project'));
    expect(
      requests.some(({ url, method }) =>
        method === 'PUT' && url.includes('/api/projects/shared-ready/collab/bootstrap')),
    ).toBe(false);
    await act(async () => {
      finishHydration(false);
      await hydration;
    });
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith(
      'shared-ready',
      undefined,
      {
        authoritative: true,
        name: 'Ready shared project',
        workspaceId: 'ws-1',
        workspaceMemberId: 'wm-1',
      },
    ));
    expect(onProjectsRefresh).toHaveBeenCalledTimes(1);
    expect(
      requests.some(({ url, method }) =>
        method === 'PUT' && url.includes('/api/projects/shared-ready/collab/bootstrap')),
    ).toBe(true);
    const bootstrapRequest = requests.find(
      ({ url, method }) =>
        method === 'PUT'
        && url.includes('/api/projects/shared-ready/collab/bootstrap'),
    );
    expect(bootstrapRequest).toMatchObject({
      workspaceId: 'ws-1',
      workspaceMemberId: 'wm-1',
    });
    await expect(fetchProjectFiles('shared-ready', {
      workspaceContext: workspace,
    })).resolves.toEqual([materializedFile]);
    invalidateProjectFilesCache('shared-ready', workspace);
  });

  it('clears content-ready latches when the member changes inside the same workspace', async () => {
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    let workspaceMemberId = 'wm-1';
    const requests: Array<{ url: string; method: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const pathname = new URL(url, 'http://d.local').pathname;
      requests.push({ url, method: init?.method ?? 'GET' });
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({
          context: teamContext({
            workspaceMemberId,
            displayName: workspaceMemberId === 'wm-1' ? 'Member A' : 'Member B',
          }),
        });
      }
      if (pathname.endsWith('/workspace/projects/team')) {
        return jsonResponse({
          projects: [{
            projectId: 'shared-ready',
            ownerMemberId: 'wm-owner',
            sharedAt: '2026-07-25T00:00:00.000Z',
            name: 'Ready shared project',
          }],
        });
      }
      if (pathname.endsWith('/files')) return jsonResponse({ files: [] });
      return jsonResponse({});
    }) as typeof fetch;
    const onOpenProject = vi.fn(async () => true);
    const onProjectsRefresh = vi.fn();
    const onTeamProjectContentReady = vi.fn(async () => true);
    renderAt('/all-projects', {
      onOpenProject,
      onProjectsRefresh,
      onTeamProjectContentReady,
    });

    expect(await screen.findByText('Ready shared project')).toBeTruthy();
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'shared-ready',
        workspaceId: 'ws-1',
      });
    });
    await waitFor(() => {
      expect(onTeamProjectContentReady).toHaveBeenCalledWith(
        'shared-ready',
        'ws-1',
        'wm-1',
      );
    });

    workspaceMemberId = 'wm-2';
    act(() => {
      notifyWorkspaceContextRefresh({
        context: teamContext({
          workspaceMemberId,
          displayName: 'Member B',
        }),
      });
    });
    // Barrier: the member switch must land in the shell before the click
    // below, or it would capture wm-1. The account name is no longer rendered
    // as visible text (320a36ac1 made the trigger avatar-only and moved the
    // name into the hover menu) — it survives as the trigger's aria-label,
    // which is the same value in the always-mounted chrome.
    expect(await screen.findByLabelText('Member B')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Ready shared project'));
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith(
      'shared-ready',
      undefined,
      {
        authoritative: true,
        name: 'Ready shared project',
        workspaceId: 'ws-1',
        workspaceMemberId: 'wm-2',
      },
    ));
    expect(onProjectsRefresh).toHaveBeenCalledTimes(1);
    expect(
      requests.some(({ url, method }) =>
        method === 'PUT' && url.includes('/api/projects/shared-ready/collab/bootstrap')),
    ).toBe(true);
    expect(onTeamProjectContentReady).toHaveBeenCalledTimes(1);
  });

  it('retries a ready hydration after its catalog row arrives', async () => {
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    let releaseCatalog!: (response: Response) => void;
    const catalogResponse = new Promise<Response>((resolve) => {
      releaseCatalog = resolve;
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return jsonResponse(workspaceDirectoryFixture([teamContext()]));
      }
      if (pathname.endsWith('/workspace/context')) {
        return jsonResponse({ context: teamContext() });
      }
      if (pathname.endsWith('/workspace/projects/team')) return catalogResponse;
      if (pathname.endsWith('/files')) return jsonResponse({ files: [] });
      return jsonResponse({});
    }) as typeof fetch;
    const onTeamProjectContentReady = vi.fn(async () => true);
    renderAt('/all-projects', { onTeamProjectContentReady });

    await waitFor(() => expect(MockWorkspaceEventSource.instances).toHaveLength(1));
    // Barrier: wait for the workspace context to land before dispatching the
    // readiness event. Read it off the account trigger's aria-label — the
    // avatar-only trigger (320a36ac1) no longer prints the name as text.
    await screen.findByLabelText('Ma Shu');
    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'shared-ready',
        workspaceId: 'ws-1',
      });
    });
    expect(onTeamProjectContentReady).not.toHaveBeenCalled();

    releaseCatalog(jsonResponse({
      projects: [{
        projectId: 'shared-ready',
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-25T00:00:00.000Z',
        name: 'Ready shared project',
      }],
    }));
    expect(await screen.findByText('Ready shared project')).toBeTruthy();
    await waitFor(() => {
      expect(onTeamProjectContentReady).toHaveBeenCalledWith('shared-ready', 'ws-1', 'wm-1');
    });
  });
});

describe('EntryShell blank-project creation tags nameSource', () => {
  it('tags the Drafts empty-state "New project" CTA as generated', async () => {
    const props = renderAt('/drafts');

    const cta = await screen.findByRole('button', { name: 'New project' });
    fireEvent.click(cta);

    expect(props.onCreateProject).toHaveBeenCalledTimes(1);
    expect(props.onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Untitled',
        metadata: expect.objectContaining({ nameSource: 'generated' }),
      }),
    );
  });

  it('tags the All-projects empty-state "New project" CTA as generated', async () => {
    const props = renderAt('/all-projects');

    const cta = await screen.findByRole('button', { name: 'New project' });
    fireEvent.click(cta);

    expect(props.onCreateProject).toHaveBeenCalledTimes(1);
    expect(props.onCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Untitled',
        metadata: expect.objectContaining({ nameSource: 'generated' }),
      }),
    );
  });
});
