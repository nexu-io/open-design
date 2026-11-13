import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { listProjects } from '../../src/state/projects';
import { workspaceContextFixture } from '../helpers/workspace-context';

type Row = { id: string; name: string };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listProjects fresh reads', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetCoalescedGet();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares a settled read inside the burst window by default', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ projects: [{ id: 'a', name: 'A' }] }));

    await listProjects();
    await listProjects();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses a just-settled read when the daemon says the list changed', async () => {
    const answers: Row[][] = [[{ id: 'a', name: 'Before' }], [{ id: 'a', name: 'After' }]];
    fetchMock.mockImplementation(async () => jsonResponse({ projects: answers.shift() }));

    await listProjects();
    const refreshed = await listProjects({ fresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.map((project) => project.name)).toEqual(['After']);
  });

  it('does not join a read that started before the change it was told about', async () => {
    let releaseStale!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { releaseStale = resolve; }),
    );
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ projects: [{ id: 'a', name: 'After' }] }),
    );

    const inFlight = listProjects();
    const refreshed = await listProjects({ fresh: true });
    releaseStale(jsonResponse({ projects: [{ id: 'a', name: 'Before' }] }));
    await inFlight;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.map((project) => project.name)).toEqual(['After']);
  });

  it('applies the same bypass to a workspace-scoped list', async () => {
    const context = workspaceContextFixture({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
    const summary = (name: string) => ({
      workspaceId: 'workspace-a',
      visibility: 'personal',
      project: { id: 'a', name },
    });
    const answers = [[summary('Before')], [summary('After')]];
    fetchMock.mockImplementation(async () => jsonResponse({ projects: answers.shift() }));

    await listProjects({ workspaceContext: context, workspaceView: 'recent' });
    const refreshed = await listProjects({
      workspaceContext: context,
      workspaceView: 'recent',
      fresh: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshed.map((project) => project.name)).toEqual(['After']);
  });
});
