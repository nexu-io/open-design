// @vitest-environment jsdom
//
// OPEND-3107 (toolbar half): the project list's control row is the three
// controls the Demo ships — 多选, the type filter, and one ⋯ button that
// folds sort and view into a single two-group menu. G4 (#8153) already
// aligned the type filter's six options; this file covers the row itself.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async () => null),
  fetchProjectFiles: vi.fn(async () => []),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

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

const OLDEST = project({ id: 'p-oldest', name: 'Alpha oldest', updatedAt: 1 });
const MIDDLE = project({ id: 'p-middle', name: 'Charlie middle', updatedAt: 2 });
const NEWEST = project({ id: 'p-newest', name: 'Bravo newest', updatedAt: 3 });
const PROJECTS = [OLDEST, MIDDLE, NEWEST];

const SORT_LABEL = 'Sort projects';
const VIEW_LABEL = 'View mode';
const DISPLAY_TRIGGER = `${SORT_LABEL} · ${VIEW_LABEL}`;

function renderList(props: Partial<React.ComponentProps<typeof RecentProjectsStrip>> = {}) {
  return render(
    <RecentProjectsStrip
      heading="Drafts"
      space="drafts"
      projects={PROJECTS}
      limit={PROJECTS.length}
      onOpen={() => {}}
      canManageProjectCollection
      {...props}
    />,
  );
}

function controls(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('.recent-projects__controls');
  if (!node) throw new Error('control row is missing');
  return node;
}

function accessibleName(button: HTMLElement): string {
  return button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '';
}

function toolbarButtons(container: HTMLElement): string[] {
  return within(controls(container))
    .getAllByRole('button')
    .map(accessibleName);
}

function openDisplayMenu(container: HTMLElement): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: DISPLAY_TRIGGER }));
  const menu = container.querySelector<HTMLElement>('.recent-projects__filter-menu--display');
  if (!menu) throw new Error('display menu did not open');
  return menu;
}

function cardNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recent-projects__card-name')].map(
    (node) => node.textContent ?? '',
  );
}

function checkedItem(group: HTMLElement): HTMLElement | null {
  return group.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]');
}

