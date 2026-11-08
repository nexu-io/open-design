import type { ClientDisplayRefreshProps } from '@open-design/contracts/analytics';
import type { OpenDesignHostBridge, OpenDesignHostDisplayRefresh } from '@open-design/host';
import type { Track } from '../analytics/events';

export function displayRefreshProperties(
  refresh: OpenDesignHostDisplayRefresh,
  renderer: { devicePixelRatio: number; reducedTransparency: boolean },
): ClientDisplayRefreshProps {
  // Chromium reports DPR as display scale times page zoom; View → Zoom is not a scale anomaly.
  const zoom = refresh.zoomFactor ?? 1;
  return {
    reasons: refresh.reasons,
    scale_factor: refresh.scaleFactor,
    display_count: refresh.displayCount,
    device_pixel_ratio: renderer.devicePixelRatio,
    page_zoom: refresh.zoomFactor ?? null,
    reduced_transparency: renderer.reducedTransparency,
    scale_mismatch: Math.abs(renderer.devicePixelRatio / zoom - refresh.scaleFactor) > 0.01,
  };
}

/** Use only AnalyticsProvider.track: responsiveness/safety transports bypass consent. */
export function subscribeDesktopDisplayRefresh(host: OpenDesignHostBridge | null, track: Track): () => void {
  return host?.appearance?.subscribeDisplayRefresh?.((refresh) => {
    const props = displayRefreshProperties(refresh, {
      devicePixelRatio: window.devicePixelRatio,
      reducedTransparency: window.matchMedia('(prefers-reduced-transparency: reduce)').matches,
    });
    track('client_display_refresh', { ...props });
  }) ?? (() => {});
}
