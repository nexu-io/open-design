/**
 * In-memory registry of adapters the conformance harness has marked
 * `critique:degraded` (Phase 10). Tracks (adapterId -> { reason, expiresAtMs })
 * with a per-entry TTL so a flaky adapter is sidelined automatically until
 * the next nightly cycle without operator action.
 *
 * v1 scope: process-local Map. The orchestrator and adapter routing both
 * sit inside the same daemon process, so a daemon-life-scoped store is
 * sufficient to gate routing decisions. Persisting to SQLite (so the
 * mark survives a daemon restart) is a Phase 15 follow-up because it
 * needs a schema migration that should land alongside the rollout-flag
 * wiring rather than ahead of it. The plan's `markDegraded(id, reason, ttlMs)`
 * + `isDegraded(id)` contract is preserved so the upgrade is drop-in
 * (the same call sites keep working when the storage layer swaps).
 */

import type { DegradedReason } from '@open-design/contracts/critique';

import { critiqueDegradedTotal } from '../metrics/index.js';

export type DegradedSource = 'conformance' | 'orchestrator' | 'manual';

export interface DegradedEntry {
  adapterId: string;
  reason: DegradedReason;
  source: DegradedSource;
  /** Epoch milliseconds; reads after this are treated as cleared. */
  expiresAtMs: number;
  markedAtMs: number;
}

export interface DegradedClock {
  now(): number;
}

const realClock: DegradedClock = { now: () => Date.now() };

const store = new Map<string, DegradedEntry>();
let clock: DegradedClock = realClock;

/** Default TTL the plan specifies for adapter-level marks (24h). */
export const ADAPTER_DEGRADED_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Mark an adapter as degraded for `ttlMs` from now. Subsequent calls
 * for the same adapter overwrite the existing entry, so a worse
 * reason or a renewed TTL during the same window takes precedence.
 */
export function markDegraded(
  adapterId: string,
  reason: DegradedReason,
  ttlMs: number = ADAPTER_DEGRADED_DEFAULT_TTL_MS,
  source: DegradedSource = 'conformance',
): DegradedEntry {
  if (!adapterId) {
    throw new Error('markDegraded: adapterId is required');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('markDegraded: ttlMs must be a positive finite number');
  }
  const markedAtMs = clock.now();
  const entry: DegradedEntry = {
    adapterId,
    reason,
    source,
    markedAtMs,
    expiresAtMs: markedAtMs + ttlMs,
  };
  store.set(adapterId, entry);
  // Phase 12: every degraded mark increments the Prometheus counter so
  // the dashboard's "adapter health" panel reflects the same rate the
  // orchestrator and conformance harness observe. Bump is unconditional
  // (every call records, including overwrites of a still-live entry)
  // because the dashboard rate query divides over the time window, not
  // over distinct adapters.
  critiqueDegradedTotal.inc({ reason, adapter: adapterId });
  return entry;
}

/**
 * `true` when the adapter has an unexpired degraded mark. Reads after
 * the entry's TTL transparently clear the mark so the caller doesn't
 * have to evict separately.
 */
export function isDegraded(adapterId: string): boolean {
  return Boolean(getDegradedEntry(adapterId));
}

/**
 * Read the full entry (or `null` if not degraded). Same TTL-eviction
 * semantics as `isDegraded`. Useful for surfacing the reason on
 * operator dashboards.
 */
export function getDegradedEntry(adapterId: string): DegradedEntry | null {
  const entry = store.get(adapterId);
  if (!entry) return null;
  if (clock.now() >= entry.expiresAtMs) {
    store.delete(adapterId);
    return null;
  }
  return entry;
}

/**
 * Explicitly clear a degraded mark (operator-initiated remediation).
 * Returns `true` if a mark was actually removed.
 */
export function clearDegraded(adapterId: string): boolean {
  return store.delete(adapterId);
}

/**
 * Snapshot the current degraded-adapter table (post-TTL eviction).
 * Used by the `/api/metrics/critique` Prometheus exporter from
 * Phase 12.
 */
export function listDegraded(): DegradedEntry[] {
  const out: DegradedEntry[] = [];
  for (const id of Array.from(store.keys())) {
    const entry = getDegradedEntry(id);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * Test-only hook to inject a deterministic clock. Production code never
 * calls this; vitest cases that exercise TTL boundaries do.
 */
export function __setDegradedClockForTests(next: DegradedClock | null): void {
  clock = next ?? realClock;
}

/**
 * Test-only hook to drop the table between cases without exposing the
 * map directly.
 */
export function __resetDegradedRegistryForTests(): void {
  store.clear();
}
