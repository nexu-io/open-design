// @vitest-environment jsdom

// Red-spec for the home/all-projects thumbnail request budget (Batch A §4.2).
//
// Evidence baseline (electron-project-waterfall-20260727): clicking a project
// from the all-projects grid left 52 thumbnail preview documents in flight and
// pushed initial concurrency to 65. The cover *probes* are already queued at
// concurrency 2 and aborted on card open, but the preview iframes themselves
// have no viewport gating, no concurrency budget, no click-time suspension,
// and a strip remount re-probes every project from scratch.
//
// The contract under test:
//   1. Cards that never come near the viewport start no cover work at all.
//   2. At most THUMBNAIL_LOAD_BUDGET (6) cover iframes are loading at once;
//      the rest wait for a slot and all cards eventually render.
//   3. Opening a card immediately suspends still-loading cover iframes.
//   4. Remounting the strip reuses the last successful cover decision (LRU
//      snapshot) instead of re-probing every project.

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectFile } from '../../src/types';

const registryMocks = vi.hoisted(() => ({
  fetchProjectFiles: vi.fn(
    async (): Promise<ProjectFile[]> => [
      {
        name: 'index.html',
        path: 'index.html',
        size: 10,
        mtime: 1,
        kind: 'html',
        mime: 'text/html',
      } as ProjectFile,
    ],
  ),
  fetchProjectFileText: vi.fn(async () => null),
}));

vi.mock('../../src/collab/useTeamMembers', () => ({
  useTeamMembers: () => ({ resolve: () => null }),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  notifyTeamProjectsChanged: vi.fn(),
  useWorkspaceBilling: () => null,
  useWorkspaceContext: () => ({ context: null }),
}));

vi.mock('../../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(),
}));

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFiles: registryMocks.fetchProjectFiles,
  fetchProjectFileText: registryMocks.fetchProjectFileText,
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';

// ---------------------------------------------------------------------------
// IntersectionObserver stub: nothing is "near the viewport" until a test
// explicitly fires intersections, mirroring an offscreen grid in jsdom (which
// has no layout). Observed elements are recorded per observer instance.
// ---------------------------------------------------------------------------

type IORecord = {
  cb: IntersectionObserverCallback;
  elements: Set<Element>;
  observer: IntersectionObserver;
};

const ioRecords: IORecord[] = [];

class StubIntersectionObserver {
  private record: IORecord;

  constructor(cb: IntersectionObserverCallback) {
    this.record = { cb, elements: new Set(), observer: this as unknown as IntersectionObserver };
    ioRecords.push(this.record);
  }

  observe(el: Element): void {
    this.record.elements.add(el);
  }

  unobserve(el: Element): void {
    this.record.elements.delete(el);
  }

