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
import { useT } from '../i18n';
import type { PluginShareAction } from '../state/projects';
import { Icon } from './Icon';
import { PluginCard } from './plugins-home/PluginCard';
import { usePluginFacets } from './plugins-home/usePluginFacets';
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
  title,
  subtitle,
  emptyMessage,
}: Props) {
  const t = useT();
  const {
    visiblePlugins,
    featuredList,
    filtered,
    catalog,
    selection,
    pickCategory,
    pickSubcategory,
    clearFacets,
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
          <h2 className="plugins-home__title">{title ?? t('pluginsHome.title')}</h2>
          {subtitle ? (
            <p className="plugins-home__subtitle">{subtitle}</p>
          ) : null}
        </div>
        <div className="plugins-home__head-tools">
          {onBrowseRegistry ? (
            <button
              type="button"
              className="plugins-home__linkbtn"
              onClick={onBrowseRegistry}
              data-testid="plugins-home-browse-registry"
            >
              {t('pluginsHome.browseRegistry')}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="plugins-home__empty">{t('pluginsHome.loadingCatalog')}</div>
      ) : visiblePlugins.length === 0 ? (
        <div className="plugins-home__empty">
          {emptyMessage ?? t('pluginsHome.emptyCatalog')}
        </div>
      ) : (
        <>
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
              featuredCount={featuredList.length}
              featuredActive={mode === 'featured'}
              onToggleFeatured={() =>
                setMode(mode === 'featured' ? 'all' : 'featured')
              }
              query={query}
              onQueryChange={setQuery}
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
              {t('pluginsHome.emptyFiltered')}{' '}
              <button
                type="button"
                className="plugins-home__linkbtn"
                onClick={clearFacets}
              >
                {t('pluginsHome.clearFilters')}
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
                  t={t}
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
  t,
}: {
  label: string;
  starterPrompt: string;
  onCreatePlugin: () => void;
  t: ReturnType<typeof useT>;
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
          <h3>{t('pluginsHome.contributeTitle', { label })}</h3>
          <p>
            {t('pluginsHome.contributeBody')}
          </p>
          <p className="plugins-home__contribute-template">
            {t('pluginsHome.starterPrefix', { starter: starterPrompt })}
          </p>
        </div>
        <button
          type="button"
          className="plugins-home__action plugins-home__action--primary"
          onClick={onCreatePlugin}
          data-testid="plugins-home-contribution-create"
        >
          {t('homeHero.chip.createPlugin')}
        </button>
      </div>
    </article>
  );
}

interface CategoryRowProps {
  options: FacetOption[];
  selectedSlug: string | null;
  totalVisible: number;
  onPick: (slug: string | null) => void;
  featuredCount: number;
  featuredActive: boolean;
  onToggleFeatured: () => void;
  query: string;
  onQueryChange: (next: string) => void;
}

// Single combined filter bar: Featured override chip + category pills
// on the left, search field on the right. Each chip carries its own
// count, and the "All" chip doubles as a clear-filters affordance,
// so a separate `X / Y` counter and `Clear` link would just repeat
// what the chip strip already shows.
function CategoryRow({
  options,
  selectedSlug,
  totalVisible,
  onPick,
  featuredCount,
  featuredActive,
  onToggleFeatured,
  query,
  onQueryChange,
}: CategoryRowProps) {
  const t = useT();
  if (options.length === 0) return null;
  return (
    <div
      className="plugins-home__facet-row plugins-home__facet-row--inline"
      data-testid="plugins-home-row-category"
    >
      <div
        className="plugins-home__facet-pills"
        role="tablist"
        aria-label={t('pluginsHome.categoryFilterAria')}
      >
        {featuredCount > 0 ? (
          <button
            type="button"
            className={[
              'plugins-home__chip',
              'plugins-home__chip--featured',
              featuredActive ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onToggleFeatured}
            aria-pressed={featuredActive}
            data-testid="plugins-home-chip-featured"
          >
            <Icon name="star" size={11} />
            <span>{t('pluginsHome.featured')}</span>
            <span className="plugins-home__chip-count">{featuredCount}</span>
          </button>
        ) : null}
        <CategoryPill
          slug={null}
          label={t('common.all')}
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
      <div className="plugins-home__facet-tools">
        <SearchInput value={query} onChange={onQueryChange} />
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
  const t = useT();
  if (!parent || options.length === 0) return null;
  return (
    <div
      className="plugins-home__facet-row plugins-home__facet-row--inline plugins-home__facet-row--sub"
      data-testid={`plugins-home-row-subcategory-${parent.slug}`}
    >
      <div
        className="plugins-home__facet-pills"
        role="tablist"
        aria-label={t('pluginsHome.subcategoryFilterAria', { label: parent.label })}
      >
        <CategoryPill
          slug={null}
          label={t('pluginsHome.allCategory', { label: pluginFacetLabel(parent.slug, parent.label, t) })}
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
  const t = useT();
  const displayLabel = slug ? pluginFacetLabel(slug, label, t) : label;
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
      // Empty lanes are intentionally kept in the strip so the
      // overall workflow shape (Import / Create / Export / Share /
      // Deploy / Refine / Extend) is visible at a glance, and
      // clicking one surfaces a "Contribute a X plugin" card. The
      // `data-empty` flag drives a faded treatment in CSS so users
      // can tell at a glance which chips are populated vs which
      // are open-invite buckets — without that hint, "Deploy 0"
      // and "Create 375" read as the same kind of control.
      data-empty={count === 0 ? 'true' : 'false'}
      data-testid={testId ?? `plugins-home-pill-category-${slug ?? 'all'}`}
    >
      <span>{displayLabel}</span>
      <span className="plugins-home__pill-count">{count}</span>
    </button>
  );
}

function pluginFacetLabel(slug: string, fallback: string, t: ReturnType<typeof useT>): string {
  switch (slug) {
    case 'import': return t('pluginsHome.facet.import');
    case 'create': return t('pluginsHome.facet.create');
    case 'export': return t('pluginsHome.facet.export');
    case 'share': return t('pluginsHome.facet.share');
    case 'deploy': return t('pluginsHome.facet.deploy');
    case 'refine': return t('pluginsHome.facet.refine');
    case 'extend': return t('pluginsHome.facet.extend');
    case 'from-figma': return t('pluginsHome.facet.figma');
    case 'from-github': return t('pluginsHome.facet.github');
    case 'from-code': return t('pluginsHome.facet.codeFolder');
    case 'from-url': return t('pluginsHome.facet.url');
    case 'from-screenshot': return t('pluginsHome.facet.screenshot');
    case 'from-pdf': return t('pluginsHome.facet.pdf');
    case 'from-pptx': return t('pluginsHome.facet.pptx');
    case 'from-framer': return t('pluginsHome.facet.framer');
    case 'from-webflow': return t('pluginsHome.facet.webflow');
    case 'prototype': return t('homeHero.chip.prototype');
    case 'deck': return t('pluginsHome.facet.slides');
    case 'design-system': return t('entry.navDesignSystems');
    case 'hyperframes': return t('homeHero.chip.hyperframes');
    case 'image': return t('homeHero.chip.image');
    case 'video': return t('homeHero.chip.video');
    case 'audio': return t('homeHero.chip.audio');
    case 'public-link': return t('pluginsHome.facet.publicLink');
    case 'github-pr': return t('pluginsHome.facet.githubPr');
    case 'github-gist': return t('pluginsHome.facet.githubGist');
    default: return fallback;
  }
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
  const t = useT();
  return (
    <div className="plugins-home__search">
      <Icon name="search" size={12} className="plugins-home__search-icon" />
      <input
        type="search"
        className="plugins-home__search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('pluginsHome.searchPlaceholder')}
        aria-label={t('pluginsHome.searchAria')}
        data-testid="plugins-home-search"
        spellCheck={false}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className="plugins-home__search-clear"
          onClick={() => onChange('')}
          aria-label={t('pluginsHome.clearSearch')}
          data-testid="plugins-home-search-clear"
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
}
