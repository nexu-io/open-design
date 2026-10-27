// @vitest-environment jsdom
//
// OPEND-3108: the 全部项目 page carries three collection tabs under its title —
// 最近浏览过 / 个人项目 / 团队项目 (Demo 877980fb17 `RecentProjectsStrip.tsx:200-202`).
// 最近浏览过 is the same list the rail shows; 个人项目 is the caller's
// un-shared projects; 团队项目 is what the workspace catalog says is shared.
// OPEND-3201 rides along: the card's relative time must sit in its own
// non-shrinking element so the creator, not the time, gives way.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async () => null),
  fetchProjectFiles: vi.fn(async () => []),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));


// The collection tabs read the workspace kind (OPEND-3285): the 团队项目 tab
// exists only in a team workspace. Default the mock to a team so the OPEND-3108
// cases keep their three tabs; the OPEND-3285 cases flip it to personal.
const workspaceState: {
  context: Record<string, unknown> | null;
  loading: boolean;
} = { context: null, loading: false };
function teamContext() {
  return {
    workspaceId: 'ws-team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    teamName: 'OD Feature Team',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    permissions: { canShareProjects: true, canInviteMembers: true },
  };
}
function personalContext() {
  return { ...teamContext(), workspaceId: 'ws-personal', workspaceType: 'personal', teamName: undefined };
}
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: workspaceState.context,
      loading: workspaceState.loading,
      failure: null,
    }),
  };
});

beforeEach(() => {
  workspaceState.context = teamContext();
  workspaceState.loading = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...overrides,
  };
}

const MINE = project({ id: 'p-mine', name: 'My draft', updatedAt: 3 });
const SHARED = project({ id: 'p-shared', name: 'Shared with the team', updatedAt: 2 });
const OLDER_MINE = project({ id: 'p-older', name: 'Older draft', updatedAt: 1 });
const PROJECTS = [MINE, SHARED, OLDER_MINE];
const isShared = (id: string) => id === SHARED.id;

function renderPage(props: Partial<React.ComponentProps<typeof RecentProjectsStrip>> = {}) {
  return render(
    <RecentProjectsStrip
      heading="All projects"
      space="drafts"
      projects={PROJECTS}
      limit={PROJECTS.length}
      isSharedProject={isShared}
      onOpen={() => {}}
      {...props}
    />,
  );
}

function cardNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recent-projects__card-name')].map(
    (node) => node.textContent ?? '',
  );
}

function tabs(container: HTMLElement): HTMLElement {
  const group = container.querySelector<HTMLElement>('.recent-projects__collection-switch');
  if (!group) throw new Error('collection tabs are missing');
  return group;
}

