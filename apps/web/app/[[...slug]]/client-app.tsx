'use client';

import dynamic from 'next/dynamic';

import { installErrorHandlers } from '../../src/analytics/error-tracking';
import { MatrixLoader } from '../../src/components/MatrixLoader';
import { installWebObservability } from '../../src/observability/install';

// Install browser exception handlers at module-load time, before any other
// client code can throw. The hooks buffer events until AnalyticsProvider
// finishes `bootstrapExceptionTracking()` with the PostHog key, so even
// errors thrown during the dynamic import of `src/App` are captured.
installErrorHandlers();

// Install the rest of the observability surface (long tasks, white-screen
// detector, resource-error capture, boot timing, visibility tracking).
// Same buffer + consent-bypass transport as the exception handler above
// so events fired before AnalyticsProvider initialises still flush.
installWebObservability();

// The product is a fully client-driven SPA — every component reads
// localStorage, window.location, etc. — so we opt out of static-time
// rendering for the entire tree. This keeps `next build --output export`
// from trying to evaluate browser-only code while still emitting a real
// shell HTML the daemon can serve as the SPA fallback.
const App = dynamic(() => import('../../src/App').then((m) => m.App), {
  ssr: false,
  // Keeps the `od-loading-shell` class on the outer node: the white-screen
  // detector filters this whole subtree out by that class when deciding
  // whether the app really mounted (`src/observability/white-screen.ts`).
  loading: () => (
    <div className="od-loading-shell">
      <MatrixLoader />
      <span>Loading Open Design…</span>
    </div>
  ),
});

export function ClientApp() {
  return <App />;
}
