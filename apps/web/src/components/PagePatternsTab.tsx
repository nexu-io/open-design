// Page patterns gallery — Q2 2026 Phase 1 (`docs/plans/2026-05-21-page-patterns.md`).
//
// Mirrors the structure of `DesignSystemsTab` "Built-in library"
// section: search input + category select + card grid. Each card
// lazy-mounts a sandboxed iframe pointing at the daemon's
// `/api/page-patterns/:id/example` so the gallery reflects what
// the agent will actually emit when the user picks the pattern.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PagePatternSummary } from '@open-design/contracts';

import { useT } from '../i18n';
import { fetchPagePatterns } from '../providers/registry';
import { Icon } from './Icon';

interface Props {
  onUsePattern: (pattern: PagePatternSummary) => void;
  onPreview: (pattern: PagePatternSummary) => void;
}

// page_type is `namespace.name`; the namespace is the category we
// expose in the select (e.g. `auth.login` → `auth`).
function namespaceOf(pageType: string): string {
  const dot = pageType.indexOf('.');
  if (dot < 0) return pageType || 'uncategorized';
  return pageType.slice(0, dot) || 'uncategorized';
}

// Category keys that have an explicit English label in `en.ts`. Any
// namespace outside this set falls back to the raw namespace string
// in the dropdown — useful as a forward-compatible escape hatch
// when a new seed lands before its translation does.
const KNOWN_CATEGORY_KEYS = new Set([
  'auth',
  'list',
  'detail',
  'dashboard',
  'profile',
]);

type CategoryKey =
  | 'pagePatterns.category.auth'
  | 'pagePatterns.category.list'
  | 'pagePatterns.category.detail'
  | 'pagePatterns.category.dashboard'
  | 'pagePatterns.category.profile';

function categoryLabelKey(namespace: string): CategoryKey | null {
  if (!KNOWN_CATEGORY_KEYS.has(namespace)) return null;
  return `pagePatterns.category.${namespace}` as CategoryKey;
}

export function PagePatternsTab({ onUsePattern, onPreview }: Props) {
  const t = useT();
  const [patterns, setPatterns] = useState<PagePatternSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    fetchPagePatterns()
      .then((result) => {
        if (!cancelled) setPatterns(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    if (!patterns) return ['all'];
    const set = new Set<string>(patterns.map((p) => namespaceOf(p.pageType)));
    return ['all', ...[...set].sort()];
  }, [patterns]);

  const filtered = useMemo(() => {
    if (!patterns) return [];
    const q = query.trim().toLowerCase();
    return patterns.filter((p) => {
      if (category !== 'all' && namespaceOf(p.pageType) !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.pageType.toLowerCase().includes(q)
      );
    });
  }, [patterns, category, query]);

  const renderCategory = (c: string) => {
    if (c === 'all') return t('pagePatterns.categoryAll');
    const key = categoryLabelKey(c);
    return key ? t(key) : c;
  };

  return (
    <section
      className="page-patterns-view tab-panel"
      data-testid="page-patterns-tab"
      aria-labelledby="page-patterns-title"
    >
      <header className="entry-section__head">
        <h1 id="page-patterns-title" className="entry-section__title">
          {t('pagePatterns.title')}
        </h1>
        <p className="entry-section__lede">{t('pagePatterns.lede')}</p>
      </header>

      <div className="tab-panel-toolbar">
        <input
          data-testid="page-patterns-search"
          placeholder={t('pagePatterns.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          data-testid="page-patterns-category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label={t('pagePatterns.categoryAll')}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {renderCategory(c)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="tab-error" role="alert">
          {error}
        </div>
      ) : null}

      {patterns === null ? (
        <div className="tab-empty">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="tab-empty" data-testid="page-patterns-empty">
          {t('pagePatterns.empty')}
        </div>
      ) : (
        <div className="ds-grid" data-testid="page-patterns-grid">
          {filtered.map((pattern) => (
            <PagePatternCard
              key={pattern.id}
              pattern={pattern}
              onUse={() => onUsePattern(pattern)}
              onPreview={() => onPreview(pattern)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface CardProps {
  pattern: PagePatternSummary;
  onUse: () => void;
  onPreview: () => void;
}

function PagePatternCard({ pattern, onUse, onPreview }: CardProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  // Mirror DesignSystemCard: defer mounting the iframe until the card
  // intersects the viewport. With eight seeds this is overkill today,
  // but the seed list will grow and per-card iframes burn memory fast
  // when mounted up front.
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (reveal) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setReveal(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setReveal(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reveal]);

  return (
    <article
      ref={ref}
      className="ds-card"
      data-testid={`page-pattern-card-${pattern.id}`}
    >
      <div
        className="ds-card-thumb"
        data-testid={`page-pattern-preview-${pattern.id}`}
        role="button"
        tabIndex={0}
        title={t('pagePatterns.previewAction')}
        onClick={onPreview}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPreview();
          }
        }}
      >
        {reveal ? (
          <iframe
            title={`${pattern.name} preview`}
            sandbox="allow-scripts"
            src={`/api/page-patterns/${encodeURIComponent(pattern.id)}/example`}
            loading="lazy"
            tabIndex={-1}
            aria-hidden
          />
        ) : (
          <div className="ds-card-thumb-fallback" aria-hidden />
        )}
        <span className="ds-card-thumb-overlay" aria-hidden>
          {t('pagePatterns.previewAction')}
        </span>
      </div>
      <div className="ds-card-meta">
        <div className="ds-card-title-row">
          <span className="ds-card-title">{pattern.name}</span>
        </div>
        <div className="ds-card-summary">{pattern.description}</div>
        <div className="ds-card-footer">
          <span className="ds-card-category">{pattern.pageType}</span>
        </div>
        <button
          type="button"
          className="ghost"
          data-testid={`page-pattern-use-${pattern.id}`}
          onClick={onUse}
        >
          <Icon name="plus" size={14} />
          {t('pagePatterns.useAction')}
        </button>
      </div>
    </article>
  );
}
