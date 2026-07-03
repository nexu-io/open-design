import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@open-design/components';
import type { BrandSummary } from '@open-design/contracts';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';
import {
  NEW_BRAND_KIT_INTENT_EVENT,
  consumePendingNewBrandKit,
} from '../runtime/brand-intent';
import { fetchBrands } from '../runtime/brands';
import { useBrandExtract } from '../runtime/useBrandExtract';
import type { BrandReference } from '../runtime/brand-references';
import { BrandLogo, BrandPreviewCard, hostnameOf } from './BrandPreviewCard';
import { BrandReferencePicker } from './BrandReferencePicker';
import { NewBrandModal } from './NewBrandModal';
import styles from './BrandsTab.module.css';

export interface BrandsTabProps {
  /**
   * Apply a brand's registered design system as the global default through the
   * web config channel (localStorage + daemon sync + React state) instead of a
   * raw daemon PATCH. Threaded from App via EntryShell so "Use in new chat"
   * actually surfaces the design system in the Home composer; a raw PATCH left
   * web config stale and could be clobbered by a later config sync.
   */
  onApplyDesignSystem?: (designSystemId: string) => void;
  onOpenProject?: (projectId: string) => Promise<boolean> | boolean | void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
}

export function BrandsTab({ onApplyDesignSystem, onOpenProject, onDesignSystemsRefresh }: BrandsTabProps = {}) {
  const t = useT();
  const route = useRoute();
  // A `/brands/:id` deep-link (from the rail, a chat link, or a shared URL)
  // preselects which brand the inline preview renders. Undefined on `/brands`.
  const routedBrandId =
    route.kind === 'home' && route.view === 'brands' ? route.brandId : undefined;
  // EntryShell keeps every sub-view mounted and only toggles visibility, so a
  // one-shot mount fetch goes stale: a brand that finishes extracting inside
  // its backing project — or is created/removed from another surface — never
  // reaches this list until a full reload. `isBrandsView` lets the effects
  // below reconcile with `/api/brands` whenever the Brands view is the active
  // one again.
  const isBrandsView = route.kind === 'home' && route.view === 'brands';
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const { state: extractState, run: runExtract } = useBrandExtract();
  const extractStarting = extractState.phase === 'starting';
  const extractError =
    extractState.phase === 'error' ? extractState.error ?? t('brand.failed') : null;

  const refresh = useCallback(async () => {
    const next = await fetchBrands();
    setBrands(next);
  }, []);

  // Refresh on first activation and on every return to the Brands view, so the
  // library always reconciles with the backend after the user comes back from
  // an extraction running in its backing project.
  useEffect(() => {
    if (isBrandsView) void refresh();
  }, [isBrandsView, refresh]);

  // While a brand is mid-extraction (or paused awaiting user input), poll so its
  // card flips from `extracting` to the finalized preview — or back from
  // `needs_input` once the user answers — without leaving and returning. Scoped
  // to the active view and torn down once nothing is in-flight, so a hidden tab
  // never polls.
  const hasExtracting = useMemo(
    () =>
      (brands ?? []).some(
        (b) => b.meta.status === 'extracting' || b.meta.status === 'needs_input',
      ),
    [brands],
  );
  useEffect(() => {
    if (!isBrandsView || !hasExtracting) return;
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [isBrandsView, hasExtracting, refresh]);

  // The "Create Brand Kit" home chip routes here and asks the tab to open its
  // New Brand Kit modal. BrandsTab stays mounted across view switches, so we
  // react to the intent event; a pending latch left before mount is drained
  // once on first render as a fallback.
  useEffect(() => {
    const openModal = () => setModalOpen(true);
    if (consumePendingNewBrandKit()) openModal();
    window.addEventListener(NEW_BRAND_KIT_INTENT_EVENT, openModal);
    return () => window.removeEventListener(NEW_BRAND_KIT_INTENT_EVENT, openModal);
  }, []);

  const filtered = useMemo(() => {
    const list = brands ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) => {
      const name = b.brand?.name ?? '';
      const host = hostnameOf(b.meta.sourceUrl);
      return name.toLowerCase().includes(q) || host.toLowerCase().includes(q);
    });
  }, [brands, query]);

  // Resolve which brand the preview shows. A routed brand id (deep-link / rail
  // selection) wins when it exists; otherwise keep the current pick valid as
  // the list refreshes (e.g. a brand finishes extracting or is removed), and
  // fall back to the first entry only when the current pick is gone.
  useEffect(() => {
    const list = brands ?? [];
    if (list.length === 0) {
      setSelectedBrandId(null);
      return;
    }
    setSelectedBrandId((cur) => {
      if (routedBrandId && list.some((b) => b.meta.id === routedBrandId)) return routedBrandId;
      if (cur && list.some((b) => b.meta.id === cur)) return cur;
      return list[0]?.meta.id ?? null;
    });
  }, [brands, routedBrandId]);

  // Selecting a brand drives the inline preview and reflects the choice in the
  // URL so the selection is shareable / deep-linkable, without navigating to a
  // separate page.
  const handleSelect = useCallback((id: string) => {
    setSelectedBrandId(id);
    navigate({ kind: 'home', view: 'brands', brandId: id }, { replace: true });
  }, []);

  const selected = useMemo(() => {
    if (!selectedBrandId) return null;
    return (brands ?? []).find((b) => b.meta.id === selectedBrandId) ?? null;
  }, [brands, selectedBrandId]);

  const handleCreated = useCallback(
    (_brandId: string, projectId: string, conversationId: string) => {
      setModalOpen(false);
      void refresh();
      void onDesignSystemsRefresh?.();
      navigate({ kind: 'project', projectId, fileName: null, conversationId });
    },
    [onDesignSystemsRefresh, refresh],
  );

  // Picking a reference brand kicks off extraction directly, then converges on
  // the same post-create flow as the modal (auto-send + navigate into project).
  const handlePickReference = useCallback(
    async (brand: BrandReference) => {
      const result = await runExtract(brand.domain);
      if (result) handleCreated(result.id, result.projectId, result.conversationId);
    },
    [runExtract, handleCreated],
  );

  const isEmpty = brands !== null && (brands ?? []).length === 0;

  return (
    <div className={styles.root} data-testid="brands-tab">
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <h1 className={styles.title}>{t('brand.libraryTitle')}</h1>
          <Button
            variant="primary"
            onClick={() => setModalOpen(true)}
            data-testid="brands-new"
            className={styles.newBtn}
          >
            {t('brand.newBrand')}
          </Button>
        </div>

        <div className={styles.searchWrap}>
          <SearchGlyph />
          <input
            type="search"
            className={styles.search}
            placeholder={t('brand.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="brands-search"
          />
        </div>

        <div className={styles.list} data-testid="brands-list">
          {brands === null ? (
            <div className={styles.listLoading} aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={`sk-${i}`} className={styles.skeletonRow} />
              ))}
            </div>
          ) : isEmpty ? (
            <div className={styles.sidebarEmpty} data-testid="brands-empty">
              <p className={styles.sidebarEmptyText}>{t('brand.empty')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.sidebarEmpty}>
              <p className={styles.sidebarEmptyText}>{t('brand.empty')}</p>
            </div>
          ) : (
            filtered.map((summary) => (
              <BrandListItem
                key={summary.meta.id}
                summary={summary}
                active={summary.meta.id === selectedBrandId}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </aside>

      <section className={styles.preview} data-testid="brands-preview">
        {selected ? (
          <BrandPreviewCard
            key={selected.meta.id}
            summary={selected}
            variant="panel"
            onChanged={refresh}
            onApplyDesignSystem={onApplyDesignSystem}
            onOpenProject={onOpenProject}
          />
        ) : isEmpty ? (
          <div className={styles.pickerPane} data-testid="brands-picker-pane">
            <BrandReferencePicker
              variant="full"
              busy={extractStarting}
              error={extractError}
              onPick={handlePickReference}
            />
          </div>
        ) : (
          <div className={styles.previewEmpty}>
            <span className={styles.previewEmptyMark} aria-hidden>
              <SparkGlyph />
            </span>
            <p className={styles.previewEmptyText}>{t('brand.previewEmpty')}</p>
          </div>
        )}
      </section>

      <NewBrandModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

interface ListItemProps {
  summary: BrandSummary;
  active: boolean;
  onSelect: (id: string) => void;
}

function BrandListItem({ summary, active, onSelect }: ListItemProps) {
  const t = useT();
  const { meta, brand } = summary;
  const host = hostnameOf(meta.sourceUrl);
  const name = brand?.name?.trim() || host;
  const extracting = meta.status === 'extracting';
  const failed = meta.status === 'failed';

  return (
    <button
      type="button"
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      aria-pressed={active}
      data-testid={`brand-item-${meta.id}`}
      onClick={() => onSelect(meta.id)}
    >
      <span className={styles.itemThumb}>
        <BrandLogo
          id={meta.id}
          host={host}
          name={name}
          faviconSize={64}
          className={styles.itemLogo}
          fallbackClassName={styles.itemLogoFallback}
        />
      </span>
      <span className={styles.itemMeta}>
        <span className={styles.itemName}>{name}</span>
        <span className={styles.itemHost}>{host}</span>
      </span>
      {extracting ? (
        <span
          className={`${styles.statusDot} ${styles.statusDotBusy}`}
          title={t('brand.extracting')}
          aria-label={t('brand.extracting')}
        />
      ) : failed ? (
        <span
          className={`${styles.statusDot} ${styles.statusDotFailed}`}
          title={t('brand.failed')}
          aria-label={t('brand.failed')}
        />
      ) : null}
    </button>
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

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden>
      <path
        d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7l4.9-1.8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
