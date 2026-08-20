// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deckPreviewSrcDoc,
  RecentProjectsStrip,
} from '../../src/components/RecentProjectsStrip';
import {
  fetchProjectFiles,
  fetchProjectFileText,
  invalidateProjectFilesCache,
} from '../../src/providers/registry';
import type { Project } from '../../src/types';

const recentWorkspaceState = vi.hoisted(() => ({
  context: {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    providerMode: 'platform_credits',
    planId: null,
    seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3 },
    permissions: {},
    teamId: 'team-1',
  },
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  notifyTeamProjectsChanged: vi.fn(),
  useWorkspaceBilling: () => null,
  useWorkspaceContext: () => ({
    context: recentWorkspaceState.context,
    loading: false,
    failure: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async (projectId: string, name: string) => {
    if (projectId === 'project-ds' && name === 'brand.json') {
      return JSON.stringify({
        logo: { primary: 'logos/favicon-1.png' },
        imagery: { samples: [{ file: 'imagery/cover-0.png', kind: 'cover' }] },
      });
    }
    if (projectId === 'project-ds-fallback' && name === 'brand.json') {
      return JSON.stringify({
        logo: {
          primary: 'logos/favicon-1.png',
          alternates: ['logos/wordmark.svg'],
        },
      });
    }
    return null;
  }),
  fetchProjectFiles: vi.fn(async (projectId: string) => {
    if (projectId === 'project-ds') {
      return [
        { name: 'favicon-1.png', path: 'logos/favicon-1.png', kind: 'image', mtime: 4, size: 0, mime: 'image/png' },
        { name: 'cover-0.png', path: 'imagery/cover-0.png', kind: 'image', mtime: 3, size: 0, mime: 'image/png' },
      ];
    }
    if (projectId === 'project-ds-fallback') {
      return [
        { name: 'favicon-1.png', path: 'logos/favicon-1.png', kind: 'image', mtime: 4, size: 0, mime: 'image/png' },
        { name: 'wordmark.svg', path: 'logos/wordmark.svg', kind: 'image', mtime: 3, size: 0, mime: 'image/svg+xml' },
      ];
    }
    if (projectId === 'project-html') {
      return [{ name: 'index.html', kind: 'html', mtime: 200, size: 0, mime: 'text/html' }];
    }
    if (projectId === 'project-deck') {
      return [{ name: 'index.html', kind: 'html', mtime: 400, size: 0, mime: 'text/html' }];
    }
    return [];
  }),
  invalidateProjectFilesCache: vi.fn(),
  projectFileUrl: (
    projectId: string,
    fileName: string,
    workspaceContext?: { workspaceId: string; workspaceMemberId: string } | null,
  ) => {
    const base = `/api/projects/${projectId}/files/${fileName}`;
    return workspaceContext
      ? `${base}?workspaceId=${workspaceContext.workspaceId}&workspaceMemberId=${workspaceContext.workspaceMemberId}`
      : base;
  },
}));

