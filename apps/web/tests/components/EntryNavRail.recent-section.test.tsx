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

const teamContext = {
  ...signedInContext,
  workspaceId: 'ws-team',
  workspaceType: 'team',
  permissions: {
    canInviteMembers: false,
    canViewWorkspaceSettings: false,
    canShareProjects: true,
  },
} as unknown as WorkspaceCollabContext;

/** What `POST …/projects/:id/move` answers; tests flip it to a refusal. */
let MOVE_STATUS = 200;

function moveRequests(): string[] {
  return vi.mocked(fetch).mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url]) => String(url))
    .filter((url) => /\/projects\/[^/]+\/move$/.test(url));
}

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
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const moveMatch = /^\/api\/workspaces\/[^/]+\/projects\/([^/]+)\/move$/.exec(url);
    if (moveMatch && init?.method === 'POST') {
      const id = decodeURIComponent(moveMatch[1]!);
      return new Response(
        JSON.stringify(MOVE_STATUS === 200
          ? { id, name: `Project ${id}`, workspaceId: 'ws-team', visibility: 'team', project: { id } }
          : { error: { code: 'FORBIDDEN', message: 'no' } }),
        { status: MOVE_STATUS, headers: { 'Content-Type': 'application/json' } },
      );
    }
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
  const onDuplicate = vi.fn(async () => {});
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
        onDuplicateRecentProject={onDuplicate}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onOpen, onRename, onDelete, onDuplicate };
}

let reportVisibleRows: (start: number, end: number) => void;

