// @vitest-environment jsdom
//
// Acceptance #77 (type filter must speak the card-chip vocabulary) and #75
// (多选 bar must actually offer actions).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RecentProjectsStrip,
  projectCardCategory,
} from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';
import type { WorkspaceProjectSummary } from '@open-design/contracts';

// Typed on the argument the component actually passes, so `.mock.calls`
// destructures instead of widening to the empty tuple.
interface MoveCall { projectId: string; visibility: string }
function movedProject(input: MoveCall): WorkspaceProjectSummary {
  return {
    id: input.projectId,
    name: input.projectId,
    workspaceId: 'ws-1',
    visibility: input.visibility === 'team' ? 'team' : 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'wm-1',
    currentUserAccess: {
      canOpen: true,
      canRename: true,
      canDelete: true,
      canDuplicate: true,
      canMoveToTeam: input.visibility !== 'team',
      canMoveToPersonal: input.visibility === 'team',
      canExport: true,
      canSendTo: true,
      canRestoreVersion: true,
    },
    createdAt: 1,
    updatedAt: 2,
    project: {
      id: input.projectId,
      name: input.projectId,
      skillId: null,
      designSystemId: null,
      createdAt: 1,
      updatedAt: 2,
    },
  };
}
const moveWorkspaceProject = vi.fn(async (input: MoveCall) => movedProject(input));

vi.mock('../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  moveWorkspaceProject: (...args: unknown[]) => moveWorkspaceProject(args[0] as MoveCall),
}));

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async () => null),
  fetchProjectFiles: vi.fn(async () => []),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

afterEach(() => {
  cleanup();
  moveWorkspaceProject.mockClear();
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

const PROTOTYPE = project({ id: 'p-prototype', name: 'Prototype project', updatedAt: 5 });
const DECK = project({
  id: 'p-deck',
  name: 'Deck project',
  updatedAt: 4,
  metadata: { kind: 'deck' },
});
const LIVE = project({
  id: 'p-live',
  name: 'Live project',
  updatedAt: 3,
  metadata: { kind: 'prototype', intent: 'live-artifact' },
});
// recvpZbvupSr1o: a web-clone project still stores `kind: 'prototype'`
// (home-hero/chips.ts's 'web-clone' chip keeps preview behavior identical to
// a blank prototype) — only `intent: 'web-clone'` marks the scenario.
const WEB_CLONE = project({
  id: 'p-web-clone',
  name: 'Web clone project',
  updatedAt: 2.5,
  metadata: { kind: 'prototype', intent: 'web-clone' },
});
const MEDIA = project({
  id: 'p-media',
  name: 'Media project',
  updatedAt: 2,
  metadata: { kind: 'video' },
});
const DESIGN_SYSTEM = project({
  id: 'p-ds',
  name: 'Design system project',
  updatedAt: 1,
  metadata: { kind: 'other', importedFrom: 'design-system' },
});

const ALL_PROJECTS = [PROTOTYPE, DECK, LIVE, WEB_CLONE, MEDIA, DESIGN_SYSTEM];

function renderGrid(props: Partial<React.ComponentProps<typeof RecentProjectsStrip>> = {}) {
  return render(
    <RecentProjectsStrip
      heading="All projects"
      projects={ALL_PROJECTS}
      onOpen={() => {}}
      {...props}
    />,
  );
}

function openKindMenu(container: HTMLElement): HTMLElement {
  const filters = container.querySelectorAll('.recent-projects__filter');
  // [0] is the owner filter, [1] the type filter.
  fireEvent.click(filters[1]!);
  return container.querySelectorAll('.recent-projects__filter-menu')[0] as HTMLElement;
}

function cardNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recent-projects__card-name')].map(
    (node) => node.textContent ?? '',
  );
}

