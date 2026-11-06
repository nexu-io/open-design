// @vitest-environment jsdom
//
// recvpkuLOujgAm: the personal workspace rendered the hardcoded English
// "Personal workspace" instead of its real remote name (e.g. "Ada's
// workspace"). B names every workspace — personal included — and the daemon
// already fetches that context at startup, so the switcher must never need the
// dropdown's own directory read to learn the current workspace's name.
//
// Both states are pinned here: the COLLAPSED label with the dropdown never
// opened, and the EXPANDED row for the personal workspace before the directory
// read answers.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const REMOTE_PERSONAL_NAME = "Ada's workspace";

/** The context `useWorkspaceContext` already holds at startup, for a PERSONAL workspace. */
function personalContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-personal',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    // B's `workspaceName` for this workspace. For a personal workspace there is
    // no `teamName` and no `teamId` — this is the only name the client is given.
    workspaceName: REMOTE_PERSONAL_NAME,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
    permissions: {
      canInviteMembers: true,
      canManageBilling: true,
      canViewWorkspaceSettings: true,
    },
  } as unknown as WorkspaceCollabContext;
}

const originalFetch = globalThis.fetch;

/**
 * Hold the directory read open forever, so "the user never opened the dropdown"
 * and "the dropdown is open but the list has not landed" are both observable —
 * and so any name on screen provably came from the startup context, not from a
 * second request.
 */
function installNeverResolvingDirectoryFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/workspace/directory')) {
      await new Promise<void>(() => {});
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return {
    directoryCalls: () =>
      fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('/api/workspace/directory'),
      ).length,
  };
}

function renderRail() {
  return render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={personalContext()}
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

describe('personal workspace name in the switcher', () => {
  it('shows the remote name on the collapsed control without opening the dropdown', () => {
    const net = installNeverResolvingDirectoryFetch();

    renderRail();

    const trigger = screen.getByTestId('workspace-switcher');
    expect(trigger.textContent).toContain(REMOTE_PERSONAL_NAME);
    expect(trigger.textContent).not.toContain('Personal workspace');
    // Nothing was fetched for this label — it came off the startup context.
    expect(net.directoryCalls()).toBe(0);
  });

  it('shows the remote name on the expanded personal row before the directory answers', async () => {
    installNeverResolvingDirectoryFetch();

    renderRail();
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    await waitFor(() => expect(screen.getByTestId('workspace-switcher-list')).toBeTruthy());
    const list = within(screen.getByTestId('workspace-switcher-list'));
    expect(list.getByText(REMOTE_PERSONAL_NAME)).toBeTruthy();
    expect(list.queryByText('Personal workspace')).toBeNull();
  });

  it('derives the avatar initial from the remote name, not the fallback', () => {
    installNeverResolvingDirectoryFetch();

    renderRail();

    const avatar = screen
      .getByTestId('workspace-switcher')
      .querySelector('.entry-nav-rail__team-avatar');
    expect(avatar?.textContent).toBe('A');
  });
});
