// Reusable "pick a brand to extract from" surface.
//
// A curated quick-pick row of the best-looking brands sits above a
// categorized, searchable gallery of every reference brand. The component is
// purely presentational: it takes an `onPick` callback and leaves the actual
// extraction kickoff to each entry point (New Brand modal, Brand Kit tab,
// onboarding). Visuals come from public favicons only — no private storage.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useT } from '../i18n';
import {
  BRAND_CATEGORIES,
  BRAND_REFERENCES,
  QUICK_PICK_BRANDS,
  brandFaviconUrl,
  type BrandReference,
} from '../runtime/brand-references';
import styles from './BrandReferencePicker.module.css';

export interface BrandReferencePickerProps {
  /** Fired when the user clicks a brand — wire this to your extraction kickoff. */
  onPick: (brand: BrandReference) => void;
  /** 'full' adds the heading/subtext and a roomier gallery; 'compact' trims
   *  the chrome for narrow surfaces like the modal or onboarding panel. */
  variant?: 'full' | 'compact';
  /** Pin the heading / quick-pick row / controls and let ONLY the gallery
   *  scroll within a bounded-height parent (e.g. the New Brand modal). When
   *  false the whole picker flows and the page owns the scroll. */
  fillHeight?: boolean;
  /** Extraction kickoff is in flight. Locks further picks and lights up a
   *  spinner on the clicked card/chip plus an "opening project" status line so
   *  the click visibly registers in the gap before navigation. */
  busy?: boolean;
  /** Localized failure reason; surfaced inline so a failed kickoff never reads
   *  as "nothing happened". */
  error?: string | null;
  /** Hard-disable interaction (rarely needed on top of `busy`). */
  disabled?: boolean;
  className?: string;
  /** Per-card hover affordance + quick-pick row context. Defaults to the i18n
   *  "Extract"/"Popular brands — click to extract". Hosts that merely add the
   *  brand as a style reference (e.g. the Design System create flow) pass
   *  "Add" so the affordance matches what the click actually does. */
  actionLabel?: string;
  quickPicksLabel?: string;
  /** When the picker flows inside a host scroll container (fillHeight=false),
   *  pass that container so the infinite-scroll observer watches the right
   *  root instead of the viewport. */
  scrollRootRef?: RefObject<HTMLElement | null>;
}

const ALL = 'all';
const PAGE_FULL = 40;
const PAGE_COMPACT = 24;

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

