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
import type { Dict } from '../i18n/types';
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
  const resolvedTitle = title ?? t('plugins.home.title');
  const resolvedSubtitle = subtitle ?? t('plugins.home.subtitle');
  const resolvedEmptyMessage = emptyMessage ?? t('plugins.home.empty');

  return (
    <section className="plugins-home" data-testid="plugins-home-section">
      <header className="plugins-home__head">
        <div className="plugins-home__heading">
          <h2 className="plugins-home__title">{resolvedTitle}</h2>
          <p className="plugins-home__subtitle">
            {resolvedSubtitle}
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
              {t('plugins.home.browseRegistry')}
            </button>
          ) : null}
          <SearchInput value={query} onChange={setQuery} />
          <span className="plugins-home__count">
            {loading ? '…' : t('plugins.home.count', { filtered: filtered.length, total: totalVisible })}
          </span>
        </div>
      </header>

      {loading ? (
        <div className="plugins-home__empty">{t('plugins.home.loading')}</div>
      ) : visiblePlugins.length === 0 ? (
        <div className="plugins-home__empty">
          {resolvedEmptyMessage}
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
            aria-label={t('plugins.home.filtersAria')}
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
              {t('plugins.home.noFilterMatches')}{' '}
              <button
                type="button"
                className="plugins-home__linkbtn"
                onClick={clearFacets}
              >
                {t('plugins.home.clearFilters')}
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
                  label={localizeFacetLabel(t, contributionTarget)}
                  starterPrompt={localizeFacetStarterPrompt(t, contributionTarget)}
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

type DictKey = keyof Dict;
type Translate = (key: DictKey, vars?: Record<string, string | number>) => string;

const FACET_LABEL_KEYS: Record<string, DictKey> = {
  import: 'plugins.home.facet.import',
  create: 'plugins.home.facet.create',
  export: 'plugins.home.facet.export',
  share: 'plugins.home.facet.share',
  deploy: 'plugins.home.facet.deploy',
  refine: 'plugins.home.facet.refine',
  extend: 'plugins.home.facet.extend',
  'from-figma': 'plugins.home.facet.fromFigma',
  'from-github': 'plugins.home.facet.fromGithub',
  'from-code': 'plugins.home.facet.fromCode',
  'from-url': 'plugins.home.facet.fromUrl',
  'from-screenshot': 'plugins.home.facet.fromScreenshot',
  'from-pdf': 'plugins.home.facet.fromPdf',
  'from-pptx': 'plugins.home.facet.fromPptx',
  prototype: 'plugins.home.facet.prototype',
  deck: 'plugins.home.facet.deck',
  'design-system': 'plugins.home.facet.designSystem',
  image: 'plugins.home.facet.image',
  video: 'plugins.home.facet.video',
  audio: 'plugins.home.facet.audio',
  'public-link': 'plugins.home.facet.publicLink',
  'github-pr': 'plugins.home.facet.githubPr',
  'plugin-authoring': 'plugins.home.facet.pluginAuthoring',
};

const FACET_STARTER_KEYS: Record<string, DictKey> = {
  import: 'plugins.home.starter.import',
  create: 'plugins.home.starter.create',
  export: 'plugins.home.starter.export',
  share: 'plugins.home.starter.share',
  deploy: 'plugins.home.starter.deploy',
  refine: 'plugins.home.starter.refine',
  extend: 'plugins.home.starter.extend',
};

function localizeFacetLabel(t: Translate, option: FacetOption): string {
  const key = FACET_LABEL_KEYS[option.slug];
  return key ? t(key) : option.label;
}

function localizeFacetStarterPrompt(t: Translate, option: FacetOption): string {
  const key = FACET_STARTER_KEYS[option.slug];
  return key ? t(key) : option.starterPrompt;
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
  const t = useT();
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
          <h3>{t('plugins.home.contributeTitle', { label })}</h3>
          <p>
            {t('plugins.home.contributeBody')}
          </p>
          <p className="plugins-home__contribute-template">
            {t('plugins.home.starterPrefix', { starterPrompt })}
          </p>
        </div>
        <button
          type="button"
          className="plugins-home__action plugins-home__action--primary"
          onClick={onCreatePlugin}
          data-testid="plugins-home-contribution-create"
        >
          {t('plugins.home.createPlugin')}
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
  const t = useT();
  return (
    <div className="plugins-home__mode" role="group" aria-label={t('plugins.home.modeAria')}>
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
          <span>{t('plugins.home.featured')}</span>
          <span className="plugins-home__chip-count">{featuredCount}</span>
        </button>
      ) : null}
      <span className="plugins-home__mode-total">
        {t('plugins.home.catalogCount', { total: totalVisible })}
      </span>
      {hasActiveFacet ? (
        <button
          type="button"
          className="plugins-home__linkbtn"
          onClick={onClearFacets}
          data-testid="plugins-home-clear"
        >
          {t('plugins.home.clearFilters')}
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
        aria-label={t('plugins.home.categoryFilterAria')}
      >
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
            label={localizeFacetLabel(t, opt)}
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
  const t = useT();
  if (!parent || options.length === 0) return null;
  const parentLabel = localizeFacetLabel(t, parent);
  return (
    <div
      className="plugins-home__facet-row plugins-home__facet-row--inline plugins-home__facet-row--sub"
      data-testid={`plugins-home-row-subcategory-${parent.slug}`}
    >
      <div
        className="plugins-home__facet-pills"
        role="tablist"
        aria-label={t('plugins.home.subcategoryFilterAria', { label: parentLabel })}
      >
        <CategoryPill
          slug={null}
          label={t('plugins.home.allInFacet', { label: parentLabel })}
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
            label={localizeFacetLabel(t, opt)}
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
  const t = useT();
  return (
    <div className="plugins-home__search">
      <Icon name="search" size={12} className="plugins-home__search-icon" />
      <input
        type="search"
        className="plugins-home__search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('plugins.home.searchPlaceholder')}
        aria-label={t('plugins.home.searchAria')}
        data-testid="plugins-home-search"
        spellCheck={false}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          className="plugins-home__search-clear"
          onClick={() => onChange('')}
          aria-label={t('plugins.home.clearSearchAria')}
          data-testid="plugins-home-search-clear"
        >
          <Icon name="close" size={12} />
        </button>
      ) : null}
    </div>
  );
}
