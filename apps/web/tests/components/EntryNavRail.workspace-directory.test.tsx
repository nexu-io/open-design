// @vitest-environment jsdom
//
// The workspace switcher re-fetched its list on every open. `coalescedGet`
// only collapses CONCURRENT reads, so each open started from an empty array and
// showed a loading row before the same names reappeared — visible as a flash
// even though nothing had changed.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

// `workspaceMemberId` is required on `WorkspaceDirectoryItem` and every real
// daemon response carries it. It matters here because the module-level cache is
// only served to the account it was filled under, and a membership id is what
// identifies that account (see `workspaceDirectoryBelongsTo`) — so a fixture
// without it cannot be attributed to `teamContext()` and would never be reused.
const DIRECTORY = [
  {
    workspaceId: 'ws-team',
    workspaceName: 'OD Feature Team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'owner',
  },
  {
    workspaceId: 'ws-personal',
    workspaceName: 'My Workspace2',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1-personal',
    role: 'owner',
  },
];

function teamContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    teamName: 'OD Feature Team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    seatSummary: { availableSeats: 2 },
    permissions: {
      canInviteMembers: true,
      canManageBilling: true,
      canViewWorkspaceSettings: true,
    },
    workspaceSettingsUrl: 'https://example.com/console/settings?workspaceId=ws-team',
  } as unknown as WorkspaceCollabContext;
}

const originalFetch = globalThis.fetch;

class OpeningEventSource {
  static instances: OpeningEventSource[] = [];
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    OpeningEventSource.instances.push(this);
    queueMicrotask(() => this.onopen?.());
  }

  addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    const callback = listener as (event: MessageEvent) => void;
    const current = this.listeners.get(name) ?? new Set();
    current.add(callback);
    this.listeners.set(name, current);
  }

  emit(name: string, data: unknown) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  close() {}
}

/** Directory reads resolve only when released, so "before the network answers" is observable. */
function installGatedFetch() {
  const releases: Array<() => void> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/workspace/directory')) {
      await new Promise<void>((resolve) => releases.push(resolve));
      return new Response(JSON.stringify({ items: DIRECTORY }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  return {
    releaseAll: () => {
      for (const r of releases.splice(0)) r();
    },
    calls: () => (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
  };
}


/** Scope to the open switcher menu — the active team's name also shows on the trigger. */
function menu() {
  const el = document.querySelector('.entry-nav-rail__team-menu');
  if (!el) throw new Error('switcher menu is not open');
  return within(el as HTMLElement);
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
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  resetWorkspaceDirectoryCache();
  OpeningEventSource.instances = [];
  vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceDirectoryCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('workspace switcher directory', () => {
  it('refreshes a remotely-created workspace while the switcher stays closed', async () => {
    let items = DIRECTORY;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/workspace/directory')) {
        return new Response(JSON.stringify({ items }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    renderRail();
    await waitFor(() => expect(OpeningEventSource.instances).toHaveLength(1));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/workspace/directory',
      { cache: 'no-store' },
    ));
    expect(document.querySelector('.entry-nav-rail__team-menu')).toBeNull();

    items = [
      ...DIRECTORY,
      {
        workspaceId: 'ws-remote',
        workspaceName: 'Remote-created team',
        workspaceType: 'team',
        workspaceMemberId: 'wm-remote',
        role: 'owner',
      },
    ];
    OpeningEventSource.instances[0]?.emit('workspace-directory-changed', {
      type: 'workspace-directory-changed',
      at: Date.now(),
    });
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.filter(
      ([input]) => String(input).includes('/api/workspace/directory'),
    )).toHaveLength(2));

    fireEvent.click(screen.getByTestId('workspace-switcher'));
    await waitFor(() => expect(menu().getByText('Remote-created team')).toBeTruthy());
  });

  it('keeps actions outside the scrollable workspace list when the directory exceeds five items', async () => {
    const manyWorkspaces = Array.from({ length: 7 }, (_, index) => ({
      workspaceId: index === 0 ? 'ws-team' : `ws-${index + 1}`,
      workspaceName: `Workspace ${index + 1}`,
      workspaceType: index === 0 ? 'personal' : 'team',
      workspaceMemberId: index === 0 ? 'wm-1' : `wm-${index + 1}`,
      role: 'owner',
    }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/workspace/directory')) {
        return new Response(JSON.stringify({ items: manyWorkspaces }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    renderRail();
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    await waitFor(() => expect(menu().getByText('Workspace 7')).toBeTruthy());

    const list = screen.getByTestId('workspace-switcher-list');
    const actions = screen.getByTestId('workspace-switcher-actions');
    const invite = menu().getByRole('menuitem', { name: /Invite/ });
    const createTeam = menu().getByRole('menuitem', { name: /New team/ });

    expect(list.contains(invite)).toBe(false);
    expect(list.contains(createTeam)).toBe(false);
    expect(actions.contains(invite)).toBe(true);
    expect(actions.contains(createTeam)).toBe(true);

    Object.defineProperty(list, 'scrollTop', { configurable: true, value: 68, writable: true });
    fireEvent.scroll(list);
    expect(actions.isConnected).toBe(true);
    expect(invite.isConnected).toBe(true);
    expect(createTeam.isConnected).toBe(true);

    const lastWorkspace = menu().getByRole('menuitem', { name: 'Workspace 7' });
    lastWorkspace.focus();
    fireEvent.keyDown(lastWorkspace, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(invite);
    fireEvent.keyDown(invite, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(createTeam);
  });

  it('shows the last known list immediately on a later open, with no loading row', async () => {
    const gate = installGatedFetch();
    const view = renderRail();

    // First open: nothing cached, so the loading row is correct.
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    gate.releaseAll();
    await waitFor(() => {
      expect(menu().getByText('OD Feature Team')).toBeTruthy();
    });

    // Close, remount the rail (returning from a project does exactly this),
    // and reopen — the names must be there before the network answers.
    view.unmount();
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    expect(menu().getByText('My Workspace2')).toBeTruthy();
    expect(menu().queryByRole('status')).toBeNull();

    gate.releaseAll();
  });

  it('keeps the cached names when a revalidation fails', async () => {
    const gate = installGatedFetch();
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-switcher'));
    gate.releaseAll();
    await waitFor(() => {
      expect(menu().getByText('OD Feature Team')).toBeTruthy();
    });

    // A failing revalidation must not blank a list the user is looking at.
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as typeof fetch;
    cleanup();
    renderRail();
    fireEvent.click(screen.getByTestId('workspace-switcher'));

    await waitFor(() => {
      expect(menu().getByText('OD Feature Team')).toBeTruthy();
    });
  });
});
