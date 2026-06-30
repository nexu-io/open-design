import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, VisuallyHidden } from '@open-design/components';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemsTemplateCardClick,
  trackDesignSystemsTopClick,
  trackDesignSystemStatusResult,
  trackDesignSystemEditClick,
  trackPageView,
} from '../analytics/events';
import type { DesignSystemEditClickProps } from '@open-design/contracts/analytics';
import type {
  TrackingDesignSystemStatusAction,
  TrackingDesignSystemStatusValue,
} from '@open-design/contracts/analytics';
import { useI18n } from '../i18n';
import type { Locale } from '../i18n/types';
import {
  localizeDesignSystemCategory,
  localizeDesignSystemSummary,
} from '../i18n/content';
import { BRAND_REFERENCES } from '../runtime/brand-references';
import { takeDesignSystemFocus } from '../runtime/brands';
import {
  deleteDesignSystemDraft,
  fetchDesignSystem,
  fetchProjectFileText,
  projectRawUrl,
  updateDesignSystemDraft,
} from '../providers/registry';
import { downloadDesignSystemArchive, downloadProjectArchive } from '../runtime/exports';
import { useDesignKit } from '../runtime/design-kit';
import { DesignKitView, HeaderActionsMenu, type DesignKitActionFeedbackTone, type HeaderMenuAction } from './DesignKitView';
import { hostnameOf } from './BrandPreviewCard';
import { Icon } from './Icon';
import { Toast } from './Toast';
import type { DesignSystemDetail, DesignSystemSummary, ProjectTemplate, Surface } from '../types';
import styles from './DesignSystemsTab.module.css';

interface Props {
  systems: DesignSystemSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  onCreate?: () => void;
  onOpenSystem?: (id: string) => void;
  onSystemsRefresh?: () => Promise<void> | void;
  templates?: ProjectTemplate[];
}

const CATEGORY_ORDER = [
  'Starter',
  'AI & LLM',
  'Developer Tools',
  'Productivity & SaaS',
  'Backend & Data',
  'Design & Creative',
  'Fintech & Crypto',
  'E-Commerce & Retail',
  'Media & Consumer',
  'Automotive',
];

type SurfaceFilter = 'all' | Surface;
type DesignSystemCollection = 'mine' | 'official' | 'enterprise';
type DesignSystemActionKind = 'edit' | 'publish' | 'default' | 'delete';

const SURFACE_PILLS: { value: SurfaceFilter; labelKey: 'examples.modeAll' | 'ds.surfaceWeb' | 'ds.surfaceImage' | 'ds.surfaceVideo' | 'ds.surfaceAudio' }[] = [
  { value: 'all', labelKey: 'examples.modeAll' },
  { value: 'web', labelKey: 'ds.surfaceWeb' },
  { value: 'image', labelKey: 'ds.surfaceImage' },
  { value: 'video', labelKey: 'ds.surfaceVideo' },
  { value: 'audio', labelKey: 'ds.surfaceAudio' },
];

const OFFICIAL_PRESET_DOMAINS: Record<string, string> = {
  airbnb: 'airbnb.com',
  airtable: 'airtable.com',
  ant: 'ant.design',
  apple: 'apple.com',
  arc: 'arc.net',
  binance: 'binance.com',
  bmw: 'bmw.com',
  'bmw-m': 'bmw-m.com',
  bugatti: 'bugatti.com',
  cal: 'cal.com',
  canva: 'canva.com',
  cisco: 'cisco.com',
  claude: 'claude.ai',
  clay: 'clay.com',
  clickhouse: 'clickhouse.com',
  cohere: 'cohere.com',
  coinbase: 'coinbase.com',
  composio: 'composio.dev',
  cursor: 'cursor.com',
  discord: 'discord.com',
  duolingo: 'duolingo.com',
  elevenlabs: 'elevenlabs.io',
  expo: 'expo.dev',
  ferrari: 'ferrari.com',
  figma: 'figma.com',
  framer: 'framer.com',
  github: 'github.com',
  hashicorp: 'hashicorp.com',
  huggingface: 'huggingface.co',
  ibm: 'ibm.com',
  intercom: 'intercom.com',
  kraken: 'kraken.com',
  lamborghini: 'lamborghini.com',
  'linear-app': 'linear.app',
  lingo: 'lingo.dev',
  loom: 'loom.com',
  lovable: 'lovable.dev',
  mastercard: 'mastercard.com',
  material: 'material.io',
  meta: 'meta.com',
  minimax: 'minimax.io',
  miro: 'miro.com',
  mistral: 'mistral.ai',
  'mistral-ai': 'mistral.ai',
  mongodb: 'mongodb.com',
  nike: 'nike.com',
  notion: 'notion.so',
  nvidia: 'nvidia.com',
  ollama: 'ollama.com',
  openai: 'openai.com',
  'opencode-ai': 'opencode.ai',
  perplexity: 'perplexity.ai',
  pinterest: 'pinterest.com',
  playstation: 'playstation.com',
  posthog: 'posthog.com',
  raycast: 'raycast.com',
  renault: 'renault.com',
  replicate: 'replicate.com',
  resend: 'resend.com',
  revolut: 'revolut.com',
  runwayml: 'runwayml.com',
  sanity: 'sanity.io',
  sentry: 'sentry.io',
  shadcn: 'ui.shadcn.com',
  shopify: 'shopify.com',
  slack: 'slack.com',
  spacex: 'spacex.com',
  spotify: 'spotify.com',
  starbucks: 'starbucks.com',
  stripe: 'stripe.com',
  supabase: 'supabase.com',
  superhuman: 'superhuman.com',
  tesla: 'tesla.com',
  theverge: 'theverge.com',
  'together-ai': 'together.ai',
  uber: 'uber.com',
  vercel: 'vercel.com',
  vodafone: 'vodafone.com',
  voltagent: 'voltagent.dev',
  warp: 'warp.dev',
  webex: 'webex.com',
  webflow: 'webflow.com',
  wechat: 'wechat.com',
  wired: 'wired.com',
  wise: 'wise.com',
  'x-ai': 'x.ai',
  xiaohongshu: 'xiaohongshu.com',
  zapier: 'zapier.com',
};

