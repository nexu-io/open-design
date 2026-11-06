// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CollabCloudMemberDirectoryEntry,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { useTeamMembers } from '../src/collab/useTeamMembers';
import { WorkspaceMemberDirectoryPreloader } from '../src/collab/WorkspaceMemberDirectoryPreloader';
import { workspaceContextFixture } from './helpers/workspace-context';

const harness = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
  identityChangePending: false,
}));

vi.mock('../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => harness,
}));

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: () => ({ connected: false }),
}));

const CONTEXTS = {
  a: workspaceContextFixture({
    workspaceId: 'workspace-preload-a',
    workspaceMemberId: 'member-viewer-a',
  }),
  b: workspaceContextFixture({
    workspaceId: 'workspace-preload-b',
    workspaceMemberId: 'member-viewer-b',
  }),
};

const ROSTERS: Record<'a' | 'b', CollabCloudMemberDirectoryEntry[]> = {
  a: [{ memberId: 'member-peer-a', displayName: 'Workspace A peer', role: 'owner' }],
  b: [{ memberId: 'member-peer-b', displayName: 'Workspace B peer', role: 'member' }],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function RouteMemberConsumer() {
  const { members } = useTeamMembers();
  return <output data-testid="route-members">{members.map((member) => member.displayName).join(',')}</output>;
}

function WorkspaceSession({ routeMounted }: { routeMounted: boolean }) {
  return (
    <>
      <WorkspaceMemberDirectoryPreloader />
      {routeMounted ? <RouteMemberConsumer /> : null}
    </>
  );
}

describe('WorkspaceMemberDirectoryPreloader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.context = CONTEXTS.a;
    harness.identityChangePending = false;
  });

  afterEach(async () => {
    cleanup();
    await Promise.resolve();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('warms the roster before a route consumer mounts and does not repeat the same-identity cold GET', async () => {
    const memberReads: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/api/workspace/members');
        memberReads.push(new Headers(init?.headers).get('x-od-workspace-id') ?? '');
        return jsonResponse({ members: ROSTERS.a });
      }),
    );

    const view = render(<WorkspaceSession routeMounted={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(memberReads).toEqual([CONTEXTS.a.workspaceId]);

    // Cross coalescedGet's one-second share window before mounting the route.
    // The stable Workspace preloader must keep the identity store hot itself.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    view.rerender(<WorkspaceSession routeMounted />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(view.getByTestId('route-members').textContent).toBe('Workspace A peer');
    expect(memberReads).toEqual([CONTEXTS.a.workspaceId]);
  });

  it('masks workspace A immediately and preloads workspace B with exact headers', async () => {
    let resolveWorkspaceB!: (response: Response) => void;
    const memberReads: Array<{ workspaceId: string | null; memberId: string | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        expect(String(input)).toContain('/api/workspace/members');
        const headers = new Headers(init?.headers);
        const workspaceId = headers.get('x-od-workspace-id');
        memberReads.push({
          workspaceId,
          memberId: headers.get('x-od-workspace-member-id'),
        });
        if (workspaceId === CONTEXTS.a.workspaceId) {
          return Promise.resolve(jsonResponse({ members: ROSTERS.a }));
        }
        return new Promise<Response>((resolve) => {
          resolveWorkspaceB = resolve;
        });
      }),
    );

    const view = render(<WorkspaceSession routeMounted />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(view.getByTestId('route-members').textContent).toBe('Workspace A peer');

    harness.context = CONTEXTS.b;
    view.rerender(<WorkspaceSession routeMounted />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(view.getByTestId('route-members').textContent).toBe('');
    expect(memberReads.at(-1)).toEqual({
      workspaceId: CONTEXTS.b.workspaceId,
      memberId: CONTEXTS.b.workspaceMemberId,
    });

    await act(async () => {
      resolveWorkspaceB(jsonResponse({ members: ROSTERS.b }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(view.getByTestId('route-members').textContent).toBe('Workspace B peer');
    expect(view.getByTestId('route-members').textContent).not.toContain('Workspace A peer');
  });
});
