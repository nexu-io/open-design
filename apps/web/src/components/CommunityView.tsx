import { Icon, type IconName } from './Icon';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { InstalledPluginRecord, ProjectKind } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { listPlugins } from '../state/projects';
import {
  buildCommunityTemplates,
  COMMUNITY_TAB_TYPES,
  copyTemplatePrompt,
  isPromptArtifact,
  templateActionLabel,
  TEMPLATE_TYPE_LABEL_KEY,
  type TemplateDemo,
  type TemplateType,
} from './CommunityTemplatePreview';
import { MediaSurface } from './plugins-home/cards/MediaSurface';
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

export function communityTypeForChip(chipId: string | null): TemplateType | undefined {
  return COMMUNITY_TAB_TYPES.find((type) => TEMPLATE_HOME_TARGET[type].chipId === chipId);
}

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
  'Prototype': 'pencil-ruler',
  'Document': 'file-text',
  'Live Artifact': 'bar-chart-box',
  'Image': 'image',
  'Video': 'video-ai',
  'HyperFrames': 'orbit',
  'Audio': 'mic',
};

interface CommunityViewProps {
  /** Home embeds the same gallery, with its composer owning the type. */
  selectedType?: TemplateType;
  contentOnly?: boolean;
  catalog?: InstalledPluginRecord[];
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
  /** The output type the gallery is filtered to, reported on mount and on every
   *  tab change. A shell that hosts a composer alongside this view (EntryShell's
   *  docked one) binds it as the composer's create type, so 原型 in the tabs and
   *  原型 in the composer are never out of step. `chipId`/`projectKind` are the
   *  same pair a template's Use hands over. */
  onActiveTypeChange?: (target: { chipId: string; projectKind: ProjectKind }) => void;
  /** Raised whenever the gallery's tab selection changes — the type row AND the
   *  category row. A shell hosting a composer under this view folds it back to
   *  its collapsed default (per product: tab 之间的切换的时候这个输入框默认是收起
   *  来的): the grid the bar sits over has become a different grid. Separate
   *  from `onActiveTypeChange`, which is a binding and only tracks the type. */
  onTabsChange?: () => void;
}

/* Types whose artwork has no house format: user-shot photos, avatars, key art,
   vertical clips. They lay out as an uncropped masonry instead of the shared
   16:9 grid (per product: 图片和视频都用瀑布流). Everything else ships one
   ratio and reads better as an even grid. */
const MASONRY_TYPES = new Set<TemplateType>(['Image', 'Video']);

