import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemsTemplatesModalClick,
  trackDesignSystemsTemplatesModalSharePopoverClick,
  trackDesignSystemsTemplatesModalSurfaceView,
} from '../analytics/events';
import { useI18n } from '../i18n';
import {
  localizeDesignSystemCategory,
  localizeDesignSystemSummary,
} from '../i18n/content';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../providers/registry';
import type { DesignSystemDetail, DesignSystemSummary } from '../types';
import { DesignSpecView } from './DesignSpecView';
import { DesignSystemKitPreview } from './DesignSystemKitPreview';
import { isUserSystem } from './design-system-metadata';
import { Icon } from './Icon';
import { PreviewModal } from './PreviewModal';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
  initialViewId?: 'showcase' | 'kit' | 'tokens';
  designSystems?: DesignSystemSummary[];
  selectedId?: string | null;
  onUseSystem?: (id: string) => void;
}

function isDesignSystemDetail(system: DesignSystemSummary): system is DesignSystemDetail {
  return typeof (system as { body?: unknown }).body === 'string';
}

// Full DS preview: keep the brand-kit-style module stack as the default view,
// while retaining the lazy showcase/tokens tabs and DESIGN.md side panel from
// the richer modal flow.
export function DesignSystemPreviewModal({
  system,
  onClose,
  initialViewId = 'kit',
  designSystems,
  selectedId,
  onUseSystem,
}: Props) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();
  const [activeSystem, setActiveSystem] = useState<DesignSystemSummary>(system);
  const [navQuery, setNavQuery] = useState('');
  const activeSystemIdRef = useRef(system.id);
  const initialViewIdRef = useRef<string | null>(null);
  const surfaceViewFiredRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveSystem(system);
  }, [system]);

  useEffect(() => {
    activeSystemIdRef.current = activeSystem.id;
  }, [activeSystem.id]);

  useEffect(() => {
    if (surfaceViewFiredRef.current === activeSystem.id) return;
    surfaceViewFiredRef.current = activeSystem.id;
    trackDesignSystemsTemplatesModalSurfaceView(analytics.track, {
      page_name: 'design_systems',
      area: 'templates_modal',
      templates_id: activeSystem.id,
      templates_type: activeSystem.source ?? 'library',
    });
  }, [analytics.track, activeSystem.id, activeSystem.source]);

  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);
  const [detail, setDetail] = useState<DesignSystemDetail | null | undefined>(
    () => (isDesignSystemDetail(system) ? system : undefined),
  );
  const detailBody = detail?.body ?? (
    isDesignSystemDetail(activeSystem) ? activeSystem.body : undefined
  );

  useEffect(() => {
    let cancelled = false;
    const systemId = activeSystem.id;
    setDetail(isDesignSystemDetail(activeSystem) ? activeSystem : undefined);
    void fetchDesignSystem(systemId).then((next) => {
      if (cancelled || activeSystemIdRef.current !== systemId) return;
      if (next) setDetail(next);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSystem]);

  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
  }, [activeSystem.id]);

  const availableSystems = useMemo(() => {
    if (!designSystems || designSystems.length === 0) return [];
    const byId = new Map<string, DesignSystemSummary>();
    for (const item of designSystems) byId.set(item.id, item);
    if (!byId.has(activeSystem.id)) byId.set(activeSystem.id, activeSystem);
    return Array.from(byId.values());
  }, [activeSystem, designSystems]);

  const filteredSystems = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return availableSystems;
    return availableSystems.filter((item) => {
      const localizedSummary = localizeDesignSystemSummary(locale, item);
      const localizedCategory = localizeDesignSystemCategory(locale, item.category);
      const haystack = [
        item.title,
        item.category,
        item.summary,
        localizedCategory,
        localizedSummary,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [availableSystems, locale, navQuery]);

  const { userSystems, officialSystems } = useMemo(() => {
    const mine: DesignSystemSummary[] = [];
    const official: DesignSystemSummary[] = [];
    for (const item of filteredSystems) (isUserSystem(item) ? mine : official).push(item);
    return { userSystems: mine, officialSystems: official };
  }, [filteredSystems]);

  const previewSystem = useCallback((next: DesignSystemSummary) => {
    if (next.id === activeSystemIdRef.current) return;
    activeSystemIdRef.current = next.id;
    initialViewIdRef.current = null;
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
    setDetail(isDesignSystemDetail(next) ? next : undefined);
    setActiveSystem(next);
  }, []);

  const handleView = useCallback(
    (viewId: string) => {
      if (initialViewIdRef.current === null) {
        initialViewIdRef.current = viewId;
      } else if (initialViewIdRef.current !== viewId) {
        initialViewIdRef.current = viewId;
        if (viewId === 'showcase' || viewId === 'kit' || viewId === 'tokens') {
          trackDesignSystemsTemplatesModalClick(analytics.track, {
            page_name: 'design_systems',
            area: 'templates_modal',
            element: viewId === 'kit' ? 'open_design_set' : viewId,
            templates_id: activeSystem.id,
            templates_type: activeSystem.source ?? 'library',
          });
        }
      }
      if (viewId === 'showcase' && showcaseHtml === undefined) {
        const systemId = activeSystem.id;
        setShowcaseHtml(null);
        void fetchDesignSystemShowcase(systemId).then((html) => {
          if (activeSystemIdRef.current === systemId) setShowcaseHtml(html);
        });
      }
      if (viewId === 'tokens' && tokensHtml === undefined) {
        const systemId = activeSystem.id;
        setTokensHtml(null);
        void fetchDesignSystemPreview(systemId).then((html) => {
          if (activeSystemIdRef.current === systemId) setTokensHtml(html);
        });
      }
    },
    [
      analytics.track,
      activeSystem.id,
      activeSystem.source,
      showcaseHtml,
      tokensHtml,
    ],
  );

  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open || specBody !== undefined) return;
      if (detailBody !== undefined) {
        setSpecBody(detailBody);
        return;
      }
      setSpecBody(null);
      const systemId = activeSystem.id;
      void fetchDesignSystem(systemId).then((detail) => {
        if (activeSystemIdRef.current === systemId) {
          setSpecBody(detail?.body ?? null);
        }
      });
    },
    [activeSystem.id, detailBody, specBody],
  );

  const renderNavigationGroup = (label: string, items: DesignSystemSummary[]) => {
    if (items.length === 0) return null;
    return (
      <>
        <div className="ds-preview-system-nav__group" role="presentation">
          {label}
        </div>
        {items.map((item) => {
          const active = item.id === activeSystem.id;
          const selected = item.id === selectedId;
          const meta =
            localizeDesignSystemCategory(locale, item.category) ||
            localizeDesignSystemSummary(locale, item);
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`ds-preview-system-nav__option${active ? ' is-active' : ''}${
                selected ? ' is-selected' : ''
              }`}
              onClick={() => previewSystem(item)}
            >
              <span className="ds-preview-system-nav__option-copy">
                <span className="ds-preview-system-nav__option-title">{item.title}</span>
                {meta ? (
                  <span className="ds-preview-system-nav__option-meta">{meta}</span>
                ) : null}
              </span>
              {selected ? (
                <span
                  className="ds-preview-system-nav__option-check"
                  aria-label={t('common.selected')}
                >
                  <Icon name="check" size={13} strokeWidth={2} />
                </span>
              ) : null}
            </button>
          );
        })}
      </>
    );
  };

  const navigation = availableSystems.length > 1 ? (
    <div className="ds-preview-system-nav" data-testid="design-system-preview-nav">
      <div className="ds-preview-system-nav__search">
        <Icon name="search" size={13} />
        <input
          type="text"
          value={navQuery}
          onChange={(event) => setNavQuery(event.target.value)}
          placeholder={t('designSystemPicker.searchCompactPlaceholder')}
          aria-label={t('designSystemPicker.searchCompactPlaceholder')}
        />
        {navQuery ? (
          <button
            type="button"
            className="ds-preview-system-nav__clear"
            aria-label={t('common.clear')}
            onClick={() => setNavQuery('')}
          >
            <Icon name="close" size={12} />
          </button>
        ) : null}
      </div>
      <div
        className="ds-preview-system-nav__list"
        role="listbox"
        aria-label={t('dsManager.areaAria')}
      >
        {renderNavigationGroup(t('dsManager.yourSystems'), userSystems)}
        {renderNavigationGroup(t('dsManager.officialPresets'), officialSystems)}
        {filteredSystems.length === 0 ? (
          <div className="ds-preview-system-nav__empty">
            {t('designSystemPicker.empty')}
          </div>
        ) : null}
      </div>
    </div>
  ) : undefined;

  const modal = (
    <PreviewModal
      title={activeSystem.title}
      subtitle={activeSystem.summary || activeSystem.category}
      views={[
        {
          id: 'kit',
          label: t('ds.kitVisualize'),
          custom: (
            <DesignSystemKitPreview
              system={activeSystem}
              variant="panel"
              showCover={false}
              className="ds-modal-kit-preview"
              dataTestId="design-system-modal-kit"
            />
          ),
        },
        { id: 'showcase', label: t('ds.showcase'), html: showcaseHtml },
        { id: 'tokens', label: t('ds.tokens'), html: tokensHtml },
      ]}
      initialViewId={initialViewId}
      onView={handleView}
      exportTitleFor={(viewId) => (
        viewId === 'kit' ? activeSystem.title : `${activeSystem.title} - ${viewId}`
      )}
      onClose={onClose}
      navigation={navigation}
      hideSidebarToggle="always"
      shareTriggerVariant="icon"
      primaryAction={onUseSystem ? {
        label: t('designSystemPicker.useCurrent'),
        onClick: () => {
          onUseSystem(activeSystem.id);
          onClose();
        },
        testId: 'design-system-preview-use',
        className: 'ds-modal-primary-action--trailing',
      } : undefined}
      onFullscreenClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'fullscreen',
          templates_id: activeSystem.id,
          templates_type: activeSystem.source ?? 'library',
        })
      }
      onShareClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'share',
          templates_id: activeSystem.id,
          templates_type: activeSystem.source ?? 'library',
        })
      }
      onSidebarToggleClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'design_md',
          templates_id: activeSystem.id,
          templates_type: activeSystem.source ?? 'library',
        })
      }
      onSharePopoverItemClick={(item) =>
        trackDesignSystemsTemplatesModalSharePopoverClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal_share_popover',
          element: item,
          templates_id: activeSystem.id,
          templates_type: activeSystem.source ?? 'library',
        })
      }
      sidebar={{
        label: t('ds.specToggle'),
        header: t('ds.specToggle'),
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        contentKey: activeSystem.id,
        className: 'ds-modal-sidebar--design-spec',
        content: (
          <DesignSpecView
            source={specBody}
            loadingLabel={t('ds.specLoading')}
          />
        ),
      }}
    />
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
