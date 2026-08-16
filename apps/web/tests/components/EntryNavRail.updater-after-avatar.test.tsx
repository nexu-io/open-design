// @vitest-environment jsdom
//
// Placement contract for the update-ready rocket.
//
// #5517 removed the entry topbar and parked the updater host in the rail
// footer — bottom-left, detached from the identity it belongs to. A follow-up
// moved it to a strip above the account row; product then placed it INLINE:
// 升级提醒按钮跟在头像后边，不再单独占一行 — the rocket rides the floating
// account row immediately AFTER the avatar chip.
//
// These specs pin the DOM relationship rather than any pixel value: the rocket
// lives in a slot that is the account trigger's immediately-following sibling,
// inside the same account container. The row layout and the slot's
// zero-width-when-empty behaviour are CSS facts (see
// `.entry-nav-rail__account-updater` in styles/home/entry-layout.css) and are
// verified in a real browser, not here — jsdom applies no stylesheets.
//
// Being a sibling rather than a descendant of the trigger is load-bearing: a
// button nested inside the account button would be invalid markup and would
// make every rocket click also toggle the account menu.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { UpdaterPopup } from '../../src/components/UpdaterPopup';
import { I18nProvider } from '../../src/i18n';

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    displayName: 'XINYU SHANG',
    seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false },
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
  } as unknown as WorkspaceCollabContext;
}

function idleStatus(): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    capabilities: {
      canApplyInPlace: false,
      canDownload: true,
      canOpenInstaller: true,
      requiresManualInstall: true,
    },
    channel: 'beta',
    currentVersion: '0.16.2-beta.145',
    enabled: true,
    mode: 'package-launcher',
    platform: 'darwin',
    state: 'idle',
    supported: true,
  };
}

function downloadedStatus(): OpenDesignHostUpdaterStatusSnapshot {
  return {
    ...idleStatus(),
    availableVersion: '0.16.2-beta.146',
    downloadPath: '/tmp/open-design-updater/Open Design Beta.dmg',
    state: 'downloaded',
  };
}

function renderRail(context: WorkspaceCollabContext | null) {
  return render(
    <I18nProvider initial="zh-CN">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={context}
        billing={null}
        updaterSlot={<UpdaterPopup />}
      />
    </I18nProvider>,
  );
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/messages?')) {
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      if (url.includes('/status')) return Response.json({ loggedIn: false });
      return Response.json({ items: [] });
    }),
  );
}

let restoreHost: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceDirectoryCache();
  stubFetch();
});

afterEach(() => {
  cleanup();
  restoreHost?.();
  restoreHost = null;
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderWithDownloadedUpdate(context: WorkspaceCollabContext | null = teamContext()) {
  restoreHost = installMockOpenDesignHost({
    host: { updater: { status: vi.fn(async () => downloadedStatus()) } },
  });
  const view = renderRail(context);
  await screen.findByTestId('entry-nav-updater');
  return view;
}

describe('updater rocket placement after the account avatar', () => {
  it('renders the rocket inline immediately after the avatar chip', async () => {
    await renderWithDownloadedUpdate();

    const rocket = screen.getByTestId('entry-nav-updater');
    const trigger = screen.getByTestId('entry-nav-account');

    // Its own slot, not inside the identity chip.
    const slot = rocket.closest('[data-testid="entry-nav-account-updater"]');
    expect(slot, 'rocket must live in the updater slot').not.toBeNull();
    expect(slot?.contains(trigger)).toBe(false);

    // AFTER the avatar chip: same account container, and the slot is the
    // trigger's immediately-following sibling — nothing may slip between them.
    const account = trigger.closest('.entry-nav-rail__account');
    expect(account?.contains(slot as Node)).toBe(true);
    expect(trigger.nextElementSibling).toBe(slot);
    expect(
      trigger.compareDocumentPosition(rocket) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The avatar chip itself still carries the account initial.
    expect(trigger.querySelector('.entry-nav-rail__account-avatar')?.textContent).toContain('X');

    // The rail footer is no longer the rocket's host.
    expect(rocket.closest('.entry-nav-rail__footer')).toBeNull();
  });

  it('keeps the account-menu trigger clickable with the rocket present', async () => {
    await renderWithDownloadedUpdate();

    const rocket = screen.getByTestId('entry-nav-updater');
    const trigger = screen.getByTestId('entry-nav-account');

    // Never nested inside the trigger: that would be a button inside a button
    // and every rocket click would also toggle the account menu.
    expect(rocket.closest('[data-testid="entry-nav-account"]')).toBeNull();
    expect(trigger.contains(rocket)).toBe(false);

    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByTestId('account-menu-message-center')).toBeTruthy());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves an empty slot after the avatar while no update is in flight', async () => {
    restoreHost = installMockOpenDesignHost({
      host: { updater: { status: vi.fn(async () => idleStatus()) } },
    });

    renderRail(teamContext());
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('entry-nav-updater')).toBeNull();
    expect(screen.queryByTestId('updater-rocket-glyph')).toBeNull();
    // The account row still renders its identity — only the rocket is absent.
    expect(screen.getByTestId('entry-nav-account')).toBeTruthy();
    // The slot stays mounted but must hold NO element children, which is what
    // lets `:empty { display: none }` keep it from reserving width and
    // shifting the cluster. A stray wrapper here would defeat that rule.
    const slot = screen.getByTestId('entry-nav-account-updater');
    expect(slot.children.length).toBe(0);
  });

  it('falls back to the rail footer when there is no account row to ride', async () => {
    // Local (no cloud identity) shell: the account row is not rendered at all,
    // so the rocket must keep its footer home instead of disappearing.
    await renderWithDownloadedUpdate(null);

    const rocket = screen.getByTestId('entry-nav-updater');
    expect(screen.queryByTestId('entry-nav-account')).toBeNull();
    expect(rocket.closest('.entry-nav-rail__footer')).not.toBeNull();
  });
});
