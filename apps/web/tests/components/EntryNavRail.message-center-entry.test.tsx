// @vitest-environment jsdom
//
// The message-center panel moved behind two external openers on the rail (the
// signed-in account menu's 消息中心 row and the signed-out rail item), with
// `MessageCenter hideTrigger`. `hideTrigger` leaves the component's internal
// `triggerRef` unattached, so `closePanel()` had nothing to restore focus to:
// opening the panel focuses the portaled dialog, and closing it unmounted the
// focused node and dropped keyboard focus to the document. Both openers also
// have to advertise the dialog they own (`aria-haspopup="dialog"` plus the
// `aria-expanded` state) — the built-in bell already did.
//
// Focus must return to a control that is still mounted after the close: the
// signed-in row lives in a hover menu that unmounts before the panel opens, so
// the account trigger is the stable host control there.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
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
    displayName: 'Leaf',
    seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false },
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
    workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-team',
  } as unknown as WorkspaceCollabContext;
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

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceDirectoryCache();
  stubFetch();
});

afterEach(() => {
  cleanup();
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EntryNavRail message-center openers', () => {
  it('returns focus to the account trigger when the panel closes with Escape', async () => {
    renderRail(teamContext());
    const accountTrigger = screen.getByTestId('entry-nav-account');

    fireEvent.click(accountTrigger);
    fireEvent.click(screen.getByTestId('account-menu-message-center'));
    await waitFor(() => expect(screen.getByTestId('message-center-dialog')).toBeTruthy());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
    expect(document.activeElement).toBe(accountTrigger);
  });

  it('returns focus to the account trigger when the panel closes via the backdrop', async () => {
    renderRail(teamContext());
    const accountTrigger = screen.getByTestId('entry-nav-account');

    fireEvent.click(accountTrigger);
    fireEvent.click(screen.getByTestId('account-menu-message-center'));
    const dialog = await waitFor(() => screen.getByTestId('message-center-dialog'));

    fireEvent.mouseDown(screen.getByTestId('message-center-backdrop'));

    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(accountTrigger);
  });

  it('returns focus to the signed-out rail opener when the panel closes', async () => {
    renderRail(null);
    const railOpener = screen.getByTestId('entry-nav-message-center');

    fireEvent.click(railOpener);
    await waitFor(() => expect(screen.getByTestId('message-center-dialog')).toBeTruthy());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
    expect(document.activeElement).toBe(railOpener);
  });

  it('advertises the dialog on both external openers', () => {
    const signedOut = renderRail(null);
    const railOpener = screen.getByTestId('entry-nav-message-center');
    expect(railOpener.getAttribute('aria-haspopup')).toBe('dialog');
    expect(railOpener.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(railOpener);
    expect(screen.getByTestId('entry-nav-message-center').getAttribute('aria-expanded')).toBe('true');
    signedOut.unmount();

    renderRail(teamContext());
    fireEvent.click(screen.getByTestId('entry-nav-account'));
    const menuRow = screen.getByTestId('account-menu-message-center');
    expect(menuRow.getAttribute('aria-haspopup')).toBe('dialog');
    expect(menuRow.getAttribute('aria-expanded')).toBe('false');
  });
});
