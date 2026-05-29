// Single entry point for the web-side observability surface.
//
// Called as a side-effect import from `apps/web/app/[[...slug]]/client-app.tsx`
// at module load — runs before React mounts, before posthog-js's lazy
// import resolves, before any product code can throw. Each observer is
// individually defensive (no-ops in environments where its API is
// missing), so this call is safe to make unconditionally.
//
// Why one entry point: every observer reaches into the same
// error-tracking transport for its consent-bypass + early-buffer
// guarantees, and centralising the install order makes it easy to
// audit what runs at boot.

import { installLongTaskObserver } from './long-task';
import { installResourceErrorObserver } from './resource-error';
import { installBootTimingObserver } from './boot-timing';
import { installVisibilityObserver } from './visibility';
import { installWhiteScreenDetector } from './white-screen';

let installed = false;

export function installWebObservability(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined') return () => undefined;
  installed = true;

  const teardowns: Array<() => void> = [
    installLongTaskObserver(),
    installResourceErrorObserver(),
    installBootTimingObserver(),
    installVisibilityObserver(),
    installWhiteScreenDetector(),
  ];

  return () => {
    for (const teardown of teardowns) {
      try {
        teardown();
      } catch {
        // best-effort — teardown failures must never propagate
      }
    }
    installed = false;
  };
}
