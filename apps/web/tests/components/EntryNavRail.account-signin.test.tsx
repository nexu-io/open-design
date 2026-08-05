// @vitest-environment jsdom
//
// #5244: the Home nav-rail account menu must expose a signed-out Open Design
// login entry (like the footer's CloudSignInTip and the project-page popover).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const originalFetch = globalThis.fetch;

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

function renderRail() {
  return render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={teamContext()}
        billing={null}
        metricsConsent={false}
      />
    </I18nProvider>,
  );
}

function stubSignedOutFetch(loginCalls: string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/integrations/vela/status')) {
      return new Response(
        JSON.stringify({
          loggedIn: false,
          loginInFlight: false,
          profile: 'prod',
          configPath: '/x',
          user: null,
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/api/integrations/vela/login')) {
      loginCalls.push(url);
      return new Response(JSON.stringify({ ok: true, authAttemptId: 'auth-1' }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
}

function openAccountMenu() {
  fireEvent.click(screen.getByTestId('entry-nav-account'));
}

beforeEach(() => {
  resetWorkspaceDirectoryCache();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EntryNavRail account-menu sign-in entry', () => {
  it('shows a sign-in entry when the Open Design account is signed out', async () => {
    const fetchMock = stubSignedOutFetch([]);
    vi.stubGlobal('fetch', fetchMock);

    renderRail();
    openAccountMenu();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByTestId('entry-nav-account-signin')).toBeTruthy();
    });
  });

  it('starts the Open Design login flow when the signed-out entry is clicked', async () => {
    const loginCalls: string[] = [];
    vi.stubGlobal('fetch', stubSignedOutFetch(loginCalls));

    renderRail();
    openAccountMenu();

    await waitFor(() => {
      expect(screen.getByTestId('entry-nav-account-signin')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('entry-nav-account-signin'));

    await waitFor(() => {
      expect(loginCalls).toContain('/api/integrations/vela/login');
    });
  });
});
