// Feature-local hook for HtmlViewer's analytics fire-helpers: the toolbar,
// draw-toolbar, header, present-popover, and comment-popover click events,
// plus the share/export click->result funnel (with its loading-toast
// ticker). Pure event-firing side effects — every other, not-yet-extracted
// HtmlViewer cluster (toolbar, deploy, export, comment, draw, present) calls
// through this hook's returned functions as a leaf dependency, so their
// existing call sites keep working unchanged once rewired to the hook.
//
// No transport of its own (no fetch/port), so there is no real substitution
// for `useWiredArtifactAnalytics` to perform today — it exists anyway to
// match the slice's `useX(deps)` / `useWiredX(deps)` shape, so the
// orchestrator can inject a fake in tests the same way it does for every
// other feature hook.
import { useRef, type MutableRefObject } from 'react';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import {
  trackArtifactExportResult,
  trackArtifactHeaderClick,
  trackArtifactToolbarClick,
  trackCommentPopoverClick,
  trackDrawToolbarClick,
  trackPresentPopoverClick,
  trackShareOptionPopoverClick,
} from '../../../analytics/events';
import { exportErrorCode } from '../../../analytics/export-error-code';
import { recordFirstLoopStep } from '../../../onboarding/first-loop';
import type { DrawToolbarElement } from '../../../components/PreviewDrawOverlay';
import type { ExportProgress } from '../../../runtime/exports';
import type { ArtifactExportToast, ArtifactTrackingAnalytics, TranslateFn } from '../types';

export type ArtifactToolbarClickElement =
  | 'reload'
  | 'preview'
  | 'source'
  | 'screenshot'
  | 'tweaks'
  | 'mark'
  | 'comment'
  | 'pods'
  | 'inspect'
  | 'edit'
  | 'zoom_out'
  | 'zoom_level_dropdown'
  | 'zoom_in'
  | 'versions';

export type ArtifactHeaderClickElement =
  | 'back'
  | 'edit'
  | 'present_dropdown'
  | 'download_dropdown'
  | 'share_dropdown'
  | 'settings';

export type ArtifactShareExportFormat =
  | 'pdf'
  | 'pptx'
  | 'zip'
  | 'html'
  | 'image'
  | 'markdown'
  | 'template'
  | 'share_link'
  | 'share_page';

export interface ArtifactAnalyticsDeps {
  projectId: string;
  projectKind: TrackingProjectKind;
  fileName: string;
  fileKind: string | null;
  t: TranslateFn;
  analytics: ArtifactTrackingAnalytics;
  /** Drives the export loading/success/error toast. The toast state itself
   * belongs to the not-yet-extracted export/download cluster (`exportToast`
   * still lives in the orchestrator), so this hook only ever writes through
   * the callback, never owns the value. */
  onExportToast: (toast: ArtifactExportToast | null) => void;
}

export interface ArtifactAnalyticsController {
  /** Latest per-slide capture progress for the programmatic exporters, read
   * by `fireShareExport`'s loading-toast ticker to render elapsed time + ETA. */
  exportProgressRef: MutableRefObject<{ done: number; total: number } | null>;
  /** Shared helper for the share menu: emits `studio_click`(share_option) on
   * entry and `artifact_export_result` on resolution, correlated by one
   * `request_id`. Sync exports report success immediately after the call
   * returns; async exports resolve via `.then`/`.catch`. */
  fireShareExport: (format: ArtifactShareExportFormat, fn: () => Promise<unknown> | unknown) => void;
  /** Feeds per-slide capture progress into `exportProgressRef` (the PDF
   * exporter in `runtime/exports.ts` drives this). */
  onExportProgress: ExportProgress;
  fireArtifactToolbarClick: (element: ArtifactToolbarClickElement, entryFrom?: 'toolbar' | 'more_menu') => void;
  fireDrawToolbarClick: (element: DrawToolbarElement, submitAction?: 'draft' | 'queue' | 'send') => void;
  fireArtifactHeaderClick: (element: ArtifactHeaderClickElement) => void;
  firePresentPopoverClick: (element: 'in_this_tab' | 'fullscreen' | 'new_tab') => void;
  fireCommentPopoverClick: (element: 'save_comment' | 'send_to_chat' | 'add_note') => void;
}

