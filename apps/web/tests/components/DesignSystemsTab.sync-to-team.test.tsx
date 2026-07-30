// @vitest-environment jsdom

// Regression for the workspace-team continuous-sync gap: "分享到团队" used to
// be a one-time snapshot — `DesignSystemsTab`'s overflow menu only rendered
// the share action while `!isTeamShared`, so the moment a design system
// became team-shared the ONLY entry point that pushes bytes to the hub
// (`share()` in team-resource-share.ts) vanished from the UI entirely. An
// owner who edited their logo/colors/content after sharing had no way to push
// the update short of unsharing and resharing from scratch.
//
// `share()` itself has no "already shared" guard (it is a plain "push the
// current directory" call), so the fix is UI-only: keep the action visible
// once shared, relabeled "Sync to team", gated on `canManageTeamSynced` (the
// same "who may manage this" signal `unshare`/`edit`/`delete` already use) so
// a plain member who merely has a teammate's pulled copy can never overwrite
// the real owner's shared entry.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    fetchDesignSystem: vi.fn(async (id: string) => ({
      id,
      title: 'My Design System',
      summary: 'Owned by me.',
      category: 'Custom',
      body: `# ${id}\n\n## Colors\n- Primary #111111`,
    })),
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
  };
});

const TEAM_CONTEXT = {
  workspaceId: 'ws-team',
  workspaceType: 'team',
  workspaceMemberId: 'mem-owner',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  teamId: 'ws-team',
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: false,
    canManageSharedResources: true,
  },
};

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({ context: TEAM_CONTEXT, loading: false, refresh: vi.fn() }),
  useWorkspaceBilling: () => ({ membershipTier: '' }),
}));

// The sharer's OWN copy: `teamSynced` is never stamped on it (only on a
// teammate's pulled copy — see `syncSharedTeamDesignSystem`'s `markTeamSynced`
// in server.ts, which returns early `if (isOwnedByCurrentMember)`), so it
// stays in the "mine" tab even after being shared.
const MY_SHARED_SYSTEM: DesignSystemSummary = {
  id: 'user:my-ds',
  title: 'My Design System',
  category: 'Custom',
  summary: 'Owned by me.',
  surface: 'web',
  source: 'user',
  status: 'draft',
  isEditable: true,
  updatedAt: '2026-07-24T00:00:00.000Z',
};

// A teammate's PULLED copy of someone else's share: `teamSynced: true` is the
// marker that only ever lands on the puller's side (never the sharer's own),
// so `canManageTeamSynced` in DesignSystemsTab.tsx falls through to the
// `canUnshareFromTeam` check instead of short-circuiting true.
const TEAMMATE_PULLED_SYSTEM: DesignSystemSummary = {
  id: 'user:teammate-ds',
  title: 'Teammate Design System',
  category: 'Custom',
  summary: 'Shared by a teammate.',
  surface: 'web',
  source: 'user',
  status: 'draft',
  isEditable: true,
  teamSynced: true,
  updatedAt: '2026-05-13T03:19:00.000Z',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let shareCalls: string[];
let teamReadHeaders: Headers[];
let unshareCalls: Array<{ url: string; headers: Headers }>;

function mockFetch(canUnshare: boolean, sharedId = 'user:my-ds') {
  shareCalls = [];
  teamReadHeaders = [];
  unshareCalls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/workspace/design-systems/team')) {
      teamReadHeaders.push(new Headers(init?.headers));
      return jsonResponse({
        ids: [sharedId],
        resources: [{ id: sharedId, canUnshare, ownerMemberId: 'mem-owner' }],
      });
    }
    if (url.includes('/share') && init?.method === 'POST') {
      shareCalls.push(url);
      return jsonResponse({ shared: true, version: shareCalls.length });
    }
    if (url.includes('/share') && init?.method === 'DELETE') {
      unshareCalls.push({ url, headers: new Headers(init.headers) });
      return jsonResponse({ unshared: true });
    }
    return jsonResponse({});
  }) as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTab(systems: DesignSystemSummary[]) {
  return render(
    <I18nProvider initial="en">
      <DesignSystemsTab
        loading={false}
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />
    </I18nProvider>,
  );
}

async function openTeamTabAndSelect() {
  await waitFor(() => expect(screen.getByRole('tab', { name: /Team/i })).toBeTruthy());
  fireEvent.click(screen.getByRole('tab', { name: /Team/i }));
  await screen.findByTestId('design-kit-view-user:teammate-ds');
}

describe('DesignSystemsTab — repeat share reads as "sync" once already team-shared', () => {
  it('keeps the action visible (relabeled "Sync to team") for the owner, and re-POSTs the same /share route on click', async () => {
    mockFetch(true);
    renderTab([MY_SHARED_SYSTEM]);

    await waitFor(() => expect(screen.getByTestId('design-kit-view-user:my-ds')).toBeTruthy());
    expect(teamReadHeaders[0]?.get('x-od-workspace-id')).toBe('ws-team');
    expect(teamReadHeaders[0]?.get('x-od-workspace-member-id')).toBe('mem-owner');
    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));

    // The old "Share to team" wording is gone — the menu no longer looks like
    // this system was never shared.
    expect(screen.queryByRole('menuitem', { name: 'Share to team' })).toBeNull();
    const syncItem = await screen.findByRole('menuitem', { name: 'Sync to team' });

    fireEvent.click(syncItem);
    await waitFor(() => expect(shareCalls).toHaveLength(1));
    expect(shareCalls[0]).toContain('/api/workspace/design-systems/user%3Amy-ds/share');
  });

  it('carries the same workspace identity when removing a design system from the team', async () => {
    mockFetch(true);
    renderTab([MY_SHARED_SYSTEM]);

    await waitFor(() => expect(screen.getByTestId('design-kit-view-user:my-ds')).toBeTruthy());
    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from team' }));

    await waitFor(() => expect(unshareCalls).toHaveLength(1));
    expect(unshareCalls[0]?.url).toContain(
      '/api/workspace/design-systems/user%3Amy-ds/share',
    );
    expect(unshareCalls[0]?.headers.get('x-od-workspace-id')).toBe('ws-team');
    expect(unshareCalls[0]?.headers.get('x-od-workspace-member-id')).toBe('mem-owner');
  });

  it('hides both "share" and "sync" for a teammate-pulled copy the caller may not manage', async () => {
    // `canUnshare: false` mirrors a plain member viewing a system someone
    // else shared — the same shape `DesignSystemsTab.team-permissions.test.tsx`
    // already covers for edit/publish/delete. The un-hide fix here must not
    // let a non-managing member overwrite the real owner's shared copy.
    mockFetch(false, 'user:teammate-ds');
    renderTab([TEAMMATE_PULLED_SYSTEM]);
    await openTeamTabAndSelect();

    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    expect(screen.queryByRole('menuitem', { name: 'Sync to team' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Share to team' })).toBeNull();
  });
});
