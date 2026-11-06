// Shared exponential-backoff primitive for the web runtime.
//
// This is pure logic — no React, no DOM, no timers. It only decides HOW LONG
// the next wait should be; the caller owns the single timer that actually
// sleeps. Keeping the arithmetic here (instead of re-deriving `backoff =
// Math.min(backoff * 2, cap)` inline in every SSE reconnect / failure-retry
// loop) means the "1s → 30s, ×2, jittered, reset-on-success" contract has ONE
// definition that can be unit-tested exhaustively.
//
// Full jitter matters under a struggling transport: when N clients all fail at
// the same instant (a vela outage, a packaged-client proxy 502 storm), an
// un-jittered schedule reconnects them in lockstep and re-creates the very
// thundering herd that produced the failure. Multiplying each delay by a
// random factor in [0.5, 1.0) spreads the retries out.

export interface BackoffOptions {
  /** Delay for the first retry, before any exponential growth. Default 1000ms. */
  initialMs?: number;
  /** Ceiling the (un-jittered) delay is clamped to. Default 30000ms. */
  maxMs?: number;
  /** Growth factor applied after each `nextDelay()`. Default 2. */
  factor?: number;
  /** When true (default) each delay is multiplied by random(0.5, 1.0). */
  jitter?: boolean;
  /**
   * Randomness seam. Defaults to `Math.random` (available in every browser and
   * in Node test envs). Tests inject a deterministic function so the jittered
   * delay is predictable.
   */
  random?: () => number;
}

/**
 * A mutable exponential-backoff cursor.
 *
 * `nextDelay()` returns the delay to wait NOW and advances the internal cursor
 * for next time. `reset()` returns to the initial delay — the only thing that
 * should clear accumulated depth is an actual success. `attempt` counts how
 * many delays have been handed out since the last reset.
 */
export class BackoffController {
  private readonly initialMs: number;
  private readonly maxMs: number;
  private readonly factor: number;
  private readonly jitter: boolean;
  private readonly random: () => number;

  /** The next un-jittered delay `nextDelay()` will draw from. */
  private currentMs: number;

  /** Delays handed out since the last `reset()`. */
  attempt = 0;

  constructor(options: BackoffOptions = {}) {
    this.initialMs = Math.max(0, options.initialMs ?? 1000);
    this.maxMs = Math.max(this.initialMs, options.maxMs ?? 30_000);
    this.factor = options.factor ?? 2;
    this.jitter = options.jitter ?? true;
    this.random = options.random ?? Math.random;
    this.currentMs = this.initialMs;
  }

  /**
   * The delay (in ms) to wait before the next attempt. Reads the current
   * (un-jittered) base, applies jitter if enabled, then grows the base toward
   * the cap for the following call. The returned value is the jittered delay;
   * the internal base is what doubles, so the base sequence stays a clean
   * 1s → 2s → 4s → … → cap regardless of the random draws.
   */
  nextDelay(): number {
    const base = this.currentMs;
    this.attempt += 1;
    this.currentMs = Math.min(this.currentMs * this.factor, this.maxMs);
    if (!this.jitter) return base;
    // random() ∈ [0, 1) → multiplier ∈ [0.5, 1.0).
    return base * (0.5 + this.random() * 0.5);
  }

  /** Return to the initial delay. Call this only after a genuine success. */
  reset(): void {
    this.currentMs = this.initialMs;
    this.attempt = 0;
  }
}
