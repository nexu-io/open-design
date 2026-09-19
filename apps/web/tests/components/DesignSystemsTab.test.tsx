// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';
import { DESIGN_SYSTEM_FOCUS_KEY, setDesignSystemFocus } from '../../src/runtime/brands';
import {
  deleteDesignSystemDraft,
  DesignSystemDeleteError,
  fetchDesignSystem,
  updateDesignSystemDraft,
} from '../../src/providers/registry';

const exportMocks = vi.hoisted(() => ({
  downloadDesignSystemArchive: vi.fn(async () => true),
  downloadProjectArchive: vi.fn(async () => false),
}));

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
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
  };
});

vi.mock('../../src/runtime/exports', () => exportMocks);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  sessionStorage.removeItem(DESIGN_SYSTEM_FOCUS_KEY);
  exportMocks.downloadDesignSystemArchive.mockReset();
  exportMocks.downloadDesignSystemArchive.mockResolvedValue(true);
  exportMocks.downloadProjectArchive.mockReset();
  exportMocks.downloadProjectArchive.mockResolvedValue(false);
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

// The gallery remains visible until a card is explicitly opened.
function collection(name = 'Official presets') {
  return within(screen.getByRole('region', { name }));
}

function list() {
  return collection();
}

describe('DesignSystemsTab', () => {
  it('renders gallery skeletons without an unopened detail pane while systems load', () => {
    const { container } = render(
      <DesignSystemsTab
        loading
        systems={[]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    expect(screen.getByTestId('design-systems-gallery-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('design-systems-preview-skeleton')).toBeNull();
    expect(screen.getByTestId('design-systems-loading-row-0')).toBeTruthy();
    expect(screen.getByText('Loading design systems…')).toBeTruthy();
    expect(container.querySelector('.loading-spinner')).toBeNull();
  });

  it('starts in the gallery without fetching details or changing the saved default', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <DesignSystemsTab loading systems={[]} selectedId="user:acme" onSelect={onSelect} />,
    );

    rerender(<DesignSystemsTab systems={systems} selectedId="user:acme" onSelect={onSelect} />);

    expect(screen.getByTestId('design-system-card-user:acme')).toBeTruthy();
    expect(screen.queryByTestId('design-kit-view-user:acme')).toBeNull();
    expect(screen.queryByTestId('design-systems-preview')).toBeNull();
    expect(fetchDesignSystem).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    expect(screen.getByTestId('design-system-card-linear')).toBeTruthy();
    expect(screen.queryByTestId('design-kit-view-linear')).toBeNull();
    expect(fetchDesignSystem).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens a requested cross-route focus directly without changing the default', async () => {
    const onSelect = vi.fn();
    setDesignSystemFocus('linear');
    render(<DesignSystemsTab systems={systems} selectedId="user:acme" onSelect={onSelect} />);

    expect(await screen.findByTestId('design-kit-view-linear')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Official presets' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Official presets' })).toBeNull();
    expect(sessionStorage.getItem(DESIGN_SYSTEM_FOCUS_KEY)).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('design-systems-back'));
    expect(screen.getByRole('region', { name: 'Official presets' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Your systems' })).toBeVisible();
    expect(screen.getByTestId('design-system-card-linear')).toBeTruthy();
    expect(screen.queryByTestId('design-kit-view-linear')).toBeNull();
  });

  it('restores both collections on return without reopening detail', async () => {
    render(<DesignSystemsTab systems={systems} selectedId="user:acme" onSelect={vi.fn()} />);
    fireEvent.click(screen.getByTestId('design-system-card-user:acme'));
    expect(await screen.findByTestId('design-kit-view-user:acme')).toBeTruthy();

    expect(screen.queryByRole('region', { name: 'Your systems' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Official presets' })).toBeNull();
    expect(screen.queryByTestId('design-systems-create')).toBeNull();
    fireEvent.click(screen.getByTestId('design-systems-back'));
    expect(screen.queryByTestId('design-kit-view-user:acme')).toBeNull();
    expect(screen.queryByTestId('design-kit-view-linear')).toBeNull();
    expect(screen.getByTestId('design-system-card-linear')).toBeTruthy();

    expect(screen.getByTestId('design-system-card-user:acme')).toBeTruthy();
    expect(screen.queryByTestId('design-kit-view-user:acme')).toBeNull();
  });

  it('keeps the summary-derived kit visible while the selected system detail resolves', async () => {
    let resolveDetail!: (value: Awaited<ReturnType<typeof fetchDesignSystem>>) => void;
    vi.mocked(fetchDesignSystem).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    const { container } = render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('design-system-card-user:acme'));
    expect(screen.getByTestId('design-kit-view-user:acme')).toBeTruthy();
    expect(screen.queryByTestId('design-system-detail-loading-user:acme')).toBeNull();
    expect(container.querySelector('.loading-spinner')).toBeNull();

    resolveDetail({
      id: 'user:acme',
      title: 'Acme Design System',
      summary: 'Internal product system.',
      category: 'Custom',
      body: '# Acme\n\n## Colors\n- Primary #111111',
    });
    await screen.findByTestId('design-kit-view-user:acme');
  });

  it('shows official and personal collections in order with counts instead of source tabs', () => {
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    expect(screen.queryByRole('tab', { name: 'Design system' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Your systems' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Official presets' })).toBeNull();
    const regions = screen.getAllByRole('region');
    expect(regions.map((region) => region.getAttribute('aria-label')))
      .toEqual(['Official presets', 'Your systems']);
    expect(collection().getByRole('heading', { name: /Official presets/ })).toHaveTextContent(/^Official presets$/);
    expect(collection('Your systems').getByRole('heading', { name: /Your systems/ })).toHaveTextContent('1');
    expect(screen.queryByRole('tab', { name: 'Enterprise' })).toBeNull();
  });

  it('separates user-created design systems from the official preset library', () => {
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    expect(screen.getByTestId('design-systems-create').textContent).toContain('Create');
    expect(collection('Your systems').getByTestId('design-system-card-user:acme')).toBeVisible();
    expect(collection('Your systems').queryByTestId('design-system-card-linear')).toBeNull();
    expect(collection().getByTestId('design-system-card-linear')).toBeVisible();
    expect(collection().queryByTestId('design-system-card-user:acme')).toBeNull();
  });

  it('shows the user system scenario (summary) as the row subtitle, not a generic placeholder', () => {
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId="user:acme"
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    // The user row's subtitle now reads the scenario (summary) instead of the
    // repeated "Design system" placeholder it used to show.
    const row = within(screen.getByTestId('design-system-card-user:acme'));
    expect(row.getByText('Internal product system.')).toBeTruthy();
    expect(row.queryByText('Design system')).toBeNull();
  });

  it('routes create and edit actions to the dedicated design-system flow', async () => {
    const onCreate = vi.fn();
    const onOpenSystem = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onCreate={onCreate}
        onOpenSystem={onOpenSystem}
      />,
    );

    fireEvent.click(screen.getByTestId('design-systems-create'));
    expect(onCreate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('design-system-card-user:acme'));
    fireEvent.click(await screen.findByRole('button', { name: /Edit with agent/i }));
    expect(onOpenSystem).toHaveBeenCalledWith('user:acme');
  });

  it('keeps built-in library systems read-only with the redundant cover removed', async () => {
    const onOpenSystem = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={onOpenSystem}
      />,
    );

    fireEvent.click(screen.getByTestId('design-system-card-linear'));
    await screen.findByTestId('design-kit-view-linear');
    // A built-in preset is browse-only: no agent edit affordance, and the
    // redundant top showcase cover (with its preview button) has been removed.
    expect(screen.queryByRole('button', { name: /Edit with agent/i })).toBeNull();
    expect(screen.queryByTestId('design-kit-cover-preview')).toBeNull();
    expect(onOpenSystem).not.toHaveBeenCalled();
  });

  it('sets a system as the global default through the detail pane', async () => {
    const onSelect = vi.fn();
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={onSelect}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('design-system-card-linear'));
    // "Make default" lives in the detail's ⋯ overflow menu.
    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Default for new chats' }));
    expect(onSelect).toHaveBeenCalledWith('linear');
  });

  it('shows loading and result feedback when publishing a user system', async () => {
    let resolveUpdate!: (value: Awaited<ReturnType<typeof updateDesignSystemDraft>>) => void;
    vi.mocked(updateDesignSystemDraft).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('design-system-card-user:acme'));
    const toggle = await screen.findByRole('button', { name: 'Draft' });
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading…')).toBeTruthy();

    resolveUpdate({
      id: 'user:acme',
      title: 'Acme Design System',
      summary: 'Internal product system.',
      category: 'Custom',
      status: 'published',
      body: '# Acme',
    });

    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
  });

  it('shows loading and result feedback for detail overflow downloads', async () => {
    let resolveDownload!: (value: boolean) => void;
    exportMocks.downloadDesignSystemArchive.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('design-system-card-user:acme'));
    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download design system (.zip + SKILLS.md)' }));

    expect(screen.getByText('Download design system (.zip + SKILLS.md)')).toBeTruthy();
    resolveDownload(true);

    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
  });

  it('explains when a design system delete is denied instead of suggesting a retry', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(deleteDesignSystemDraft).mockRejectedValueOnce(
      new DesignSystemDeleteError(
        'WORKSPACE_RESOURCE_MANAGE_DENIED',
        403,
        'WORKSPACE_RESOURCE_MANAGE_DENIED',
      ),
    );
    render(
      <DesignSystemsTab
        systems={systems}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('design-system-card-user:acme'));
    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Acme Design System' }));

    await waitFor(() => {
      expect(
        screen.getByText('You don\'t have permission to delete this design system.'),
      ).toBeTruthy();
    });
    expect(screen.queryByText('Something went wrong. Please try again.')).toBeNull();
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
    />,
  );
}

