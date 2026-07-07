// Faceted categorisation hook for the Plugins home section.
//
// Two-level starter model: the top row is the artifact kind
// (Prototype / Slides / Image / Video / HyperFrames / Audio). Prototype,
// Slides, Image, and Video expose scene buckets from the prompt-taxonomy
// analysis; HyperFrames and Audio stay flat.
//
// A small "Saved" toggle sits orthogonally to the category row —
// when active it overrides the category selection and just shows
// the plugins saved by the user. We intentionally make Saved
// override rather than AND-compose so a saved pick is never
// accidentally hidden behind a still-selected category pill.

import { useEffect, useMemo, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import {
  applyFacetSelection,
  buildFacetCatalog,
  filterByQuery,
  resolveDefaultSelection,
  type FacetCatalog,
  type FacetSelection,
} from './facets';
import { sortByVisualAppeal } from './visualScore';
import {
  readStoredSortOrder,
  sortByNewest,
  writeStoredSortOrder,
  type PluginSortOrder,
} from './sortOrder';

export type FilterMode = 'all' | 'saved';

interface UsePluginFacetsArgs {
  plugins: InstalledPluginRecord[];
  savedPluginIds?: ReadonlySet<string>;
  preferDefaultFacet?: boolean;
  locale?: string;
}

export interface UsePluginFacetsResult {
  visiblePlugins: InstalledPluginRecord[];
  savedList: InstalledPluginRecord[];
  filtered: InstalledPluginRecord[];
  catalog: FacetCatalog;
  selection: FacetSelection;
  pickCategory: (slug: string | null) => void;
  pickSubcategory: (slug: string | null) => void;
  clearFacets: () => void;
  hasActiveFacet: boolean;
  mode: FilterMode;
  setMode: (next: FilterMode) => void;
  query: string;
  setQuery: (next: string) => void;
  sortOrder: PluginSortOrder;
  setSortOrder: (next: PluginSortOrder) => void;
  totalVisible: number;
}

const EMPTY_SELECTION: FacetSelection = {
  category: null,
  subcategory: null,
};

export function usePluginFacets({
  plugins,
  savedPluginIds,
  preferDefaultFacet = true,
  locale,
}: UsePluginFacetsArgs): UsePluginFacetsResult {
  const [mode, setMode] = useState<FilterMode>('all');
  const [selection, setSelection] = useState<FacetSelection>(EMPTY_SELECTION);
  const [query, setQuery] = useState('');
  // Hot vs newest scan order, remembered per browser so a returning
  // user keeps their preferred ordering (lazy read: storage is only
  // touched once per mount).
  const [sortOrder, setSortOrderState] = useState<PluginSortOrder>(
    () => readStoredSortOrder(),
  );
  // Apply the preferred default selection once, on the first render that
  // sees a non-empty catalog. Using a flag (instead of a useState lazy
  // initializer) handles the realistic case where `args.plugins` is
  // empty at first paint and arrives a tick later.
  const [bootstrapped, setBootstrapped] = useState(false);

  // Atoms are infrastructure pieces (`code-import`, `patch-edit`) that
  // are not user-facing on the home grid; the original section already
  // filtered them out and we preserve that contract. We immediately
  // sort by visual-appeal score so the first viewport leads with the
  // cinematic decks / image / video templates rather than alphabetical
  // bundled noise. Featured plugins get a +1000 score boost inside the
  // sort so curator picks stay anchored to the front of every category view.
  const visiblePlugins = useMemo(
    () =>
      sortByVisualAppeal(
        plugins.filter((p) => p.manifest?.od?.kind !== 'atom'),
      ),
    [plugins],
  );

  // Re-rank for the "newest" order on top of the visual-appeal base:
  // sortByNewest is stable, so same-timestamp batches (e.g. the bundled
  // catalog seeded in one transaction) keep their appeal ranking
  // instead of collapsing into raw daemon order.
  const orderedPlugins = useMemo(
    () => (sortOrder === 'newest' ? sortByNewest(visiblePlugins) : visiblePlugins),
    [sortOrder, visiblePlugins],
  );

  const savedList = useMemo(
    () => orderedPlugins.filter((plugin) => savedPluginIds?.has(plugin.id)),
    [savedPluginIds, orderedPlugins],
  );

  const catalog = useMemo(() => buildFacetCatalog(visiblePlugins), [visiblePlugins]);

  useEffect(() => {
    if (bootstrapped) return;
    if (visiblePlugins.length === 0) return;
    if (!preferDefaultFacet) {
      setBootstrapped(true);
      return;
    }
    const next = resolveDefaultSelection(catalog);
    if (next.category !== null) {
      setSelection(next);
    }
    setBootstrapped(true);
  }, [bootstrapped, preferDefaultFacet, visiblePlugins.length, catalog]);

  // The visual-appeal sort is applied at `visiblePlugins` derivation
  // (above), so any downstream `applyFacetSelection` slice preserves
  // the ranking. We do not re-sort here because filter + featured
  // override should both remain stable across selections.
  const filtered = useMemo(() => {
    const base =
      mode === 'saved'
        ? savedList
        : applyFacetSelection(orderedPlugins, selection);
    return filterByQuery(base, query, locale);
  }, [mode, savedList, orderedPlugins, selection, query, locale]);

  function pickCategory(slug: string | null): void {
    if (mode === 'saved') setMode('all');
    setSelection((prev) => ({
      category: prev.category === slug ? null : slug,
      subcategory: null,
    }));
  }

  function pickSubcategory(slug: string | null): void {
    if (mode === 'saved') setMode('all');
    setSelection((prev) => ({
      ...prev,
      subcategory: prev.subcategory === slug ? null : slug,
    }));
  }

  function setSortOrder(next: PluginSortOrder): void {
    setSortOrderState(next);
    writeStoredSortOrder(next);
  }

  function clearFacets(): void {
    setSelection(EMPTY_SELECTION);
    setQuery('');
    // Saved overrides the facet slice, so the empty-state "Clear
    // filters" CTA also has to leave Saved mode — otherwise clicking
    // it from a Saved + zero-match view just re-renders the same
    // empty state and the user has no one-click escape back to the
    // full catalog.
    setMode('all');
  }

  const hasActiveFacet =
    selection.category !== null || selection.subcategory !== null || query.trim().length > 0;

  return {
    visiblePlugins,
    savedList,
    filtered,
    catalog,
    selection,
    pickCategory,
    pickSubcategory,
    clearFacets,
    hasActiveFacet,
    mode,
    setMode,
    query,
    setQuery,
    sortOrder,
    setSortOrder,
    totalVisible: visiblePlugins.length,
  };
}
