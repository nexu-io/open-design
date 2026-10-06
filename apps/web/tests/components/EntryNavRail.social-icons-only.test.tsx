// @vitest-environment jsdom
//
// OPEND-3180: the Discord / X / mail links at the foot of the entry rail show
// only their icons. The visible names are gone on both the signed-in account
// dock and its signed-out (local shell) twin; each link keeps an accessible
// name and surfaces the same copy through the shared `.od-tooltip` layer, and
// the click targets are unchanged.

import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID } from '../../src/components/workspaceChromeActions';
import { resetProjectRunStatusStore } from '../../src/hooks/useProjectRunStatuses';
import { I18nProvider } from '../../src/i18n';

const SOCIAL_LINKS = [
  { href: 'https://discord.gg/mHAjSMV6gz', label: 'Join our Discord for free credits' },
  { href: 'https://x.com/OpenDesignHQ', label: 'Follow @OpenDesignHQ for updates' },
  { href: 'mailto:support@open-design.ai', label: 'Questions? Email our team' },
];

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

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/messages?')) {
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      if (url.includes('/status')) return Response.json({ loggedIn: false });
      if (url.includes('/api/runs?')) return Response.json({ runs: [], awaitingInputProjectIds: [] });
      return Response.json({ items: [] });
    }),
  );
}

function renderRail(context: WorkspaceCollabContext | null) {
  return render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={context}
        billing={null}
        footerNotice={context ? undefined : <div data-testid="local-sign-in-card">Sign in</div>}
      />
    </I18nProvider>,
  );
}

let chromeActionsHost: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceDirectoryCache();
  resetProjectRunStatusStore();
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
  resetProjectRunStatusStore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.querySelector('.workspace-tabs-chrome')?.remove();
});

/** Text a sighted user would read inside the link — element text minus
 *  anything hidden from the accessibility tree (the SVG glyphs). */
function visibleText(link: HTMLElement): string {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent ?? '';
  return text.trim();
}

function expectIconOnlySocialRow(row: HTMLElement) {
  const links = within(row).getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual(SOCIAL_LINKS.map((link) => link.href));
  links.forEach((link, index) => {
    const { label } = SOCIAL_LINKS[index]!;
    // Icon only: nothing readable beside the glyph.
    expect(visibleText(link), `${label} visible text`).toBe('');
    expect(link.querySelector('svg'), `${label} glyph`).not.toBeNull();
    // Still named for assistive tech, and the same copy rides the shared
    // tooltip layer so a hover explains the glyph.
    expect(link.getAttribute('aria-label')).toBe(label);
    expect(link.classList.contains('od-tooltip'), `${label} od-tooltip`).toBe(true);
    expect(link.getAttribute('data-tooltip')).toBe(label);
  });
}

describe('OPEND-3180 — icon-only social links at the rail foot', () => {
  it('signed in: the account dock shows Discord / X / mail as icons with tooltips', async () => {
    renderRail(teamContext());
    await act(async () => {});
    const dock = screen.getByTestId('entry-nav-account').closest('.entry-nav-rail__account-dock') as HTMLElement;
    expect(dock).not.toBeNull();
    expectIconOnlySocialRow(within(dock).getByTestId('entry-nav-rail-social'));
  });

  it('signed out: the local dock shows the same icon-only row', async () => {
    renderRail(null);
    await act(async () => {});
    const dock = screen.getByTestId('entry-nav-local-account-dock');
    expectIconOnlySocialRow(within(dock).getByTestId('entry-nav-rail-social'));
  });
});