describe('RecentProjectsStrip toolbar (OPEND-3107)', () => {
  it('holds exactly three controls in the personal space: 多选, the type filter, and ⋯', () => {
    const { container } = renderList();

    expect(toolbarButtons(container)).toEqual(['Multi-select', 'Any type', DISPLAY_TRIGGER]);
  });

  it('keeps the owner filter ahead of the type filter in a team space', () => {
    const { container } = renderList({ heading: 'All projects', space: 'team' });

    expect(toolbarButtons(container)).toEqual(['Multi-select', 'All', 'Any type', DISPLAY_TRIGGER]);
  });

  it('never renders a standalone clear-filters button; the type filter resets through Any type', () => {
    const { container } = renderList();

    // Every fixture falls into the Prototype bucket, so Image empties the grid
    // — the case the old clear chip was reserved for.
    fireEvent.click(screen.getByRole('button', { name: 'Any type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    expect(cardNames(container)).toEqual([]);

    expect(screen.queryByTestId('recent-projects-clear-filters')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    expect(container.querySelector('.recent-projects__filter-clear')).toBeNull();
    expect(toolbarButtons(container)).toEqual(['Multi-select', 'Image', DISPLAY_TRIGGER]);

    fireEvent.click(screen.getByRole('button', { name: 'Image' }));
    fireEvent.click(within(container.querySelector<HTMLElement>('.recent-projects__filter-menu')!).getByRole('button', { name: 'Any type' }));

    expect(cardNames(container)).toEqual(['Bravo newest', 'Charlie middle', 'Alpha oldest']);
  });

  it('opens a two-group menu from ⋯: Sort (Newest / Oldest / Name) and View (Grid / List), current items checked', () => {
    const { container } = renderList();

    const trigger = screen.getByRole('button', { name: DISPLAY_TRIGGER });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('svg')).not.toBeNull();

    const menu = openDisplayMenu(container);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('role')).toBe('menu');

    const groups = [...menu.querySelectorAll<HTMLElement>('.recent-projects__filter-menu-group')];
    expect(groups.map((group) => group.getAttribute('role'))).toEqual(['group', 'group']);
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([SORT_LABEL, VIEW_LABEL]);
    expect(
      groups.map((group) => group.querySelector('.recent-projects__filter-menu-label')?.textContent),
    ).toEqual([SORT_LABEL, VIEW_LABEL]);

    const [sortGroup, viewGroup] = groups as [HTMLElement, HTMLElement];
    const sortItems = within(sortGroup).getAllByRole('menuitemradio');
    expect(sortItems.map((item) => item.textContent)).toEqual(['Newest first', 'Oldest first', 'Name']);
    const viewItems = within(viewGroup).getAllByRole('menuitemradio');
    expect(viewItems.map((item) => item.textContent)).toEqual(['Grid view', 'List view']);

    // Defaults: newest first, grid — each the only checked item of its group,
    // and the only one carrying a glyph inside its check slot.
    expect(checkedItem(sortGroup)?.textContent).toBe('Newest first');
    expect(checkedItem(viewGroup)?.textContent).toBe('Grid view');
    for (const item of [...sortItems, ...viewItems]) {
      const slot = item.querySelector('.recent-projects__filter-menu-check');
      expect(slot).not.toBeNull();
      expect(slot?.querySelector('svg') !== null).toBe(item.getAttribute('aria-checked') === 'true');
      expect(item.classList.contains('is-active')).toBe(item.getAttribute('aria-checked') === 'true');
    }
  });

  it('applies a sort pick, closes the menu, and shows it checked on reopen', () => {
    const { container } = renderList();
    expect(cardNames(container)).toEqual(['Bravo newest', 'Charlie middle', 'Alpha oldest']);

    let menu = openDisplayMenu(container);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Name' }));

    expect(container.querySelector('.recent-projects__filter-menu--display')).toBeNull();
    expect(cardNames(container)).toEqual(['Alpha oldest', 'Bravo newest', 'Charlie middle']);

    menu = openDisplayMenu(container);
    const [sortGroup] = menu.querySelectorAll<HTMLElement>('.recent-projects__filter-menu-group');
    expect(checkedItem(sortGroup!)?.textContent).toBe('Name');
    expect(within(sortGroup!).getAllByRole('menuitemradio', { checked: true })).toHaveLength(1);
  });

  it('applies a view pick, closes the menu, and shows it checked on reopen', () => {
    const { container } = renderList();
    expect(container.querySelector('.recent-projects__row--grid')).not.toBeNull();

    let menu = openDisplayMenu(container);
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'List view' }));

    expect(container.querySelector('.recent-projects__filter-menu--display')).toBeNull();
    expect(container.querySelector('.recent-projects__row--list')).not.toBeNull();
    expect(container.querySelector('.recent-projects__row--grid')).toBeNull();
    // The old grid / list toggle pair is gone for good, not just hidden.
    expect(container.querySelector('.recent-projects__view')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grid view', pressed: true })).toBeNull();

    menu = openDisplayMenu(container);
    const viewGroup = menu.querySelectorAll<HTMLElement>('.recent-projects__filter-menu-group')[1]!;
    expect(checkedItem(viewGroup)?.textContent).toBe('List view');
  });

  it('is keyboard reachable: items are focusable buttons and Escape closes the menu back onto ⋯', () => {
    const { container } = renderList();

    const trigger = screen.getByRole('button', { name: DISPLAY_TRIGGER });
    trigger.focus();
    fireEvent.click(trigger);
    const menu = container.querySelector<HTMLElement>('.recent-projects__filter-menu--display')!;
    const first = within(menu).getAllByRole('menuitemradio')[0]!;
    expect(first.tagName).toBe('BUTTON');
    expect(first.hasAttribute('disabled')).toBe(false);
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: 'Escape' });

    expect(container.querySelector('.recent-projects__filter-menu--display')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