function brandKey(value: string): string {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

const REFERENCE_BRAND_DOMAINS = new Map(
  BRAND_REFERENCES.map((brand) => [brandKey(brand.name), brand.domain] as const),
);

function surfaceOf(system: DesignSystemSummary): Surface {
  return system.surface ?? 'web';
}

function isUserSystem(system: DesignSystemSummary): boolean {
  return system.source === 'user' || system.isEditable === true;
}

function designSystemLogoHost(system: DesignSystemSummary): string {
  const sourceUrl = system.provenance?.sourceUrls?.[0];
  if (sourceUrl) return hostnameOf(sourceUrl);
  const fromReference = REFERENCE_BRAND_DOMAINS.get(brandKey(system.title));
  if (fromReference) return fromReference;
  return OFFICIAL_PRESET_DOMAINS[system.id] ?? '';
}

// `system.status` is the DesignSystemSummary status string from the
// daemon; map it onto the tracking enum used by
// `design_system_status_result.status_before|status_after`. The
// summary type today only carries `'draft' | 'published'`; the wider
// tracking enum keeps room for `ready`/`failed`/`archived` once those
// land server-side. Unknown values collapse to `'unknown'`.
function mapStatusToTracking(
  status: string | null | undefined,
): TrackingDesignSystemStatusValue {
  switch (status) {
    case 'draft':
    case 'published':
      return status;
    default:
      return 'unknown';
  }
}

function systemMatchesQuery(
  locale: Locale,
  system: DesignSystemSummary,
  query: string,
): boolean {
  if (!query) return true;
  const summary = localizeDesignSystemSummary(locale, system).toLowerCase();
  const categoryLabel = localizeDesignSystemCategory(
    locale,
    system.category || 'Uncategorized',
  ).toLowerCase();
  return (
    system.title.toLowerCase().includes(query) ||
    system.summary.toLowerCase().includes(query) ||
    summary.includes(query) ||
    categoryLabel.includes(query)
  );
}

export function DesignSystemsTab({
  systems,
  selectedId,
  onSelect,
  loading = false,
  onCreate,
  onOpenSystem,
  onSystemsRefresh,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const designSystemsPageViewFiredRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (designSystemsPageViewFiredRef.current) return;
    designSystemsPageViewFiredRef.current = true;
    // v2 doc: the DS list page also carries `area` / `view_type` /
    // `entry_from` so it can stitch the cross-surface DS funnel.
    // `entry_from` is `unknown` here because the tab is reached
    // through the home nav rail; a router-aware entry mapper can
    // refine this later.
    trackPageView(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_list',
      view_type: 'page',
      entry_from: 'unknown',
      available_design_system_count: systems.length,
    });
  }, [analytics.track, systems.length, loading]);
  const searchTrackedRef = useRef(false);
  const categoryTrackedRef = useRef(false);
  const [filter, setFilter] = useState('');
  const [busyAction, setBusyAction] = useState<{ systemId: string; action: DesignSystemActionKind } | null>(null);
  const busyId = busyAction?.systemId ?? null;
  const [actionToast, setActionToast] = useState<{ message: string; tone: DesignKitActionFeedbackTone } | null>(null);
  const notifyAction = (tone: DesignKitActionFeedbackTone, message: string) => {
    setActionToast({ tone, message });
  };
  const notifyActionLoading = (label?: string) => {
    const message = label
      ? label.endsWith('…') || label.endsWith('...') ? label : `${label}...`
      : t('common.loading');
    notifyAction('loading', message);
  };
  const [designSystemCollection, setDesignSystemCollection] = useState<DesignSystemCollection>('mine');
  const [surfaceFilter, setSurfaceFilter] = useState<SurfaceFilter>('all');
  const [category, setCategory] = useState<string>('All');
  // The master-detail selection — which row renders in the right preview pane.
  // Distinct from `selectedId`, which is the global *default* design system.
  const [previewId, setPreviewId] = useState<string | null>(null);
  // A one-shot design-system id another surface asked us to preselect (e.g. the
  // brand-extraction "ready" prompt navigating here). Read+cleared from
  // sessionStorage exactly once; applied by the effect below once the system
  // actually shows up in the loaded list (which may arrive after a refresh).
  const [pendingFocus, setPendingFocus] = useState<string | null>(() => takeDesignSystemFocus());
  const q = filter.trim().toLowerCase();

  const librarySystems = useMemo(
    () => systems.filter((system) => !isUserSystem(system)),
    [systems],
  );

  const userSystems = useMemo(
    () => systems.filter(isUserSystem),
    [systems],
  );

  const userSearched = useMemo(
    () => userSystems.filter((s) => systemMatchesQuery(locale, s, q)),
    [userSystems, locale, q],
  );

  const surfaceScoped = useMemo(
    () => surfaceFilter === 'all'
      ? librarySystems
      : librarySystems.filter((s) => surfaceOf(s) === surfaceFilter),
    [librarySystems, surfaceFilter],
  );

  // Total systems per surface, ignoring every active filter. Drives the
  // "this surface is now empty" fallback below — that guard must react to
  // the catalog itself, not to a transient style/search filter.
  const surfaceTotals = useMemo(() => {
    const counts: Record<SurfaceFilter, number> = { all: librarySystems.length, web: 0, image: 0, video: 0, audio: 0 };
    for (const s of librarySystems) counts[surfaceOf(s)]++;
    return counts;
  }, [librarySystems]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of surfaceScoped) cats.add(s.category || 'Uncategorized');
    const ordered: string[] = [];
    for (const c of CATEGORY_ORDER) if (cats.has(c)) ordered.push(c);
    for (const c of [...cats].sort()) if (!ordered.includes(c)) ordered.push(c);
    return ['All', ...ordered];
  }, [surfaceScoped]);

  // Keep surfaceFilter and category in sync when systems changes dynamically.
  // If the currently selected surface has zero items, fall back to 'all'.
  // If the current category is no longer present in the filtered list, fall back to 'All'.
  useEffect(() => {
    if (surfaceFilter !== 'all' && surfaceTotals[surfaceFilter] === 0) {
      setSurfaceFilter('all');
      setCategory('All');
    } else if (category !== 'All' && !categories.includes(category)) {
      setCategory('All');
    }
  }, [systems, surfaceFilter, surfaceTotals, category, categories]);

  // Systems matching the active style category and search text, before the
  // surface filter is applied. Both the surface pill counts and the visible
  // list derive from this so a surface chip always reports its own result
  // set rather than the unfiltered catalog total.
  const queryScoped = useMemo(() => {
    return librarySystems.filter((s) => {
      if (category !== 'All' && (s.category || 'Uncategorized') !== category) return false;
      return systemMatchesQuery(locale, s, q);
    });
  }, [librarySystems, q, category, locale]);

  const surfaceCounts = useMemo(() => {
    const counts: Record<SurfaceFilter, number> = {
      all: queryScoped.length, web: 0, image: 0, video: 0, audio: 0,
    };
    for (const s of queryScoped) counts[surfaceOf(s)]++;
    return counts;
  }, [queryScoped]);

  const filtered = useMemo(
    () => surfaceFilter === 'all'
      ? queryScoped
      : queryScoped.filter((s) => surfaceOf(s) === surfaceFilter),
    [queryScoped, surfaceFilter],
  );

  // The list backing the active scope. Design-system scopes carry summaries;
  const activeSystems = useMemo<DesignSystemSummary[]>(() => {
    if (designSystemCollection === 'mine') return userSearched;
    if (designSystemCollection === 'official') return filtered;
    return [];
  }, [designSystemCollection, userSearched, filtered]);

  const activeIds = useMemo(() => {
    return activeSystems.map((s) => s.id);
  }, [activeSystems]);

  // Keep the previewed row valid as scopes / filters change: hold the current
  // pick when it still exists, otherwise fall back to the first row (mirrors
  // the Brand Kit master-detail). Empty scopes clear the selection.
  useEffect(() => {
    if (activeIds.length === 0) {
      setPreviewId(null);
      return;
    }
    setPreviewId((cur) => (cur && activeIds.includes(cur) ? cur : activeIds[0] ?? null));
  }, [activeIds]);

  // Apply a pending focus once the requested system is present in the catalog.
  // Runs again whenever `systems` changes, so a focus that arrived before the
  // freshly-finalized brand design system loaded still lands after the refresh.
  // Brand systems are user systems, so make sure the "mine" scope is active.
  useEffect(() => {
    if (!pendingFocus) return;
    const sys = systems.find((s) => s.id === pendingFocus);
    if (!sys) return; // not in the loaded list yet — wait for the next refresh
    if (isUserSystem(sys)) setDesignSystemCollection('mine');
    setPreviewId(pendingFocus);
    setPendingFocus(null);
  }, [pendingFocus, systems]);

  const selectedSystem = useMemo(() => {
    if (!previewId) return null;
    return activeSystems.find((s) => s.id === previewId) ?? null;
  }, [previewId, activeSystems]);

  // Category metadata is authored in English; keep raw values in state for
  // filtering while localizing the visible labels for the current UI locale.
  const renderCategory = (c: string) => {
    if (c === 'All') return t('ds.categoryAll');
    if (c === 'Uncategorized') return t('ds.categoryUncategorized');
    return localizeDesignSystemCategory(locale, c);
  };

  async function refreshSystems() {
    await onSystemsRefresh?.();
  }

  async function togglePublished(system: DesignSystemSummary) {
    if (busyAction) return;
    setBusyAction({ systemId: system.id, action: 'publish' });
    notifyActionLoading();
    const startedAt = performance.now();
    const willPublish = system.status !== 'published';
    const action: TrackingDesignSystemStatusAction = willPublish
      ? 'publish'
      : 'unpublish';
    const statusBefore = mapStatusToTracking(system.status);
    const isDefaultBefore = system.id === selectedId;
    let succeeded = false;
    let errorCode: string | undefined;
    try {
      const updated = await updateDesignSystemDraft(system.id, {
        status: willPublish ? 'published' : 'draft',
      });
      succeeded = Boolean(updated);
      if (!succeeded) errorCode = 'DS_STATUS_UPDATE_RETURNED_NULL';
      if (succeeded) {
        await refreshSystems();
        notifyAction('success', t('ds.actionDone'));
      } else {
        notifyAction('error', t('ds.actionFailed'));
      }
    } catch (err) {
      errorCode = err instanceof Error
        ? `DS_STATUS_UPDATE_THREW:${err.message.slice(0, 80)}`
        : 'DS_STATUS_UPDATE_THREW';
      notifyAction('error', t('ds.actionFailed'));
    } finally {
      setBusyAction(null);
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action,
        result: succeeded ? 'success' : 'failed',
        design_system_id: system.id,
        status_before: statusBefore,
        status_after: succeeded
          ? willPublish
            ? 'published'
            : 'draft'
          : statusBefore,
        is_default_before: isDefaultBefore,
        is_default_after: isDefaultBefore,
        error_code: errorCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }

  async function deleteSystem(system: DesignSystemSummary) {
    if (busyAction) return;
    const ok = window.confirm(t('dsManager.deleteConfirm', { title: system.title }));
    if (!ok) {
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: 'delete',
        result: 'cancelled',
        design_system_id: system.id,
        status_before: mapStatusToTracking(system.status),
        status_after: mapStatusToTracking(system.status),
        is_default_before: system.id === selectedId,
        is_default_after: system.id === selectedId,
        duration_ms: 0,
      });
      return;
    }
    setBusyAction({ systemId: system.id, action: 'delete' });
    notifyActionLoading(t('dsManager.deleteSystemAria', { title: system.title }));
    const startedAt = performance.now();
    const statusBefore = mapStatusToTracking(system.status);
    const wasDefault = system.id === selectedId;
    let succeeded = false;
    let errorCode: string | undefined;
    try {
      const deleted = await deleteDesignSystemDraft(system.id);
      succeeded = Boolean(deleted);
      if (!succeeded) errorCode = 'DS_DELETE_RETURNED_FALSE';
      if (succeeded && selectedId === system.id) {
        const fallback = systems.find((candidate) =>
          candidate.id !== system.id && isUserSystem(candidate),
        );
        if (fallback) onSelect(fallback.id);
      }
      if (succeeded) {
        await refreshSystems();
        notifyAction('success', t('ds.actionDone'));
      } else {
        notifyAction('error', t('ds.actionFailed'));
      }
    } catch (err) {
      errorCode = err instanceof Error
        ? `DS_DELETE_THREW:${err.message.slice(0, 80)}`
        : 'DS_DELETE_THREW';
      notifyAction('error', t('ds.actionFailed'));
    } finally {
      setBusyAction(null);
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: 'delete',
        result: succeeded ? 'success' : 'failed',
        design_system_id: system.id,
        status_before: statusBefore,
        status_after: succeeded ? 'deleted' : statusBefore,
        is_default_before: wasDefault,
        // After a successful delete the row is gone; if it was the
        // default the consumer remapped to a fallback above, so this
        // DS is no longer the default either way.
        is_default_after: false,
        error_code: errorCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }

  function handleMakeDefaultClick(system: DesignSystemSummary): void {
    if (busyAction) return;
    setBusyAction({ systemId: system.id, action: 'default' });
    notifyActionLoading(t('dsManager.makeDefault'));
    const wasDefault = system.id === selectedId;
    const statusBefore = mapStatusToTracking(system.status);
    try {
      onSelect(system.id);
      notifyAction('success', t('ds.actionDone'));
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: wasDefault ? 'unset_default' : 'set_default',
        result: 'success',
        design_system_id: system.id,
        status_before: statusBefore,
        status_after: statusBefore,
        is_default_before: wasDefault,
        is_default_after: !wasDefault,
        duration_ms: 0,
      });
    } catch {
      notifyAction('error', t('ds.actionFailed'));
      trackDesignSystemStatusResult(analytics.track, {
        page_name: 'design_systems',
        area: 'design_system_status',
        action: wasDefault ? 'unset_default' : 'set_default',
        result: 'failed',
        design_system_id: system.id,
        status_before: statusBefore,
        status_after: statusBefore,
        is_default_before: wasDefault,
        is_default_after: wasDefault,
        error_code: 'DS_DEFAULT_SELECT_THREW',
        duration_ms: 0,
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleEditSystem(system: DesignSystemSummary): void {
    if (!onOpenSystem || busyAction) return;
    setBusyAction({ systemId: system.id, action: 'edit' });
    notifyActionLoading(t('dsManager.editWithAgent'));
    try {
      onOpenSystem(system.id);
      notifyAction('success', t('ds.actionDone'));
    } catch {
      notifyAction('error', t('ds.actionFailed'));
    } finally {
      setBusyAction(null);
    }
  }

  function trackCardClick(system: DesignSystemSummary): void {
    trackDesignSystemsTemplateCardClick(analytics.track, {
      page_name: 'design_systems',
      area: 'templates_card',
      element: 'templates_card',
      templates_id: system.id,
      templates_type: system.source ?? 'library',
    });
  }

  function handleSelectSystem(system: DesignSystemSummary): void {
    setPreviewId(system.id);
    trackCardClick(system);
  }

  const scopeTabs = [
    { value: 'mine' as const, label: t('dsManager.yourSystems'), count: userSearched.length },
    { value: 'official' as const, label: t('dsManager.officialPresets'), count: queryScoped.length },
    { value: 'enterprise' as const, label: t('dsManager.enterprise'), comingSoon: true },
  ];

  const showPresetFilters = designSystemCollection === 'official';

  if (loading) {
    return (
      <div
        className={styles.root}
        data-testid="design-systems-tab"
        data-loading="true"
        aria-busy="true"
      >
        <VisuallyHidden role="status">{t('designSystemPicker.loading')}</VisuallyHidden>
        <aside className={styles.sidebar} data-testid="design-systems-sidebar-skeleton">
          {onCreate ? (
            <Button
              variant="primary"
              className={styles.newBtn}
              onClick={onCreate}
              data-testid="design-systems-create"
            >
              <Icon name="plus" />
              {t('dsManager.createAction')}
            </Button>
          ) : (
            <SkeletonBlock className={styles.skeletonCreateButton} />
          )}

          <div className={styles.searchWrap} aria-hidden>
            <SearchGlyph className={styles.searchIcon} />
            <SkeletonBlock className={`${styles.search} ${styles.skeletonSearchField}`} />
          </div>

          <div className={styles.scopes} aria-hidden>
            <SkeletonBlock className={`${styles.scopeChip} ${styles.skeletonScopeChipWide}`} />
            <SkeletonBlock className={`${styles.scopeChip} ${styles.skeletonScopeChip}`} />
            <SkeletonBlock className={`${styles.scopeChip} ${styles.skeletonScopeChipWide}`} />
          </div>

          <div className={styles.list} data-testid="design-systems-list" aria-hidden>
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className={`${styles.item} ${index === 0 ? styles.skeletonRowActive : styles.skeletonRow}`}
                data-testid={`design-systems-loading-row-${index}`}
              >
                <span className={styles.itemThumb}>
                  <SkeletonBlock className={styles.skeletonThumb} />
                </span>
                <span className={styles.itemMeta}>
                  <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonLineTitle}`} />
                  <SkeletonBlock className={`${styles.skeletonLine} ${index % 3 === 0 ? styles.skeletonLineShort : styles.skeletonLineMedium}`} />
                </span>
                <SkeletonBlock className={styles.skeletonStatusDot} />
              </div>
            ))}
          </div>
        </aside>

        <section className={styles.preview} data-testid="design-systems-preview">
          <DesignSystemDetailSkeleton
            label={t('designSystemPicker.loadingPreview')}
            dataTestId="design-systems-preview-skeleton"
          />
        </section>
      </div>
    );
  }

  return (
    <>
      {actionToast ? (
        <Toast
          message={actionToast.message}
          tone={actionToast.tone}
          ttlMs={actionToast.tone === 'loading' ? 60000 : 2600}
          role={actionToast.tone === 'error' ? 'alert' : 'status'}
          onDismiss={() => setActionToast(null)}
        />
      ) : null}
      <div className={styles.root} data-testid="design-systems-tab">
      <aside className={styles.sidebar}>
        {onCreate ? (
          <Button
            variant="primary"
            className={styles.newBtn}
            onClick={onCreate}
            data-testid="design-systems-create"
          >
            <Icon name="plus" />
            {t('dsManager.createAction')}
          </Button>
        ) : null}

        <div className={styles.searchWrap}>
          <SearchGlyph className={styles.searchIcon} />
          <input
            type="search"
            data-testid="design-systems-search"
            className={styles.search}
            placeholder={t('ds.searchPlaceholder')}
            value={filter}
            onFocus={() => {
              if (searchTrackedRef.current) return;
              searchTrackedRef.current = true;
              trackDesignSystemsTopClick(analytics.track, {
                page_name: 'design_systems',
                area: 'design_systems',
                element: 'search_input',
              });
            }}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div
          className={styles.scopes}
          role="tablist"
          aria-label={t('dsManager.sourceAria')}
        >
          {scopeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={designSystemCollection === tab.value}
              className={`${styles.scopeChip} ${designSystemCollection === tab.value ? styles.scopeChipActive : ''}`}
              onClick={() => setDesignSystemCollection(tab.value)}
            >
              <span>{tab.label}</span>
              {'count' in tab ? (
                <span className={styles.scopeCount} aria-hidden>{tab.count}</span>
              ) : null}
              {tab.comingSoon ? (
                <span className={styles.scopeComingSoon} aria-hidden>{t('dsManager.comingSoonBadge')}</span>
              ) : null}
            </button>
          ))}
        </div>

        {showPresetFilters ? (
          <div className={styles.presetFilters}>
            <div className={styles.surfaceRow} role="tablist" aria-label={t('ds.surfaceLabel')}>
              {/* Hide chips with no items in the active style/search filter, but
                  always keep "all" and the currently selected surface — otherwise a
                  transient search could remove the active chip and leave the list
                  filtered with no chip showing aria-selected. */}
              {SURFACE_PILLS.filter(
                (p) => p.value === surfaceFilter || p.value === 'all' || surfaceCounts[p.value] > 0,
              ).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="tab"
                  aria-selected={surfaceFilter === p.value}
                  data-testid={`design-systems-surface-${p.value}`}
                  className={`${styles.surfacePill} ${surfaceFilter === p.value ? styles.surfacePillActive : ''}`}
                  onClick={() => {
                    trackDesignSystemsTopClick(analytics.track, {
                      page_name: 'design_systems',
                      area: 'design_systems',
                      element: 'filter_chip',
                      filter_name: p.value,
                    });
                    setSurfaceFilter(p.value);
                  }}
                >
                  {t(p.labelKey)}
                  <span className={`filter-pill-count ${styles.surfaceCount}`}>{surfaceCounts[p.value]}</span>
                </button>
              ))}
            </div>
            <select
              data-testid="design-systems-category-select"
              className={styles.categorySelect}
              value={category}
              onFocus={() => {
                if (categoryTrackedRef.current) return;
                categoryTrackedRef.current = true;
                trackDesignSystemsTopClick(analytics.track, {
                  page_name: 'design_systems',
                  area: 'design_systems',
                  element: 'search_dropdown',
                });
              }}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {renderCategory(c)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className={styles.list} data-testid="design-systems-list">
          {renderSidebarList()}
        </div>
      </aside>

      <section className={styles.preview} data-testid="design-systems-preview">
        {renderPreview()}
      </section>
      </div>
    </>
  );

  function renderSidebarList() {
    if (designSystemCollection === 'enterprise') {
      return (
        <div className={styles.sidebarEmpty}>
          <p className={styles.sidebarEmptyText}>{t('dsManager.enterpriseDsBody')}</p>
        </div>
      );
    }
    if (activeSystems.length === 0) {
      if (designSystemCollection === 'official') {
        return (
          <div className={styles.sidebarEmpty} data-testid="design-systems-empty">
            <p className={styles.sidebarEmptyText}>{t('ds.emptyNoMatch')}</p>
          </div>
        );
      }
      return (
        <div className={styles.sidebarEmpty}>
          <p className={styles.sidebarEmptyText}>{t('dsManager.emptyMine')}</p>
        </div>
      );
    }
    return activeSystems.map((system) => (
      <SystemRow
        key={system.id}
        system={system}
        active={system.id === previewId}
        isDefault={system.id === selectedId}
        subtitle={
          // User systems: prefer the scenario (summary), then the source link
          // (host, truncated by CSS), then the generic placeholder. Presets keep
          // their localized category, which already reads as their scenario.
          isUserSystem(system)
            ? (system.summary?.trim()
              || designSystemLogoHost(system)
              || t('brandDetail.designSystem'))
            : localizeDesignSystemCategory(locale, system.category || 'Uncategorized')
        }
        statusLabel={(system.status ?? 'draft') === 'published' ? t('dsManager.statusPublished') : t('dsManager.statusDraft')}
        onSelect={() => handleSelectSystem(system)}
      />
    ));
  }

  function renderPreview() {
    if (designSystemCollection === 'enterprise') {
      return (
        <ComingSoon
          title={t('dsManager.enterpriseDsTitle')}
          body={t('dsManager.enterpriseDsBody')}
          comingSoonLabel={t('dsManager.comingSoonBadge')}
        />
      );
    }

    if (selectedSystem) {
      return (
        <DesignSystemDetail
          key={selectedSystem.id}
          system={selectedSystem}
          isDefault={selectedSystem.id === selectedId}
          busy={busyId === selectedSystem.id}
          actionBusy={busyAction?.systemId === selectedSystem.id ? busyAction.action : null}
          t={t}
          onEdit={handleEditSystem}
          onMakeDefault={handleMakeDefaultClick}
          onTogglePublished={togglePublished}
          onDelete={deleteSystem}
          onSystemsRefresh={onSystemsRefresh}
          onActionFeedback={notifyAction}
        />
      );
    }

    // Empty scope — invite the relevant next action.
    const emptyText = designSystemCollection === 'official'
        ? t('ds.emptyNoMatch')
        : t('dsManager.emptyMine');
    const emptyTitle = designSystemCollection === 'mine'
      ? t('dsManager.createTitle')
      : null;
    return (
      <div className={styles.previewEmpty}>
        <span className={styles.previewEmptyMark} aria-hidden>
          <SparkGlyph />
        </span>
        {emptyTitle ? <p className={styles.previewEmptyTitle}>{emptyTitle}</p> : null}
        <p className={styles.previewEmptyText}>{emptyText}</p>
      </div>
    );
  }
}

function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return <span className={`${styles.skeletonBlock}${className ? ` ${className}` : ''}`} aria-hidden />;
}

interface SystemRowProps {
  system: DesignSystemSummary;
  active: boolean;
  isDefault: boolean;
  subtitle: string;
  statusLabel: string;
  onSelect: () => void;
}

function fallbackSwatches(seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const base = h % 360;
  return [
    `hsl(${base}, 24%, 94%)`,
    `hsl(${(base + 90) % 360}, 34%, 74%)`,
    `hsl(${(base + 180) % 360}, 42%, 34%)`,
    `hsl(${(base + 28) % 360}, 76%, 54%)`,
  ];
}

function SystemRowPaletteLogo({ system }: { system: DesignSystemSummary }) {
  const swatches = system.swatches && system.swatches.length > 0
    ? system.swatches.slice(0, 4)
    : fallbackSwatches(system.title || system.id);
  return (
    <span className={styles.itemSwatches} aria-hidden>
      {swatches.map((color, index) => (
        <span key={`${color}-${index}`} style={{ background: color }} />
      ))}
    </span>
  );
}

// Resolve a system's own logo from its backing project's brand.json
// (`logo.primary`), exactly mirroring how the detail kit loads it via
// `useDesignKit`. The list row can't use `/api/brands/:id/logo` because the row
// only knows the *design-system* id, which differs from the brand id the brands
// route expects. Returns `undefined` while the fetch is in flight, `null` when
// the project has no logo, or the raw URL string.
function useProjectLogoSrc(projectId: string | undefined): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(projectId ? undefined : null);
  useEffect(() => {
    if (!projectId) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    setSrc(undefined);
    void fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' }).then((raw) => {
      if (cancelled) return;
      let primary: string | null = null;
      if (raw) {
        try {
          const data = JSON.parse(raw) as { logo?: { primary?: unknown } };
          const candidate = data?.logo?.primary;
          if (typeof candidate === 'string' && candidate.trim()) primary = candidate.trim();
        } catch {
          // Not a valid brand.json (e.g. a non-brand "Create"d system) — no logo.
        }
      }
      setSrc(primary ? projectRawUrl(projectId, primary) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return src;
}

// Row thumbnail. Prefer the system's real logo (resolved from the backing
// project's brand.json), then a site favicon (captured source URL, reference
// brand, or curated official-preset domain), falling back to the palette stripe
// when neither resolves. The palette also holds the slot while a user system's
// logo is still loading, so the thumbnail never flashes a broken image first.
function SystemRowLogo({ system }: { system: DesignSystemSummary }) {
  const host = designSystemLogoHost(system);
  const projectLogo = useProjectLogoSrc(isUserSystem(system) ? system.projectId : undefined);

  // Candidate srcs in priority order, skipping empties; `onError` advances to
  // the next, and exhausting them collapses to the palette stripe.
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (typeof projectLogo === 'string') list.push(projectLogo);
    if (host) list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`);
    return list;
  }, [projectLogo, host]);

  const [failedCount, setFailedCount] = useState(0);
  useEffect(() => setFailedCount(0), [candidates]);

  const resolving = projectLogo === undefined;
  const src = !resolving && failedCount < candidates.length ? candidates[failedCount] : null;

  if (!src) return <SystemRowPaletteLogo system={system} />;
  return (
    <img
      className={styles.itemLogo}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedCount((n) => n + 1)}
    />
  );
}

