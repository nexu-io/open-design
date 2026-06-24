// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystem: vi.fn(async (id: string) => ({
      id,
      title: id === 'linear' ? 'Linear' : 'Acme Design System',
      summary: id === 'linear' ? 'Quiet issue-tracker system.' : 'Internal product system.',
      category: id === 'linear' ? 'Productivity & SaaS' : 'Custom',
      body: `# ${id}\n\n## Colors\n- Primary #111111`,
    })),
    fetchDesignSystemShowcase: vi.fn(async () => '<main>Showcase</main>'),
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const systems: DesignSystemSummary[] = [
  {
    id: 'user:acme',
    title: 'Acme Design System',
    category: 'Custom',
    summary: 'Internal product system.',
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    updatedAt: '2026-05-13T03:19:00.000Z',
  },
  {
    id: 'linear',
    title: 'Linear',
    category: 'Productivity & SaaS',
    summary: 'Quiet issue-tracker system.',
    surface: 'web',
    source: 'built-in',
    status: 'published',
    isEditable: false,
  },
];

// The active scope's first row auto-selects into the detail pane, so a title
// can appear twice (row + detail). Scope row lookups to the sidebar list.
function list() {
  return within(screen.getByTestId('design-systems-list'));
}

function openOfficialPresets() {
  fireEvent.click(screen.getByRole('tab', { name: 'Official presets' }));
}