  disconnect(): void {
    this.record.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function intersectAll(): void {
  for (const record of [...ioRecords]) {
    const entries = [...record.elements].map(
      (el) =>
        ({ isIntersecting: true, target: el }) as unknown as IntersectionObserverEntry,
    );
    if (entries.length === 0) continue;
    act(() => {
      record.cb(entries, record.observer);
    });
  }
}

const flush = async (hops = 6): Promise<void> => {
  for (let i = 0; i < hops; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

// ---------------------------------------------------------------------------
// Fetch stub: counts HEAD cover probes. The strip verifies HTML covers with
// fetch(src, { method: 'HEAD' }) before mounting the preview iframe.
// ---------------------------------------------------------------------------

const headCalls: string[] = [];

beforeEach(() => {
  headCalls.length = 0;
  ioRecords.length = 0;
  registryMocks.fetchProjectFiles.mockClear();
  vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') headCalls.push(String(input));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1000,
  } as Project;
}

function renderStrip(
  projects: Project[],
  onOpen: (id: string) => boolean | void | Promise<boolean | void> = () => {},
) {
  return render(
    <RecentProjectsStrip
      projects={projects}
      heading="All projects"
      onOpen={onOpen}
      space="team"
      limit={1000}
    />,
  );
}

const range = (n: number): number[] => Array.from({ length: n }, (_v, i) => i);

function mountedCoverIframes(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>('iframe.recent-projects__thumb-iframe')];
}

/** Fire `load` on every not-yet-settled iframe, then flush. */
async function settleLoadedIframes(fired: Set<Element>): Promise<void> {
  for (const frame of mountedCoverIframes()) {
    if (fired.has(frame)) continue;
    fired.add(frame);
    fireEvent.load(frame);
  }
  await flush();
}

describe('RecentProjectsStrip thumbnail request budget (Batch A §4.2)', () => {
  it('starts no cover work for cards that never come near the viewport', async () => {
    renderStrip(range(12).map((i) => makeProject(`offscreen-${i}`)));
    await flush(20);

    expect(registryMocks.fetchProjectFiles).not.toHaveBeenCalled();
    expect(headCalls).toHaveLength(0);
    expect(mountedCoverIframes()).toHaveLength(0);
  });

  it('does not probe local files for an unmaterialized shared-project placeholder', async () => {
    const placeholder = makeProject('remote-placeholder');
    placeholder.metadata = { kind: 'prototype', sharedProjectPlaceholderAt: 20 };
    renderStrip([placeholder]);
    await flush();
    intersectAll();
    await flush(20);

    expect(registryMocks.fetchProjectFiles).not.toHaveBeenCalled();
    expect(headCalls).toHaveLength(0);
    expect(mountedCoverIframes()).toHaveLength(0);
  });

  it('keeps concurrently loading cover iframes within the budget and still renders every card', async () => {
    renderStrip(range(10).map((i) => makeProject(`budget-${i}`)));
    await flush();
    intersectAll();
    await flush(30);
    // Covers resolve asynchronously; the verified frames register their own
    // viewport observation before mounting the iframe.
    intersectAll();
    await flush(30);

    const initiallyLoading = mountedCoverIframes();
    expect(initiallyLoading.length).toBeGreaterThan(0);
    expect(initiallyLoading.length).toBeLessThanOrEqual(6);

    // As documents finish loading, queued cards take the freed slots until the
    // whole grid has rendered.
    const fired = new Set<Element>();
    const seenSrcs = new Set<string>();
    for (let round = 0; round < 12 && seenSrcs.size < 10; round++) {
      for (const frame of mountedCoverIframes()) {
        seenSrcs.add(frame.getAttribute('src') ?? '');
      }
      await settleLoadedIframes(fired);
      intersectAll();
      await flush(10);
    }
    for (const frame of mountedCoverIframes()) {
      seenSrcs.add(frame.getAttribute('src') ?? '');
    }
    expect(seenSrcs.size).toBe(10);
  });

  it('reuses the last successful cover decision on remount instead of re-probing', async () => {
    const projects = range(4).map((i) => makeProject(`lru-${i}`));
    const first = renderStrip(projects);
    await flush();
    intersectAll();
    await flush(30);
    intersectAll();
    await flush(30);
    const fired = new Set<Element>();
    await settleLoadedIframes(fired);

    const filesAfterFirst = registryMocks.fetchProjectFiles.mock.calls.length;
    const headAfterFirst = headCalls.length;
    expect(headAfterFirst).toBeGreaterThan(0);

    first.unmount();
    renderStrip(projects);
    await flush();
    intersectAll();
    await flush(30);
    intersectAll();
    await flush(30);

    expect(registryMocks.fetchProjectFiles.mock.calls.length).toBe(filesAfterFirst);
    expect(headCalls.length).toBe(headAfterFirst);
    // The cached decision still renders a cover (it must not cache "nothing").
    expect(mountedCoverIframes().length).toBeGreaterThan(0);
  });

  it('suspends still-loading cover iframes the moment a card is opened', async () => {
    renderStrip(range(8).map((i) => makeProject(`open-${i}`)));
    await flush();
    intersectAll();
    await flush(30);
    intersectAll();
    await flush(30);

    expect(mountedCoverIframes().length).toBeGreaterThan(0);

    const openButtons = document.querySelectorAll<HTMLButtonElement>(
      'button.recent-projects__card-main',
    );
    expect(openButtons.length).toBeGreaterThan(0);
    fireEvent.click(openButtons[0]!);
    await flush();

    // None of the iframes had finished loading; opening a project must not let
    // them keep competing with the project's own foreground reads.
    expect(mountedCoverIframes()).toHaveLength(0);
  });
});
