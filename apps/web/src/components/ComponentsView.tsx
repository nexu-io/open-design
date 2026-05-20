import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n';
import { listProjects, patchProject } from '../state/projects';
import { navigate } from '../router';
import type { Project } from '../types';

interface ComponentRow {
  brand: string;
  category: string;
  selector: string;
}
interface BrandBucket {
  brand: string;
  selectorCount: number;
  categories: Record<string, string[]>;
  previewUrl: string;
  contrast: {
    fgOnBg: number | null;
    accentOnBg: number | null;
    passesAa: boolean;
  };
  vibe: string;
  quality?: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D';
    tokenCoverage: number;
    selectorCoverage: number;
    contrastScore: number;
    notes: string[];
  };
}
interface ComponentsResponse {
  totalBrands: number;
  totalComponents: number;
  categories: string[];
  components: ComponentRow[];
  brands: BrandBucket[];
}

/**
 * Brand-component browser with live previews. Each brand card renders
 * the brand's full components.html in an iframe (via the daemon's
 * /api/design-systems/:id/components-html endpoint), so users see real
 * rendered buttons, cards, hero blocks instead of just class-selector
 * strings.
 *
 * Visible-only rendering: each iframe mounts lazily when its card
 * scrolls into view. With 155 brands a naive eager mount would launch
 * 155 iframes on first render — IntersectionObserver lets us cap that
 * to ~6 visible at a time on a typical viewport.
 */