export function CommunityView({
  selectedType,
  contentOnly = false,
  catalog,
  onRemixTemplate,
  onUsePrompt,
  onUsePlugin,
  onActiveTypeChange,
  onTabsChange,
}: CommunityViewProps) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const { context: workspaceContext } = useWorkspaceContext();
  const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
  const pageViewRecordedRef = useRef(false);
  useEffect(() => {
    // React StrictMode replays mount effects in development. Keep one
    // Community exposure per mounted view so local validation and production
    // dashboards share the same one-view/one-event contract.
    if (contentOnly || pageViewRecordedRef.current) return;
    pageViewRecordedRef.current = true;
    trackPageView(analytics.track, { page_name: 'community' });
  }, [analytics.track, contentOnly]);
  const [loadedPlugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const plugins = catalog ?? loadedPlugins;
  // The gallery card opens the FULL plugin details modal (Use split action +
  // Share + close) — the same surface the plugin library uses — while the
  // lightweight footer-Remix preview belongs to the creation page's template
  // chip (飞书 recvqxDuYM6Uxk). Keep the raw record here: the modal renders
  // from `InstalledPluginRecord`, not from the card view-model.
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  // The tab row leads with Prototype, mirroring the Home type row's order.
  const [tabType, setActiveType] = useState<TemplateType>('Prototype');
  const activeType = selectedType ?? tabType;
  // Mirror the picked type into whatever composer the host has on screen. Runs
  // on mount too: this gallery is ALWAYS filtered to one type (unlike Home,
  // which starts unbound), so the composer should open already carrying it.
  useEffect(() => {
    onActiveTypeChange?.(TEMPLATE_HOME_TARGET[activeType]);
  }, [activeType, onActiveTypeChange]);
  // A shell hosting a composer under this view folds it back to its collapsed
  // default on every tab change (per product: tab 之间的切换的时候这个输入框
  // 默认是收起来的).
  useEffect(() => {
    onTabsChange?.();
  }, [activeType, onTabsChange]);
  // Remix (and the prompt-artifact copy path it shares) hands off to a
  // fire-and-forget parent callback (`onRemixTemplate`/`onUsePrompt` return
  // void) that kicks off a real POST /api/projects — nothing here observes
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
    if (catalog) return;
    let cancelled = false;
    // `listPlugins` resolves to [] on a failed/aborted fetch, so a daemon that
    // is not up yet simply leaves the grid empty instead of throwing.
    void listPlugins().then((rows) => {
      if (!cancelled) setPlugins(rows);
    });
    return () => { cancelled = true; };
  }, [catalog]);
  const templates = useMemo(
    () => buildCommunityTemplates(plugins, locale, t, workspaceContext),
    [plugins, locale, t, workspaceContext],
  );
  const filteredTemplates = templates.filter((template) => template.type === activeType);
  const templateScope = (templateId: string) => {
    const sourceKind = plugins.find((row) => row.id === templateId)?.sourceKind;
    return sourceKind === 'bundled' || sourceKind === 'marketplace' ? 'official' as const : 'personal' as const;
  };
  const handleTemplateAction = (template: TemplateDemo) => {
    if (isPromptArtifact(template)) {
      trackCommunityTemplateClick(analytics.track, {
        page_name: 'community',
        area: 'community_templates',
        element: 'copy_prompt',
        template_key: template.id,
        template_type: template.type,
        resource_scope: templateScope(template.id),
        ...workspaceDimensions,
      });
      void copyTemplatePrompt(template);
      return;
    }
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
   *  card's own prompt button uses). */
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
    <section
      className="community-template-view"
      data-content-only={contentOnly || undefined}
      aria-labelledby={contentOnly ? undefined : 'community-template-title'}
      aria-label={contentOnly ? t('community.title') : undefined}
    >
      {/* Header (title + filter row) scrolls away with the grid. */}
      {contentOnly ? null : (
      <div className="community-template-view__header">
      <header className="community-template-view__hero">
        <div>
          <h1 id="community-template-title" className="entry-section__title">{t('community.title')}</h1>
        </div>
      </header>

      <div className="community-template-view__filters" aria-label={t('community.filtersAria')}>
        <div className="community-template-view__filter-main">
          <div className="community-template-view__type-tabs">
            {COMMUNITY_TAB_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={activeType === type ? 'is-active' : ''}
                onClick={() => {
                  trackCommunityTemplateClick(analytics.track, {
                    page_name: 'community',
                    area: 'community_templates',
                    element: 'filter',
                    filter_type: 'category',
                    filter_value: type,
                    ...workspaceDimensions,
                  });
                  setActiveType(type);
                }}
              >
                <Icon name={TEMPLATE_TYPE_ICON[type]} size={16} aria-hidden />
                <span>{t(TEMPLATE_TYPE_LABEL_KEY[type])}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
      )}

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
                className="community-template-card__preview"
                style={{ '--template-accent': template.accent } as CSSProperties}
                aria-hidden
              >
                <TemplateThumb template={template} />
              </div>
              <div className="community-template-card__actions">
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
                          so `Icon` renders it aria-hidden. The glyph follows
                          the label: this button says Copy prompt for a prompt
                          artifact and Remix for everything else
                          (`templateActionLabel`), and a remix loop over "Copy
                          prompt" named the wrong action. `copy` resolves to
                          Remix's `file-copy-line`. */}
                      <Icon name={isPromptArtifact(template) ? 'copy' : 'remix-loop'} size={14} />
                      {templateActionLabel(template)}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="community-template-card__prompt-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    trackCommunityTemplateClick(analytics.track, {
                      page_name: 'community',
                      area: 'community_templates',
                      element: 'use_prompt',
                      template_key: template.id,
                      template_type: template.type,
                      resource_scope: templateScope(template.id),
                      ...workspaceDimensions,
                    });
                    onUsePrompt?.(templateUseTarget(template));
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

export function TemplateThumb({ template }: { template: TemplateDemo }) {
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
