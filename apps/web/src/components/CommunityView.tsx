import { Icon, type IconName } from './Icon';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { InstalledPluginRecord, ProjectKind } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { listPlugins } from '../state/projects';
import {
  buildCommunityTemplates,
  COMMUNITY_TAB_TYPES,
  isPromptArtifact,
  TEMPLATE_TYPE_LABEL_KEY,
  TEMPLATE_TYPE_ORDER,
  type TemplateDemo,
  type TemplateType,
} from './CommunityTemplatePreview';
import { MediaSurface } from './plugins-home/cards/MediaSurface';
import { canDuplicatePluginPreview } from './plugins-home/duplicate';
import { PluginDetailsModal } from './PluginDetailsModal';
import type { PluginUseAction } from './plugins-home/useActions';
import { useInView } from './plugins-home/useInView';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import { useAnalytics } from '../analytics/provider';
import { trackCommunityTemplateClick, trackPageView } from '../analytics/events';
import { workspaceAnalyticsDimensions } from '../analytics/workspace';

export interface CommunityTemplateUseTarget {
  templateId: string;
  prompt: string;
  chipId: string;
  projectKind: ProjectKind;
}

const TEMPLATE_HOME_TARGET: Record<TemplateType, Pick<CommunityTemplateUseTarget, 'chipId' | 'projectKind'>> = {
  'Prototype': { chipId: 'prototype', projectKind: 'prototype' },
  'Live Artifact': { chipId: 'live-artifact', projectKind: 'prototype' },
  'Slides': { chipId: 'deck', projectKind: 'deck' },
  // Documents route through the generic scenario under `other` — the same pair
  // the Home `document` chip dispatches (see home-hero/chips.ts).
  'Document': { chipId: 'document', projectKind: 'other' },
  'Image': { chipId: 'image', projectKind: 'image' },
  'Video': { chipId: 'video', projectKind: 'video' },
  'HyperFrames': { chipId: 'hyperframes', projectKind: 'video' },
  'Audio': { chipId: 'audio', projectKind: 'audio' },
};

function templateUseTarget(template: TemplateDemo): CommunityTemplateUseTarget {
  return {
    templateId: template.id,
    prompt: template.prompt,
    ...TEMPLATE_HOME_TARGET[template.type],
  };
}

/** Each tab carries the same icon the home composer's creation-type radial
 *  uses for that artifact kind (see home-hero/chips.ts), so the two surfaces
 *  read as one taxonomy. */
const TEMPLATE_TYPE_ICON: Record<TemplateType, IconName> = {
  'Slides': 'present',
  'Prototype': 'artboard',
  'Document': 'file-text',
  'Live Artifact': 'bar-chart-box',
  'Image': 'image',
  'Video': 'video-ai',
  'HyperFrames': 'orbit',
  'Audio': 'mic',
};

interface CommunityViewProps {
  /** Hand the user into Home with a starting prompt derived from the chosen
   *  template. The `templateId` is threaded through so the destination knows
   *  which card was remixed. */
  onRemixTemplate?: (remix: { templateId: string; prompt: string }) => void;
  /** Send this template's prompt to the home composer input, without
   *  remixing straight into a project. */
  onUsePrompt?: (target: CommunityTemplateUseTarget) => void;
  /** Route this plugin as the Home composer's active driver (the detail
   *  modal's Use split action). Provided by shells that own a Home hand-off
   *  (EntryShell); when absent, Use falls back to seeding the composer with
   *  the template's prompt via `onUsePrompt`. */
  onUsePlugin?: (
    record: InstalledPluginRecord,
    action: PluginUseAction,
    target: CommunityTemplateUseTarget,
  ) => void;
}

/* Types whose artwork has no house format: user-shot photos, avatars, key art,
   vertical clips. They lay out as an uncropped masonry instead of the shared
   16:9 grid (per product: 图片和视频都用瀑布流). Everything else ships one
   ratio and reads better as an even grid. */
const MASONRY_TYPES = new Set<TemplateType>(['Image', 'Video']);