function SystemRow({ system, active, isDefault, subtitle, statusLabel, onSelect }: SystemRowProps) {
  const { t } = useI18n();
  const status = system.status ?? 'draft';
  const isUser = isUserSystem(system);
  return (
    <button
      type="button"
      data-testid={`design-system-card-${system.id}`}
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className={styles.itemThumb}>
        <SystemRowLogo system={system} />
      </span>
      <span className={styles.itemMeta}>
        <span className={styles.itemNameRow}>
          <span className={styles.itemName}>{system.title}</span>
          {isDefault ? <span className={styles.badgeDefault}>{t('dsManager.badgeDefault')}</span> : null}
        </span>
        <span className={styles.itemSub}>{subtitle}</span>
      </span>
      {isUser ? (
        <span
          className={`${styles.statusDot} ${status === 'published' ? styles.statusDotPublished : styles.statusDotDraft}`}
          title={statusLabel}
          aria-label={statusLabel}
        />
      ) : null}
    </button>
  );
}

interface DetailProps {
  system: DesignSystemSummary;
  isDefault: boolean;
  busy: boolean;
  actionBusy: DesignSystemActionKind | null;
  t: ReturnType<typeof useI18n>['t'];
  onEdit?: (system: DesignSystemSummary) => void;
  onMakeDefault: (system: DesignSystemSummary) => void;
  onTogglePublished: (system: DesignSystemSummary) => void | Promise<void>;
  onDelete: (system: DesignSystemSummary) => void | Promise<void>;
  onSystemsRefresh?: () => Promise<void> | void;
  onActionFeedback: (tone: DesignKitActionFeedbackTone, message: string) => void;
}