afterEach(() => {
  cleanup();
  Object.assign(recentWorkspaceState.context, {
    displayName: undefined,
    avatarUrl: undefined,
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(invalidateProjectFilesCache).mockClear();
  vi.mocked(fetchProjectFiles).mockReset().mockImplementation(async (projectId: string) => {
    if (projectId === 'project-ds') {
      return [
        { name: 'favicon-1.png', path: 'logos/favicon-1.png', kind: 'image', mtime: 4, size: 0, mime: 'image/png' },
        { name: 'cover-0.png', path: 'imagery/cover-0.png', kind: 'image', mtime: 3, size: 0, mime: 'image/png' },
      ];
    }
    if (projectId === 'project-ds-fallback') {
      return [
        { name: 'favicon-1.png', path: 'logos/favicon-1.png', kind: 'image', mtime: 4, size: 0, mime: 'image/png' },
        { name: 'wordmark.svg', path: 'logos/wordmark.svg', kind: 'image', mtime: 3, size: 0, mime: 'image/svg+xml' },
      ];
    }
    if (projectId === 'project-html') {
      return [{ name: 'index.html', kind: 'html', mtime: 200, size: 0, mime: 'text/html' }];
    }
    if (projectId === 'project-deck') {
      return [{ name: 'index.html', kind: 'html', mtime: 400, size: 0, mime: 'text/html' }];
    }
    return [];
  });
});

function project(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...overrides,
  };
}

function projects(count: number): Project[] {
  return Array.from({ length: count }, (_, index) =>
    project({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      updatedAt: count - index,
    }),
  );
}

function stubCoverProbe(status = 200, statusText = 'OK', body = '<html><body>slide</body></html>') {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/workspace/context')) {
      return new Response(JSON.stringify({
        context: {
          workspaceId: 'ws-1',
          workspaceType: 'team',
          workspaceMemberId: 'wm-1',
          role: 'member',
          memberStatus: 'active',
          lifecycleState: 'active',
          billingState: 'active',
          planId: null,
          providerMode: 'platform_credits',
          seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3 },
          permissions: {},
          teamId: 'team-1',
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    // Deck cards read the cover document (GET) to build their first-slide
    // srcDoc; plain HTML cards only HEAD-probe it.
    text: async () => body,
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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

describe('RecentProjectsStrip', () => {
  it('turns a script-activated deck into a deterministic visible first-page cover', () => {
    const cover = deckPreviewSrcDoc(`<!doctype html>
      <html><head><style>
        #stage { position: fixed; top: 50%; left: 50%; width: 1920px; height: 1080px }
        .slide { display: none; opacity: 0; visibility: hidden }
        .slide.active,
        .slide.is-active { display: flex; opacity: 1; visibility: visible }
        [data-anim] { opacity: 0; transform: translateY(24px) }
      </style></head><body>
        <div id="stage">
          <section class="slide orange"><h1 data-anim="fade-up">Launch</h1></section>
          <section class="slide dark"><h1>Details</h1></section>
        </div>
        <script>document.querySelector('.slide').classList.add('is-active')</script>
      </body></html>`);

    expect(cover).not.toContain('<script>');
    expect(cover).toMatch(
      /<section class="slide orange active is-active" data-od-cover-slide(?:="")?>/,
    );
    expect(cover).toContain('[data-od-cover-slide] > *');
    expect(cover).toContain(':where(body *):has(> [data-od-cover-slide])');
    expect(cover).toContain('transform-origin: 0 0 !important');
    expect(cover).toContain('[data-od-cover-slide] [data-anim]');
    expect(cover).toContain('opacity: 1 !important');
    expect(cover).toContain('.slide:not([data-od-cover-slide])');
  });

  it('lets a 16:9 project cover determine its grid-card height without a taller minimum', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/styles/home/recent-projects.css'),
      'utf8',
    );
    const gridThumb = css.match(
      /\.recent-projects__row--grid \.recent-projects__card-thumb\s*\{([^}]*)\}/u,
    )?.[1];
    expect(gridThumb).toContain('min-height: 0');
    expect(gridThumb).not.toContain('min-height: 108px');
  });

  it('scans a shared project cover once after the same card materializes', async () => {
    stubCoverProbe();
    vi.mocked(fetchProjectFiles).mockResolvedValue([{
      name: 'index.html',
      path: 'index.html',
      kind: 'html',
      mtime: 703,
      size: 0,
      mime: 'text/html',
    }]);
    const placeholder = project({
      id: 'project-materializing',
      name: 'Materializing project',
      updatedAt: 8,
      metadata: { kind: 'other', sharedProjectPlaceholderAt: 7 },
    });
    const materialized = project({
      id: placeholder.id,
      name: placeholder.name,
      updatedAt: placeholder.updatedAt,
    });

    const { container, rerender } = render(
      <RecentProjectsStrip
        projects={[placeholder]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchProjectFiles).not.toHaveBeenCalled();

    rerender(
      <RecentProjectsStrip
        projects={[materialized]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    await waitFor(() => {
      expect(fetchProjectFiles).toHaveBeenCalledTimes(1);
      expect(container.querySelector('.recent-projects__card-thumb-html')).not.toBeNull();
      expect(
        (container.querySelector('iframe') as HTMLIFrameElement | null)?.getAttribute('src'),
      ).toContain('workspaceId=ws-1');
    });
    expect(fetchProjectFiles).toHaveBeenCalledWith(
      'project-materializing',
      expect.objectContaining({
        workspaceContext: expect.objectContaining({
          workspaceId: 'ws-1',
          workspaceMemberId: 'wm-1',
        }),
      }),
    );
  });

  it('renders the signed-in creator name and profile image for a self-owned project', async () => {
    Object.assign(recentWorkspaceState.context, {
      displayName: 'Elian Zhang',
      avatarUrl: 'https://example.com/elian.png',
    });

    const { container } = render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-owned', name: 'Owned project' })]}
        onOpen={() => {}}
      />,
    );

    await screen.findByText('Created by Elian Zhang');
    expect(screen.queryByText('Created by Me')).toBeNull();
    const avatar = container.querySelector<HTMLImageElement>('.recent-projects__card-owner img');
    expect(avatar?.src).toBe('https://example.com/elian.png');
  });

  it('refreshes only the card named by team-project-content-ready', async () => {
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    stubCoverProbe();
    vi.mocked(fetchProjectFiles).mockImplementation(async (projectId: string) => {
      if (
        projectId === 'project-ready' &&
        vi.mocked(fetchProjectFiles).mock.calls.filter(([id]) => id === projectId).length > 1
      ) {
        return [{
          name: 'index.html',
          path: 'index.html',
          kind: 'html',
          mtime: 700,
          size: 0,
          mime: 'text/html',
        }];
      }
      return [];
    });

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({ id: 'project-ready', name: 'Ready project' }),
          project({ id: 'project-other', name: 'Other project' }),
        ]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(2));
    expect(fetchProjectFiles).toHaveBeenCalledWith(
      'project-ready',
      expect.objectContaining({
        workspaceContext: expect.objectContaining({
          workspaceId: 'ws-1',
          workspaceMemberId: 'wm-1',
        }),
      }),
    );
    expect(container.querySelector('.recent-projects__card-thumb-html')).toBeNull();
    expect(MockWorkspaceEventSource.instances).toHaveLength(1);

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'project-ready',
        workspaceId: 'ws-1',
      });
    });

    await waitFor(() => expect(container.querySelector('.recent-projects__card-thumb-html')).not.toBeNull());
    expect(
      (container.querySelector('iframe') as HTMLIFrameElement | null)?.getAttribute('src'),
    ).toContain('workspaceId=ws-1');
    const readyProjectCalls = vi.mocked(fetchProjectFiles).mock.calls.filter(
      ([id]) => id === 'project-ready',
    );
    expect(readyProjectCalls).toHaveLength(2);
    // The first scan can settle with [] immediately before proactive Team
    // materialization emits content-ready. A force cover refresh that only
    // bypasses the thumbnail snapshot still reuses fetchProjectFiles' 1s
    // settled cache and misses the freshly-promoted files. The authoritative
    // ready event must force the exact Workspace file list too.
    expect(readyProjectCalls[1]?.[1]).toEqual(expect.objectContaining({
      fresh: true,
      workspaceContext: expect.objectContaining({
        workspaceId: 'ws-1',
        workspaceMemberId: 'wm-1',
      }),
    }));
    expect(invalidateProjectFilesCache).toHaveBeenCalledWith(
      'project-ready',
      expect.objectContaining({
        workspaceId: 'ws-1',
        workspaceMemberId: 'wm-1',
      }),
    );
    expect(vi.mocked(fetchProjectFiles).mock.calls.filter(([id]) => id === 'project-other')).toHaveLength(1);
  });

  it('rechecks unresolved visible covers when the workspace stream reconnects', async () => {
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    stubCoverProbe();
    vi.mocked(fetchProjectFiles)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        name: 'index.html',
        path: 'index.html',
        kind: 'html',
        mtime: 701,
        size: 0,
        mime: 'text/html',
      }]);

    const { container } = render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-catch-up', name: 'Catch-up project' })]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(1));
    expect(container.querySelector('.recent-projects__card-thumb-html')).toBeNull();

    act(() => {
      MockWorkspaceEventSource.instances[0]!.onopen?.();
    });

    await waitFor(() => {
      expect(fetchProjectFiles).toHaveBeenCalledTimes(2);
      expect(container.querySelector('.recent-projects__card-thumb-html')).not.toBeNull();
    });
  });

  it('does not let a stale initial cover scan overwrite a newer content-ready result', async () => {
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    stubCoverProbe();
    let resolveInitial!: (files: Awaited<ReturnType<typeof fetchProjectFiles>>) => void;
    const initial = new Promise<Awaited<ReturnType<typeof fetchProjectFiles>>>((resolve) => {
      resolveInitial = resolve;
    });
    vi.mocked(fetchProjectFiles)
      .mockReturnValueOnce(initial)
      .mockResolvedValueOnce([{
        name: 'index.html',
        path: 'index.html',
        kind: 'html',
        mtime: 702,
        size: 0,
        mime: 'text/html',
      }]);

    const { container } = render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-race', name: 'Race project' })]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(1));
    const staleSignal = vi.mocked(fetchProjectFiles).mock.calls[0]?.[1]?.signal;
    expect(staleSignal).toBeDefined();

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'project-race',
        workspaceId: 'ws-1',
      });
    });
    await waitFor(() => {
      expect(container.querySelector('.recent-projects__card-thumb-html')).not.toBeNull();
    });
    expect(staleSignal?.aborted).toBe(true);

    await act(async () => {
      resolveInitial([]);
      await initial;
    });
    expect(container.querySelector('.recent-projects__card-thumb-html')).not.toBeNull();
  });

  it('coalesces repeated active catch-up while an unresolved cover scan is already in flight', async () => {
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    const pending = new Promise<Awaited<ReturnType<typeof fetchProjectFiles>>>(() => {});
    vi.mocked(fetchProjectFiles).mockReturnValue(pending);

    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-inflight', name: 'In-flight project' })]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(1));

    act(() => {
      MockWorkspaceEventSource.instances[0]!.onopen?.();
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchProjectFiles).toHaveBeenCalledTimes(1);
  });

  it('aborts an unresolved background cover read when Home unmounts for a reopen', async () => {
    let coverSignal: AbortSignal | undefined;
    vi.mocked(fetchProjectFiles).mockImplementation((_projectId, options) => {
      coverSignal = options?.signal;
      return new Promise((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve([]), { once: true });
      });
    });

    const { unmount } = render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-reopen', name: 'Reopen project' })]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(1));

    unmount();

    expect(coverSignal).toBeDefined();
    expect(coverSignal?.aborted).toBe(true);
  });

  it('bounds a large cover scan and aborts it before opening a foreground project', async () => {
    const activeSignals = new Set<AbortSignal>();
    const startedSignals: AbortSignal[] = [];
    vi.mocked(fetchProjectFiles).mockImplementation((_projectId, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('cover request must be cancellable');
      activeSignals.add(signal);
      startedSignals.push(signal);
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            activeSignals.delete(signal);
            resolve([]);
          },
          { once: true },
        );
      });
    });
    const onOpen = vi.fn(() => {
      expect(activeSignals.size).toBe(0);
      expect(startedSignals.every((signal) => signal.aborted)).toBe(true);
    });

    render(
      <RecentProjectsStrip
        projects={projects(20)}
        limit={1000}
        onOpen={onOpen}
        heading="All projects"
      />,
    );

    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalled());
    expect(fetchProjectFiles).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTitle('Project 1'));

    expect(onOpen).toHaveBeenCalledWith('project-1');
    expect(activeSignals.size).toBe(0);
    await act(async () => {});
    expect(fetchProjectFiles).toHaveBeenCalledTimes(2);
  });

  it('resumes the bounded cover scan when a shared-project foreground open fails', async () => {
    const activeSignals = new Set<AbortSignal>();
    vi.mocked(fetchProjectFiles).mockImplementation((_projectId, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('cover request must be cancellable');
      activeSignals.add(signal);
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            activeSignals.delete(signal);
            resolve([]);
          },
          { once: true },
        );
      });
    });
    let finishOpen!: (opened: boolean) => void;
    const onOpen = vi.fn(() => new Promise<boolean>((resolve) => {
      finishOpen = resolve;
    }));

    render(
      <RecentProjectsStrip
        projects={projects(20)}
        limit={1000}
        onOpen={onOpen}
        heading="All projects"
      />,
    );
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTitle('Project 1'));
    expect(activeSignals.size).toBe(0);
    expect(fetchProjectFiles).toHaveBeenCalledTimes(2);

    act(() => finishOpen(false));

    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(4));
    expect(activeSignals.size).toBe(2);
  });

  it('keeps HTML cover probes inside the same bounded queue and aborts them before open', async () => {
    vi.mocked(fetchProjectFiles).mockImplementation(async (projectId) => [{
      name: 'index.html',
      path: 'index.html',
      kind: 'html',
      mtime: Number(projectId.replace('project-', '')),
      size: 1,
      mime: 'text/html',
    }]);
    const activeCoverSignals = new Set<AbortSignal>();
    const coverFetch = vi.fn<typeof fetch>((input, init) => {
      if (String(input).includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({ context: null }), {
          headers: { 'content-type': 'application/json' },
        }));
      }
      const signal = init?.signal;
      if (!signal) throw new Error('HTML cover probe must be cancellable');
      activeCoverSignals.add(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          activeCoverSignals.delete(signal);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    });
    vi.stubGlobal('fetch', coverFetch);
    const onOpen = vi.fn(() => {
      expect(activeCoverSignals.size).toBe(0);
    });

    render(
      <RecentProjectsStrip
        projects={projects(20)}
        limit={1000}
        onOpen={onOpen}
        heading="All projects"
      />,
    );

    await waitFor(() => expect(activeCoverSignals.size).toBeGreaterThan(0));
    expect(coverFetch.mock.calls.filter(([input]) => String(input).includes('/api/projects/')))
      .toHaveLength(2);

    fireEvent.click(screen.getByTitle('Project 1'));

    expect(onOpen).toHaveBeenCalledWith('project-1');
    expect(activeCoverSignals.size).toBe(0);
    await act(async () => {});
    expect(coverFetch.mock.calls.filter(([input]) => String(input).includes('/api/projects/')))
      .toHaveLength(2);
  });

  it('does not start queued work while cancelling a saturated priority replacement', async () => {
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    stubCoverProbe();
    const activeSignals = new Set<AbortSignal>();
    const pending: Array<{
      projectId: string;
      finish: (files?: Awaited<ReturnType<typeof fetchProjectFiles>>) => void;
    }> = [];
    vi.mocked(fetchProjectFiles).mockImplementation((projectId, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error('cover request must be cancellable');
      activeSignals.add(signal);
      return new Promise((resolve) => {
        const finish = (files: Awaited<ReturnType<typeof fetchProjectFiles>> = []) => {
          activeSignals.delete(signal);
          resolve(files);
        };
        pending.push({ projectId, finish });
        signal.addEventListener('abort', () => finish(), { once: true });
      });
    });

    render(
      <RecentProjectsStrip
        projects={projects(5)}
        limit={1000}
        onOpen={() => {
          expect(activeSignals.size).toBe(0);
        }}
        heading="All projects"
      />,
    );
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(2));

    act(() => {
      MockWorkspaceEventSource.instances[0]!.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'project-5',
        workspaceId: 'ws-1',
      });
    });
    expect(fetchProjectFiles).toHaveBeenCalledTimes(2);

    act(() => pending.find(({ projectId }) => projectId === 'project-1')!.finish());
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(3));
    expect(vi.mocked(fetchProjectFiles).mock.calls[2]?.[0]).toBe('project-5');

    fireEvent.click(screen.getByTitle('Project 2'));

    expect(activeSignals.size).toBe(0);
    await act(async () => {});
    expect(fetchProjectFiles).toHaveBeenCalledTimes(3);
  });

  it('keeps the force-refresh replacement request abortable after the stale request settles late', async () => {
    // Cover probes are viewport-gated and deduped per card, so StrictMode's
    // synthetic remount no longer produces an aborted twin request — a card
    // issues exactly ONE live scan. The overlap this case guards (a stale
    // request settling late must not orphan the live replacement's abort
    // controller) is still reachable in production through the
    // team-project-content-ready force refresh, so that path drives it now.
    MockWorkspaceEventSource.instances = [];
    vi.stubGlobal('EventSource', MockWorkspaceEventSource as unknown as typeof EventSource);
    stubCoverProbe();
    const requests: Array<{
      resolve: (files: Awaited<ReturnType<typeof fetchProjectFiles>>) => void;
      signal: AbortSignal;
    }> = [];
    vi.mocked(fetchProjectFiles).mockImplementation((_projectId, options) =>
      new Promise((resolve) => {
        if (!options?.signal) throw new Error('cover request must be cancellable');
        requests.push({ resolve, signal: options.signal });
      }),
    );

    const { unmount } = render(
      <StrictMode>
        <RecentProjectsStrip
          projects={[project({ id: 'project-replay', name: 'Replay project' })]}
          onOpen={() => {}}
          heading="All projects"
        />
      </StrictMode>,
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.signal.aborted).toBe(false);

    // Let the workspace context resolve so the content-ready handler accepts
    // the event's workspace id.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(MockWorkspaceEventSource.instances.length).toBeGreaterThan(0);
    // StrictMode's synthetic remount can leave an earlier, closed EventSource
    // behind; the live subscription is the most recent instance.
    const liveSource =
      MockWorkspaceEventSource.instances[MockWorkspaceEventSource.instances.length - 1]!;
    act(() => {
      liveSource.dispatch('team-project-content-ready', {
        type: 'team-project-content-ready',
        projectId: 'project-replay',
        workspaceId: 'ws-1',
      });
    });

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(requests[1]?.signal.aborted).toBe(false);

    await act(async () => {
      requests[0]?.resolve([]);
      await Promise.resolve();
    });
    expect(requests[1]?.signal.aborted).toBe(false);

    unmount();

    expect(requests[1]?.signal.aborted).toBe(true);
    await act(async () => {
      requests[1]?.resolve([]);
      await Promise.resolve();
    });
  });

  it('aborts hidden Home scans and does not continue a design-system read into brand.json', async () => {
    vi.mocked(fetchProjectFileText).mockClear();
    let coverSignal: AbortSignal | undefined;
    vi.mocked(fetchProjectFiles).mockImplementation((_projectId, options) => {
      coverSignal = options?.signal;
      return new Promise((resolve) => {
        options?.signal?.addEventListener(
          'abort',
          () => resolve([
            {
              name: 'logo.svg',
              path: 'assets/logo.svg',
              kind: 'image',
              mtime: 1,
              size: 1,
              mime: 'image/svg+xml',
            },
          ]),
          { once: true },
        );
      });
    });

    const projectToReopen = project({
      id: 'project-ds-reopen',
      name: 'Design System',
      metadata: { kind: 'other', importedFrom: 'design-system' },
    });
    const { rerender } = render(
      <RecentProjectsStrip
        isActive
        projects={[projectToReopen]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );
    await waitFor(() => expect(fetchProjectFiles).toHaveBeenCalledTimes(1));

    rerender(
      <RecentProjectsStrip
        isActive={false}
        projects={[projectToReopen]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    expect(coverSignal?.aborted).toBe(true);
    await act(async () => {});
    expect(fetchProjectFileText).not.toHaveBeenCalled();
  });

  it('shows seven projects when the row has room for a seventh card', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        width: this.classList.contains('recent-projects__row') ? 1332 : 180,
        height: 100,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    const { container } = render(
      <RecentProjectsStrip
        projects={projects(8)}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('.recent-projects__card')).toHaveLength(7);
    });
  });

  it('keeps six projects when the row is below the wide-card threshold', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        width: this.classList.contains('recent-projects__row') ? 1331 : 180,
        height: 100,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    const { container } = render(
      <RecentProjectsStrip
        projects={projects(8)}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(container.querySelectorAll('.recent-projects__card')).toHaveLength(6);
  });

  it('remeasures when projects arrive after the initial empty render', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1400,
    });

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        width: this.classList.contains('recent-projects__row') ? 1331 : 180,
        height: 100,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    const { container, rerender } = render(
      <RecentProjectsStrip
        projects={[]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    rerender(
      <RecentProjectsStrip
        projects={projects(8)}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(container.querySelectorAll('.recent-projects__card')).toHaveLength(6);
  });

  it('matches project cards with previews and design-system tags', async () => {
    stubCoverProbe();

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-ds',
            name: 'Acme Design System',
            updatedAt: 4,
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(screen.getByText('Design System')).toBeTruthy();
    expect(screen.getAllByText('Prototype').length).toBeGreaterThan(0);
    const designSystemCard = container.querySelector('.recent-projects__card.is-design-system-project');
    expect(designSystemCard).toBeTruthy();
    expect(designSystemCard?.querySelectorAll('.design-card-tag')).toHaveLength(1);

    await waitFor(() => {
      expect(designSystemCard?.querySelector('.recent-projects__card-thumb-image img')).toBeTruthy();
      expect(designSystemCard?.querySelector('img')?.getAttribute('src')).toBe(
        '/api/projects/project-ds/files/imagery/cover-0.png?workspaceId=ws-1&workspaceMemberId=wm-1&v=3',
      );
      const htmlFrame = container.querySelector<HTMLIFrameElement>('.recent-projects__card-thumb-html iframe');
      expect(htmlFrame).toBeTruthy();
      expect(htmlFrame?.getAttribute('src')).toBe(
        '/api/projects/project-html/files/index.html?workspaceId=ws-1&workspaceMemberId=wm-1&v=200',
      );
      expect(container.querySelector('.recent-projects__card-thumb-html .recent-projects__card-glyph')).toBeNull();
    });
  });

  it('uses non-favicon design-system logo alternates when no cover exists', async () => {
    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-ds-fallback',
            name: 'Acme Design System',
            updatedAt: 4,
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const designSystemCard = container.querySelector('.recent-projects__card.is-design-system-project');

    await waitFor(() => {
      expect(designSystemCard?.querySelector('.recent-projects__card-thumb-logo img')).toBeTruthy();
      expect(designSystemCard?.querySelector('img')?.getAttribute('src')).toBe(
        '/api/projects/project-ds-fallback/files/logos/wordmark.svg?workspaceId=ws-1&workspaceMemberId=wm-1&v=3',
      );
    });
  });

  it('renders HTML and deck covers from the current file URL', async () => {
    const fetchMock = stubCoverProbe();

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-deck',
            name: 'Simple Deck',
            updatedAt: 4,
            metadata: { kind: 'deck' },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const deckCard = container.querySelector('[data-project-id="project-deck"]');
    const htmlCard = container.querySelector('[data-project-id="project-html"]');

    await waitFor(() => {
      // #5517 collapses a deck card to its first slide, so its frame is built
      // from the fetched document (srcDoc) rather than pointed at the live URL
      // — a running deck would otherwise show whichever slide it drifted to.
      // The URL is still the versioned one, which is what this spec guards.
      expect(deckCard?.querySelector('.recent-projects__deck-iframe')?.getAttribute('srcdoc'))
        .toContain('slide');
      expect(htmlCard?.querySelector('iframe')?.getAttribute('src')).toBe(
        '/api/projects/project-html/files/index.html?workspaceId=ws-1&workspaceMemberId=wm-1&v=200',
      );
      expect(deckCard?.querySelector('.recent-projects__card-glyph')).toBeNull();
      expect(htmlCard?.querySelector('.recent-projects__card-glyph')).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-deck/files/index.html?workspaceId=ws-1&workspaceMemberId=wm-1&v=400',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'x-od-workspace-id': 'ws-1',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-html/files/index.html?workspaceId=ws-1&workspaceMemberId=wm-1&v=200',
      expect.objectContaining({
        cache: 'no-store',
        method: 'HEAD',
        headers: expect.objectContaining({
          'x-od-workspace-id': 'ws-1',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });

  it('falls back to the glyph and logs when an HTML cover is unavailable', async () => {
    stubCoverProbe(404, 'Not Found');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    await waitFor(() => {
      const htmlThumb = container.querySelector('.recent-projects__card-thumb');
      expect(htmlThumb?.querySelector('iframe')).toBeNull();
      expect(htmlThumb?.querySelector('.recent-projects__card-glyph')?.textContent).toBe('W');
      expect(warn).toHaveBeenCalledWith(
        '[project-cover] HTML cover unavailable (404 Not Found):',
        'project-html:index.html',
      );
    });
  });
});

describe('recvq5fpqrXzV1 — per-card move-to-team menu item', () => {
  // A personal-only workspace has no team plane to move a draft INTO — the
  // daemon 403s the request. The bulk toolbar already gates its equivalent
  // actions on `collaborationAvailable` (canBulkMoveToTeam/
  // canBulkMoveToPersonal); this per-card "..." menu item was missing the
  // same gate, so it stayed clickable and always failed.
  it('hides the move-to-team/move-out-of-team item when collaboration is unavailable', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Draft' })]}
        onOpen={() => {}}
        onDuplicate={() => {}}
        collaborationEnabled={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.queryByRole('menuitem', { name: /Move to team space|Move out of team space/i })).toBeNull();
  });

  it('shows the move-to-team item when collaboration is available', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Draft' })]}
        onOpen={() => {}}
        onDuplicate={() => {}}
        collaborationEnabled
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menuitem', { name: /Move to team space/i })).toBeTruthy();
  });
});

describe('recvqabp2Uy23r — shared badge grid overlay vs list inline', () => {
  // The badge has two renderings (see recent-projects.css): a floating
  // hover-revealed overlay inside the thumb (grid) and an always-visible
  // inline pill next to the name (list, whose 128x52 thumb has no room for
  // the overlay). Both must actually be wired to the shared card — a
  // shared project rendering neither is exactly this bug.
  it('renders the shared badge as a thumb overlay in grid view', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Shared One' })]}
        onOpen={() => {}}
        heading="All projects"
        isSharedProject={(id) => id === 'project-1'}
      />,
    );

    const badge = screen.getByText('Shared').closest('.recent-projects__card-badge');
    expect(badge).not.toBeNull();
    expect(badge?.classList.contains('recent-projects__card-badge--inline')).toBe(false);
    expect(badge?.closest('.recent-projects__card-thumb')).not.toBeNull();
  });

  it('renders the shared badge inline next to the name in list view', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Shared One' })]}
        onOpen={() => {}}
        heading="All projects"
        isSharedProject={(id) => id === 'project-1'}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    const badge = screen.getByText('Shared').closest('.recent-projects__card-badge');
    expect(badge).not.toBeNull();
    expect(badge?.classList.contains('recent-projects__card-badge--inline')).toBe(true);
    expect(badge?.closest('.recent-projects__card-name-row')).not.toBeNull();
  });

  it('renders no shared badge at all for a project that is not shared', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Private One' })]}
        onOpen={() => {}}
        heading="All projects"
        isSharedProject={() => false}
      />,
    );

    expect(screen.queryByText('Shared')).toBeNull();
  });
});

