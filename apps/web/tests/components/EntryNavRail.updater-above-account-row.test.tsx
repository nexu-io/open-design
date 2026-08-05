// @vitest-environment jsdom
//
// Placement contract for the update-ready rocket.
//
// #5517 removed the entry topbar and parked the updater host in the rail
// footer, which put the rocket on its own line UNDER the account row —
// bottom-left, detached from the identity it belongs to. Product placed it
// 「名字那个横条的上方,靠右对齐」: its own right-aligned strip IMMEDIATELY ABOVE
// the account row.
//
// These specs pin the DOM relationship rather than any pixel value: the rocket
// lives in a strip that is the account trigger's immediately-preceding sibling,
// inside the same account container. Right-alignment and the strip's
// zero-height-when-empty behaviour are CSS facts (see
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

describe('updater rocket placement above the rail account row', () => {
  it('renders the rocket in a strip immediately above the name + plan row', async () => {
    await renderWithDownloadedUpdate();

    const rocket = screen.getByTestId('entry-nav-updater');
    const trigger = screen.getByTestId('entry-nav-account');

    // Its own strip, not the identity row.
    const strip = rocket.closest('[data-testid="entry-nav-account-updater"]');
    expect(strip, 'rocket must live in the updater strip').not.toBeNull();
    expect(strip?.contains(trigger)).toBe(false);

    // ABOVE the identity row: same account container, and the strip is the
    // trigger's immediately-preceding sibling — nothing may slip between them.
    const account = trigger.closest('.entry-nav-rail__account');
    expect(account?.contains(strip as Node)).toBe(true);
    expect(trigger.previousElementSibling).toBe(strip);
    expect(
      rocket.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The identity row itself still carries the name and the plan wordmark.
    expect(trigger.querySelector('.entry-nav-rail__account-name')?.textContent).toBe(
      'XINYU SHANG',
    );

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

  it('leaves an empty strip above the row while no update is in flight', async () => {
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
    // The strip stays mounted but must hold NO element children, which is what
    // lets `:empty { display: none }` keep it from reserving vertical space and
    // shifting the account area. A stray wrapper here would defeat that rule.
    const strip = screen.getByTestId('entry-nav-account-updater');
    expect(strip.children.length).toBe(0);
  });

  it('falls back to the rail footer when there is no account row to sit above', async () => {
    // Local (no cloud identity) shell: the account row is not rendered at all,
    // so the rocket must keep its footer home instead of disappearing.
    await renderWithDownloadedUpdate(null);

    const rocket = screen.getByTestId('entry-nav-updater');
    expect(screen.queryByTestId('entry-nav-account')).toBeNull();
    expect(rocket.closest('.entry-nav-rail__footer')).not.toBeNull();
  });
});
