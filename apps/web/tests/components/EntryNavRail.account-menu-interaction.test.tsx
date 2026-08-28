// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';
import { WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID } from '../../src/components/workspaceChromeActions';

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
  } as unknown as WorkspaceCollabContext;
}

function renderRail() {
  return render(
    <I18nProvider initial="zh-CN">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={teamContext()}
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

let chromeActionsHost: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetWorkspaceDirectoryCache();
  stubFetch();
  const chrome = document.createElement('header');
  chrome.className = 'workspace-tabs-chrome';
  chromeActionsHost = document.createElement('div');
  chromeActionsHost.id = WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID;
  chrome.append(chromeActionsHost);
  document.body.append(chrome);
});

afterEach(() => {
  cleanup();
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.querySelector('.workspace-tabs-chrome')?.remove();
});

async function advancePastHoverClose() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(220);
  });
}

describe('EntryNavRail account menu interaction state', () => {
  it('mounts the first account controls inside the workspace chrome no-drag host', async () => {
    renderRail();

    await act(async () => {});
    expect(screen.getByTestId('entry-nav-account').closest('#workspace-chrome-account-actions'))
      .toBe(chromeActionsHost);
  });

  it('pins a hover-open menu when the avatar is clicked', async () => {
    renderRail();
    const trigger = screen.getByTestId('entry-nav-account');

    fireEvent.mouseEnter(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseLeave(trigger.closest('.entry-nav-rail__account') as HTMLElement);
    await advancePastHoverClose();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('still closes a hover-only menu after the pointer leaves', async () => {
    renderRail();
    const trigger = screen.getByTestId('entry-nav-account');

    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger.closest('.entry-nav-rail__account') as HTMLElement);
    await advancePastHoverClose();

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('treats a second avatar click as an explicit close', () => {
    renderRail();
    const trigger = screen.getByTestId('entry-nav-account');

    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not treat focus loss as a close action after a click pins the menu', () => {
    renderRail();
    const trigger = screen.getByTestId('entry-nav-account');

    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);
    fireEvent.blur(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['an outside press', () => fireEvent.pointerDown(document.body)],
  ])('keeps %s as an explicit close action', (_label, close) => {
    renderRail();
    const trigger = screen.getByTestId('entry-nav-account');

    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);
    close();

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps selecting a menu item as an explicit close action', () => {
    const onOpenSettings = vi.fn();
    render(
      <I18nProvider initial="zh-CN">
        <EntryNavRail
          view="home"
          onViewChange={() => {}}
          onNewProject={() => {}}
          onOpenSettings={onOpenSettings}
          open
          context={teamContext()}
          billing={null}
        />
      </I18nProvider>,
    );
    const trigger = screen.getByTestId('entry-nav-account');
    fireEvent.mouseEnter(trigger);
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('menuitem', { name: '设置' }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
