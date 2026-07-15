/**
 * Circuit breaker for renderer-process crash loops.
 *
 * The desktop poll loop reloads the web app whenever the renderer process
 * dies (`render-process-gone`) so a backgrounded-and-killed renderer recovers
 * instead of leaving a blank window. But when a renderer crashes
 * *deterministically* — a GPU/V8 CHECK failure, a wedged extension, a corrupt
 * profile that aborts on every load — that same reload turns into an infinite
 * loop: load → crash → reload → crash. A single 0.14.0 device did exactly this
 * and emitted 26,011 `desktop_renderer_crash` events in one day while its
 * window stayed blank; that one machine was 96% of all renderer crashes on the
 * release.
 *
 * This breaker bounds the loop. Every crash is recorded with its timestamp;
 * once `limit` crashes fall inside a rolling `windowMs`, the breaker "opens".
 * While open the caller must stop auto-reloading (show a recoverable error
 * screen instead) and suppress the per-crash telemetry so one wedged device
 * cannot flood analytics. After `cooldownMs` with no further crashes the
 * breaker re-arms on its own, so a transient fault still self-heals without a
 * user reinstall.
 *
 * The class is deliberately pure — it takes `now` as a parameter and touches no
 * Electron API — so the loop policy can be unit-tested without a BrowserWindow.
 */

export const RENDERER_CRASH_LOOP_LIMIT = 5;
export const RENDERER_CRASH_LOOP_WINDOW_MS = 60_000;
export const RENDERER_CRASH_LOOP_COOLDOWN_MS = 5 * 60_000;

export interface RendererCrashLoopBreakerOptions {
  /** Crashes within the window required to open the breaker. Default 5. */
  limit?: number;
  /** Rolling window over which crashes are counted, in ms. Default 60s. */
  windowMs?: number;
  /** Idle time with no crash after which an open breaker re-arms, in ms. Default 5min. */
  cooldownMs?: number;
}

export interface RendererCrashOutcome {
  /** True once the breaker is open — the caller must not auto-reload. */
  readonly tripped: boolean;
  /**
   * True when this crash happened while the breaker was *already* open. The
   * caller reports the crash that trips the breaker (so the loop is visible in
   * analytics) but suppresses every crash after it.
   */
  readonly suppressTelemetry: boolean;
  /** True only for the single crash that transitioned the breaker open. */
  readonly justOpened: boolean;
}

export class RendererCrashLoopBreaker {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private crashTimes: number[] = [];
  private open = false;
  private lastCrashAt = 0;

  constructor(options: RendererCrashLoopBreakerOptions = {}) {
    this.limit = options.limit ?? RENDERER_CRASH_LOOP_LIMIT;
    this.windowMs = options.windowMs ?? RENDERER_CRASH_LOOP_WINDOW_MS;
    this.cooldownMs = options.cooldownMs ?? RENDERER_CRASH_LOOP_COOLDOWN_MS;
  }

  /**
   * Record a renderer crash at `now` (ms). Returns whether the breaker is now
   * open, whether this crash's telemetry should be suppressed, and whether this
   * crash is the one that just opened the breaker.
   */
  recordCrash(now: number): RendererCrashOutcome {
    const wasOpen = this.open;
    this.lastCrashAt = now;
    // Drop crashes that have aged out of the rolling window, then count this one.
    this.crashTimes = this.crashTimes.filter((t) => now - t < this.windowMs);
    this.crashTimes.push(now);
    if (this.crashTimes.length >= this.limit) this.open = true;
    return {
      tripped: this.open,
      suppressTelemetry: wasOpen,
      justOpened: this.open && !wasOpen,
    };
  }

  /** True while the breaker is open and the caller must stay parked. */
  isOpen(): boolean {
    return this.open;
  }

  /**
   * If the breaker is open and no crash has occurred for `cooldownMs`, close it
   * and clear the crash history so the caller can attempt one fresh reload.
   * Returns true only on the transition from open to closed.
   */
  rearmIfCooledDown(now: number): boolean {
    if (!this.open) return false;
    if (now - this.lastCrashAt < this.cooldownMs) return false;
    this.reset();
    return true;
  }

  /** Force the breaker closed — e.g. an explicit user-initiated retry. */
  reset(): void {
    this.crashTimes = [];
    this.open = false;
  }
}