// Favicon tile with a monogram fallback, mirroring the BrandLogo fallback
// chain: when the favicon service has nothing for a domain, show the brand's
// initial instead of a broken image.
function BrandFavicon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [domain]);

  if (failed) {
    return (
      <span className={styles.faviconFallback} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={styles.favicon}
      src={brandFaviconUrl(domain, 64)}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <path
        d="M3 8h9M8.5 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg className={styles.searchIcon} viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return <span className={[styles.spinner, className].filter(Boolean).join(' ')} aria-hidden />;
}

export function BrandReferencePicker({
  onPick,
  variant = 'full',
  fillHeight = false,
  busy = false,
  error = null,
  disabled = false,
  className,
  actionLabel,
  quickPicksLabel,
  scrollRootRef,
}: BrandReferencePickerProps) {
  const t = useT();
  const compact = variant === 'compact';
  const resolvedActionLabel = actionLabel ?? t('brandPicker.extractAction');
  const resolvedQuickPicksLabel = quickPicksLabel ?? t('brandPicker.quickPicksLabel');
  const pageSize = compact ? PAGE_COMPACT : PAGE_FULL;
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);
  // The brand the user most recently clicked — drives which card/chip shows a
  // spinner and which name the status line names.
  const [picked, setPicked] = useState<BrandReference | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BRAND_REFERENCES.filter((b) => {
      if (category !== ALL && b.category !== category) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.domain.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  // Narrowing the wall (new filter / search) starts over from the top.
  useEffect(() => {
    setLimit(pageSize);
  }, [category, query, pageSize]);

  // Infinite scroll: reveal the next page well before the user hits the floor,
  // so the gallery fills smoothly without a jarring button press. In fillHeight
  // mode the bounded gallery itself is the scroll container, so the observer
  // watches that element instead of the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    // Graceful degradation: without IntersectionObserver (older runtimes,
    // jsdom) the "Show more" button remains the way to reveal more brands.
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((l) => Math.min(l + pageSize, filtered.length));
        }
      },
      {
        root: scrollRootRef?.current ?? (fillHeight ? scrollAreaRef.current : null),
        rootMargin: '600px 0px',
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, pageSize, fillHeight, scrollRootRef]);

  const visible = filtered.slice(0, limit);
  const showQuickPicks = category === ALL && query.trim() === '';
  const locked = disabled || busy;

  const handlePick = useCallback(
    (brand: BrandReference) => {
      if (disabled || busy) return;
      // Record the pick first so the spinner/status reflect this card the
      // instant the kickoff begins, even before the parent flips `busy`.
      setPicked(brand);
      onPick(brand);
    },
    [disabled, busy, onPick],
  );

  const pickedDomain = picked?.domain ?? null;

  const rootClass = [
    styles.root,
    compact ? styles.compact : '',
    fillHeight ? styles.fill : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={rootClass} data-testid="brand-reference-picker">
      {compact ? null : (
        <header className={styles.head}>
          <h2 className={styles.heading}>{t('brandPicker.heading')}</h2>
          <p className={styles.subtext}>{t('brandPicker.subtext')}</p>
        </header>
      )}

      {showQuickPicks ? (
        <div
          className={styles.quickPicksSection}
          role="group"
          aria-label={resolvedQuickPicksLabel}
        >
          <span className={styles.quickPicksLabel}>{resolvedQuickPicksLabel}</span>
          <div className={styles.quickPicks}>
            {QUICK_PICK_BRANDS.map((brand) => {
              const loadingThis = busy && brand.domain === pickedDomain;
              return (
                <button
                  key={`quick-${brand.domain}`}
                  type="button"
                  className={`${styles.quickChip} ${loadingThis ? styles.chipLoading : ''}`}
                  disabled={locked}
                  aria-busy={loadingThis || undefined}
                  onClick={() => handlePick(brand)}
                  data-testid={`brand-quick-${brand.domain}`}
                >
                  {loadingThis ? (
                    <Spinner />
                  ) : (
                    <BrandFavicon domain={brand.domain} name={brand.name} />
                  )}
                  <span className={styles.quickName}>{brand.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <SearchGlyph />
          <input
            type="search"
            className={styles.search}
            placeholder={t('brandPicker.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="brand-picker-search"
          />
        </div>
        <div className={styles.categories}>
          {[ALL, ...BRAND_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.categoryChip} ${category === c ? styles.categoryChipActive : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c === ALL ? t('brandPicker.allCategories') : categoryLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className={styles.statusError} role="alert" data-testid="brand-picker-error">
          {error}
        </p>
      ) : busy && picked ? (
        <p className={styles.statusBusy} role="status" data-testid="brand-picker-status">
          <Spinner />
          {t('brandPicker.opening', { brand: picked.name })}
        </p>
      ) : null}

      <div className={styles.scrollArea} ref={scrollAreaRef}>
        <div className={styles.grid} data-testid="brand-picker-grid">
          {visible.map((brand) => {
            const loadingThis = busy && brand.domain === pickedDomain;
            return (
              <button
                key={brand.domain}
                type="button"
                className={`${styles.card} ${loadingThis ? styles.cardLoading : ''}`}
                disabled={locked}
                aria-busy={loadingThis || undefined}
                onClick={() => handlePick(brand)}
                data-testid={`brand-card-${brand.domain}`}
              >
                <span className={styles.cardThumb}>
                  {loadingThis ? (
                    <Spinner />
                  ) : (
                    <BrandFavicon domain={brand.domain} name={brand.name} />
                  )}
                </span>
                <span className={styles.cardBody}>
                  <span className={styles.cardName}>{brand.name}</span>
                  <span className={styles.cardCategory}>{categoryLabel(brand.category)}</span>
                </span>
                <span className={styles.extractPill} aria-hidden>
                  {resolvedActionLabel}
                  <ArrowGlyph />
                </span>
              </button>
            );
          })}
        </div>

        {limit < filtered.length ? (
          <>
            <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
            <div className={styles.showMoreWrap}>
              <button
                type="button"
                className={styles.showMore}
                onClick={() => setLimit((l) => Math.min(l + pageSize, filtered.length))}
              >
                {t('brandPicker.showMore')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