describe('DesignSystemsTab', () => {
  it('uses design-system scopes directly instead of a design-system/template switcher', () => {
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onPreview={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    expect(screen.queryByRole('tab', { name: 'Design system' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Template' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Your systems' }).textContent).toContain('1');
    expect(screen.getByRole('tab', { name: 'Official presets' }).textContent).toContain('1');
    expect(screen.getByRole('tab', { name: 'Enterprise' }).textContent).toContain('Coming soon');
  });

  it('separates user-created design systems from the official preset library', () => {
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onPreview={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    // "Your systems" is the default scope: Acme shows, Linear (a preset) does not.
    expect(screen.getByTestId('design-systems-create').textContent).toContain('Create');
    expect(screen.getByTestId('design-system-card-user:acme')).toBeTruthy();
    expect(screen.queryByTestId('design-system-card-linear')).toBeNull();

    openOfficialPresets();
    expect(screen.getByTestId('design-system-card-linear')).toBeTruthy();
    expect(list().queryByText('Acme Design System')).toBeNull();
  });

  it('routes create and edit actions to the dedicated design-system flow', () => {
    const onCreate = vi.fn();
    const onOpenSystem = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onPreview={() => {}}
        onCreate={onCreate}
        onOpenSystem={onOpenSystem}
      />,
    );

    fireEvent.click(screen.getByTestId('design-systems-create'));
    expect(onCreate).toHaveBeenCalledOnce();

    // Acme is the only user system, so it auto-selects into the detail pane,
    // exposing the agent edit action that routes back into the authoring flow.
    fireEvent.click(screen.getByRole('button', { name: /Edit with agent/i }));
    expect(onOpenSystem).toHaveBeenCalledWith('user:acme');
  });

  it('keeps built-in library systems read-only with the redundant cover removed', async () => {
    const onOpenSystem = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onPreview={() => {}}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={onOpenSystem}
      />,
    );

    openOfficialPresets();
    // Linear auto-selects into the read-only detail pane.
    await screen.findByTestId('design-kit-view-linear');
    // A built-in preset is browse-only: no agent edit affordance, and the
    // redundant top showcase cover (with its preview button) has been removed.
    expect(screen.queryByRole('button', { name: /Edit with agent/i })).toBeNull();
    expect(screen.queryByTestId('design-kit-cover-preview')).toBeNull();
    expect(onOpenSystem).not.toHaveBeenCalled();
  });

  it('sets a system as the global default through the detail pane', () => {
    const onSelect = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={onSelect}
        onPreview={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    openOfficialPresets();
    // "Make default" now lives in the detail's ⋯ overflow menu.
    fireEvent.click(screen.getByTestId('design-kit-more-actions'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Default for new chats' }));
    expect(onSelect).toHaveBeenCalledWith('linear');
  });
});

// --- #2062: built-in library surface-chip filtering -----------------------

function ds(
  overrides: Partial<DesignSystemSummary> & Pick<DesignSystemSummary, 'id' | 'title'>,
): DesignSystemSummary {
  return {
    id: overrides.id,
    title: overrides.title,
    category: overrides.category ?? 'Uncategorized',
    summary: overrides.summary ?? `${overrides.title} summary`,
    surface: overrides.surface ?? 'web',
  };
}

// Two style categories, each spanning more than one surface, so a style
// filter genuinely narrows every surface count. None set `source`/`isEditable`,
// so they populate the built-in library section the surface chips belong to.
//   Retro:  web x2, image x1   Social: web x1, image x1
const librarySystems: DesignSystemSummary[] = [
  ds({ id: 'retro-web-1', title: 'Retro Web One', category: 'Retro', surface: 'web' }),
  ds({ id: 'retro-web-2', title: 'Retro Web Two', category: 'Retro', surface: 'web' }),
  ds({ id: 'retro-img-1', title: 'Retro Image One', category: 'Retro', surface: 'image' }),
  ds({ id: 'social-web-1', title: 'Social Web One', category: 'Social', surface: 'web' }),
  ds({ id: 'social-img-1', title: 'Social Image One', category: 'Social', surface: 'image' }),
];

function renderTab(items: DesignSystemSummary[] = librarySystems) {
  return render(
    <DesignSystemsTab
      systems={items}
      selectedId={null}
      onSelect={vi.fn()}
      onPreview={vi.fn()}
    />,
  );
}

// The surface pill renders its label and a `.filter-pill-count` span; read
// the count back by the visible label so assertions describe the UI.
function surfacePillCount(label: string): string | null {
  for (const pill of screen.getAllByRole('tab')) {
    const countEl = pill.querySelector('.filter-pill-count');
    if (!countEl) continue;
    const labelText = (pill.textContent ?? '').replace(countEl.textContent ?? '', '');
    if (labelText === label) return countEl.textContent ?? null;
  }
  return null;
}

function selectCategory(value: string) {
  fireEvent.change(screen.getByTestId('design-systems-category-select'), {
    target: { value },
  });
}

describe('DesignSystemsTab surface filtering', () => {
  it('scopes surface pill counts to the selected style category', () => {
    // Regression: nexu-io/open-design#2062 — surface chips kept showing the
    // unfiltered totals after a style category was applied. The counts must
    // describe the filtered result set, otherwise "All 149 / Web 149" is a
    // lie about what the user is looking at.
    renderTab();
    openOfficialPresets();

    expect(surfacePillCount('All')).toBe('5');
    expect(surfacePillCount('Web')).toBe('3');
    expect(surfacePillCount('Image')).toBe('2');

    selectCategory('Retro');

    expect(surfacePillCount('All')).toBe('3');
    expect(surfacePillCount('Web')).toBe('2');
    expect(surfacePillCount('Image')).toBe('1');
  });

  it('keeps the style category when a surface chip refines within it', () => {
    // Regression: nexu-io/open-design#2062 — clicking a surface chip reset
    // the style category to "All", discarding the user's filter instead of
    // refining inside it. The category survives when it still has matches
    // for the chosen surface.
    renderTab();
    openOfficialPresets();
    selectCategory('Retro');

    fireEvent.click(screen.getByRole('tab', { name: /^Web/ }));

    expect(
      (screen.getByTestId('design-systems-category-select') as HTMLSelectElement).value,
    ).toBe('Retro');
    expect(list().getByText('Retro Web One')).toBeTruthy();
    expect(list().getByText('Retro Web Two')).toBeTruthy();
    // A web system from a different category must not leak back in.
    expect(list().queryByText('Social Web One')).toBeNull();
  });

  it('hides a surface chip that has no systems in the selected style category', () => {
    // Consequence of the #2062 fix: a chip whose count drops to zero for the
    // active style category falls away, the same way a globally-empty
    // surface already does — so a chip never advertises an empty result set.
    const webOnlyCategory: DesignSystemSummary[] = [
      ds({ id: 'tools-web-1', title: 'Tools Web One', category: 'Tools', surface: 'web' }),
      ds({ id: 'retro-web-1', title: 'Retro Web One', category: 'Retro', surface: 'web' }),
      ds({ id: 'retro-img-1', title: 'Retro Image One', category: 'Retro', surface: 'image' }),
    ];
    renderTab(webOnlyCategory);
    openOfficialPresets();
    expect(screen.queryByRole('tab', { name: /^Image/ })).not.toBeNull();

    selectCategory('Tools');

    // Tools has only web systems, so the Image chip no longer applies.
    expect(screen.queryByRole('tab', { name: /^Image/ })).toBeNull();
    expect(surfacePillCount('Web')).toBe('1');
  });

  it('keeps the active surface chip visible when a search filters out all of its results', () => {
    // PR #2141 review (Looper): the scoped-count hide rule must never remove
    // the chip the user is currently on. Select Image, then search for text
    // only web systems match — the Image chip must stay, and stay selected,
    // so the active filter is visible instead of an empty list with no chip.
    renderTab();
    openOfficialPresets();
    fireEvent.click(screen.getByRole('tab', { name: /^Image/ }));

    fireEvent.change(screen.getByTestId('design-systems-search'), {
      target: { value: 'Web' },
    });

    const imageTab = screen.queryByRole('tab', { name: /^Image/ });
    expect(imageTab).not.toBeNull();
    expect(imageTab?.getAttribute('aria-selected')).toBe('true');
    // ...and it honestly reports zero matches for the current search.
    expect(surfacePillCount('Image')).toBe('0');
  });
});