export function useArtifactAnalytics(deps: ArtifactAnalyticsDeps): ArtifactAnalyticsController {
  const { projectId, projectKind, fileName, fileKind, t, analytics, onExportToast } = deps;

  // Latest per-slide capture progress for the programmatic exporters, read by
  // the loading-toast ticker in fireShareExport to render elapsed time + ETA.
  const exportProgressRef = useRef<{ done: number; total: number } | null>(null);

  // Shared helper for the share menu: emit studio_click share_option on
  // entry and artifact_export_result on resolution. Sync exports report
  // success immediately after the call returns; async exports get .then
  // / .catch. The same request_id threads both events so PostHog can
  // stitch click -> result via $insert_id correlation.
  const fireShareExport: ArtifactAnalyticsController['fireShareExport'] = (format, fn) => {
    const requestId = analytics.newRequestId();
    const artifactId = anonymizeArtifactId({ projectId, fileName });
    const artifactKind = artifactKindToTracking({ fileKind });
    const trackingFormat = format;
    trackShareOptionPopoverClick(
      analytics.track,
      {
        page_name: 'artifact',
        area: 'share_option_popover',
        artifact_id: artifactId,
        artifact_kind: artifactKind,
        element: trackingFormat,
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    const started = performance.now();
    const finish = (result: 'success' | 'failed' | 'cancelled', errorCode?: string) => {
      trackArtifactExportResult(
        analytics.track,
        {
          page_name: 'artifact',
          area: 'share_option_popover',
          artifact_id: artifactId,
          artifact_kind: artifactKind,
          project_id: projectId,
          project_kind: projectKind,
          export_format: trackingFormat,
          result,
          ...(errorCode ? { error_code: errorCode } : {}),
          export_duration_ms: Math.round(performance.now() - started),
        },
        { requestId },
      );
      // Onboarding first-loop delivery step (spec S8.3): only a SUCCESSFUL
      // export closes the loop. Project-scoped — a no-op unless the project
      // was started from the Home recommendation.
      if (result === 'success') recordFirstLoopStep(analytics.track, 'delivered', projectId);
    };
    const toastFormats = new Set(['pdf', 'pptx', 'zip', 'html', 'image', 'markdown']);
    // Programmatic exports compute in-browser and can take a while (one
    // render per deck slide), so the loading toast ticks every second with
    // elapsed time and — once at least one slide is captured — a live ETA
    // derived from the average time per completed slide. onExportProgress
    // (passed into the export call by the menu item) feeds slide progress
    // into exportProgressRef.
    exportProgressRef.current = null;
    const startedAt = performance.now();
    let ticker: ReturnType<typeof setInterval> | null = null;
    const renderLoadingToast = () => {
      if (!toastFormats.has(format)) return;
      const elapsedS = Math.max(0, Math.round((performance.now() - startedAt) / 1000));
      const p = exportProgressRef.current;
      let message: string;
      if (p && p.total > 1 && p.done > 0) {
        const remainingS = Math.max(
          1,
          Math.round(((performance.now() - startedAt) / p.done) * (p.total - p.done) / 1000),
        );
        message = t('fileViewer.exportSlideEta', { current: p.done, total: p.total, seconds: remainingS });
      } else if (p && p.total > 1) {
        message = t('fileViewer.exportSlideProgress', { current: p.done, total: p.total });
      } else {
        message = elapsedS > 0
          ? t('fileViewer.exportingElapsed', { seconds: elapsedS })
          : t('fileViewer.exportingProgress');
      }
      onExportToast({ message, tone: 'loading' });
    };
    const stopTicker = () => {
      if (ticker != null) {
        clearInterval(ticker);
        ticker = null;
      }
    };
    if (toastFormats.has(format)) {
      renderLoadingToast();
      ticker = setInterval(renderLoadingToast, 1000);
    }
    const failToast = (err?: unknown) => {
      stopTicker();
      const message = err instanceof Error && err.message ? err.message : t('fileViewer.exportFailed');
      if (toastFormats.has(format)) onExportToast({ message, tone: 'error' });
    };
    try {
      const out = fn();
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        (out as Promise<unknown>).then(
          (result) => {
            stopTicker();
            if (result === 'cancelled') {
              finish('cancelled');
              if (toastFormats.has(format)) onExportToast(null);
              return;
            }
            finish('success');
            if (toastFormats.has(format)) onExportToast({ message: t('fileViewer.exportDone'), tone: 'success' });
          },
          (err) => {
            finish('failed', exportErrorCode(err));
            failToast(err);
          },
        );
      } else {
        stopTicker();
        if (out === 'cancelled') {
          finish('cancelled');
          if (toastFormats.has(format)) onExportToast(null);
          return;
        }
        finish('success');
        if (toastFormats.has(format)) onExportToast({ message: t('fileViewer.exportDone'), tone: 'success' });
      }
    } catch (err) {
      finish('failed', exportErrorCode(err));
      failToast(err);
    }
  };

  // Feeds per-slide capture progress into the ref the loading-toast ticker
  // reads (apps/web/src/runtime/exports.ts drives this for the PDF exporter).
  const onExportProgress: ExportProgress = (done, total) => {
    exportProgressRef.current = { done, total };
  };

  // P0 helpers — keep the artifact_id + artifact_kind derivation in one place
  // so each per-button onClick stays a one-liner. We compute lazily inside
  // the closure because `fileName`/`fileKind` can change as the user
  // navigates tabs without remounting HtmlViewer.
  const fireArtifactToolbarClick: ArtifactAnalyticsController['fireArtifactToolbarClick'] = (element, entryFrom) => {
    trackArtifactToolbarClick(analytics.track, {
      page_name: 'artifact',
      area: 'artifact_toolbar',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName }),
      artifact_kind: artifactKindToTracking({ fileKind }),
      ...(entryFrom ? { entry_from: entryFrom } : {}),
    });
  };

  const fireDrawToolbarClick: ArtifactAnalyticsController['fireDrawToolbarClick'] = (element, submitAction) => {
    trackDrawToolbarClick(analytics.track, {
      page_name: 'artifact',
      area: 'draw_toolbar',
      element,
      ...(submitAction ? { submit_action: submitAction } : {}),
      artifact_id: anonymizeArtifactId({ projectId, fileName }),
      artifact_kind: artifactKindToTracking({ fileKind }),
    });
  };

  const fireArtifactHeaderClick: ArtifactAnalyticsController['fireArtifactHeaderClick'] = (element) => {
    trackArtifactHeaderClick(analytics.track, {
      page_name: 'artifact',
      area: 'artifact_header',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName }),
      artifact_kind: artifactKindToTracking({ fileKind }),
    });
  };

  const firePresentPopoverClick: ArtifactAnalyticsController['firePresentPopoverClick'] = (element) => {
    trackPresentPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'present_popover',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName }),
      artifact_kind: artifactKindToTracking({ fileKind }),
    });
  };

  const fireCommentPopoverClick: ArtifactAnalyticsController['fireCommentPopoverClick'] = (element) => {
    trackCommentPopoverClick(analytics.track, {
      page_name: 'artifact',
      area: 'comment_popover',
      element,
      artifact_id: anonymizeArtifactId({ projectId, fileName }),
      artifact_kind: artifactKindToTracking({ fileKind }),
    });
  };

  return {
    exportProgressRef,
    fireShareExport,
    onExportProgress,
    fireArtifactToolbarClick,
    fireDrawToolbarClick,
    fireArtifactHeaderClick,
    firePresentPopoverClick,
    fireCommentPopoverClick,
  };
}

export function useWiredArtifactAnalytics(deps: ArtifactAnalyticsDeps): ArtifactAnalyticsController {
  return useArtifactAnalytics(deps);
}