describe('projectCardCategory', () => {
  // The chip a card wears IS the filter vocabulary; if these drift, the
  // dropdown starts offering types no card can display (acceptance #77).
  it('maps each project to the chip its card renders', () => {
    expect(projectCardCategory(PROTOTYPE)).toBe('prototype');
    expect(projectCardCategory(DECK)).toBe('slide');
    expect(projectCardCategory(LIVE)).toBe('live-artifact');
    expect(projectCardCategory(WEB_CLONE)).toBe('web-clone');
    expect(projectCardCategory(MEDIA)).toBe('media');
    expect(projectCardCategory(DESIGN_SYSTEM)).toBe('design-system');
  });

  it('recvpZbvupSr1o: resolves a web-clone-intent project to its own chip, not the blank prototype bucket', () => {
    // Both projects store `kind: 'prototype'`; only `intent` distinguishes a
    // website clone from a real blank prototype. Before this fix every clone
    // fell through the missing branch straight to the 'prototype' default.
    expect(
      projectCardCategory(project({ id: 'p-blank', metadata: { kind: 'prototype' } })),
    ).toBe('prototype');
    expect(
      projectCardCategory(
        project({ id: 'p-clone', metadata: { kind: 'prototype', intent: 'web-clone' } }),
      ),
    ).toBe('web-clone');
  });

  it('resolves brand-kind projects to the design-system chip the card shows', () => {
    // `projectCategory` alone would answer 'brand', but the card branches on
    // `isDesignSystemProject` first — so 'brand' is not an offerable filter.
    expect(projectCardCategory(project({ id: 'p-brand', metadata: { kind: 'brand' } }))).toBe(
      'design-system',
    );
  });
});

describe('RecentProjectsStrip type filter (#77)', () => {
  it('omits the redundant owner filter from the drafts space', () => {
    const { container } = renderGrid({ heading: 'Drafts', space: 'drafts' });

    const filters = [...container.querySelectorAll('.recent-projects__filter')].map(
      (node) => node.textContent?.trim(),
    );

    expect(filters).toEqual(['Any type']);
  });

  it("keeps the owner filter in spaces that can contain other members' projects", () => {
    const { container } = renderGrid({ space: 'team' });

    const filters = [...container.querySelectorAll('.recent-projects__filter')].map(
      (node) => node.textContent?.trim(),
    );

    expect(filters).toEqual(['All', 'Any type']);
  });

  it('offers exactly the artifact types the cards stamp on themselves', () => {
    const { container } = renderGrid();

    const menu = openKindMenu(container);
    const options = [...menu.querySelectorAll('button')].map((node) => node.textContent);

    expect(options).toEqual([
      'Any type',
      'Prototype',
      'Slide',
      'Live Artifact',
      'Website clone',
      'Media',
      'Design System',
    ]);
    // The legacy taxonomy's catch-all bucket matched no chip at all.
    expect(options).not.toContain('Other');
  });

  it('filters the grid down to the projects wearing the picked chip', () => {
    const { container } = renderGrid();

    fireEvent.click(within(openKindMenu(container)).getByText('Slide'));
    expect(cardNames(container)).toEqual(['Deck project']);

    fireEvent.click(within(openKindMenu(container)).getByText('Live Artifact'));
    expect(cardNames(container)).toEqual(['Live project']);

    // recvpZbvupSr1o: Website clone must be its own filter bucket, separate
    // from both Live Artifact and the blank Prototype bucket it used to hide in.
    fireEvent.click(within(openKindMenu(container)).getByText('Website clone'));
    expect(cardNames(container)).toEqual(['Web clone project']);

    fireEvent.click(within(openKindMenu(container)).getByText('Design System'));
    expect(cardNames(container)).toEqual(['Design system project']);

    fireEvent.click(within(openKindMenu(container)).getByText('Prototype'));
    expect(cardNames(container)).toEqual(['Prototype project']);

    fireEvent.click(within(openKindMenu(container)).getByText('Any type'));
    expect(cardNames(container)).toHaveLength(ALL_PROJECTS.length);
  });
});

