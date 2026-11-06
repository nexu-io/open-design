import type { ChatInteractionLatencyProps } from '@open-design/contracts/analytics';
import { chatCorrelation } from './chat-context';
import {
  createExposureClock, reportResponsiveness,
  responsivenessVisible,
} from './responsiveness';

const WINDOW_MS = 30_000;
const MAX_LEGACY_REPORTS = 20;
type ChatArea = ChatInteractionLatencyProps['area'];
type InputArea = 'composer' | 'search' | 'settings' | 'other_input';
interface InputWindow {
  attempts: number;
  samples: number;
  slow: number;
  max: number | null;
  queue: number | null;
}
let teardown: (() => void) | null = null;
let reported = 0;

function chatArea(el: Element): ChatArea {
  const explicit = el.closest('[data-od-chat-area]')?.getAttribute('data-od-chat-area');
  if (explicit === 'composer' || explicit === 'chat_log') return explicit;
  if (el.closest('[data-testid="chat-composer"]')) return 'composer';
  if (el.closest('[data-testid="chat-log"]')) return 'chat_log';
  return 'other';
}
function inputArea(el: Element): InputArea | null {
  if (!el.matches('input:not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]')) return null;
  if (chatArea(el) === 'composer') return 'composer';
  if (el.matches('[type="search"], [role="searchbox"], [data-testid="project-search-input"]') || el.closest('[role="search"]')) return 'search';
  if (el.closest('[data-od-input-area="settings"], .modal-settings')) return 'settings';
  return 'other_input';
}

export function installChatInteractionObserver(): () => void {
  if (teardown || typeof document === 'undefined') return () => undefined;
  let observer: PerformanceObserver | null = null;
  let supported = false;
  let since = performance.now();
  let lastEntry = -1;
  let inputs = new Map<InputArea, InputWindow>();
  let current: { worst: number; count: number; name: string; area: ChatArea; streaming: boolean } | null = null;
  const clock = createExposureClock();
  const state = (area: InputArea): InputWindow => {
    let value = inputs.get(area);
    if (!value) {
      value = { attempts: 0, samples: 0, slow: 0, max: null, queue: null };
      inputs.set(area, value);
    }
    return value;
  };
  const reset = () => { inputs = new Map(); current = null; since = performance.now(); lastEntry = -1; clock.reset(); };
  const stop = () => { observer?.disconnect(); observer = null; supported = false; reset(); };
  const start = () => {
    reset();
    if (typeof PerformanceObserver === 'undefined'
      || !PerformanceObserver.supportedEntryTypes?.includes('event')) return;
    try {
      observer = new PerformanceObserver((list) => {
        if (!responsivenessVisible()) return;
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceEventTiming;
          if (!Number.isFinite(timing.duration) || timing.duration < 16) continue;
          // Ignore entries that began before observation or while the page was hidden.
          if (Number.isFinite(timing.startTime) && timing.startTime < since) continue;
          const el = timing.target instanceof Element ? timing.target : null;
          if (!el) continue;
          const area = chatArea(el);
          if (reported < MAX_LEGACY_REPORTS && area !== 'other' && timing.duration >= 200) {
            const count = (current?.count ?? 0) + 1;
            if (!current || timing.duration > current.worst) {
              current = { worst: timing.duration, count, name: safeEventName(timing.name),
                area, streaming: chatCorrelation().run_id != null };
            } else current.count = count;
          }
          // One DOM event family, not keydown + keyup + beforeinput for the
          // same keystroke. The 16ms API floor makes these qualified samples,
          // NOT a census of all keystrokes (attempts are counted separately).
          const input = timing.name === 'keydown' ? inputArea(el) : null;
          if (!input) continue;
          if (Number.isFinite(timing.startTime)) {
            if (timing.startTime <= lastEntry) continue;
            lastEntry = timing.startTime;
          }
          const bucket = state(input);
          bucket.samples += 1;
          if (timing.duration > 500) bucket.slow += 1;
          bucket.max = Math.max(bucket.max ?? 0, timing.duration);
          if (Number.isFinite(timing.processingStart) && Number.isFinite(timing.startTime)
            && timing.processingStart >= timing.startTime) {
            bucket.queue = Math.max(bucket.queue ?? 0, timing.processingStart - timing.startTime);
          }
        }
      });
      observer.observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
      supported = true;
    } catch { stop(); }
  };
  start();
  const keydown = (event: KeyboardEvent) => {
    if (!event.isTrusted || !supported || !responsivenessVisible() || !(event.target instanceof Element)) return;
    const area = inputArea(event.target);
    if (area) state(area).attempts += 1;
  };
  const visibility = () => { inputs.clear(); current = null; since = performance.now(); };
  document.addEventListener('keydown', keydown, { capture: true, passive: true });
  document.addEventListener('visibilitychange', visibility);
  const timer = setInterval(() => {
    const exposure = clock.tick();
    const measurable = supported && exposure.qualified;
    reportResponsiveness('client_responsiveness_window', {
      telemetry_capability: supported ? 'supported' : 'unsupported', measurement: 'event_timing',
      measurable, unavailable_reason: !supported ? 'unsupported' : measurable ? null : 'background_or_sleep',
      window_ms: exposure.elapsed,
    });
    if (measurable) {
      for (const [area, value] of inputs) reportResponsiveness('client_input_responsiveness', {
        telemetry_capability: 'supported', area, window_ms: exposure.elapsed,
        input_attempt_count: value.attempts, qualified_sample_count: value.samples,
        over_500ms_count: value.slow, max_input_to_presentation_ms: value.max,
        max_queue_delay_ms: value.queue, sample_floor_ms: 16,
      });
      // Historical ≥200ms, chat-only, 30s maximum and 20-report cap retain
      // their meaning. They are never used as an input-rate denominator.
      if (current && reported < MAX_LEGACY_REPORTS) {
        reported += 1;
        reportResponsiveness('client_chat_interaction_latency', {
          ...chatCorrelation(), inp_ms: Math.round(current.worst), interaction_count: current.count,
          event_name: current.name, area: current.area, streaming: current.streaming,
        });
      }
    }
    inputs.clear(); current = null;
  }, WINDOW_MS);
  const cleanup = () => {
    stop(); clock.stop(); clearInterval(timer);
    document.removeEventListener('keydown', keydown, { capture: true });
    document.removeEventListener('visibilitychange', visibility);
    teardown = null;
  };
  teardown = cleanup;
  return cleanup;
}
function safeEventName(name: string): string {
  return ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click', 'input', 'beforeinput'].includes(name) ? name : 'unknown';
}
export function __resetChatInteractionForTest(): void { teardown?.(); reported = 0; }
