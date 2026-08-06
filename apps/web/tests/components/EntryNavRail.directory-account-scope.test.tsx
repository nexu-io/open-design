// @vitest-environment jsdom
//
// The workspace switcher's module-level directory cache must never paint one
// account's workspace names under another account's identity.
//
// `cachedWorkspaceDirectory` deliberately survives the rail unmounting, so the
// switcher does not flash a loading row on every open (see
// `EntryNavRail.workspace-directory.test.tsx` for the behavior it protects).
// What it lacked was INVALIDATION: nothing cleared it when the signed-in
// account changed, and `resetWorkspaceDirectoryCache` had no production caller
// at all — only tests. So signing out and back in as a different account left
// the previous account's workspace list on screen, presented confidently (no
// loading row) because the cache was non-empty.
//
// `/api/workspace/directory` answers "which workspaces can the SIGNED-IN
// ACCOUNT see", so it is exactly the class of read `workspaceIdentityCacheKey`
// warns about: a cache coarser than the identity of the request it holds.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EntryNavRail,
  resetWorkspaceDirectoryCache,
  workspaceDirectoryForIdentity,
} from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

/**
 * Account A sees a shared team workspace plus its own personal one. Every item
 * carries the `workspaceMemberId` of the membership that produced it — which is
 * what makes the list attributable to one account.
 */
