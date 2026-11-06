/** Shared safety reporting and foreground exposure for responsiveness collectors. */
import { reportSafetyEvent } from '../analytics/error-tracking';

export function responsivenessVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}
export function reportResponsiveness(event: string, props: Record<string, unknown>): void {
  // Preserve schema projection and the safety transport's bounded early buffer.
  reportSafetyEvent(event, { metric_schema_version: 1, ...props }, { currentUrlOverride: '' });
}

/** Long timer gaps are ambiguous (sleep OR blockage), never qualified exposure. */
export function createExposureClock() {
  let last = performance.now();
  let wall = Date.now();
  let visible = responsivenessVisible();
  let interrupted = false;
  const visibility = () => { interrupted = true; };
  document.addEventListener('visibilitychange', visibility);
  return {
    tick() {
      const now = performance.now();
      const nextWall = Date.now();
      const elapsed = now - last;
      const qualified = visible && responsivenessVisible() && !interrupted
        && elapsed > 0 && elapsed <= 35_000 && Math.abs(nextWall - wall - elapsed) < 1_000;
      last = now;
      wall = nextWall;
      visible = responsivenessVisible();
      interrupted = false;
      return { qualified, elapsed: qualified ? Math.round(elapsed) : null };
    },
    reset() {
      last = performance.now(); wall = Date.now();
      visible = responsivenessVisible(); interrupted = false;
    },
    stop() { document.removeEventListener('visibilitychange', visibility); },
  };
}