function selectCategory(value: string, count: number) {
  fireEvent.click(screen.getByRole('combobox', { name: /^Category:/ }));
  fireEvent.click(within(screen.getByRole('listbox', { name: 'Category' })).getByRole('option', { name: `${value} ${count}` }));
}

describe('DesignSystemsTab category filtering', () => {
  it('keeps the search before official filters and applies only search to personal systems', () => {
    renderTab([
      ...librarySystems,
      { ...systems[0]!, title: 'Personal Image One', surface: 'image' },
    ]);
    const official = screen.getByRole('region', { name: 'Official presets' });
    const search = within(official).getByTestId('design-systems-header-search');
    const categorySelect = within(official).getByRole('combobox');
    expect(within(official).queryByRole('tablist')).toBeNull();
    expect(search.compareDocumentPosition(categorySelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    selectCategory('Retro', 3);
    const personal = collection('Your systems');
    expect(personal.getByTestId('design-system-card-user:acme')).toBeVisible();
    expect(personal.getByRole('heading', { name: /Your systems/ })).toHaveTextContent('1');
    expect(list().getByTestId('design-system-card-retro-img-1')).toBeVisible();

    fireEvent.change(screen.getByTestId('design-systems-search'), { target: { value: 'Personal' } });
    expect(personal.getByTestId('design-system-card-user:acme')).toBeVisible();
    expect(list().queryByTestId('design-system-card-retro-web-1')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Category: Retro 0' })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('design-systems-search'), { target: { value: 'Retro' } });
    expect(personal.queryByTestId('design-system-card-user:acme')).toBeNull();
    expect(personal.getByRole('heading', { name: /Your systems/ })).toHaveTextContent('0');
    expect(list().getByTestId('design-system-card-retro-web-1')).toBeVisible();
  });

  it('shows category result counts for the current search and refreshed catalog', () => {
    const { rerender } = renderTab();
    const trigger = screen.getByRole('combobox', { name: 'Category: All 5' });
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'All 5' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Social 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Retro 3' }));
    expect(trigger).toHaveAccessibleName('Category: Retro 3');

    expect(trigger).toHaveAccessibleName('Category: Retro 3');
    fireEvent.click(trigger);
    // Other categories must still advertise their own results, even while
    // Retro is selected and excludes them from the visible gallery.
    expect(screen.getByRole('option', { name: 'All 5' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Social 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Retro 3' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(trigger, { key: 'Escape' });

    fireEvent.change(screen.getByTestId('design-systems-search'), { target: { value: 'Social Web' } });
    expect(trigger).toHaveAccessibleName('Category: Retro 0');
    expect(screen.queryByTestId('design-system-card-retro-web-1')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'All 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Retro 0' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'Social 1' }));
    expect(trigger).toHaveAccessibleName('Category: Social 1');
    expect(screen.getByTestId('design-system-card-social-web-1')).toBeInTheDocument();
    expect(screen.queryByTestId('design-system-card-social-img-1')).not.toBeInTheDocument();

    rerender(<DesignSystemsTab systems={[
      ...librarySystems,
      ds({ id: 'social-web-2', title: 'Social Web Two', category: 'Social', surface: 'web' }),
    ]} selectedId={null} onSelect={vi.fn()} />);
    expect(trigger).toHaveAccessibleName('Category: Social 2');
    expect(screen.getByTestId('design-system-card-social-web-2')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'All 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Social 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Retro 0' })).toBeInTheDocument();
  });

  it('opens the category menu, selects a category and returns focus with the filtered gallery', () => {
    renderTab();
    const trigger = screen.getByRole('combobox', { name: 'Category: All 5' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('listbox', { name: 'Category' });
    expect(within(menu).getByRole('option', { name: 'All 5' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(menu).getByRole('option', { name: 'Retro 3' }));

    expect(screen.queryByRole('listbox', { name: 'Category' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Category: Retro 3' })).toHaveFocus();
    expect(list().getByText('Retro Web One')).toBeInTheDocument();
    expect(list().getByText('Retro Image One')).toBeInTheDocument();
    expect(list().queryByText('Social Web One')).not.toBeInTheDocument();
    expect(list().queryByText('Social Image One')).not.toBeInTheDocument();
  });

  it('closes categories with Escape or an outside click without changing the selected filter', () => {
    renderTab();
    selectCategory('Retro', 3);
    const trigger = screen.getByRole('combobox', { name: 'Category: Retro 3' });
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'Retro 3' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Category' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const outside = screen.getByTestId('design-systems-search');
    outside.focus();
    fireEvent.mouseDown(outside);
    expect(screen.queryByRole('listbox', { name: 'Category' })).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
    expect(trigger).toHaveAccessibleName('Category: Retro 3');
    expect(list().queryByText('Social Web One')).not.toBeInTheDocument();
  });

  it('restores filters, the official rail and vertical position when returning from either collection', async () => {
    const onSelect = vi.fn();
    render(
      <div className="entry-main--scroll" data-testid="catalog-scroll-pane">
        <DesignSystemsTab systems={[
          ...librarySystems,
          { ...systems[0]!, title: 'Personal One' },
        ]} selectedId="social-web-1" onSelect={onSelect} />
      </div>,
    );
    selectCategory('Retro', 3);
    fireEvent.change(screen.getByTestId('design-systems-search'), { target: { value: 'One' } });

    expect(screen.getByTestId('design-system-card-retro-web-1')).toBeTruthy();
    expect(screen.queryByTestId('design-system-card-retro-web-2')).toBeNull();
    const rail = collection().getByTestId('design-systems-list');
    rail.scrollLeft = 144;
    expect(collection('Your systems').queryByTestId('design-systems-previous')).toBeNull();
    expect(collection('Your systems').queryByTestId('design-systems-next')).toBeNull();
    const scrollPane = screen.getByTestId('catalog-scroll-pane');
    scrollPane.scrollTop = 37;
    const openedCard = screen.getByTestId('design-system-card-retro-web-1');
    fireEvent.click(openedCard);
    expect(await screen.findByTestId('design-kit-view-retro-web-1')).toBeTruthy();
    expect(scrollPane.scrollTop).toBe(0);
    expect(screen.queryByRole('region', { name: 'Official presets' })).toBeNull();
    expect(screen.getByTestId('design-systems-back')).toHaveFocus();

    fireEvent.click(screen.getByTestId('design-systems-back'));
    expect(openedCard).toHaveFocus();
    expect(scrollPane.scrollTop).toBe(37);
    expect(collection().getByTestId('design-systems-list').scrollLeft).toBe(144);
    expect(screen.getByTestId('design-systems-search')).toHaveValue('One');
    expect(screen.getByRole('combobox', { name: 'Category: Retro 2' })).toBeInTheDocument();
    expect(screen.getByTestId('design-system-card-retro-web-1')).toBeTruthy();
    expect(screen.queryByTestId('design-system-card-retro-web-2')).toBeNull();
    expect(screen.queryByTestId('design-system-card-social-web-1')).toBeNull();
    expect(screen.queryByTestId('design-kit-view-retro-web-1')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    scrollPane.scrollTop = 280;
    const personalCard = collection('Your systems').getByTestId('design-system-card-user:acme');
    fireEvent.click(personalCard);
    expect(await screen.findByTestId('design-kit-view-user:acme')).toBeTruthy();
    expect(scrollPane.scrollTop).toBe(0);
    fireEvent.click(screen.getByTestId('design-systems-back'));
    expect(personalCard).toHaveFocus();
    expect(scrollPane.scrollTop).toBe(280);
    expect(collection().getByTestId('design-systems-list').scrollLeft).toBe(144);
  });

});
