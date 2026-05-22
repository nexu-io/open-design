// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystemShowcase: vi.fn(async () => null),
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
  };
});

// DesignSystemCard lazy-loads its showcase iframe through an
// IntersectionObserver; an idle observer keeps thumbnails (and the registry
// fetch) out of the way so the tests only exercise filtering.
const originalIntersectionObserver = globalThis.IntersectionObserver;

class IdleIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.IntersectionObserver =
    IdleIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.IntersectionObserver = originalIntersectionObserver;
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

describe('DesignSystemsTab', () => {
  it('surfaces user-created design systems in the gallery', () => {
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

    expect(screen.getByText('Create')).toBeTruthy();
    expect(screen.getByText('Acme Design System')).toBeTruthy();
    expect(screen.getByText('Linear')).toBeTruthy();
  });

  it('routes create and open actions to the dedicated design-system flow', () => {
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

    fireEvent.click(screen.getByText('Create'));
    expect(onCreate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText('Edit'));
    expect(onOpenSystem).toHaveBeenCalledWith('user:acme');
  });

  it('omits the built-in library Open button while keeping preview clicks', () => {
    const onOpenSystem = vi.fn();
    const onPreview = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onPreview={onPreview}
        onCreate={() => {}}
        onOpenSystem={onOpenSystem}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();

    fireEvent.click(screen.getByTestId('design-system-preview-linear'));

    expect(onPreview).toHaveBeenCalledWith('linear');
    expect(onOpenSystem).not.toHaveBeenCalledWith('linear');
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
    const labelText = (pill.textContent ?? '').replace(countEl?.textContent ?? '', '');
    if (labelText === label) return countEl?.textContent ?? null;
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
    selectCategory('Retro');

    fireEvent.click(screen.getByRole('tab', { name: /^Web/ }));

    expect(
      (screen.getByTestId('design-systems-category-select') as HTMLSelectElement).value,
    ).toBe('Retro');
    expect(screen.getByText('Retro Web One')).toBeTruthy();
    expect(screen.getByText('Retro Web Two')).toBeTruthy();
    // A web system from a different category must not leak back in.
    expect(screen.queryByText('Social Web One')).toBeNull();
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
    // so the active filter is visible instead of an empty grid with no chip.
    renderTab();
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