export function ComponentsView() {
  const t = useT();
  const [data, setData] = useState<ComponentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeVibe, setActiveVibe] = useState<string>('all');
  const [aaOnly, setAaOnly] = useState(false);
  const [qualityOnly, setQualityOnly] = useState(false);
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'count' | 'az' | 'aa' | 'quality'>('quality');
  const [projects, setProjects] = useState<Project[]>([]);
  const [applyTarget, setApplyTarget] = useState<{ brand: string } | null>(null);
  // Multi-select for cross-brand diff. The cap is 4 because viewports
  // start showing iframe content unreadably small past that. Keys are
  // brand ids — they're unique enough for a Set.
  const [selectedForDiff, setSelectedForDiff] = useState<Set<string>>(new Set());
  const [diffOpen, setDiffOpen] = useState(false);
  const toggleSelected = (brand: string) => {
    setSelectedForDiff((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else if (next.size < 4) next.add(brand);
      return next;
    });
  };

  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/components')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setData(d as ComponentsResponse);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBrands = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.brands.filter((b) => {
      if (q && !b.brand.toLowerCase().includes(q)) {
        const hit = Object.values(b.categories).some((sels) =>
          sels.some((s) => s.toLowerCase().includes(q)),
        );
        if (!hit) return false;
      }
      if (activeCategory !== 'all' && !b.categories[activeCategory]) return false;
      if (activeVibe !== 'all' && b.vibe !== activeVibe) return false;
      if (aaOnly && !b.contrast.passesAa) return false;
      if (qualityOnly && (b.quality?.score ?? 0) < 85) return false;
      return true;
    });
    if (sortBy === 'az') {
      filtered.sort((a, b) => a.brand.localeCompare(b.brand));
    } else if (sortBy === 'aa') {
      filtered.sort((a, b) => {
        if (a.contrast.passesAa !== b.contrast.passesAa) {
          return a.contrast.passesAa ? -1 : 1;
        }
        return b.selectorCount - a.selectorCount;
      });
    } else if (sortBy === 'quality') {
      filtered.sort((a, b) => {
        const byScore = (b.quality?.score ?? 0) - (a.quality?.score ?? 0);
        return byScore || b.selectorCount - a.selectorCount;
      });
    }
    // 'count' is the daemon's default order; no client sort needed.
    return filtered;
  }, [data, query, activeCategory, activeVibe, aaOnly, qualityOnly, sortBy]);

  const vibesFromData = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const b of data.brands) set.add(b.vibe);
    return Array.from(set).sort();
  }, [data]);

  return (
    <div className="components-view">
      <header className="components-view__head">
        <h1 className="components-view__title">{t('components.title')}</h1>
        {data ? (
          <span className="components-view__counts">
            {data.totalBrands} brands · {data.totalComponents} selectors
          </span>
        ) : null}
      </header>

      <div className="components-view__toolbar">
        <div className="components-view__search-row">
          <input
            type="text"
            className="components-view__search"
            placeholder="Search brand or selector…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="components-view__sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'count' | 'az' | 'aa' | 'quality')}
            aria-label="Sort brands"
          >
            <option value="quality">Quality score</option>
            <option value="count">Most selectors</option>
            <option value="az">A → Z</option>
            <option value="aa">AA-pass first</option>
          </select>
          {selectedForDiff.size > 0 ? (
            <button
              type="button"
              className="components-view__diff-btn"
              onClick={() => setDiffOpen(true)}
              disabled={selectedForDiff.size < 2}
              title={
                selectedForDiff.size < 2
                  ? 'Select 2+ brands to compare'
                  : `Compare ${selectedForDiff.size} brands side by side`
              }
            >
              <Icon name="grid" size={12} />
              <span>
                Compare {selectedForDiff.size}
                {selectedForDiff.size < 2 ? ' (need 2+)' : ''}
              </span>
            </button>
          ) : null}
        </div>
        <div className="components-view__categories">
          <button
            type="button"
            className={`components-view__cat${activeCategory === 'all' ? ' is-active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {data?.categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`components-view__cat${activeCategory === c ? ' is-active' : ''}`}
              onClick={() => setActiveCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {vibesFromData.length > 1 ? (
          <div className="components-view__categories">
            <span className="components-view__filter-label">vibe</span>
            <button
              type="button"
              className={`components-view__cat${activeVibe === 'all' ? ' is-active' : ''}`}
              onClick={() => setActiveVibe('all')}
            >
              All
            </button>
            {vibesFromData.map((v) => (
              <button
                key={v}
                type="button"
                className={`components-view__cat${activeVibe === v ? ' is-active' : ''}`}
                onClick={() => setActiveVibe(v)}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              className={`components-view__cat${aaOnly ? ' is-active' : ''}`}
              onClick={() => setAaOnly((v) => !v)}
              title="Show only brands whose fg/bg + accent/bg pairs pass WCAG AA"
            >
              AA-only
            </button>
            <button
              type="button"
              className={`components-view__cat${qualityOnly ? ' is-active' : ''}`}
              onClick={() => setQualityOnly((v) => !v)}
              title="Show systems scoring 85+ across token, selector, and contrast coverage"
            >
              85+
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="components-view__empty">
          <Icon name="spinner" size={18} />
        </div>
      ) : filteredBrands.length === 0 ? (
        <div className="components-view__empty">{t('components.empty')}</div>
      ) : (
        <ul className="components-view__brand-grid">
          {filteredBrands.slice(0, 200).map((b) => (
            <BrandCard
              key={b.brand}
              brand={b}
              isExpanded={openBrand === b.brand}
              onToggle={() =>
                setOpenBrand((curr) => (curr === b.brand ? null : b.brand))
              }
              activeCategory={activeCategory}
              onUseInProject={() => setApplyTarget({ brand: b.brand })}
              isSelectedForDiff={selectedForDiff.has(b.brand)}
              onToggleDiff={() => toggleSelected(b.brand)}
              diffDisabled={!selectedForDiff.has(b.brand) && selectedForDiff.size >= 4}
            />
          ))}
        </ul>
      )}
      {diffOpen && selectedForDiff.size >= 2 ? (
        <CrossBrandDiff
          brands={Array.from(selectedForDiff)}
          onClose={() => setDiffOpen(false)}
        />
      ) : null}
      {applyTarget ? (
        <ApplyBrandModal
          brand={applyTarget.brand}
          projects={projects}
          onClose={() => setApplyTarget(null)}
          onApplied={(project) => {
            setApplyTarget(null);
            navigate({ kind: 'project', projectId: project.id, conversationId: null, fileName: null });
          }}
        />
      ) : null}
    </div>
  );
}

interface CrossBrandDiffProps {
  brands: string[];
  onClose: () => void;
}
function CrossBrandDiff({ brands, onClose }: CrossBrandDiffProps) {
  // Renders 2-4 brand components.html iframes in a horizontal split so
  // the user can scroll any pane independently to align like-for-like
  // components across brands. Each iframe targets the daemon's
  // /api/design-systems/<brand>/components-html endpoint which serves
  // the raw fixture file.
  return (
    <div className="cross-brand-diff" role="dialog" aria-modal="true">
      <div className="cross-brand-diff__head">
        <div className="cross-brand-diff__title">
          Comparing {brands.length} brands · scroll each pane to align components
        </div>
        <button
          type="button"
          className="cross-brand-diff__close"
          onClick={onClose}
          aria-label="Close compare"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <div
        className="cross-brand-diff__grid"
        style={{ gridTemplateColumns: `repeat(${brands.length}, 1fr)` }}
      >
        {brands.map((b) => (
          <div key={b} className="cross-brand-diff__pane">
            <div className="cross-brand-diff__pane-head">{b}</div>
            <iframe
              className="cross-brand-diff__iframe"
              title={`${b} components`}
              src={`/api/design-systems/${encodeURIComponent(b)}/components-html`}
              sandbox=""
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ApplyBrandModalProps {
  brand: string;
  projects: Project[];
  onClose: () => void;
  onApplied: (p: Project) => void;
}
function ApplyBrandModal({ brand, projects, onClose, onApplied }: ApplyBrandModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const apply = async (p: Project) => {
    setBusy(p.id);
    try {
      const updated = await patchProject(p.id, { designSystemId: brand });
      onApplied(updated ?? { ...p, designSystemId: brand });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="apply-brand-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="apply-brand-modal__panel" onClick={(e) => e.stopPropagation()}>
        <div className="apply-brand-modal__head">
          <h2>Use <code>{brand}</code> in…</h2>
          <button type="button" className="apply-brand-modal__close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="apply-brand-modal__empty">No projects yet — create one from Home first.</div>
        ) : (
          <ul className="apply-brand-modal__list">
            {projects.slice(0, 30).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="apply-brand-modal__row"
                  onClick={() => void apply(p)}
                  disabled={busy !== null}
                >
                  <div className="apply-brand-modal__name">{p.name}</div>
                  <div className="apply-brand-modal__meta">
                    {p.designSystemId ? `currently: ${p.designSystemId}` : 'no brand'}
                  </div>
                  {busy === p.id ? <Icon name="spinner" size={12} /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface BrandCardProps {
  brand: BrandBucket;
  isExpanded: boolean;
  onToggle: () => void;
  activeCategory: string;
  onUseInProject: () => void;
  isSelectedForDiff: boolean;
  onToggleDiff: () => void;
  diffDisabled: boolean;
}

function BrandCard({ brand, isExpanded, onToggle, activeCategory, onUseInProject, isSelectedForDiff, onToggleDiff, diffDisabled }: BrandCardProps) {
  const t = useT();
  const [inView, setInView] = useState(false);
  const [ref, setRef] = useState<HTMLLIElement | null>(null);

  // Lazy-mount the preview iframe only when the card scrolls into view.
  // Critical at scale — 155 cards means 155 iframes if we eager-mount,
  // which crashes the page. IntersectionObserver keeps the working set
  // to whatever fits in the viewport plus a small margin.
  useEffect(() => {
    if (!ref || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
            return;
          }
        }
      },
      { rootMargin: '200px 0px' },
    );
    obs.observe(ref);
    return () => obs.disconnect();
  }, [ref, inView]);

  const categoriesToShow =
    activeCategory === 'all'
      ? Object.keys(brand.categories).sort()
      : brand.categories[activeCategory]
        ? [activeCategory]
        : [];
  const copySelector = (sel: string) => {
    void navigator.clipboard?.writeText(sel).catch(() => {});
  };

  return (
    <li
      ref={setRef}
      className={`brand-card${isExpanded ? ' is-expanded' : ''}`}
    >
      <button
        type="button"
        className="brand-card__head"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="brand-card__head-left">
          <span className="brand-card__name">{brand.brand}</span>
          <span className="brand-card__count">{brand.selectorCount} selectors</span>
        </div>
        <div className="brand-card__head-right">
          <span className={`brand-card__vibe brand-card__vibe--${brand.vibe}`}>{brand.vibe}</span>
          {brand.contrast.fgOnBg ? (
            <span
              className={`brand-card__contrast${brand.contrast.passesAa ? ' is-pass' : ' is-fail'}`}
              title={`fg/bg ${brand.contrast.fgOnBg}:1 · accent/bg ${brand.contrast.accentOnBg ?? '?'}:1`}
            >
              {brand.contrast.passesAa ? 'AA' : `${brand.contrast.fgOnBg}:1`}
            </span>
          ) : null}
          {brand.quality ? (
            <span
              className={`brand-card__quality brand-card__quality--${brand.quality.grade.toLowerCase()}`}
              title={brand.quality.notes.join(' · ')}
            >
              {brand.quality.grade} {brand.quality.score}
            </span>
          ) : null}
          <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
        </div>
      </button>
      <div className="brand-card__actions">
        <label
          className={`brand-card__diff-check${isSelectedForDiff ? ' is-on' : ''}${diffDisabled ? ' is-disabled' : ''}`}
          onClick={(e) => e.stopPropagation()}
          title={diffDisabled ? 'Up to 4 brands at a time' : 'Add to side-by-side compare'}
        >
          <input
            type="checkbox"
            checked={isSelectedForDiff}
            disabled={diffDisabled}
            onChange={onToggleDiff}
          />
          <span>Compare</span>
        </label>
        <button
          type="button"
          className="brand-card__use-btn"
          onClick={(e) => { e.stopPropagation(); onUseInProject(); }}
          title="Apply this brand to a project"
        >
          <Icon name="check" size={11} />
          <span>Use in project</span>
        </button>
      </div>
      <div className="brand-card__preview">
        {inView ? (
          <iframe
            className="brand-card__iframe"
            title={`${brand.brand} components preview`}
            src={brand.previewUrl}
            sandbox=""
            loading="lazy"
          />
        ) : (
          <div className="brand-card__iframe-placeholder" />
        )}
      </div>
      {isExpanded ? (
        <div className="brand-card__body">
          {brand.quality ? (
            <div className="brand-card__quality-panel">
              <div>
                <span>Tokens</span>
                <strong>{brand.quality.tokenCoverage}%</strong>
              </div>
              <div>
                <span>Selectors</span>
                <strong>{brand.quality.selectorCoverage}%</strong>
              </div>
              <div>
                <span>Contrast</span>
                <strong>{brand.quality.contrastScore}%</strong>
              </div>
            </div>
          ) : null}
          {categoriesToShow.map((cat) => (
            <div key={cat} className="brand-card__category">
              <div className="brand-card__category-head">{cat}</div>
              <div className="brand-card__selectors">
                {brand.categories[cat]?.map((sel) => (
                  <button
                    key={sel}
                    type="button"
                    className="brand-card__selector"
                    onClick={() => copySelector(`design-systems/${brand.brand}/components.html · ${sel}`)}
                    title={t('components.copySelector')}
                  >
                    <code>{sel}</code>
                    <Icon name="copy" size={11} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}
