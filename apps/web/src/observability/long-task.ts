import {
  createExposureClock, reportResponsiveness,
  responsivenessVisible,
} from './responsiveness';

const WINDOW_MS = 30_000;
const RECOVERY_KEY = 'open-design:responsiveness-recovery-v1';
// A single bounded checkpoint. It cannot establish a duration for a process
// killed before its PerformanceObserver callback runs.
interface Checkpoint {
  id: string;
  at: string;
  duration: number | null;
  count: number;
}
let installed = false;

function readCheckpoint(): Checkpoint | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw || raw.length > 512) return null;
    const p = JSON.parse(raw) as Checkpoint;
    if (typeof p.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.id)
      || typeof p.at !== 'string' || !Number.isFinite(Date.parse(p.at))
      || !(p.duration === null || (Number.isFinite(p.duration) && p.duration >= 5_000))
      || !Number.isSafeInteger(p.count) || p.count < 0) return null;
    return p;
  } catch { return null; }
}
function saveCheckpoint(value: Checkpoint | null): void {
  try {
    if (value) localStorage.setItem(RECOVERY_KEY, JSON.stringify(value));
    else localStorage.removeItem(RECOVERY_KEY);
  } catch { /* Storage denial must never affect interaction. */ }
}

export function installLongTaskObserver(): () => void {
  if (installed || typeof document === 'undefined') return () => undefined;
  installed = true;
  let observer: PerformanceObserver | null = null;
  let supported = false;
  let eligibleSince = performance.now();
  let count = 0;
  let severe = 0;
  let worst: number | null = null;
  let checkpoint: Checkpoint | null = null;
  const clock = createExposureClock();
  const reset = () => { count = 0; severe = 0; worst = null; clock.reset(); };
  const startCheckpoint = () => {
    const previous = readCheckpoint();
    if (previous) reportResponsiveness('client_responsiveness_recovery', {
      telemetry_capability: 'unknown', recovery_id: previous.id,
      previous_occurred_at: previous.at, duration_ms: previous.duration,
      severe_task_count: previous.count,
      reason: previous.duration === null ? 'unclean_exit_unknown' : 'observed_severe_task',
    });
    checkpoint = { id: globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}`,
      at: new Date().toISOString(), duration: null, count: 0 };
    if (responsivenessVisible()) saveCheckpoint(checkpoint);
  };
  const start = () => {
    reset();
    eligibleSince = performance.now();
    if (typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      try {
        observer = new PerformanceObserver((list) => {
          if (!responsivenessVisible()) return;
          for (const entry of list.getEntries()) {
            if (Number.isFinite(entry.startTime) && entry.startTime < eligibleSince) continue;
            if (!Number.isFinite(entry.duration) || entry.duration < 100) continue;
            count += 1;
            worst = Math.max(worst ?? 0, entry.duration);
            if (entry.duration < 5_000) continue;
            severe += 1;
            if (checkpoint) {
              checkpoint.at = new Date(performance.timeOrigin + entry.startTime).toISOString();
              checkpoint.duration = Math.max(checkpoint.duration ?? 0, entry.duration);
              checkpoint.count += 1;
              saveCheckpoint(checkpoint);
            }
            // Preserve the legacy severe event, without attribution names/URLs.
            reportResponsiveness('client_long_task', {
              duration_ms: Math.round(entry.duration), start_time_ms: Math.round(entry.startTime),
              occurred_at: new Date(performance.timeOrigin + entry.startTime).toISOString(),
            });
          }
        });
        observer.observe({ type: 'longtask' });
        supported = true;
      } catch { observer?.disconnect(); observer = null; supported = false; }
    }
    startCheckpoint();
  };
  const stop = () => {
    observer?.disconnect(); observer = null; supported = false;
    if (checkpoint?.count === 0) saveCheckpoint(null);
    else if (checkpoint) saveCheckpoint(checkpoint);
    checkpoint = null; reset();
  };
  start();
  const timer = setInterval(() => {
    const exposure = clock.tick();
    const qualified = supported && exposure.qualified;
    reportResponsiveness('client_responsiveness_window', {
      telemetry_capability: supported ? 'supported' : 'unsupported',
      measurement: 'long_task', measurable: qualified,
      unavailable_reason: !supported ? 'unsupported' : qualified ? null : 'background_or_sleep',
      window_ms: exposure.elapsed, long_task_count: qualified ? count : null,
      severe_task_count: qualified ? severe : null, max_duration_ms: qualified ? worst : null,
    });
    count = 0; severe = 0; worst = null;
    // One bounded storage write per foreground window; no per-small-task I/O.
    if (checkpoint && responsivenessVisible()) saveCheckpoint(checkpoint);
  }, WINDOW_MS);
  const visibility = () => {
    eligibleSince = performance.now();
    // Background termination is not evidence of a foreground hang.
    if (!responsivenessVisible() && !checkpoint?.count) saveCheckpoint(null);
    else if (checkpoint) saveCheckpoint(checkpoint);
  };
  const pagehide = () => { saveCheckpoint(checkpoint?.count ? checkpoint : null); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  return () => {
    clearInterval(timer); clock.stop(); stop();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pagehide);
    installed = false;
  };
}