describe('recvqbipG9QDTt — Recent Projects filter needs a visible clear entry', () => {
  // RecentProjectsStrip mounts once per host view and stays alive across
  // EntryShell tab switches — Home's instance in particular is only ever
  // hidden via `content-visibility`, never unmounted — so kindFilter /
  // ownerFilter state survives a round trip through another tab with no
  // visible sign anything is filtered. A filter that now matches zero
  // projects reads as "my projects disappeared" instead of "a filter is on".
  it('shows no clear-filters entry while the default (unfiltered) view is showing', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Only Project' })]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    expect(screen.queryByTestId('recent-projects-clear-filters')).toBeNull();
  });

  it('surfaces a clear-filters entry once the type filter hides every project, and restores the grid on click', () => {
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Only Project' })]}
        onOpen={() => {}}
        heading="All projects"
      />,
    );

    // Every project here falls back to the 'prototype' card category
    // (projectCategory's default), so filtering to Media leaves zero
    // matches — exactly the "did my projects disappear?" scenario reported.
    fireEvent.click(screen.getByRole('button', { name: 'Any type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Media' }));

    expect(screen.queryByText('Only Project')).toBeNull();
    const clearButton = screen.getByTestId('recent-projects-clear-filters');

    fireEvent.click(clearButton);

    expect(screen.getByText('Only Project')).toBeTruthy();
    expect(screen.queryByTestId('recent-projects-clear-filters')).toBeNull();
    expect(screen.getByRole('button', { name: 'Any type' })).toBeTruthy();
  });
});