describe('RecentProjectsStrip collection tabs (OPEND-3108)', () => {
  it('renders 最近浏览过 / 个人项目 / 团队项目 as a radio group under the title, in that order', () => {
    const { container } = renderPage();

    const group = tabs(container);
    expect(group.getAttribute('role')).toBe('radiogroup');
    const options = within(group).getAllByRole('radio');
    expect(options.map((node) => node.textContent?.trim())).toEqual([
      'Recently viewed',
      'Personal projects',
      'Team projects',
    ]);
    expect(options.map((node) => node.getAttribute('data-testid'))).toEqual([
      'recent-projects-collection-recent',
      'recent-projects-collection-personalProjects',
      'recent-projects-collection-teamProjects',
    ]);
    // The tabs are part of the page head: the title row above, the tabs and
    // the toolbar cluster on the row below (Demo `recent-projects__head--personal`).
    const head = container.querySelector('.recent-projects__head');
    expect(head?.classList.contains('recent-projects__head--personal')).toBe(true);
    expect(head?.contains(group)).toBe(true);
  });

  it('opens on 最近浏览过 with every project, and narrows to un-shared / shared on the other two', () => {
    const { container } = renderPage();

    expect(screen.getByTestId('recent-projects-collection-recent').getAttribute('aria-checked')).toBe('true');
    expect(cardNames(container)).toEqual(['My draft', 'Shared with the team', 'Older draft']);

    fireEvent.click(screen.getByTestId('recent-projects-collection-personalProjects'));
    expect(screen.getByTestId('recent-projects-collection-personalProjects').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('recent-projects-collection-recent').getAttribute('aria-checked')).toBe('false');
    expect(cardNames(container)).toEqual(['My draft', 'Older draft']);

    fireEvent.click(screen.getByTestId('recent-projects-collection-teamProjects'));
    expect(cardNames(container)).toEqual(['Shared with the team']);

    fireEvent.click(screen.getByTestId('recent-projects-collection-recent'));
    expect(cardNames(container)).toEqual(['My draft', 'Shared with the team', 'Older draft']);
  });

  it('lets the host pick the opening tab and hear every switch (deep link to 团队项目)', () => {
    const onCollectionChange = vi.fn();
    const { container } = renderPage({ collection: 'teamProjects', onCollectionChange });

    expect(screen.getByTestId('recent-projects-collection-teamProjects').getAttribute('aria-checked')).toBe('true');
    expect(cardNames(container)).toEqual(['Shared with the team']);

    fireEvent.click(screen.getByTestId('recent-projects-collection-personalProjects'));
    expect(onCollectionChange).toHaveBeenCalledWith('personalProjects');
    // Controlled: the host owns the value, so the grid does not move until
    // the host re-renders with the new collection.
    expect(cardNames(container)).toEqual(['Shared with the team']);
  });

  it('explains an empty tab instead of dropping to a bare grid', () => {
    const { container } = renderPage({ projects: [MINE, OLDER_MINE] });

    fireEvent.click(screen.getByTestId('recent-projects-collection-teamProjects'));
    expect(cardNames(container)).toEqual([]);
    const empty = container.querySelector('.recent-projects__collection-empty');
    expect(empty?.textContent).toContain('Projects shared to the team will appear here');
    // The tabs and the toolbar survive an empty tab, so the user can leave it.
    expect(tabs(container)).toBeTruthy();
    expect(container.querySelector('.recent-projects__controls')).toBeTruthy();
  });

  it('keeps the tabs off the team space and the home rail', () => {
    const team = renderPage({ space: 'team', heading: 'Team' });
    expect(team.container.querySelector('.recent-projects__collection-switch')).toBeNull();
    team.unmount();

    const home = renderPage({ space: 'recent', heading: undefined });
    expect(home.container.querySelector('.recent-projects__collection-switch')).toBeNull();
  });
});

describe('project card footer keeps the time whole (OPEND-3201)', () => {
  it('puts the relative time in its own element after the creator, never as loose text', () => {
    const { container } = renderPage();

    const card = container.querySelector('.recent-projects__card');
    const time = card?.querySelector('.recent-projects__card-time');
    if (!time) throw new Error('card footer time row is missing');
    const creator = time.querySelector('.recent-projects__card-creator');
    const when = time.querySelector('.recent-projects__card-when');
    expect(creator?.textContent).toBe('Created by Me');
    // Loose text nodes cannot be given `flex-shrink: 0`; the time needs a box.
    // (The fixture's epoch-ms timestamps format as a calendar date.)
    expect(when?.textContent?.trim()).toBeTruthy();
    expect(
      [...time.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()),
    ).toEqual([]);
    expect(creator && when && creator.compareDocumentPosition(when) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('personal workspace hides the 团队项目 tab (OPEND-3285)', () => {
  it('shows only 最近浏览过 / 个人项目 in a personal workspace', () => {
    workspaceState.context = personalContext();
    const { container } = renderPage();
    const group = tabs(container);
    expect(within(group).getAllByRole('radio').map((tab) => tab.textContent)).toEqual([
      'Recently viewed',
      'Personal projects',
    ]);
    expect(screen.queryByTestId('recent-projects-collection-teamProjects')).toBeNull();
  });

  it('keeps all three tabs in a team workspace', () => {
    workspaceState.context = teamContext();
    const { container } = renderPage();
    expect(within(tabs(container)).getAllByRole('radio')).toHaveLength(3);
  });

  it('falls back to 最近浏览过 when a personal workspace lands on the team tab (deep link / stale state)', () => {
    workspaceState.context = personalContext();
    const onCollectionChange = vi.fn();
    renderPage({ collection: 'teamProjects', onCollectionChange });
    expect(onCollectionChange).toHaveBeenCalledWith('recent');
    expect(screen.queryByTestId('recent-projects-collection-teamProjects')).toBeNull();
  });

  it('does not reset the team tab while the workspace context is still loading', () => {
    workspaceState.context = null;
    workspaceState.loading = true;
    const onCollectionChange = vi.fn();
    renderPage({ collection: 'teamProjects', onCollectionChange });
    expect(onCollectionChange).not.toHaveBeenCalled();
  });
});
