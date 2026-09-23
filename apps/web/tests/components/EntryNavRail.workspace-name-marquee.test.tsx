// @vitest-environment jsdom
//
// OPEND-3112: the rail's workspace switcher row and the switcher menu's rows
// render their names through `MarqueeLabel`, so a name longer than the rail
// slides its tail into view on hover instead of staying behind an ellipsis.
// The motion itself is CSS (`.od-marquee` in styles/primitives.css); what the
// rail owes is the slot/text structure that CSS keys on.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const LONG_NAME = "Leon Wang's very long personal workspace";

function personalContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-personal',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    workspaceName: LONG_NAME,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    permissions: { canInviteMembers: true, canManageBilling: true, canViewWorkspaceSettings: true },
  } as unknown as WorkspaceCollabContext;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetWorkspaceDirectoryCache();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/workspace/directory')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              workspaceId: 'ws-personal',
              workspaceName: LONG_NAME,
              workspaceType: 'personal',
              workspaceMemberId: 'wm-1',
              role: 'owner',
              memberStatus: 'active',
              lifecycleState: 'active',
            },
          ],
          activeWorkspaceId: 'ws-personal',
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  vi.restoreAllMocks();
});

function renderRail() {
  return render(
    <I18nProvider initial="en">
      <EntryNavRail view="home" onViewChange={() => {}} onNewProject={() => {}} open context={personalContext()} />
    </I18nProvider>,
  );
}

describe('workspace name marquee (OPEND-3112)', () => {
  it('renders the switcher row name as a marquee slot', () => {
    renderRail();
    const switcher = screen.getByTestId('workspace-switcher');
    const slot = switcher.querySelector('.entry-nav-rail__team-name');
    expect(slot?.classList.contains('od-marquee')).toBe(true);
    expect(slot?.querySelector('.od-marquee__text')?.textContent).toBe(LONG_NAME);
    // The slot is a direct child of the hovered row: `.od-marquee` plays on
    // `:hover > .od-marquee`, so anything in between would break the trigger.
    expect(slot?.parentElement).toBe(switcher);
  });

  it('renders the switcher menu row names as marquee slots', async () => {
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    await waitFor(() => {
      const name = document.querySelector('.entry-nav-rail__team-menu .entry-nav-rail__workspace-menu-name');
      expect(name).not.toBeNull();
      expect(name?.classList.contains('od-marquee')).toBe(true);
      expect(name?.querySelector('.od-marquee__text')?.textContent).toBe(LONG_NAME);
    });
  });
});