export function CommunityView({ onRemixTemplate, onUsePrompt, onUsePlugin }: CommunityViewProps) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const { context: workspaceContext } = useWorkspaceContext();
  const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  const pageViewRecordedRef = useRef(false);
  useEffect(() => {
    // React StrictMode replays mount effects in development. Keep one
    // Community exposure per mounted view so local validation and production
    // dashboards share the same one-view/one-event contract.
    if (pageViewRecordedRef.current) return;
    pageViewRecordedRef.current = true;
    trackPageView(analytics.track, { page_name: 'community' });
  }, [analytics.track]);
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  // The gallery card opens the FULL plugin details modal (Use split action +
  // Share + close) — the same surface the plugin library uses — while the
  // lightweight footer-Remix preview belongs to the creation page's template
  // chip (飞书 recvqxDuYM6Uxk). Keep the raw record here: the modal renders
  // from `InstalledPluginRecord`, not from the card view-model.
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  // The tab row leads with Prototype, mirroring the Home type row's order, and
  // is fixed rather than derived from the catalogue (see COMMUNITY_TAB_TYPES):
  // a kind with nothing published yet still gets its tab, and shows the empty
  // state instead of silently borrowing the next kind's cards.
  const [activeType, setActiveType] = useState<TemplateType>('Prototype');
  // Whether GET /api/plugins has answered at all. The empty state is keyed on
  // this, not on the grid being empty: before the catalogue lands every tab is
  // empty, and painting "no templates yet" for the length of the fetch would
  // flash on every visit.
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const typeTabsRef = useRef<HTMLDivElement | null>(null);
  // Remix hands off to a fire-and-forget parent callback
  // (`onRemixTemplate` returns void) that kicks off a real POST /api/projects
  // — nothing here observes
  // when it settles. Without a guard, N rapid clicks before the resulting
  // navigation actually leaves this view fired N separate creates,
  // duplicating the project N times ("Community 的模板 remix 点击多次会复制
  // 多次").
  //
  // `remixingId` (state) drives the visible disabled/loading affordance, but
  // state writes are NOT synchronous — `handleTemplateAction` closes over
  // whatever `remixingId` was at the last render, and a burst of clicks that
  // lands before React re-renders (real rapid clicking, or several native
  // click events dispatched inside one tick) all read the same stale
  // (pre-update) value and all pass the `if (remixingId) return` check. A
  // second confirmed-live PR (0b8e31a3e) shipped exactly that state-only
  // guard and rapid-click verification still produced 5 POST /api/projects
  // from 5 clicks. `remixingIdRef` is the actual gate: a plain mutable ref
  // is written synchronously the instant the first click is accepted, so
  // every click in the same burst — including ones whose handler closure
  // predates the next render — sees the lock immediately. Cleared on the
  // success path (navigation away unmounts this view) or by the timeout
  // fallback below, so a card can never get stuck disabled forever.
  const remixingIdRef = useRef<string | null>(null);
  const [remixingId, setRemixingId] = useState<string | null>(null);
  useEffect(() => {
    if (!remixingId) return;
    const timer = window.setTimeout(() => {
      remixingIdRef.current = null;
      setRemixingId(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [remixingId]);
  useEffect(() => {
    let cancelled = false;
    // `listPlugins` resolves to [] on a failed/aborted fetch, so a daemon that
    // is not up yet simply leaves the grid empty instead of throwing.
    void listPlugins().then((rows) => {
      if (cancelled) return;
      setPlugins(rows);
      setCatalogueLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);
  const templates = useMemo(
    () => buildCommunityTemplates(plugins, locale, t, workspaceContext),
    [plugins, locale, t, workspaceContext],
  );
  const pluginById = useMemo(
    () => new Map(plugins.map((record) => [record.id, record])),
    [plugins],
  );
  // Every kind the catalogue carries beyond the four fixed tabs (Live
  // Artifact, Video, HyperFrames, Audio…) stays reachable through the row's
  // 更多 popover — the same tail the Home type row keeps for its overflow — so
  // pinning the inline set to Home's taxonomy never strands a published
  // template. A picked overflow kind is promoted to an inline pill after 图片
  // for as long as it is the active one, so the selection is always visible.
  const extraTypes = TEMPLATE_TYPE_ORDER.filter((type) =>
    !COMMUNITY_TAB_TYPES.includes(type) && templates.some((template) => template.type === type),
  );
  const inlineTypes: TemplateType[] = COMMUNITY_TAB_TYPES.includes(activeType)
    ? [...COMMUNITY_TAB_TYPES]
    : [...COMMUNITY_TAB_TYPES, activeType];
  const popoverTypes = extraTypes.filter((type) => type !== activeType);
  const filteredTemplates = templates.filter((template) => template.type === activeType);
  // Dismiss the 更多 popover on outside press / Escape, the way the Home row does.
  useEffect(() => {
    if (!moreOpen) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (typeTabsRef.current?.contains(event.target as Node)) return;
      setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);
  const pickType = (type: TemplateType) => {
    setMoreOpen(false);
    if (type === activeType) return;
    trackCommunityTemplateClick(analytics.track, {
      page_name: 'community',
      area: 'community_templates',
      element: 'filter',
      filter_type: 'category',
      filter_value: type,
      ...workspaceDimensions,
    });
    setActiveType(type);
  };
  /** One tab pill. It wears the Home type row's pill classes (home-hero.css,
   *  a documented shared contract) so 原型 here and 原型 under the composer
   *  are the same object: same ring, same icon hue keyed on `data-chip`, same
   *  lit state. */
  const typeTab = (type: TemplateType, inPopover: boolean) => {
    const isActive = type === activeType;
    return (
      <button
        key={type}
        type="button"
        className={`home-hero__type-pill${isActive ? ' is-active' : ''}`}
        aria-pressed={isActive}
        data-chip={TEMPLATE_HOME_TARGET[type].chipId}
        data-testid={`community-type-tab-${TEMPLATE_HOME_TARGET[type].chipId}${inPopover ? '-more' : ''}`}
        onClick={() => pickType(type)}
      >
        <Icon name={TEMPLATE_TYPE_ICON[type]} size={14} aria-hidden />
        <span>{t(TEMPLATE_TYPE_LABEL_KEY[type])}</span>
      </button>
    );
  };
  const templateScope = (templateId: string) => {
    const sourceKind = plugins.find((row) => row.id === templateId)?.sourceKind;
    return sourceKind === 'bundled' || sourceKind === 'marketplace' ? 'official' as const : 'personal' as const;
  };
  const handleTemplateAction = (template: TemplateDemo) => {
    // Synchronous check-and-set on the ref: this is what actually decides
    // whether a request goes out. See the remixingIdRef comment above for
    // why the state flag alone cannot gate this.
    if (remixingIdRef.current) return;
    trackCommunityTemplateClick(analytics.track, {
      page_name: 'community',
      area: 'community_templates',
      element: 'remix',
      template_key: template.id,
      template_type: template.type,
      resource_scope: templateScope(template.id),
      ...workspaceDimensions,
    });
    remixingIdRef.current = template.id;
    setRemixingId(template.id);
    onRemixTemplate?.({ templateId: template.id, prompt: template.prompt });
  };
  const handleCardUse = (template: TemplateDemo) => {
    const target = templateUseTarget(template);
    trackCommunityTemplateClick(analytics.track, {
      page_name: 'community',
      area: 'community_templates',
      element: 'use_prompt',
      template_key: template.id,
      template_type: template.type,
      resource_scope: templateScope(template.id),
      ...workspaceDimensions,
    });
    const record = pluginById.get(template.id);
    if (record && onUsePlugin) {
      onUsePlugin(record, 'use-with-query', target);
      return;
    }
    onUsePrompt?.(target);
  };
  const canRemixTemplate = (template: TemplateDemo) => {
    const record = pluginById.get(template.id);
    return !isPromptArtifact(template) && Boolean(record && canDuplicatePluginPreview(record));
  };
  const templateById = useCallback(
    (id: string) => templates.find((template) => template.id === id) ?? null,
    [templates],
  );
  /** Card body → FULL details modal. Templates are a projection of the plugin
   *  catalogue, so the record behind a card is always present in `plugins`. */
  const openTemplateDetails = (template: TemplateDemo) => {
    trackCommunityTemplateClick(analytics.track, {
      page_name: 'community',
      area: 'community_templates',
      element: 'template_detail',
      template_key: template.id,
      template_type: template.type,
      resource_scope: templateScope(template.id),
      ...workspaceDimensions,
    });
    const record = plugins.find((row) => row.id === template.id) ?? null;
    setDetailsRecord(record);
  };
  /** The detail modal's Use split action. Shells that own a Home hand-off
   *  route the plugin as the composer's active driver; without one, fall back
   *  to seeding the composer with the template's prompt (same destination the
   *  card's own Use button uses). */
  const handleDetailsUse = (record: InstalledPluginRecord, action: PluginUseAction) => {
    setDetailsRecord(null);
    const template = templateById(record.id);
    if (!template) return;
    const target = templateUseTarget(template);
    if (onUsePlugin) {
      onUsePlugin(record, action, target);
      return;
    }
    onUsePrompt?.(target);
  };
  /** The detail modal's Remix menu item keeps the EXACT community remix
   *  semantic (create a project seeded with the template prompt), including
   *  the synchronous rapid-click gate in `handleTemplateAction`. */
  const handleDetailsRemix = (record: InstalledPluginRecord) => {
    const template = templateById(record.id);
    if (template) handleTemplateAction(template);
  };

  return (
    <section className="community-template-view" aria-labelledby="community-template-title">
      {/* Header (title + filter row) scrolls away with the grid. The header
          search and the sub-facet pill row are gone: the type tabs are the
          whole filter surface. */}
      <div className="community-template-view__header">
      <header className="community-template-view__hero">
        <div>
          <h1 id="community-template-title" className="entry-section__title">{t('community.title')}</h1>
        </div>
      </header>

      <div className="community-template-view__filters" aria-label={t('community.filtersAria')}>
        <div className="community-template-view__filter-main">
          <div className="community-template-view__type-tabs" ref={typeTabsRef}>
            {inlineTypes.map((type) => typeTab(type, false))}
            {popoverTypes.length > 0 ? (
              <div className="home-hero__type-pills-more">
                <button
                  type="button"
                  className={`home-hero__type-pill home-hero__type-pills-more-btn${moreOpen ? ' is-open' : ''}`}
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                  data-testid="community-type-tabs-more"
                  onClick={() => setMoreOpen((value) => !value)}
                >
                  <span>{t('homeHero.subTypeMore')}</span>
                  <Icon name="chevron-down" size={14} />
                </button>
                {moreOpen ? (
                  <div
                    className="home-hero__type-pills-popover"
                    role="group"
                    aria-label={t('homeHero.subTypeMore')}
                    data-testid="community-type-tabs-popover"
                  >
                    {popoverTypes.map((type) => typeTab(type, true))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </div>

      {/* The layout is per-type: the two media tabs break out of the shared
          16:9 grid into an uncropped masonry (see plugin-marketplace-demo.css).
          The flag, not the type name, is what the stylesheet keys on — which
          types qualify is a product call and belongs here, next to the tab
          state, rather than spread across a dozen selectors. */}
      <div
        className="community-template-grid"
        data-layout={MASONRY_TYPES.has(activeType) ? 'masonry' : undefined}
      >
        {filteredTemplates.map((template) => (
          <article
            key={template.id}
            className="community-template-card is-clickable"
            /* The caption names the template now, so the tile no longer prints
               its type anywhere — this keeps that fact assertable (a tab may
               only grid cards of its own type). */
            data-template-type={template.type}
            onClick={() => openTemplateDetails(template)}
          >
            {/* The plate owns the actions' positioning context: they overlay
                the thumbnail (per product: 按钮的位置在卡片上) but must stay
                OUTSIDE the `aria-hidden` preview, or assistive tech loses two
                real controls. */}
            <div className="community-template-card__plate">
              <div
                className={`community-template-card__preview${template.type === 'Slides' ? ' is-deck' : ''}`}
                style={{ '--template-accent': template.accent } as CSSProperties}
                aria-hidden
              >
                <TemplateThumb template={template} />
              </div>
              <div className="community-template-card__actions">
                {canRemixTemplate(template) ? (
                  <button
                    type="button"
                    disabled={remixingId === template.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleTemplateAction(template);
                    }}
                  >
                    {remixingId === template.id ? (
                      t('common.loading')
                    ) : (
                      <>
                        {/* Icon leads the label on both pills (per product). It
                            is decorative — the label already names the action —
                            so `Icon` renders it aria-hidden. */}
                        <Icon name="remix-loop" size={14} />
                        Remix
                      </>
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="community-template-card__prompt-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCardUse(template);
                  }}
                >
                  <Icon name="make-same" size={14} />
                  {t('community.usePrompt')}
                </button>
              </div>
            </div>
            <footer className="community-template-card__foot">
              <span className="community-template-card__title">{template.title}</span>
              {/* The byline the caption sits on: who published the template,
                  then what it is. Both come out of the catalogue record
                  (`buildCommunityTemplates`) — the view/remix counts this row
                  used to carry alongside them were placeholder numbers with no
                  source behind them, so they stay out until one exists. The
                  initial disc is drawn from the name itself, not a stored
                  avatar. */}
              <span className="community-template-card__byline">
                <span className="community-template-card__avatar" aria-hidden>
                  {template.author.trim().charAt(0).toUpperCase()}
                </span>
                <span className="community-template-card__author">{template.author}</span>
                <span className="community-template-card__meta">{template.meta}</span>
              </span>
            </footer>
          </article>
        ))}
      </div>
      {catalogueLoaded && filteredTemplates.length === 0 ? (
        /* A tab with nothing published yet (Document, until document templates
           ship). The mark is the same blueprint glyph the drafts blank state
           draws, so the two empty pages read as one family. */
        <div className="community-template-view__no-results" data-testid="community-empty-state">
          <p className="community-template-view__no-results-title">
            {t('community.emptyTitle', { type: t(TEMPLATE_TYPE_LABEL_KEY[activeType]) })}
          </p>
          <p>{t('community.emptyBody')}</p>
          <img
            className="community-template-view__no-results-mark"
            src="/community-empty-mark.svg"
            alt=""
            aria-hidden
          />
        </div>
      ) : null}
      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          workspaceContext={workspaceContext}
          onClose={() => setDetailsRecord(null)}
          onUse={handleDetailsUse}
          onDuplicate={handleDetailsRemix}
          isApplying={remixingId === detailsRecord.id}
        />
      ) : null}
    </section>
  );
}

function TemplateThumb({ template }: { template: TemplateDemo }) {
  // Same visibility contract the plugins-home gallery hands MediaSurface (see
  // PreviewSurface.tsx): the wide margin MOUNTS the clip so its first frame is
  // ready before the tile scrolls in and scrolling back never remounts it,
  // while the zero-margin observer gates decode/playback so an idle gallery
  // does not spin up every clip at once.
  const { ref: keepRef, inView: keep } = useInView<HTMLDivElement>({
    rootMargin: '1500px',
    once: false,
  });
  const { ref: visibleRef, inView: visible } = useInView<HTMLDivElement>({
    rootMargin: '0px',
    once: false,
  });
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      keepRef.current = node;
      visibleRef.current = node;
    },
    [keepRef, visibleRef],
  );

  const media = template.cardMedia;
  if (media?.poster) {
    // MediaSurface positions itself against its container, so the thumb owns
    // the positioned box; it also handles poster-load failure on its own.
    return (
      <div className="community-template-thumb__media" ref={setRef}>
        <MediaSurface
          preview={media}
          pluginTitle={template.title}
          inView={keep}
          visible={visible}
        />
      </div>
    );
  }

  return (
    <div className={`community-template-thumb community-template-thumb--${template.type.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="community-template-thumb__paper">
        <span className="community-template-thumb__line is-primary" />
        <strong>{template.title.split(' ')[0]}</strong>
        <span className="community-template-thumb__line is-short" />
        <div className="community-template-thumb__grid">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
