import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnalytics } from '../analytics/provider';
import {
  trackDesignSystemsTemplatesModalClick,
  trackDesignSystemsTemplatesModalSharePopoverClick,
  trackDesignSystemsTemplatesModalSurfaceView,
} from '../analytics/events';
import { useT } from '../i18n';
import {
  fetchDesignSystem,
  fetchDesignSystemPreview,
  fetchDesignSystemShowcase,
} from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import { DesignSpecView } from './DesignSpecView';
import { PreviewModal } from './PreviewModal';

interface Props {
  system: DesignSystemSummary;
  onClose: () => void;
}

// Two-tab DS preview: a complete Showcase webpage rendered from the system's
// tokens, and the original Tokens view (palette / typography / components +
// rendered DESIGN.md prose). A toggleable side panel surfaces the raw
// DESIGN.md so users can compare spec to render at the same time, mirroring
// the styles.refero.design layout.
export function DesignSystemPreviewModal({ system, onClose }: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const surfaceViewFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (surfaceViewFiredRef.current === system.id) return;
    surfaceViewFiredRef.current = system.id;
    trackDesignSystemsTemplatesModalSurfaceView(analytics.track, {
      page_name: 'design_systems',
      area: 'templates_modal',
      templates_id: system.id,
      templates_type: system.source ?? 'library',
    });
  }, [analytics.track, system.id, system.source]);
  const [showcaseHtml, setShowcaseHtml] = useState<string | null | undefined>(undefined);
  const [tokensHtml, setTokensHtml] = useState<string | null | undefined>(undefined);
  const [specBody, setSpecBody] = useState<string | null | undefined>(undefined);

  // Lazy-load each view on first reveal. Both endpoints are cheap, but this
  // keeps the network panel quiet when the user only opens one tab.
  // Also emits a templates_modal ui_click for showcase / tokens tab changes.
  const initialViewIdRef = useRef<string | null>(null);
  const handleView = useCallback(
    (viewId: string) => {
      // The first call comes from PreviewModal's mount with the initial
      // view id; that's a surface_view, not a click. Skip the click
      // tracking for the very first invocation and only emit on real
      // user-driven tab changes.
      if (initialViewIdRef.current === null) {
        initialViewIdRef.current = viewId;
      } else if (initialViewIdRef.current !== viewId) {
        initialViewIdRef.current = viewId;
        if (viewId === 'showcase' || viewId === 'tokens') {
          trackDesignSystemsTemplatesModalClick(analytics.track, {
            page_name: 'design_systems',
            area: 'templates_modal',
            element: viewId,
            templates_id: system.id,
            templates_type: system.source ?? 'library',
          });
        }
      }
      if (viewId === 'showcase' && showcaseHtml === undefined) {
        setShowcaseHtml(null);
        void fetchDesignSystemShowcase(system.id).then((html) => setShowcaseHtml(html));
      }
      if (viewId === 'tokens' && tokensHtml === undefined) {
        setTokensHtml(null);
        void fetchDesignSystemPreview(system.id).then((html) => setTokensHtml(html));
      }
    },
    [analytics.track, system.id, system.source, showcaseHtml, tokensHtml],
  );

  // Fetch DESIGN.md the first time the side panel opens. Once we have it we
  // never re-fetch unless the underlying system swaps.
  const handleSidebarToggle = useCallback(
    (open: boolean) => {
      if (!open || specBody !== undefined) return;
      setSpecBody(null);
      void fetchDesignSystem(system.id).then((detail) =>
        setSpecBody(detail?.body ?? null),
      );
    },
    [system.id, specBody],
  );

  // If the system swaps under us (rare but possible), wipe all caches.
  useEffect(() => {
    setShowcaseHtml(undefined);
    setTokensHtml(undefined);
    setSpecBody(undefined);
  }, [system.id]);

  const detail = (
    <PreviewModal
      title={system.title}
      subtitle={system.summary || system.category}
      views={[
        { id: 'showcase', label: t('ds.showcase'), html: showcaseHtml },
        { id: 'tokens', label: t('ds.tokens'), html: tokensHtml },
      ]}
      initialViewId="showcase"
      onView={handleView}
      exportTitleFor={(viewId) => `${system.title} — ${viewId}`}
      onClose={onClose}
      onFullscreenClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'fullscreen',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onShareClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'share',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onSidebarToggleClick={() =>
        trackDesignSystemsTemplatesModalClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal',
          element: 'design_md',
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      onSharePopoverItemClick={(item) =>
        trackDesignSystemsTemplatesModalSharePopoverClick(analytics.track, {
          page_name: 'design_systems',
          area: 'templates_modal_share_popover',
          element: item,
          templates_id: system.id,
          templates_type: system.source ?? 'library',
        })
      }
      sidebar={{
        label: t('ds.specToggle'),
        defaultOpen: true,
        onToggle: handleSidebarToggle,
        // Re-fire onToggle when the system swaps under us so the new
        // DESIGN.md fetch starts even if the sidebar never closed.
        contentKey: system.id,
        content: (
          <DesignSpecView
            source={specBody}
            loadingLabel={t('ds.specLoading')}
          />
        ),
      }}
    />
  );

  if (typeof document === 'undefined') return detail;
  return createPortal(detail, document.body);
}
