// Spec 112 — in-process leaky-bucket rate limiter for the multi-tenant REST API.
// Keyed by `<tenant_slug>:<bucket_name>` so per-tenant limits are isolated.
// Mirrors the gateway-plugins/open-design-lead-handoff/rate-limit.ts pattern.
//
// Defaults: 10 creates/min, 30 publishes/min per tenant.
// Hard-capped at 60/min per bucket — production must never exceed that without
// a code change (prevents accidental config-driven DoS amplification).

const MAX_PROD_LIMIT = 60;

interface Bucket {
  tokens: number;
  last_refill_ms: number;
}

export interface RateLimitResult {
  ok: boolean;
  retry_after_seconds: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit_per_min: number;
  private readonly tokens_per_ms: number;
  private readonly name: string;

  constructor(name: string, limit_per_min: number) {
    if (!Number.isFinite(limit_per_min) || limit_per_min <= 0) {
      throw new Error(`rate limit must be positive (got ${limit_per_min})`);
    }
    if (limit_per_min > MAX_PROD_LIMIT) {
      throw new Error(`rate limit ${limit_per_min} exceeds prod max ${MAX_PROD_LIMIT}`);
    }
    this.name = name;
    this.limit_per_min = limit_per_min;
    this.tokens_per_ms = limit_per_min / 60_000;
  }

  check(key: string, now_ms = Date.now()): RateLimitResult {
    const bucketKey = `${this.name}:${key}`;
    const existing = this.buckets.get(bucketKey);
    if (!existing) {
      this.buckets.set(bucketKey, {
        tokens: this.limit_per_min - 1,
        last_refill_ms: now_ms,
      });
      return { ok: true, retry_after_seconds: 0 };
    }

    const elapsed = now_ms - existing.last_refill_ms;
    const refilled = Math.min(
      this.limit_per_min,
      existing.tokens + elapsed * this.tokens_per_ms,
    );
    if (refilled < 1) {
      const deficit = 1 - refilled;
      const retry_after_ms = deficit / this.tokens_per_ms;
      return {
        ok: false,
        retry_after_seconds: Math.max(1, Math.ceil(retry_after_ms / 1000)),
      };
    }

    this.buckets.set(bucketKey, {
      tokens: refilled - 1,
      last_refill_ms: now_ms,
    });
    return { ok: true, retry_after_seconds: 0 };
  }

  /** Test helper — clear all buckets. */
  reset(): void {
    this.buckets.clear();
  }
}
