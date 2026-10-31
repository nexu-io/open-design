/** Frame cadence during actual chat scrolling; independent of compositor freeze. */
import {
  createExposureClock, reportResponsiveness,
  responsivenessVisible,
} from './responsiveness';

const WINDOW_MS = 30_000;
const FRAME_BUDGET = 120;
const ACTIVE_MS = 1_000;
export function installChatScrollJankObserver(): () => void {
  const supported = typeof requestAnimationFrame === 'function';
  let handle: number | null = null;
  let until = 0;
  let previous: number | null = null;
  let frames = 0;
  let gaps = 0;
  let intervals = 0;
  let worst: number | null = null;
  let truncated = false;
  const clock = createExposureClock();
  const cancel = () => {
    if (handle !== null) cancelAnimationFrame(handle);
    handle = null; previous = null; until = 0;
  };
  const reset = () => { cancel(); frames = 0; gaps = 0; intervals = 0; worst = null; truncated = false; clock.reset(); };
  const frame = (at: number) => {
    handle = null;
    if (!responsivenessVisible()) { previous = null; return; }
    frames += 1;
    if (previous !== null) {
      const gap = at - previous;
      // Sleep and suspended frame callbacks are unmeasurable, not scroll jank.
      if (gap >= 5_000 || gap < 0) { reset(); return; }
      intervals += 1;
      gaps += gap > 50 ? 1 : 0;
      worst = Math.max(worst ?? 0, gap);
    }
    previous = at;
    if (at > until) { previous = null; return; }
    if (frames >= FRAME_BUDGET) { truncated = true; previous = null; return; }
    handle = requestAnimationFrame(frame);
  };
  const activity = (event: Event) => {
    if (!event.isTrusted || !supported || !responsivenessVisible() || !(event.target instanceof Element)
      || !event.target.closest('[data-testid="chat-log"], .chat-log')) return;
    if (frames >= FRAME_BUDGET) { truncated = true; return; }
    until = performance.now() + ACTIVE_MS;
    if (handle === null) handle = requestAnimationFrame(frame);
  };
  document.addEventListener('wheel', activity, { capture: true, passive: true });
  document.addEventListener('scroll', activity, { capture: true, passive: true });
  document.addEventListener('visibilitychange', reset);
  const timer = setInterval(() => {
    const exposure = clock.tick();
    const measurable = supported && exposure.qualified;
    if (frames > 0 || !measurable) reportResponsiveness('client_chat_scroll_frames', {
      telemetry_capability: supported ? 'supported' : 'unsupported', measurable,
      window_ms: exposure.elapsed, frame_count: measurable ? frames : null,
      interval_count: measurable ? intervals : null,
      over_50ms_count: measurable ? gaps : null,
      max_frame_interval_ms: measurable ? worst : null, sampling_truncated: truncated,
    });
    cancel(); frames = 0; gaps = 0; intervals = 0; worst = null; truncated = false;
  }, WINDOW_MS);
  return () => {
    cancel(); clock.stop(); clearInterval(timer);
    document.removeEventListener('wheel', activity, { capture: true });
    document.removeEventListener('scroll', activity, { capture: true });
    document.removeEventListener('visibilitychange', reset);
  };
}
