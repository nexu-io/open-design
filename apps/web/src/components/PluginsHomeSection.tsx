// Plugins discovery section on Home.
//
// Renders a curated workflow bar (Lovart-style) over the plugin catalog:
// Import · Create · Export · Refine · Extend. A scoped child row appears
// inside the active lane, e.g. Create -> Prototype / Slides / Design
// system / Media. A small Featured chip sits orthogonal to the rows for
// quick access to curator-promoted picks.
//
// The category list is curated — finer metadata (surface, role tags,
// scenario domains) lives on each plugin card and detail surface, not
// in the filter bar.
//
// Derivation, catalog building and category-based filtering live in
// `./plugins-home/facets.ts`; selection state and the Featured
// override live in `./plugins-home/usePluginFacets.ts`. This file
// owns layout only.

import type { InstalledPluginRecord } from '@open-design/contracts';
import type { PluginShareAction } from '../state/projects';
import { Icon } from './Icon';
import { PluginCard } from './plugins-home/PluginCard';
import {
  usePluginFacets,
  type FilterMode,
} from './plugins-home/usePluginFacets';
import type { FacetOption } from './plugins-home/facets';
import type { PluginUseAction } from './plugins-home/useActions';

interface Props {
  plugins: InstalledPluginRecord[];
  loading: boolean;
  activePluginId: string | null;
  pendingApplyId: string | null;
  pendingShareAction?: { pluginId: string; action: PluginShareAction } | null;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
  onPluginShareAction?: (
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) => void;
  onCreatePlugin?: (goal?: string) => void;
  onBrowseRegistry?: () => void;
  preferDefaultFacet?: boolean;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}

const CONTRIBUTION_CARD_THRESHOLD = 3;

