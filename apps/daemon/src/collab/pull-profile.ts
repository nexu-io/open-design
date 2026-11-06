const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const VELA_PULL_PHASES = new Set([
  'load_profile',
  'resolve_cache',
  'resolve_ref',
  'get_manifest',
  'download_authorization',
  'object_store_download',
  'materialize_snapshot',
]);

export type SharedProjectPullTimingPhase =
  | 'event-received'
  | 'queued'
  | 'guard-started'
  | 'guard-completed'
  | 'invoke'
  | 'completed'
  | 'route-started'
  | 'initial-authorization-reused'
  | 'authorized-stage-started'
  | 'authorized-stage-done'
  | 'authorized-receipt-validated'
  | 'authorized-scope-revalidated'
  | 'promotion-started'
  | 'promotion-done'
  | 'version-persisted'
  | 'transport-invoke'
  | 'transport-done'
  | 'registration-prepared'
  | 'catalog-revalidated'
  | 'scope-revalidated'
  | 'mirror-materialized'
  | 'version-write-started'
  | 'persisted'
  | 'route-completed';

export interface SharedProjectPullTimingEvent {
  phase: SharedProjectPullTimingPhase;
  projectId: string;
  version?: number | undefined;
  receivedAtMs?: number | undefined;
  atMs?: number | undefined;
  status?: string | undefined;
}

interface VelaPullPhase {
  name: string;
  count: number;
  totalMs: number;
  maxMs: number;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeText(value: unknown, maxLength = 256): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function safeTimestamp(value: unknown): string | null {
  const timestamp = safeText(value, 64);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

export function sharedProjectPullProfileEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return ENABLED_VALUES.has(
    env.OD_COLLAB_PULL_PROFILE?.trim().toLowerCase() ?? '',
  );
}

export function emitSharedProjectPullTiming(
  event: SharedProjectPullTimingEvent,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!sharedProjectPullProfileEnabled(env)) return;
  const atMs = finiteNonNegative(event.atMs) ?? Date.now();
  const receivedAtMs = finiteNonNegative(event.receivedAtMs);
  console.info(
    `[od] shared_project_pull_profile ${JSON.stringify({
      event: 'shared_project_pull_profile',
      schemaVersion: 1,
      phase: event.phase,
      projectId: event.projectId,
      ...(event.version != null ? { version: event.version } : {}),
      atMs,
      ...(receivedAtMs != null
        ? {
            receivedAtMs,
            elapsedSinceEventMs: Math.max(0, atMs - receivedAtMs),
          }
        : {}),
      ...(event.status ? { status: event.status } : {}),
    })}`,
  );
}

/**
 * Parse only Vela's secret-free resource pull profile envelope. Arbitrary
 * stderr remains discarded: warnings can contain URLs, paths, or credentials.
 */
export function emitVelaResourcePullProfile(
  stderr: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!sharedProjectPullProfileEnabled(env)) return;
  for (const line of stderr.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let candidate: unknown;
    try {
      candidate = JSON.parse(line);
    } catch {
      continue;
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    if (
      record.event !== 'resource_pull_profile' ||
      record.schemaVersion !== 1 ||
      typeof record.success !== 'boolean'
    ) {
      continue;
    }
    const totalMs = finiteNonNegative(record.totalMs);
    const startedAt = safeTimestamp(record.startedAt);
    const finishedAt = safeTimestamp(record.finishedAt);
    const kind = safeText(record.kind, 64);
    const resourceId = safeText(record.resourceId);
    const ref = safeText(record.ref, 64);
    if (
      totalMs == null ||
      !startedAt ||
      !finishedAt ||
      !kind ||
      !resourceId ||
      !ref
    ) {
      continue;
    }
    const phases: VelaPullPhase[] = [];
    const seenPhases = new Set<string>();
    if (Array.isArray(record.phases)) {
      for (const rawPhase of record.phases) {
        if (phases.length >= VELA_PULL_PHASES.size) break;
        if (!rawPhase || typeof rawPhase !== 'object' || Array.isArray(rawPhase)) {
          continue;
        }
        const phase = rawPhase as Record<string, unknown>;
        const name = safeText(phase.name, 64);
        const count = finiteNonNegative(phase.count);
        const phaseTotalMs = finiteNonNegative(phase.totalMs);
        const maxMs = finiteNonNegative(phase.maxMs);
        if (
          !name ||
          !VELA_PULL_PHASES.has(name) ||
          count == null ||
          !Number.isInteger(count) ||
          phaseTotalMs == null ||
          maxMs == null
        ) {
          continue;
        }
        if (seenPhases.has(name)) continue;
        seenPhases.add(name);
        phases.push({ name, count, totalMs: phaseTotalMs, maxMs });
      }
    }
    console.info(
      `[od] shared_project_pull_profile ${JSON.stringify({
        event: 'shared_project_pull_profile',
        schemaVersion: 1,
        phase: 'vela-child-done',
        atMs: Date.now(),
        success: record.success,
        kind,
        resourceId,
        ref,
        startedAt,
        finishedAt,
        totalMs,
        phases,
      })}`,
    );
  }
}
