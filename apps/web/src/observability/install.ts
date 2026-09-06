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
import { installPreviewIframeMessageObserver } from './iframe-error';
import { installChatInteractionObserver } from './chat-interaction';
import { installChatScrollFreezeObserver } from './chat-scroll-freeze';

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
    installPreviewIframeMessageObserver(),
    // Chat input latency is global rather than per-surface: the Event
    // Timing observer must already be listening when the user's first
    // interaction lands, which is well before any chat surface mounts.
    // It attributes entries to the chat panel itself and ignores the rest.
    installChatInteractionObserver(),
    // The scroll-freeze probe is global for the same reason: it has to be
    // listening before the chat log first auto-scrolls, because that is
    // the transition it most needs in its ring buffer. It discovers the
    // log from the first scroll event that comes out of it and stays inert
    // until then.
    installChatScrollFreezeObserver(),
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
