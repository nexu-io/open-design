// @vitest-environment jsdom
//
// OPEND-3129 / OPEND-3133: the two surfaces that list projects — the rail's
// 最近项目 rows and the project switcher above the chat — lead every project
// with the SAME resting glyph, the folder, and report a finished run the same
// way: the folder stays and a small blue dot at the row's end says "done, and
// you have not looked yet". Opening the project spends that dot in the ONE
// shared run-status store, so both surfaces drop it in the same moment.
// Live states (running, awaiting, failed) keep their status glyph in the lead
// slot, exactly as before.
//
// This supersedes the first OPEND-3129 pass, which had unified the resting
// glyph on a chat-bubble mark instead of the folder.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { WorkspaceTabsBar } from '../../src/components/WorkspaceTabsBar';
import { setWorkspaceTabsDock } from '../../src/components/workspaceTabsDock';
import { I18nProvider } from '../../src/i18n';
import type { Route } from '../../src/router';
import type { Project } from '../../src/types';

vi.mock('../../src/router', async () => {
  const actual = await vi.importActual<typeof import('../../src/router')>('../../src/router');
  return { ...actual, navigate: vi.fn() };
});

const signedInContext = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canInviteMembers: false, canViewWorkspaceSettings: false },
} as unknown as WorkspaceCollabContext;

function project(id: string, name: string, updatedAt: number): Project {
  return { id, name, skillId: null, designSystemId: null, createdAt: updatedAt, updatedAt };
}

const DONE = project('project-done', 'Project Done', 3);
const RUNNING = project('project-running', 'Project Running', 2);
const QUIET = project('project-quiet', 'Project Quiet', 1);
const ASKING = project('project-asking', 'Project Asking', 0);
const PROJECTS = [DONE, RUNNING, QUIET, ASKING];

/** What the runs feed answers per project. */
const RUNS: Record<string, { status: string; runId: string } | undefined> = {
  [DONE.id]: { status: 'succeeded', runId: 'run-done-1' },
  [RUNNING.id]: { status: 'running', runId: 'run-running-1' },
  [QUIET.id]: undefined,
  [ASKING.id]: { status: 'succeeded', runId: 'run-asking-1' },
};
/** Projects whose latest conversation holds an unanswered question. */
const AWAITING = new Set([ASKING.id]);

const activeRoute: Route = {
  kind: 'project',
  projectId: QUIET.id,
  conversationId: null,
  fileName: null,
};

const originalFetch = globalThis.fetch;
const dock = document.createElement('div');

