// @vitest-environment jsdom
//
// `PUT /api/workspace/active` already returns the new `WorkspaceCollabContext`
// (`WorkspaceActiveResponse.context`), and the route only returns 200 after
// verifying the exact Workspace/member pair. The client parsed that body and
// threw it away, then
// called `notifyWorkspaceContextRefresh()` so every mounted consumer went and
// GET the same data again.
//
// Two costs: a wasted round-trip on the switch path, and the extra beat the user
// sees — the UI waits for request #2 for something request #1 already answered.
//
// The fix seeds the shell from the response. The refresh broadcast still fires,
// because `useProjectWorkspaceScope` listens to it to revalidate the project
// scope and passive tabs (which cannot be seeded) still need to re-read.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import {
  resetWorkspaceContextCache,
  useWorkspaceContext,
} from '../../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../../src/lib/coalesced-get';
import { I18nProvider } from '../../src/i18n';

const DIRECTORY = [
  {
    workspaceId: 'ws-a',
    workspaceName: 'Workspace A',
    workspaceType: 'team',
    workspaceMemberId: 'wm-a',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  },
  {
    workspaceId: 'ws-b',
    workspaceName: 'Workspace B',
    workspaceType: 'team',
    workspaceMemberId: 'wm-b',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  },
];

function contextFor(workspaceId: string, workspaceMemberId: string): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    workspaceName: workspaceId === 'ws-a' ? 'Workspace A' : 'Workspace B',
    teamName: workspaceId === 'ws-a' ? 'Workspace A' : 'Workspace B',
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
  } as unknown as WorkspaceCollabContext;
}

/** Renders what the shell would: a context consumer next to the rail. */
function Harness() {
  const { context } = useWorkspaceContext();
  return (
    <I18nProvider initial="en">
      <div data-testid="observed-workspace">{context?.workspaceId ?? 'none'}</div>
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={contextFor('ws-a', 'wm-a')}
      />
    </I18nProvider>
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetWorkspaceDirectoryCache();
  resetWorkspaceContextCache();
  resetCoalescedGet();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  resetWorkspaceContextCache();
  resetCoalescedGet();
  vi.restoreAllMocks();
});

describe('workspace switch — seeding the context from the PUT response', () => {
  it('adopts the switch response instead of re-reading the context', async () => {
    let activeWorkspaceId = 'ws-a';
    const paths: string[] = [];
    const contextScopes: Array<{ workspaceId: string | null; workspaceMemberId: string | null }> = [];
    const switchBodies: unknown[] = [];
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem');

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://d.local');
      paths.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      if (url.pathname === '/api/workspace/directory') {
        return new Response(JSON.stringify({ items: DIRECTORY, activeWorkspaceId }), {
          status: 200,
        });
      }
      if (url.pathname === '/api/workspace/context') {
        const headers = new Headers(init?.headers);
        const requestedWorkspaceId = headers.get('x-od-workspace-id');
        const requestedWorkspaceMemberId = headers.get('x-od-workspace-member-id');
        contextScopes.push({
          workspaceId: requestedWorkspaceId,
          workspaceMemberId: requestedWorkspaceMemberId,
        });
        if (!requestedWorkspaceId || !requestedWorkspaceMemberId) {
          return new Response(JSON.stringify({ error: 'missing_scope' }), { status: 400 });
        }
        return new Response(
          JSON.stringify({
            context: contextFor(requestedWorkspaceId, requestedWorkspaceMemberId),
          }),
          { status: 200 },
        );
      }
      if (url.pathname === '/api/workspace/active') {
        switchBodies.push(JSON.parse(String(init?.body ?? '{}')));
        activeWorkspaceId = 'ws-b';
        return new Response(
          JSON.stringify({
            activeWorkspaceId: 'ws-b',
            context: contextFor('ws-b', 'wm-b'),
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('observed-workspace').textContent).toBe('ws-a'),
    );
    expect(contextScopes).toEqual([{ workspaceId: 'ws-a', workspaceMemberId: 'wm-a' }]);

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    await waitFor(() => expect(screen.getByText('Workspace B')).toBeTruthy());

    const contextGetsBeforeSwitch = paths.filter(
      (entry) => entry === 'GET /api/workspace/context',
    ).length;

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Workspace B' }));
      await Promise.resolve();
    });

    // The shell must reflect the new workspace — from the PUT body.
    await waitFor(() =>
      expect(screen.getByTestId('observed-workspace').textContent).toBe('ws-b'),
    );

    expect(paths.filter((entry) => entry === 'PUT /api/workspace/active')).toHaveLength(1);
    expect(switchBodies).toEqual([{ workspaceId: 'ws-b', workspaceMemberId: 'wm-b' }]);
    expect(
      storageWrites.mock.calls.some(([key]) => key === 'od.workspaceContext.refreshAt'),
    ).toBe(false);

    // …and it must not have spent a second round-trip asking for what the PUT
    // just returned.
    const contextGetsAfterSwitch = paths.filter(
      (entry) => entry === 'GET /api/workspace/context',
    ).length;
    expect(contextGetsAfterSwitch).toBe(contextGetsBeforeSwitch);

    // A refresh stays on this tab's session selection and explicitly scopes
    // the context request to B. Another tab has its own sessionStorage and did
    // not receive a localStorage switch broadcast above.
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(contextScopes).toHaveLength(2));
    expect(contextScopes[1]).toEqual({
      workspaceId: 'ws-b',
      workspaceMemberId: 'wm-b',
    });
  });

  it('clears a cached Team selection when the authoritative directory becomes signed-out empty', async () => {
    let signedOut = false;
    let contextReads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://d.local');
      if (url.pathname === '/api/workspace/directory') {
        return new Response(JSON.stringify({
          items: signedOut ? [] : [DIRECTORY[0]],
          activeWorkspaceId: null,
        }), { status: 200 });
      }
      if (url.pathname === '/api/workspace/context') {
        contextReads += 1;
        return new Response(JSON.stringify({ context: contextFor('ws-a', 'wm-a') }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId('observed-workspace').textContent).toBe('ws-a'),
    );
    expect(contextReads).toBe(1);

    signedOut = true;
    act(() => {
      window.dispatchEvent(new Event('od:workspace-context-refresh'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('observed-workspace').textContent).toBe('none'),
    );
    expect(contextReads).toBe(1);
    expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).toBeNull();
  });
});