export function PluginsHomeSection({
  plugins,
  loading,
  activePluginId,
  pendingApplyId,
  pendingShareAction = null,
  onUse,
  onOpenDetails,
  onPluginShareAction,
  onCreatePlugin,
  onBrowseRegistry,
  preferDefaultFacet = true,
  title = 'Official starters',
  subtitle = 'Ready-to-use Open Design workflows bundled with this runtime. Pick one to load a starter prompt, or browse the registry for more.',
  emptyMessage = 'Catalog is empty. Bundled plugins ship with Open Design and should appear here automatically — try restarting the daemon if this persists.',
}: Props) {
  const {
    visiblePlugins,
    featuredList,
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
    totalVisible,
  } = usePluginFacets({ plugins, preferDefaultFacet });
  const contributionTarget = onCreatePlugin
    ? resolveContributionTarget(catalog, selection)
    : null;
  const showContributionCard =
    contributionTarget !== null &&
    shouldShowContributionCard(filtered.length, selection.category);

  return (
    <section className="plugins-home" data-testid="plugins-home-section">
      <header className="plugins-home__head">
        <div className="plugins-home__heading">
          <h2 className="plugins-home__title">{title}</h2>
          <p className="plugins-home__subtitle">
            {subtitle}
          </p>
        </div>
        <div className="plugins-home__head-tools">
          {onBrowseRegistry ? (
            <button
              type="button"
              className="plugins-home__linkbtn"
              onClick={onBrowseRegistry}
              data-testid="plugins-home-browse-registry"
            >
              Browse registry
            </button>
          ) : null}
          <SearchInput value={query} onChange={setQuery} />
          <span className="plugins-home__count">
            {loading ? '…' : `${filtered.length} of ${totalVisible}`}
          </span>
        </div>
      </header>

      {loading ? (
        <div className="plugins-home__empty">Loading catalog…</div>
      ) : visiblePlugins.length === 0 ? (
        <div className="plugins-home__empty">
          {emptyMessage}
        </div>
      ) : (
        <>
          <ModeRow
            mode={mode}
            featuredCount={featuredList.length}
            totalVisible={totalVisible}
            hasActiveFacet={hasActiveFacet}
            onModeChange={setMode}
            onClearFacets={clearFacets}
          />
          <div
            className="plugins-home__facets"
            role="group"
            aria-label="Plugin filters"
          >
            <CategoryRow
              options={catalog.category}
              selectedSlug={selection.category}
              totalVisible={totalVisible}
              onPick={pickCategory}
            />
            {selection.category ? (
              <SubcategoryRow
                parent={catalog.category.find((opt) => opt.slug === selection.category)}
                options={catalog.subcategory[selection.category] ?? []}
                selectedSlug={selection.subcategory}
                onPick={pickSubcategory}
              />
            ) : null}
          </div>

          {filtered.length === 0 && !showContributionCard ? (
            <div className="plugins-home__empty plugins-home__empty--filtered">
              No plugins match the current filters.{' '}
              <button
                type="button"
                className="plugins-home__linkbtn"
                onClick={clearFacets}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="plugins-home__grid" role="list">
              {filtered.map((p) => (
                <PluginCard
                  key={p.id}
                  record={p}
                  isActive={activePluginId === p.id}
                  isPending={pendingApplyId === p.id}
                  pendingAny={pendingApplyId !== null}
                  pendingShareAction={pendingShareAction}
                  isFeatured={featuredList.some((f) => f.id === p.id)}
                  onUse={onUse}
                  onOpenDetails={onOpenDetails}
                  onShareAction={onPluginShareAction}
                />
              ))}
              {showContributionCard && contributionTarget ? (
                <ContributionCard
                  label={contributionTarget.label}
                  starterPrompt={contributionTarget.starterPrompt}
                  onCreatePlugin={() => onCreatePlugin?.(contributionTarget.starterPrompt)}
                />
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function shouldShowContributionCard(count: number, category: string | null): boolean {
  return Boolean(category) && count < CONTRIBUTION_CARD_THRESHOLD;
}

function resolveContributionTarget(
  catalog: ReturnType<typeof usePluginFacets>['catalog'],
  selection: ReturnType<typeof usePluginFacets>['selection'],
): FacetOption | null {
  if (!selection.category) return null;
  if (selection.subcategory) {
    const sub = catalog.subcategory[selection.category]?.find(
      (opt) => opt.slug === selection.subcategory,
    );
    if (sub) return sub;
  }
  return catalog.category.find((opt) => opt.slug === selection.category) ?? null;
}

function ContributionCard({
  label,
  starterPrompt,
  onCreatePlugin,
}: {
  label: string;
  starterPrompt: string;
  onCreatePlugin: () => void;
}) {
  return (
    <article
      role="listitem"
      className="plugins-home__card plugins-home__card--contribute"
      data-testid="plugins-home-contribution-card"
    >
      <div className="plugins-home__contribute-inner">
        <span className="plugins-home__contribute-icon" aria-hidden>
          <Icon name="plus" size={18} />
        </span>
        <div>
          <h3>Contribute a {label} plugin</h3>
          <p>
            This area is still sparse. Turn your workflow into a reusable
            plugin, add it to My plugins, then share it with the community.
          </p>
          <p className="plugins-home__contribute-template">
            Starter: {starterPrompt}
          </p>
        </div>
        <button
          type="button"
          className="plugins-home__action plugins-home__action--primary"
          onClick={onCreatePlugin}
          data-testid="plugins-home-contribution-create"
        >
          Create plugin
        </button>
      </div>
    </article>
  );
}

interface ModeRowProps {
  mode: FilterMode;
  featuredCount: number;
  totalVisible: number;
  hasActiveFacet: boolean;
  onModeChange: (next: FilterMode) => void;
  onClearFacets: () => void;
}

// Tiny strip above the category row: Featured override + a clear-link
// when at least one filter is active. Kept compact so the category
// bar is what the eye lands on first.
function ModeRow({
  mode,
  featuredCount,
  totalVisible,
  hasActiveFacet,
  onModeChange,
  onClearFacets,
}: ModeRowProps) {
  return (
    <div className="plugins-home__mode" role="group" aria-label="Plugin mode">
      {featuredCount > 0 ? (
        <button
          type="button"
          className={[
            'plugins-home__chip',
            'plugins-home__chip--featured',
            mode === 'featured' ? 'is-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onModeChange(mode === 'featured' ? 'all' : 'featured')}
          aria-pressed={mode === 'featured'}
          data-testid="plugins-home-chip-featured"
        >
          <Icon name="star" size={11} />
          <span>Featured</span>
          <span className="plugins-home__chip-count">{featuredCount}</span>
        </button>
      ) : null}
      <span className="plugins-home__mode-total">
        {totalVisible} in catalog
      </span>
      {hasActiveFacet ? (
        <button
          type="button"
          className="plugins-home__linkbtn"
          onClick={onClearFacets}
          data-testid="plugins-home-clear"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

interface CategoryRowProps {
  options: FacetOption[];
  selectedSlug: string | null;
  totalVisible: number;
  onPick: (slug: string | null) => void;
}

function CategoryRow({ options, selectedSlug, totalVisible, onPick }: CategoryRowProps) {
  if (options.length === 0) return null;
  return (
    <div
      className="plugins-home__facet-row plugins-home__facet-row--inline"
      data-testid="plugins-home-row-category"
    >
      <div
        className="plugins-home__facet-pills"
        role="tablist"
        aria-label="Category filter"
      >
        <CategoryPill
          slug={null}
          label="All"
          count={totalVisible}
          active={selectedSlug === null}
          onPick={onPick}
          variant="all"
        />
        {options.map((opt) => (
          <CategoryPill
            key={opt.slug}
            slug={opt.slug}
            label={opt.label}
            count={opt.count}
            active={selectedSlug === opt.slug}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

interface SubcategoryRowProps {
  parent: FacetOption | undefined;
  options: FacetOption[];
  selectedSlug: string | null;
  onPick: (slug: string | null) => void;
}

function SubcategoryRow({ parent, options, selectedSlug, onPick }: SubcategoryRowProps) {
  if (!parent || options.length === 0) return null;
  return (
    <div
      className="plugins-home__facet-row plugins-home__facet-row--inline plugins-home__facet-row--sub"
      data-testid={`plugins-home-row-subcategory-${parent.slug}`}
    >
      <div
        className="plugins-home__facet-pills"
        role="tablist"
        aria-label={`${parent.label} subcategory filter`}
      >
        <CategoryPill
          slug={null}
          label={`All ${parent.label}`}
          count={parent.count}
          active={selectedSlug === null}
          onPick={onPick}
          variant="sub-all"
          testId={`plugins-home-pill-subcategory-${parent.slug}-all`}
        />
        {options.map((opt) => (
          <CategoryPill
            key={opt.slug}
            slug={opt.slug}
            label={opt.label}
            count={opt.count}
            active={selectedSlug === opt.slug}
            onPick={onPick}
            testId={`plugins-home-pill-subcategory-${parent.slug}-${opt.slug}`}
          />
        ))}
      </div>
    </div>
  );
}

interface CategoryPillProps {
  slug: string | null;
  label: string;
  count: number;
  active: boolean;
  variant?: 'all' | 'sub-all';
  testId?: string;
  onPick: (slug: string | null) => void;
}

function CategoryPill({ slug, label, count, active, variant, testId, onPick }: CategoryPillProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={[
        'plugins-home__pill',
        active ? 'is-active' : '',
        variant === 'all' ? 'plugins-home__pill--all' : '',
        variant === 'sub-all' ? 'plugins-home__pill--sub-all' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onPick(slug)}
      data-testid={testId ?? `plugins-home-pill-category-${slug ?? 'all'}`}
    >
      <span>{label}</span>
      <span className="plugins-home__pill-count">{count}</span>
    </button>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
}

// Compact search field that lives in the section head. Search composes
// with the category selection via AND inside the hook, so a query
// narrows whatever category the user has already picked rather than
// discarding the category context. We keep the UI a single text input
// with an optional clear button so it sits inside the existing head
// row without a heavyweight toolbar.
function SearchInput({ value, onChange }: SearchInputProps) {
  return (
    <div className="plugins-home__search">
      <Icon name="search" size={12} className="plugins-home__search-icon" />
      <input
        type="search"
        className="plugins-home__search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search plugins…"
        aria-label="Search plugins"
        data-testid="plugins-home-search"
        spellCheck={false}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className="plugins-home__search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
          data-testid="plugins-home-search-clear"
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
}