describe('recvqaRqM0dv2x — per-card Duplicate menu item', () => {
  // Duplicating a project you did not create always 403s (the daemon's
  // canDuplicate mirrors canMutate: privileged-or-selfCreated only). The item
  // used to render without the same ownedBySelf gate Rename/Delete already
  // carry, so it stayed enabled on a foreign team-shared card and looked like
  // a dead click when pressed.
  it('disables Duplicate for a project owned by another team member', () => {
    const onDuplicate = vi.fn();
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Shared project' })]}
        onOpen={() => {}}
        onDuplicate={onDuplicate}
        projectOwnerMemberIds={new Map([['project-1', 'someone-else']])}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const duplicateItem = screen.getByRole('menuitem', { name: 'Duplicate project' });
    expect((duplicateItem as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(duplicateItem);
    expect(onDuplicate).not.toHaveBeenCalled();
  });

  it('keeps Duplicate enabled and wired for a project the current member created', () => {
    const onDuplicate = vi.fn();
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'My project' })]}
        onOpen={() => {}}
        onDuplicate={onDuplicate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const duplicateItem = screen.getByRole('menuitem', { name: 'Duplicate project' });
    expect((duplicateItem as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(duplicateItem);
    expect(onDuplicate).toHaveBeenCalledWith('project-1');
  });
});

describe('team-shared project with unresolved owner identity', () => {
  // The hub list can arrive before its owner directory/map (or the catalog
  // read can transiently fail). Unknown is not proof that the viewer owns a
  // shared project: treating it as self-owned exposes rename/delete/unshare
  // actions that the daemon must reject, which is exactly the misleading
  // "move out of team space failed" menu QA reported.
  it('fails closed instead of offering owner-only mutations', () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'Shared project' })]}
        onOpen={() => {}}
        onRename={onRename}
        onDelete={onDelete}
        collaborationEnabled
        isSharedProject={(projectId) => projectId === 'project-1'}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    expect((screen.getByRole('menuitem', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('menuitem', { name: /Move out of team space/i })).toBeNull();
    expect((screen.getByRole('menuitem', { name: /In team space/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('menuitem', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('recvqbh189zBY6 — single-card delete confirmation', () => {
  // commitDelete used to await onDelete and drop the result either way, so a
  // 403/network failure closed the confirm dialog exactly like a success —
  // the project stayed put with no signal anything had gone wrong.
  it('keeps the dialog open with a visible error when the delete request fails', async () => {
    const onDelete = vi.fn(async () => false);
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'My project' })]}
        onOpen={() => {}}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('project-1');
      expect(within(dialog).getByRole('alert')).toBeTruthy();
    });
    // The dialog is still open — nothing pretended the project was gone.
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('closes the dialog on a successful delete', async () => {
    const onDelete = vi.fn(async () => true);
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'My project' })]}
        onOpen={() => {}}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('project-1');
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('submits at most one delete while the request is pending', async () => {
    let resolveDelete!: (value: true) => void;
    const pendingDelete = new Promise<true>((resolve) => {
      resolveDelete = resolve;
    });
    const onDelete = vi.fn(() => pendingDelete);
    render(
      <RecentProjectsStrip
        projects={[project({ id: 'project-1', name: 'My project' })]}
        onOpen={() => {}}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect(within(dialog).getByText(/My project/)).toBeTruthy();

    await act(async () => resolveDelete(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
