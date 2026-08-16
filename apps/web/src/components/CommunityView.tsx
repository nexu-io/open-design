import { Icon, type IconName } from './Icon';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { InstalledPluginRecord, ProjectKind } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { listPlugins } from '../state/projects';
import {
  buildCommunityTemplates,
  copyTemplatePrompt,
  isPromptArtifact,
  templateActionLabel,
  TEMPLATE_TYPE_LABEL_KEY,
  TEMPLATE_TYPE_ORDER,
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
  const [activeType, setActiveType] = useState<TemplateType>('Slides');
  const [activeSubtype, setActiveSubtype] = useState('All');
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
    let cancelled = false;
    // `listPlugins` resolves to [] on a failed/aborted fetch, so a daemon that
    // is not up yet simply leaves the grid empty instead of throwing.
    void listPlugins().then((rows) => {
      if (!cancelled) setPlugins(rows);
    });
    return () => { cancelled = true; };
  }, []);
  const templates = useMemo(
    () => buildCommunityTemplates(plugins, locale, t, workspaceContext),
    [plugins, locale, t, workspaceContext],
  );
  const typeOptions = TEMPLATE_TYPE_ORDER.filter((type) =>
    templates.some((template) => template.type === type),
  );
  const subtypeOptions = Array.from(new Set(
    templates
      .filter((template) => template.type === activeType && template.subtype)
      .map((template) => template.subtype),
  ));
  const filteredTemplates = templates.filter((template) => {
    const typeMatches = template.type === activeType;
    const subtypeMatches = activeSubtype === 'All' || template.subtype === activeSubtype;
    return typeMatches && subtypeMatches;
  });
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
    <section className="community-template-view" aria-labelledby="community-template-title">
      {/* Header (title + search + filter rows) scrolls away with the grid. */}
      <div className="community-template-view__header">
      <header className="community-template-view__hero">
        <div>
          <h1 id="community-template-title" className="entry-section__title">{t('community.title')}</h1>
        </div>
        <div className="community-template-view__search" role="search">
          <Icon name="search" size={16} />
          <input type="search" placeholder={t('community.searchPlaceholder')} aria-label={t('community.searchAria')} readOnly />
        </div>
      </header>

      <div className="community-template-view__filters" aria-label={t('community.filtersAria')}>
        <div className="community-template-view__filter-main">
          <div className="community-template-view__type-tabs">
            {typeOptions.map((type) => (
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
                  setActiveSubtype('All');
                }}
              >
                <Icon name={TEMPLATE_TYPE_ICON[type]} size={16} aria-hidden />
                <span>{t(TEMPLATE_TYPE_LABEL_KEY[type])}</span>
              </button>
            ))}
          </div>
        </div>
        {subtypeOptions.length > 0 ? (
          <div className="community-template-view__subtabs">
            <button
              type="button"
              className={activeSubtype === 'All' ? 'is-active' : ''}
              onClick={() => {
                trackCommunityTemplateClick(analytics.track, {
                  page_name: 'community',
                  area: 'community_templates',
                  element: 'filter',
                  filter_type: 'subtype',
                  filter_value: 'all',
                  ...workspaceDimensions,
                });
                setActiveSubtype('All');
              }}
            >
              {t('common.all')}
            </button>
            {subtypeOptions.map((subtype) => (
              <button
                key={subtype}
                type="button"
                className={activeSubtype === subtype ? 'is-active' : ''}
                onClick={() => {
                  trackCommunityTemplateClick(analytics.track, {
                    page_name: 'community',
                    area: 'community_templates',
                    element: 'filter',
                    filter_type: 'subtype',
                    filter_value: subtype,
                    ...workspaceDimensions,
                  });
                  setActiveSubtype(subtype);
                }}
              >
                {subtype}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      </div>

      <div className="community-template-grid">
        {filteredTemplates.map((template) => (
          <article
            key={template.id}
            className="community-template-card is-clickable"
            onClick={() => openTemplateDetails(template)}
          >
            <div
              className="community-template-card__preview"
              style={{ '--template-accent': template.accent } as CSSProperties}
              aria-hidden
            >
              <TemplateThumb template={template} />
            </div>
            <footer className="community-template-card__foot">
              <span>{template.meta}</span>
              <div className="community-template-card__actions">
                <button
                  type="button"
                  disabled={remixingId === template.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleTemplateAction(template);
                  }}
                >
                  {remixingId === template.id ? t('common.loading') : templateActionLabel(template)}
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
                  {t('community.usePrompt')}
                </button>
              </div>
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
