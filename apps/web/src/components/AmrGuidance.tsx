import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import {
  trackRunFailedToastGoAmrClick,
  trackRunFailedToastSurfaceView,
} from '../analytics/events';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { recordAmrEntry, type TrackingAmrEntrySource } from '../analytics/amr-attribution';

export interface AmrGuidanceProps {
  errorCode: string;
  projectId: string;
  projectKind: TrackingProjectKind | null;
  conversationId: string | null;
  assistantMessageId: string;
  runId: string | null;
  sourceDetail: TrackingAmrEntrySource;
  metricsConsent?: boolean;
  // Switch the run to AMR and retry. The `ui_click` analytics event is fired
  // here first; the host performs the switch + arms the auto-retry.
  onActivate: () => void;
}

// Theme-color promotion card under a failed run's gray error card, shown when a
// non-AMR agent hits a model/auth/quota wall. Offers a one-click switch to
// Open Design's hosted AMR with auto-retry. Fires `surface_view`
// (element=run_failed_toast) once on mount and `ui_click` (element=go_amr) on
// the action. `useAnalytics()` returns a no-op stub outside the provider, so
// this is safe in isolated tests.
export function AmrGuidance({
  errorCode,
  projectId,
  projectKind,
  conversationId,
  assistantMessageId,
  runId,
  sourceDetail,
  metricsConsent = false,
  onActivate,
}: AmrGuidanceProps) {
  const t = useT();
  const analytics = useAnalytics();
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    trackRunFailedToastSurfaceView(analytics.track, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: errorCode,
      project_id: projectId,
      project_kind: projectKind,
      conversation_id: conversationId,
      assistant_message_id: assistantMessageId,
      run_id: runId,
    });
  }, [
    analytics.track,
    errorCode,
    projectId,
    projectKind,
    conversationId,
    assistantMessageId,
    runId,
  ]);

  return (
    <div className="amr-card amr-card--switch" data-testid="amr-guidance">
      <div className="amr-card__head">
        <span className="amr-card__icon" aria-hidden="true">
          !
        </span>
        <strong className="amr-card__title">{t('chat.amrCard.switchTitle')}</strong>
      </div>
      <p className="amr-card__body">{t('chat.amrCard.switchBody')}</p>
      <div className="amr-card__chips" aria-hidden="true">
        <span className="amr-card__chip">{t('chat.amrCard.chipOfficial')}</span>
        <span className="amr-card__chip">{t('chat.amrCard.chipNoKey')}</span>
        <span className="amr-card__chip">{t('chat.amrCard.chipAutoRetry')}</span>
      </div>
      <div className="amr-card__actions">
        <button
          type="button"
          className="amr-card__cta"
          onClick={() => {
            trackRunFailedToastGoAmrClick(analytics.track, {
              page_name: 'chat_panel',
              area: 'chat_panel',
              element: 'go_amr',
            });
            recordAmrEntry(analytics.track, sourceDetail, new Date(), {
              metricsConsent,
            });
            onActivate();
          }}
        >
          {t('chat.amrCard.switchCta')}
        </button>
      </div>
    </div>
  );
}