describe('RecentProjectsStrip bulk selection bar (#75)', () => {
  function enterSelectionMode(container: HTMLElement, names: string[]) {
    fireEvent.click(screen.getByRole('button', { name: 'Multi-select' }));
    for (const name of names) {
      fireEvent.click(
        container.querySelector(`.recent-projects__select-check[aria-label="${name}"]`)!,
      );
    }
    return container.querySelector('.recent-projects__bulkbar') as HTMLElement;
  }

  it('renders the batch actions next to the selected count', () => {
    const { container } = renderGrid({
      canManageProjectCollection: true,
      collaborationEnabled: true,
      onDelete: () => true,
    });

    const bar = enterSelectionMode(container, ['Deck project']);

    expect(bar.getAttribute('role')).toBe('toolbar');
    expect(within(bar).getByText('1 selected')).toBeTruthy();
    // The defect was an empty right-hand side: count, no actions.
    const actions = [...bar.querySelectorAll('.recent-projects__bulkbar-actions button')].map(
      (node) => node.textContent?.trim(),
    );
    expect(actions).toEqual([
      'Move to team space',
      'Move out of team space',
      'Delete selected',
      'Cancel',
    ]);
  });

  it('only offers batch actions backed by a real capability', () => {
    // No delete handler and no collaboration: the bar keeps its exit affordance
    // rather than showing buttons that would do nothing.
    const { container } = renderGrid({
      canManageProjectCollection: true,
      collaborationEnabled: false,
    });

    const bar = enterSelectionMode(container, ['Deck project']);
    const actions = [...bar.querySelectorAll('.recent-projects__bulkbar-actions button')].map(
      (node) => node.textContent?.trim(),
    );
    expect(actions).toEqual(['Cancel']);
  });

  it('moves every selected project through the workspace move endpoint', async () => {
    const onProjectShared = vi.fn();
    const { container } = renderGrid({
      canManageProjectCollection: true,
      collaborationEnabled: true,
      onDelete: () => true,
      onProjectShared,
    });

    const bar = enterSelectionMode(container, ['Deck project', 'Media project']);
    expect(within(bar).getByText('2 selected')).toBeTruthy();

    fireEvent.click(within(bar).getByText('Move to team space'));
    fireEvent.click(screen.getByText('Confirm move'));

    await waitFor(() => {
      expect(moveWorkspaceProject).toHaveBeenCalledTimes(2);
    });
    expect(
      moveWorkspaceProject.mock.calls.map(([input]) => [
        input.projectId,
        input.visibility,
      ]),
    ).toEqual([
      ['p-deck', 'team'],
      ['p-media', 'team'],
    ]);
    await waitFor(() => {
      expect(onProjectShared.mock.calls.map(([project]) => project.id)).toEqual(['p-deck', 'p-media']);
    });
    // Selection mode closes once the batch is dispatched.
    expect(container.querySelector('.recent-projects__bulkbar')).toBeNull();
  });

  it('confirms before deleting the whole selection', async () => {
    const onDelete = vi.fn((_id: string) => true);
    const { container } = renderGrid({
      canManageProjectCollection: true,
      collaborationEnabled: true,
      onDelete,
    });

    const bar = enterSelectionMode(container, ['Deck project', 'Media project']);
    fireEvent.click(within(bar).getByText('Delete selected'));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Delete 2 project(s)?')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete selected' }));

    await waitFor(() => {
      expect(onDelete.mock.calls.map(([id]) => id)).toEqual(['p-deck', 'p-media']);
    });
  });

  it('blocks batch mutations when the selection contains another member’s project', () => {
    const { container } = renderGrid({
      canManageProjectCollection: true,
      collaborationEnabled: true,
      onDelete: () => true,
      projectOwnerMemberIds: new Map([['p-deck', 'someone-else']]),
    });

    const bar = enterSelectionMode(container, ['Deck project']);
    const mutations = [...bar.querySelectorAll('.recent-projects__bulkbar-actions button')].filter(
      (node) => node.textContent?.trim() !== 'Cancel',
    );
    expect(mutations).toHaveLength(3);
    for (const button of mutations) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('cancel leaves selection mode without touching anything', () => {
    const onDelete = vi.fn((_id: string) => true);
    const { container } = renderGrid({
      canManageProjectCollection: true,
      collaborationEnabled: true,
      onDelete,
    });

    const bar = enterSelectionMode(container, ['Deck project']);
    fireEvent.click(within(bar).getByText('Cancel'));

    expect(container.querySelector('.recent-projects__bulkbar')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    expect(moveWorkspaceProject).not.toHaveBeenCalled();
  });
});
