// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollabDemoView } from '../src/collab/CollabDemoView';
import { resetWorkspaceContextCache } from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-demo',
});

// Route the demo view's live polling through a stub so the presence + sync loop
// is exercised without a daemon. Mirrors the real route shapes.
function installFetchStub(present: Array<{ memberId: string; name?: string }>, publishedVersion: number | null) {
  const calls: Array<{ url: string; method: string; body: unknown; headers: Headers }> = [];
  const state = { present, publishedVersion };
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    });
    const pathname = new URL(url, 'http://daemon.local').pathname;
    let payload: unknown = { ok: true };
    if (pathname.endsWith('/workspace/directory')) {
      payload = workspaceDirectoryFixture([TEAM_CONTEXT]);
    } else if (pathname.endsWith('/workspace/context')) payload = { context: TEAM_CONTEXT };
    else if (pathname.endsWith('/presence/heartbeat')) payload = { present: state.present };
    else if (pathname.endsWith('/collab/status')) payload = { publishedVersion: state.publishedVersion, syncState: 'synced' };
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }) as typeof fetch;
  vi.stubGlobal('fetch', fetchImpl);
  return { calls, state };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetWorkspaceContextCache();
  // A stable member id keeps the self-exclusion assertion deterministic.
  vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CollabDemoView', () => {
  it('always shows the stub disclaimer banner', () => {
    installFetchStub([], null);
    render(<CollabDemoView projectId={null} />);
    expect(screen.getByText(/Collaboration demo/i)).toBeTruthy();
    expect(screen.getByText(/stubbed/i)).toBeTruthy();
  });

  it('shows the project picker when no project is routed', () => {
    installFetchStub([], null);
    render(<CollabDemoView projectId={null} />);
    expect(screen.getByPlaceholderText(/paste a project id/i)).toBeTruthy();
  });

  it('renders present members including self and the published head once joined', async () => {
    installFetchStub([{ memberId: 'demo-aaaaaaaa', name: 'Me' }, { memberId: 'other', name: 'Other One' }], 5);
    render(<CollabDemoView projectId="p1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Presence now includes self so a newly-shared project still shows the
    // current member even before teammates join.
    expect(screen.getByText('DM')).toBeTruthy();
    expect(screen.getByText('OO')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('drives the sync routes from the author controls', async () => {
    const { calls } = installFetchStub([], null);
    render(<CollabDemoView projectId="p1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Report change'));
      fireEvent.click(screen.getByText('Publish'));
      fireEvent.click(screen.getByText('Share to team'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/collab/changed'))).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/collab/publish'))).toBe(true);
    const syncIntent = calls.find((c) => c.url.endsWith('/collab/sync-intent'));
    expect(syncIntent?.headers.get('x-od-workspace-id')).toBe(
      TEAM_CONTEXT.workspaceId,
    );
    expect(syncIntent?.headers.get('x-od-workspace-member-id')).toBe(
      TEAM_CONTEXT.workspaceMemberId,
    );
  });

  it('surfaces a pull prompt when the published head advances past the pulled version', async () => {
    const stub = installFetchStub([], 3);
    render(<CollabDemoView projectId="p1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // First observed version is treated as already pulled — no prompt yet.
    expect(screen.queryByText(/^Pull v/)).toBeNull();

    // Author publishes a newer head; the member tab should now be prompted.
    stub.state.publishedVersion = 4;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText('Pull v4')).toBeTruthy();
  });
});
