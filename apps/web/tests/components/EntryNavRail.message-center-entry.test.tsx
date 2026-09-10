// @vitest-environment jsdom
// The signed-in dock bell and signed-out rail item are stable external
// openers. Closing MessageCenter must return focus to the initiating control.

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
  it('returns focus to the dock bell when the panel close button is clicked', async () => {
    renderRail(teamContext());
    const accountBell = screen.getByTestId('entry-nav-account-message-center');

    fireEvent.click(screen.getByTestId('entry-nav-account-message-center'));
    await waitFor(() => expect(screen.getByTestId('message-center-dialog')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '关闭消息中心' }));

    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
    expect(document.activeElement).toBe(accountBell);
  });

  it('returns focus to the dock bell when the panel closes via the backdrop', async () => {
    renderRail(teamContext());
    const accountBell = screen.getByTestId('entry-nav-account-message-center');

    // Same one-click opener as above; the backdrop path must hand focus back
    // to the same trigger.
    fireEvent.click(screen.getByTestId('entry-nav-account-message-center'));
    const dialog = await waitFor(() => screen.getByTestId('message-center-dialog'));

    fireEvent.mouseDown(screen.getByTestId('message-center-backdrop'));

    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(accountBell);
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
    const accountBell = screen.getByTestId('entry-nav-account-message-center');
    expect(accountBell.getAttribute('aria-haspopup')).toBe('dialog');
    expect(accountBell.getAttribute('aria-expanded')).toBe('false');
  });
});
