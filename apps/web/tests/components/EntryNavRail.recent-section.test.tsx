// @vitest-environment jsdom
//
// The rail's 最近浏览过 section: the head of the recent catalog under 插件, each
// row leading with the project's live run status (the same feed the projects
// grid reads) and opening through the shell's pull-first opener.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';
import type { Project } from '../../src/types';

const signedInContext = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canInviteMembers: false, canViewWorkspaceSettings: false },
} as unknown as WorkspaceCollabContext;

function project(id: string, updatedAt: number, name = `Project ${id}`): Project {
  return {
    id,
    name,
    skillId: null,
    designSystemId: null,
    createdAt: updatedAt,
    updatedAt,
  } as Project;
}

type RunFixture = { status: string; awaiting?: boolean; runId?: string };

const DEFAULT_RUNS: Record<string, RunFixture> = {
  p1: { status: 'running' },
  p2: { status: 'succeeded', awaiting: true },
  p3: { status: 'failed' },
  p4: { status: 'succeeded' },
};

/** What the runs feed answers per project; tests mutate it between polls. */
let RUNS: Record<string, RunFixture> = { ...DEFAULT_RUNS };

const originalFetch = globalThis.fetch;

function stubFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = /^\/api\/runs\?projectId=([^&]+)$/.exec(url);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      const fixture = RUNS[id];
      const runs = fixture
        ? [{
            id: fixture.runId ?? `run-${id}`,
            projectId: id,
            conversationId: null,
            assistantMessageId: null,
            agentId: 'claude',
            status: fixture.status,
            createdAt: 1,
            updatedAt: 2,
          }]
        : [];
      return new Response(
        JSON.stringify({ runs, awaitingInputProjectIds: fixture?.awaiting ? [id] : [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

function renderRail(overrides: Partial<Parameters<typeof EntryNavRail>[0]> = {}) {
  const onOpen = vi.fn();
  const onRename = vi.fn();
  const onDelete = vi.fn(async () => true);
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={signedInContext}
        recentProjects={Array.from({ length: 10 }, (_, index) =>
          project(`p${index + 1}`, 1_000 - index))}
        onOpenRecentProject={onOpen}
        onRenameRecentProject={onRename}
        onDeleteRecentProject={onDelete}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onOpen, onRename, onDelete };
}

beforeEach(() => {
  window.localStorage.clear();
  RUNS = { ...DEFAULT_RUNS };
  stubFetch();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('EntryNavRail 最近浏览过 section', () => {
  it('lists the eight most recent projects, newest first, under a disclosure that starts open', () => {
    renderRail();
    const toggle = screen.getByTestId('entry-nav-recent-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('Recently viewed');
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    expect(rows.map((row) => row.textContent)).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => `Project ${id}`),
    );
  });

  it('renders nothing without projects or without a cloud identity', () => {
    renderRail({ recentProjects: [] });
    expect(screen.queryByTestId('entry-nav-recent-toggle')).toBeNull();
    cleanup();
    renderRail({ context: null });
    expect(screen.queryByTestId('entry-nav-recent-toggle')).toBeNull();
  });

  it('leads each row with its live run status from the runs feed', async () => {
    renderRail();
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    await waitFor(() => {
      expect(within(rows[0]!).getByRole('img', { name: 'Running' })).toBeTruthy();
    });
    // A pending question outranks the succeeded run that asked it.
    expect(within(rows[1]!).getByRole('img', { name: 'Needs input' })).toBeTruthy();
    expect(within(rows[2]!).getByRole('img', { name: 'Failed' })).toBeTruthy();
    expect(within(rows[3]!).getByRole('img', { name: 'Completed' })).toBeTruthy();
    // No run at all: the default chat mark, which is decorative.
    expect(within(rows[4]!).queryByRole('img')).toBeNull();
  });

  it('opens a project through the pull-first opener and spends its ✓ once looked at', async () => {
    const { onOpen } = renderRail();
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    await waitFor(() => {
      expect(within(rows[3]!).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
    fireEvent.click(rows[3]!);
    expect(onOpen).toHaveBeenCalledWith('p4');
    await waitFor(() => {
      expect(within(screen.getAllByTestId('entry-nav-recent-item')[3]!).queryByRole('img')).toBeNull();
    });
    expect(JSON.parse(window.localStorage.getItem('od.entry.railRecentSeenDone') ?? '{}')).toEqual({
      p4: 'run-p4',
    });
  });

  it('re-raises the ✓ for a newer finished run even when its running phase was never seen', async () => {
    // r1 finished; the user looks at it, which spends its ✓.
    RUNS = { ...DEFAULT_RUNS, p4: { status: 'succeeded', runId: 'r1' } };
    const { onOpen } = renderRail();
    const rowFor = (id: string) =>
      screen.getAllByTestId('entry-nav-recent-item').find((row) => row.textContent === `Project ${id}`)!;
    await waitFor(() => {
      expect(within(rowFor('p4')).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
    fireEvent.click(rowFor('p4'));
    expect(onOpen).toHaveBeenCalledWith('p4');
    await waitFor(() => {
      expect(within(rowFor('p4')).queryByRole('img')).toBeNull();
    });

    // Collapse: the section stops polling, so the next run's queued/running
    // phase is never observed. By the time it is expanded again, a NEW run r2
    // has finished.
    fireEvent.click(screen.getByTestId('entry-nav-recent-toggle'));
    RUNS = { ...DEFAULT_RUNS, p4: { status: 'succeeded', runId: 'r2' } };
    fireEvent.click(screen.getByTestId('entry-nav-recent-toggle'));

    // r2 is a new notice: its ✓ must show even though r1's was acknowledged.
    await waitFor(() => {
      expect(within(rowFor('p4')).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
  });

  it('ignores the legacy array shape of the acknowledgement store', async () => {
    // Older builds stored a bare list of project ids. That shape cannot say
    // WHICH run was acknowledged, so it must read as "nothing acknowledged":
    // the ✓ shows once more rather than a fresh completion being swallowed.
    window.localStorage.setItem('od.entry.railRecentSeenDone', JSON.stringify(['p4']));
    renderRail();
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    await waitFor(() => {
      expect(within(rows[3]!).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
  });

  it('collapses on the head row and remembers the choice', () => {
    renderRail();
    const toggle = screen.getByTestId('entry-nav-recent-toggle');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(window.localStorage.getItem('od.entry.railRecentOpen')).toBe('false');
    cleanup();
    renderRail();
    expect(screen.getByTestId('entry-nav-recent-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('offers rename and a two-step delete from the row menu', async () => {
    const { onDelete, onRename } = renderRail();
    const more = screen.getAllByTestId('entry-nav-recent-more')[0]!;
    fireEvent.click(more);
    const menu = screen.getByRole('menu');
    const items = within(menu).getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Rename', 'Export', 'Delete']);

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete' }));
    // First click only arms the destructive action.
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'OK' }));
    expect(onDelete).toHaveBeenCalledWith('p1');

    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[1]!);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Rename' }) as HTMLInputElement;
    expect(input.value).toBe('Project p2');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Renamed' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(onRename).toHaveBeenCalledWith('p2', 'Renamed');
  });
});