function stubRunsFeed() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = /^\/api\/runs\?projectId=([^&]+)$/.exec(url);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      const fixture = RUNS[id];
      const runs = fixture
        ? [{
            id: fixture.runId,
            projectId: id,
            conversationId: null,
            assistantMessageId: null,
            agentId: 'claude',
            status: fixture.status,
            createdAt: 1,
            updatedAt: 2,
          }]
        : [];
      return new Response(JSON.stringify({ runs, awaitingInputProjectIds: AWAITING.has(id) ? [id] : [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

/** Every project is an open tab, so the switcher lists all three. */
function seedOpenTabs() {
  window.localStorage.setItem(
    'open-design:workspace-tabs:v1',
    JSON.stringify({
      activeTabId: `project:${QUIET.id}`,
      tabs: PROJECTS.map((item, index) => ({
        id: `project:${item.id}`,
        kind: 'project',
        projectId: item.id,
        createdAt: index + 1,
        lastActiveAt: index + 1,
      })),
    }),
  );
}

function renderBoth() {
  const onOpen = vi.fn();
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={signedInContext}
        recentProjects={PROJECTS}
        onOpenRecentProject={onOpen}
      />
      <WorkspaceTabsBar route={{ ...activeRoute }} projects={PROJECTS} />
    </I18nProvider>,
  );
  return { onOpen };
}

function railRow(name: string): HTMLElement {
  return screen.getAllByTestId('entry-nav-recent-item').find((row) => row.textContent?.includes(name))!;
}

/** The rail row's lead slot. */
function railLead(name: string): Element {
  return railRow(name).querySelector('.entry-nav-rail__recent-icon')!;
}

async function openSwitcher(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByTestId('workspace-tabs-dropdown-trigger'));
  return screen.getByRole('listbox');
}

function switcherRow(listbox: HTMLElement, name: string): HTMLElement {
  return within(listbox).getByRole('option', { name: new RegExp(name) });
}

function switcherLead(listbox: HTMLElement, name: string): Element {
  return switcherRow(listbox, name).querySelector('.workspace-tabs-dropdown__row-lead')!;
}

/** The `data-testid` of the glyph a lead slot holds, or null when it has none. */
function glyphTestIdIn(slot: Element): string | null {
  return slot.firstElementChild?.getAttribute('data-testid') ?? null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  document.body.append(dock);
  setWorkspaceTabsDock(dock);
  stubRunsFeed();
  seedOpenTabs();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  setWorkspaceTabsDock(null);
  dock.remove();
});

describe('project glyphs in the rail and the switcher (OPEND-3129 / OPEND-3133)', () => {
  it('leads a quiet project with the folder in both places, and no unread dot', async () => {
    renderBoth();
    await waitFor(() => {
      expect(glyphTestIdIn(railLead(QUIET.name))).toBe('project-folder-glyph');
    });
    expect(within(railRow(QUIET.name)).queryByTestId('entry-nav-recent-unread')).toBeNull();

    const listbox = await openSwitcher();
    await waitFor(() => {
      expect(glyphTestIdIn(switcherLead(listbox, QUIET.name))).toBe('project-folder-glyph');
    });
    expect(within(switcherRow(listbox, QUIET.name)).queryByTestId('workspace-tabs-dropdown-unread')).toBeNull();
  });

  // P0-24 设计答复(2026-10-26):有新结果「也改成蓝色球,无标签」—— 行首一颗静止的蓝球,
  // 不再是文件夹 + 行尾蓝点。
  it('leads a finished, unopened project with the still blue ball and no row-end dot, in both places', async () => {
    renderBoth();
    await waitFor(() => {
      expect(within(railLead(DONE.name) as HTMLElement).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
    expect(glyphTestIdIn(railLead(DONE.name))).not.toBe('project-folder-glyph');
    expect(within(railRow(DONE.name)).queryByTestId('entry-nav-recent-unread')).toBeNull();
    expect(within(railRow(DONE.name)).queryByTestId('entry-nav-recent-reply-tag')).toBeNull();

    const listbox = await openSwitcher();
    await waitFor(() => {
      expect(within(switcherLead(listbox, DONE.name) as HTMLElement).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });
    expect(within(switcherRow(listbox, DONE.name)).queryByTestId('workspace-tabs-dropdown-unread')).toBeNull();
  });

  it('keeps the live status glyph for a running project, with no unread dot', async () => {
    renderBoth();
    await waitFor(() => {
      expect(within(railRow(RUNNING.name)).getByRole('img', { name: 'Running' })).toBeTruthy();
    });
    expect(railLead(RUNNING.name).querySelector('[data-testid="project-folder-glyph"]')).toBeNull();
    expect(within(railRow(RUNNING.name)).queryByTestId('entry-nav-recent-unread')).toBeNull();

    const listbox = await openSwitcher();
    await waitFor(() => {
      expect(within(switcherRow(listbox, RUNNING.name)).getByRole('img', { name: 'Running' })).toBeTruthy();
    });
    expect(within(switcherRow(listbox, RUNNING.name)).queryByTestId('workspace-tabs-dropdown-unread')).toBeNull();
  });

  it('spends the blue ball in both places when the project is opened from the rail', async () => {
    const { onOpen } = renderBoth();
    await waitFor(() => {
      expect(within(railLead(DONE.name) as HTMLElement).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });

    fireEvent.click(railRow(DONE.name));
    expect(onOpen).toHaveBeenCalledWith(DONE.id);

    // Back to the folder in the rail …
    await waitFor(() => {
      expect(glyphTestIdIn(railLead(DONE.name))).toBe('project-folder-glyph');
    });
    // … and in the switcher, which reads the same store rather than its own
    // copy of the acknowledgement.
    const listbox = await openSwitcher();
    await waitFor(() => {
      expect(glyphTestIdIn(switcherLead(listbox, DONE.name))).toBe('project-folder-glyph');
    });
    // The acknowledgement is keyed on THIS finished run, the record both
    // surfaces share.
    expect(JSON.parse(window.localStorage.getItem('od.entry.railRecentSeenDone') ?? '{}')).toEqual({
      [DONE.id]: 'run-done-1',
    });
  });

  it('spends the blue ball in both places when the project is opened from the switcher', async () => {
    renderBoth();
    const listbox = await openSwitcher();
    await waitFor(() => {
      expect(within(switcherLead(listbox, DONE.name) as HTMLElement).getByRole('img', { name: 'Completed' })).toBeTruthy();
    });

    fireEvent.click(switcherRow(listbox, DONE.name));

    await waitFor(() => {
      expect(glyphTestIdIn(railLead(DONE.name))).toBe('project-folder-glyph');
    });
    const reopened = await openSwitcher();
    await waitFor(() => {
      expect(glyphTestIdIn(switcherLead(reopened, DONE.name))).toBe('project-folder-glyph');
    });
  });
});