class VisibleRowsObserver {
  rows: Element[] = [];
  constructor(private callback: IntersectionObserverCallback) {
    reportVisibleRows = (start, end) => this.callback(this.rows.map((target, index) => ({
      target, isIntersecting: index >= start && index < end,
    } as IntersectionObserverEntry)), this as unknown as IntersectionObserver);
  }
  observe(target: Element) {
    this.rows.push(target);
    queueMicrotask(() => reportVisibleRows(0, 11));
  }
  disconnect() { this.rows = []; }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', VisibleRowsObserver);
  window.localStorage.clear();
  RUNS = { ...DEFAULT_RUNS };
  MOVE_STATUS = 200;
  stubFetch();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('EntryNavRail 最近浏览过 section', () => {
  it('lists every recent project, newest first, under a disclosure that starts open', () => {
    renderRail();
    const toggle = screen.getByTestId('entry-nav-recent-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // 最近项目 (OPEND-2703), not 最近浏览过.
    expect(toggle.textContent).toContain('Recent projects');
    const rows = screen.getAllByTestId('entry-nav-recent-item');
    // OPEND-2757: no 8-row cap — the ninth (and every later) project is a row
    // too; the list scrolls past ~11 rows instead of dropping them.
    expect(rows.map((row) => row.textContent)).toEqual(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'].map((id) => `Project ${id}`),
    );
  });

  it('polls only visible rows in a 500-project catalog and follows the scroll window', async () => {
    vi.useFakeTimers();
    const { onOpen } = renderRail({ recentProjects: Array.from({ length: 500 }, (_, i) =>
      project(`p${i + 1}`, 1000 - i)) });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const runRequests = () => vi.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).startsWith('/api/runs?projectId='));
    expect(screen.getAllByTestId('entry-nav-recent-item')).toHaveLength(500);
    expect(runRequests()).toHaveLength(11);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(runRequests()).toHaveLength(22);
    await act(async () => { reportVisibleRows(489, 500); });
    expect(runRequests().slice(-11).map(([url]) => String(url))).toEqual(
      Array.from({ length: 11 }, (_, i) => `/api/runs?projectId=p${490 + i}`),
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(runRequests()).toHaveLength(44);
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-item')[499]!);
    expect(onOpen).toHaveBeenCalledWith('p500');
    fireEvent.click(screen.getByTestId('entry-nav-recent-toggle'));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(runRequests()).toHaveLength(44);
  });

  it('asks for the rows\' statuses in the same commit that paints them (OPEND-2762)', () => {
    // No hop through the scroll observer, no timer: the head of the list is
    // known the moment the rows render, so its status reads leave right then.
    renderRail();
    const runRequests = vi.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).startsWith('/api/runs?projectId='));
    // Ten rows: fewer than the head window, so every one of them.
    expect(runRequests.map(([url]) => String(url)).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `/api/runs?projectId=p${i + 1}`).sort(),
    );
  });

  it('keeps every glyph when the catalog is handed over again (OPEND-2762)', async () => {
    // EntryShell rebuilds the catalog array on unrelated renders. That must
    // neither blank the glyphs (a flash to the default mark and back) nor
    // re-ask for statuses it already has.
    const catalog = () => Array.from({ length: 10 }, (_, index) =>
      project(`p${index + 1}`, 1_000 - index));
    const tree = (projects: Project[]) => (
      <I18nProvider initial="en">
        <EntryNavRail
          view="home"
          onViewChange={() => {}}
          onNewProject={() => {}}
          open
          context={signedInContext}
          recentProjects={projects}
        />
      </I18nProvider>
    );
    const { rerender } = render(tree(catalog()));
    const rowFor = (id: string) =>
      screen.getAllByTestId('entry-nav-recent-item').find((row) => row.textContent === `Project ${id}`)!;
    await waitFor(() => {
      expect(within(rowFor('p4')).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
    const runRequests = () => vi.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).startsWith('/api/runs?projectId='));
    const before = runRequests().length;

    rerender(tree(catalog()));
    // Synchronously after the commit, and again once the observer has had its
    // say: the ✓ never leaves.
    expect(within(rowFor('p4')).getByRole('img', { name: 'Completed' })).toBeTruthy();
    expect(within(rowFor('p1')).getByRole('img', { name: 'Running' })).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(within(rowFor('p4')).getByRole('img', { name: 'Completed' })).toBeTruthy();
    expect(runRequests()).toHaveLength(before);
  });

  it('renders nothing without projects', () => {
    renderRail({ recentProjects: [] });
    expect(screen.queryByTestId('entry-nav-recent-toggle')).toBeNull();
    // A missing cloud identity is no longer a reason to hide it: the local
    // shell lists its projects here too (OPEND-3140, see
    // EntryNavRail.local-shell.test.tsx).
    cleanup();
    renderRail({ context: null });
    expect(screen.getByTestId('entry-nav-recent-toggle')).toBeTruthy();
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

  it('offers rename / duplicate / delete in a personal workspace — no export, no team item', () => {
    const { onDuplicate } = renderRail();
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
    const menu = screen.getByRole('menu');
    // OPEND-2686: 导出 is gone; 复制 sits between 重命名 and 删除. OPEND-2794: a
    // personal workspace has no team plane, so 转入团队空间 is hidden here.
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(
      ['Rename', 'Duplicate project', 'Delete'],
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicate project' }));
    expect(onDuplicate).toHaveBeenCalledWith('p1');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renames inline from the row menu', async () => {
    const { onRename } = renderRail();
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

  it('confirms delete in the shared dialog: names the project, backs out on Esc / 取消, submits once', async () => {
    let resolveDelete!: (value: boolean) => void;
    const onDelete = vi.fn(() => new Promise<boolean>((resolve) => { resolveDelete = resolve; }));
    renderRail({ onDeleteRecentProject: onDelete });
    const openDelete = () => {
      fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
      fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete' }));
      return screen.getByRole('alertdialog');
    };
    // OPEND-2797: the menu item no longer arms in place — nothing is deleted
    // until the dialog's own red 删除 is pressed.
    let dialog = openDelete();
    expect(onDelete).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Delete "Project p1"?')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    dialog = openDelete();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();

    dialog = openDelete();
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('p1');
    // In flight: both buttons lock, and the scrim / Esc cannot dismiss it.
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    await act(async () => resolveDelete(true));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('keeps the delete dialog open with a visible error when the request fails', async () => {
    const onDelete = vi.fn(async () => false);
    renderRail({ onDeleteRecentProject: onDelete });
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith('p1');
      expect(within(dialog).getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByRole('alertdialog')).toBe(dialog);
    expect((within(dialog).getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers 转入团队空间 in a team workspace through the shared confirm dialog and reports progress in the row menu', async () => {
    const onProjectShared = vi.fn();
    renderRail({
      context: teamContext,
      onRecentProjectShared: onProjectShared,
      isSharedRecentProject: (id) => id === 'p2',
    });
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(
      ['Rename', 'Duplicate project', 'Move to team space', 'Delete'],
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to team space' }));
    // The same confirmation the project cards show — nothing moves yet.
    const dialog = screen.getByRole('alertdialog', { name: 'Move to team space' });
    expect(moveRequests()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm move' }));
    await waitFor(() => expect(moveRequests()).toHaveLength(1));
    expect(moveRequests()[0]).toBe('/api/workspaces/ws-team/projects/p1/move');
    await waitFor(() => expect(onProjectShared).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' })));
    // The row menu re-opened to say 分享中… and closes on success.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    // A project already in the team space says so and cannot be moved again.
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[1]!);
    const shared = within(screen.getByRole('menu')).getByRole('menuitem', { name: 'In team space' });
    expect((shared as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the row menu open with the failure when the move is refused', async () => {
    MOVE_STATUS = 403;
    const onProjectShareFailed = vi.fn();
    renderRail({ context: teamContext, onRecentProjectShareFailed: onProjectShareFailed });
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Move to team space' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog', { name: 'Move to team space' })).getByRole('button', { name: 'Confirm move' }),
    );
    await waitFor(() => expect(onProjectShareFailed).toHaveBeenCalledWith('p1'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('alert').textContent).toBe('Could not move to team space. Try again.');
  });

  it('disables mutations on a row someone else shared', () => {
    renderRail({
      context: teamContext,
      isSharedRecentProject: (id) => id === 'p1',
      recentProjectOwnerMemberIds: new Map([['p1', 'wm-other']]),
    });
    fireEvent.click(screen.getAllByTestId('entry-nav-recent-more')[0]!);
    const menu = screen.getByRole('menu');
    for (const name of ['Rename', 'Duplicate project', 'In team space', 'Delete']) {
      expect((within(menu).getByRole('menuitem', { name }) as HTMLButtonElement).disabled, name).toBe(true);
    }
  });
});