function DesignSystemDetail({
  system,
  isDefault,
  busy,
  actionBusy,
  t,
  onEdit,
  onMakeDefault,
  onTogglePublished,
  onDelete,
  onSystemsRefresh,
  onActionFeedback,
}: DetailProps) {
  const analytics = useAnalytics();
  const isUser = isUserSystem(system);
  const status = system.status ?? 'draft';
  const published = status === 'published';
  // A built-in preset can always be picked as the global default; a user
  // system must be published first (mirrors the old "Make default" gate).
  const canBeDefault = !isUser || published;

  // The summary lacks the DESIGN.md body + packageInfo the kit needs, so fetch
  // the full detail. The kit view derives every module from brand.json (when a
  // backing project carries one) or the parsed DESIGN.md (presets).
  const [detail, setDetail] = useState<DesignSystemDetail | null>(null);
  const [detailResolved, setDetailResolved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const lastSystemIdRef = useRef<string | null>(null);

  // The design-system project is the single source of truth. Re-read the full
  // detail whenever the selected `system` changes — that covers both a new
  // selection AND the parent refreshing the list after an edit anywhere (e.g.
  // the in-project Design System tab), since `onSystemsRefresh` replaces the
  // summary objects. A same-system refresh updates in place (no loading flash)
  // and bumps `reloadKey` so brand.json-derived modules (logo / images /
  // palette) re-read too.
  useEffect(() => {
    let cancelled = false;
    const isNewSelection = lastSystemIdRef.current !== system.id;
    lastSystemIdRef.current = system.id;
    if (isNewSelection) {
      setDetail(null);
      setDetailResolved(false);
      setDownloadFailed(false);
    } else {
      setReloadKey((k) => k + 1);
    }
    void fetchDesignSystem(system.id).then((d) => {
      if (cancelled) return;
      if (d) setDetail(d);
      setDetailResolved(true);
    }).catch(() => {
      if (!cancelled) setDetailResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [system]);

  const host = designSystemLogoHost(system) || undefined;
  const projectId = detail?.projectId ?? system.projectId;

  // Direct in-panel DS edits (E3 / §3.6). All carry edit_surface=direct_module
  // + artifact_kind=design_system + the DS id so "edit depth" drills down.
  function emitEditClick(
    element: DesignSystemEditClickProps['element'],
    module: DesignSystemEditClickProps['module'],
  ) {
    trackDesignSystemEditClick(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_edit',
      element,
      module,
      edit_surface: 'direct_module',
      artifact_kind: 'design_system',
      design_system_id: system.id,
      project_id: projectId ?? undefined,
    });
  }
  const { kit } = useDesignKit({
    designSystemId: system.id,
    title: system.title,
    projectId,
    body: detail?.body,
    packageInfo: detail?.packageInfo,
    swatches: system.swatches,
    showcaseHtml: null,
    // Read-only is enforced by withholding the edit handlers below — not by
    // this flag. Keep user systems "editable" so their kit renders live from
    // the project (the SSOT / latest) rather than a stale published snapshot.
    editable: isUser,
    host,
    reloadKey,
  });

  async function handleDownload() {
    if (downloading) return;
    emitEditClick('download', 'general');
    setDownloading(true);
    setDownloadFailed(false);
    onActionFeedback('loading', t('dsManager.downloadTitle'));
    try {
      const ok =
        await downloadDesignSystemArchive({
          designSystemId: system.id,
          fallbackTitle: system.title,
        }) || (projectId
          ? await downloadProjectArchive({ projectId, fallbackTitle: system.title })
          : false);
      setDownloadFailed(!ok);
      onActionFeedback(ok ? 'success' : 'error', ok ? t('ds.actionDone') : t('dsManager.downloadFailed'));
    } catch {
      setDownloadFailed(true);
      onActionFeedback('error', t('dsManager.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  }

  const badgeSlot = isDefault ? (
    <span className={styles.badgeDefault}>{t('dsManager.badgeDefault')}</span>
  ) : null;

  // Keep only the two primary actions on the bar — "Edit with agent" and the
  // publish toggle — and tuck the secondary actions (download / make-default /
  // delete) into a single ⋯ overflow so the toolbar reads clean (issue #5).
  const overflowActions: HeaderMenuAction[] = [
    ...(isUser
      ? [{
          id: 'download',
          label: t('dsManager.downloadTitle'),
          icon: 'download' as const,
          onClick: () => void handleDownload(),
          disabled: busy || downloading,
          loading: downloading,
        }]
      : []),
    ...(canBeDefault && !isDefault
      ? [{
          id: 'make-default',
          label: t('dsManager.makeDefault'),
          icon: 'star' as const,
          onClick: () => onMakeDefault(system),
          disabled: busy,
          loading: actionBusy === 'default',
        }]
      : []),
    ...(isUser
      ? [{
          id: 'delete',
          label: t('dsManager.deleteSystemAria', { title: system.title }),
          icon: 'trash' as const,
          onClick: () => void onDelete(system),
          disabled: busy,
          loading: actionBusy === 'delete',
        }]
      : []),
  ];

  const actionsSlot = (
    <>
      {isUser && onEdit ? (
        <Button
          variant="primary"
          className={styles.actionButton}
          onClick={() => {
            emitEditClick('edit_with_agent', 'general');
            onEdit(system);
          }}
          disabled={busy}
          aria-busy={actionBusy === 'edit' || undefined}
          title={t('dsManager.openSystemAria', { title: system.title })}
        >
          <Icon name={actionBusy === 'edit' ? 'spinner' : 'sparkles'} />
          {t('dsManager.editWithAgent')}
        </Button>
      ) : null}
      {isUser ? (
        <button
          type="button"
          className={`${styles.statusToggle} ${published ? styles.statusToggleOn : ''}`}
          aria-pressed={published}
          aria-busy={actionBusy === 'publish' || undefined}
          onClick={() => void onTogglePublished(system)}
          disabled={busy}
        >
          {actionBusy === 'publish' ? <Icon name="spinner" size={13} className={styles.statusToggleSpinner} /> : null}
          <span>{published ? t('dsManager.statusPublished') : t('dsManager.statusDraft')}</span>
          <span className={styles.statusToggleTrack} aria-hidden />
        </button>
      ) : null}
      {overflowActions.length > 0 ? (
        <HeaderActionsMenu groups={[overflowActions]} label={t('designs.menuMore')} />
      ) : null}
    </>
  );

  return (
    <div className={styles.detail} data-testid={`design-system-detail-${system.id}`}>
      {kit ? (
        <DesignKitView
          kit={kit}
          badgeSlot={badgeSlot}
          actionsSlot={actionsSlot}
          showCover={false}
          onEditClick={emitEditClick}
          noticeSlot={
            downloadFailed ? (
              <div className={styles.missingProjectNotice}>{t('dsManager.downloadFailed')}</div>
            ) : null
          }
          dataTestId={`design-kit-view-${system.id}`}
        />
      ) : (
        <DesignSystemDetailSkeleton
          label={detailResolved ? t('common.loading') : t('designSystemPicker.loadingPreview')}
          dataTestId={`design-system-detail-loading-${system.id}`}
        />
      )}
    </div>
  );
}

function DesignSystemDetailSkeleton({
  label,
  dataTestId,
}: {
  label: string;
  dataTestId: string;
}) {
  return (
    <div
      className={`${styles.detail} ${styles.detailSkeleton}`}
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid={dataTestId}
    >
      <header className={styles.skeletonHeader}>
        <div className={styles.skeletonHeaderCopy}>
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonHeroTitle}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonHeroSub}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonHeroMeta}`} />
        </div>
        <div className={styles.skeletonActions} aria-hidden>
          <SkeletonBlock className={styles.skeletonActionPrimary} />
          <SkeletonBlock className={styles.skeletonActionToggle} />
          <SkeletonBlock className={styles.skeletonActionIcon} />
        </div>
      </header>

      <section className={styles.skeletonModule}>
        <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonModuleKicker}`} />
        <div className={styles.skeletonParagraph}>
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLine}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLine}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLineShort}`} />
          <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonParagraphLine}`} />
        </div>
      </section>

      <section className={styles.skeletonLogoModule}>
        <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonModuleKicker}`} />
        <div className={styles.skeletonLogoStage}>
          <SkeletonBlock className={styles.skeletonLogoMark} />
          <div className={styles.skeletonLogoText}>
            <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonLogoWord}`} />
            <SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonLogoCaption}`} />
          </div>
        </div>
        <div className={styles.skeletonThumbRow} aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonBlock
              key={index}
              className={`${styles.skeletonLogoThumb} ${index === 0 ? styles.skeletonLogoThumbActive : ''}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ComingSoon({
  title,
  body,
  comingSoonLabel,
}: {
  title: string;
  body: string;
  comingSoonLabel: string;
}) {
  return (
    <div className={styles.previewEmpty}>
      <span className={styles.comingSoonBadge}>{comingSoonLabel}</span>
      <p className={styles.previewEmptyTitle}>{title}</p>
      <p className={styles.previewEmptyText}>{body}</p>
    </div>
  );
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
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