const ACCOUNT_A_DIRECTORY = [
  {
    workspaceId: 'ws-shared-team',
    workspaceName: 'Shared Team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-a-team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  },
  {
    workspaceId: 'ws-personal-a',
    workspaceName: 'Ada private workspace',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-a-personal',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  },
];

/** Account B is a member of the SAME team workspace, under its own membership. */
const ACCOUNT_B_DIRECTORY = [
  {
    workspaceId: 'ws-shared-team',
    workspaceName: 'Shared Team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-b-team',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
  },
  {
    workspaceId: 'ws-personal-b',
    workspaceName: 'Bruno private workspace',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-b-personal',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  },
];

function contextFor(workspaceMemberId: string): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-shared-team',
    workspaceType: 'team',
    workspaceMemberId,
    teamName: 'Shared Team',
    workspaceName: 'Shared Team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    seatSummary: { availableSeats: 2 },
    permissions: {
      canInviteMembers: true,
      canManageBilling: true,
      canViewWorkspaceSettings: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
    },
    workspaceSettingsUrl: 'https://example.com/console/settings?workspaceId=ws-shared-team',
  } as unknown as WorkspaceCollabContext;
}

const originalFetch = globalThis.fetch;

/** Directory reads resolve only when released, so "before the network answers" is observable. */
function installGatedFetch(items: () => unknown[]) {
  const releases: Array<() => void> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/workspace/directory')) {
      await new Promise<void>((resolve) => releases.push(resolve));
      return new Response(JSON.stringify({ items: items() }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  return {
    releaseAll: () => {
      for (const r of releases.splice(0)) r();
    },
  };
}

function menu() {
  const el = document.querySelector('.entry-nav-rail__team-menu');
  if (!el) throw new Error('switcher menu is not open');
  return within(el as HTMLElement);
}

function renderRail(context: WorkspaceCollabContext) {
  return render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={context}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  resetWorkspaceDirectoryCache();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
});

describe('workspace switcher directory — account scope', () => {
  it("rejects the previous identity's in-memory list during the incoming render", () => {
    const accountB = {
      ...contextFor('wm-b-team'),
      workspaceName: 'Shared Team renamed for B',
      teamName: 'Shared Team renamed for B',
    } as unknown as WorkspaceCollabContext;

    // This pure render-time decision is the frame-before-effects contract.
    // Account A and B share the same workspace id, so matching by workspace id
    // alone would render A's old name for one committed frame under B.
    expect(workspaceDirectoryForIdentity(ACCOUNT_A_DIRECTORY, accountB)).toEqual([]);
    expect(workspaceDirectoryForIdentity(ACCOUNT_B_DIRECTORY, accountB)).toBe(
      ACCOUNT_B_DIRECTORY,
    );
  });

  it("never paints the previous account's workspaces after an account change", async () => {
    let directory: unknown[] = ACCOUNT_A_DIRECTORY;
    const gate = installGatedFetch(() => directory);

    // Account A opens the switcher and the directory lands: the cache is warm.
    const accountA = renderRail(contextFor('wm-a-team'));
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    gate.releaseAll();
    await waitFor(() => expect(menu().getByText('Ada private workspace')).toBeTruthy());

    // Sign out, sign in as account B. Same shared team workspace, different
    // membership — the identity the cache was filled under is gone.
    accountA.unmount();
    directory = ACCOUNT_B_DIRECTORY;
    renderRail(contextFor('wm-b-team'));
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    // Before B's own read answers, the rail must not present A's private
    // workspace as one of B's. What it falls back to is the one workspace it can
    // still attribute to B: the active one, named from B's own context.
    expect(menu().queryByText('Ada private workspace')).toBeNull();
    expect(menu().getByRole('menuitem', { name: /Shared Team/ })).toBeTruthy();
    expect(menu().queryAllByRole('menuitem', { name: /workspace$/ })).toHaveLength(0);

    // Once B's read lands, B's own workspaces appear.
    gate.releaseAll();
    await waitFor(() => expect(menu().getByText('Bruno private workspace')).toBeTruthy());
    expect(menu().queryByText('Ada private workspace')).toBeNull();
  });

  // The identity-scoped cache key stops a cached answer being SERVED to the
  // wrong identity. It does nothing about a request already in flight when the
  // identity moves: that response lands afterwards and used to be written
  // straight into both the module cache and component state, repopulating
  // account A's names after the identity-change effect had cleared them.
  it("discards an in-flight read that lands after the account changed", async () => {
    let directory: unknown[] = ACCOUNT_A_DIRECTORY;
    const gate = installGatedFetch(() => directory);

    const view = renderRail(contextFor('wm-a-team'));
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    // A's read is in flight and deliberately NOT released yet. Swap the account
    // underneath the mounted rail (sign out, sign in as someone else) — no
    // unmount, which is what leaves the pending request pointing at A.
    view.rerender(
      <I18nProvider initial="en">
        <EntryNavRail
          view="home"
          onViewChange={() => {}}
          onNewProject={() => {}}
          open
          context={contextFor('wm-b-team')}
        />
      </I18nProvider>,
    );
    directory = ACCOUNT_B_DIRECTORY;

    // Now let A's request answer, after the identity has already moved.
    await act(async () => {
      gate.releaseAll();
      await Promise.resolve();
    });

    // Component state must not have taken A's names.
    expect(menu().queryByText('Ada private workspace')).toBeNull();

    // …and the module cache must not have taken them either. Observed by
    // remounting as A with a read that never answers: an abandoned response
    // leaves no trace, so there is no warm list to serve even to A.
    view.unmount();
    installGatedFetch(() => ACCOUNT_A_DIRECTORY);
    renderRail(contextFor('wm-a-team'));
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    expect(menu().queryByText('Ada private workspace')).toBeNull();
  });

  it('still serves the warm list across a same-account workspace switch', async () => {
    const gate = installGatedFetch(() => ACCOUNT_A_DIRECTORY);

    const first = renderRail(contextFor('wm-a-team'));
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    gate.releaseAll();
    await waitFor(() => expect(menu().getByText('Ada private workspace')).toBeTruthy());

    // The same account moving to its OTHER workspace is not an account change:
    // its own membership is still in the cached list, so the switcher must keep
    // showing the names immediately — no loading row. This is the behavior the
    // module-level cache exists for, and the account fix must not cost it.
    first.unmount();
    renderRail({
      ...contextFor('wm-a-personal'),
      workspaceId: 'ws-personal-a',
      workspaceType: 'personal',
    } as unknown as WorkspaceCollabContext);
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    expect(menu().getByText('Ada private workspace')).toBeTruthy();
    expect(menu().queryByRole('status')).toBeNull();

    gate.releaseAll();
  });
});
