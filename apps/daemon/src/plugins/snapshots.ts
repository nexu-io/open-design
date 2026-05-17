// Snapshot writer. Spec §8.2.1 demands this be the only module that issues
// INSERT/UPDATE against `applied_plugin_snapshots`. Plan §2 names a CI guard
// for the rule; the apply pipeline must never touch the table directly.
//
// Phase 1 ships:
//   - createSnapshot()  — INSERT a fresh row, stamping expires_at via the
//     PB2 unreferenced TTL knob.
//   - getSnapshot()     — read by id.
//   - linkSnapshotToRun() — once a run starts off the snapshot, pin
//     expires_at = NULL and update run_id (the snapshot is now referenced).
//   - markSnapshotStale() — `od plugin doctor` flips status='stale' after a
//     plugin upgrade. We never rewrite the resolved_context_json, so historic
//     reproducibility wins over freshness.

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { readPluginEnvKnobs } from '../app-config.js';
import {
  OPEN_DESIGN_PLUGIN_SPEC_VERSION,
  type AppliedPluginSnapshot,
  type GenUISurfaceSpec,
  type McpServerSpec,
  type PluginAssetRef,
  type PluginConnectorBinding,
  type PluginConnectorRef,
  type PluginPipeline,
  type ResolvedContext,
} from '@open-design/contracts';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

export interface CreateSnapshotInput {
  projectId: string;
  conversationId?: string | null | undefined;
  runId?: string | null | undefined;
  pluginId: string;
  pluginSpecVersion?: string | null | undefined;
  pluginVersion: string;
  pluginTitle?: string | undefined;
  pluginDescription?: string | undefined;
  manifestSourceDigest: string;
  sourceMarketplaceId?: string | null | undefined;
  sourceMarketplaceEntryName?: string | null | undefined;
  sourceMarketplaceEntryVersion?: string | null | undefined;
  marketplaceTrust?: 'official' | 'trusted' | 'restricted' | null | undefined;
  resolvedSource?: string | null | undefined;
  resolvedRef?: string | null | undefined;
  archiveIntegrity?: string | null | undefined;
  pinnedRef?: string | null | undefined;
  taskKind: AppliedPluginSnapshot['taskKind'];
  inputs: Record<string, string | number | boolean>;
  resolvedContext: ResolvedContext;
  pipeline?: PluginPipeline | undefined;
  genuiSurfaces?: GenUISurfaceSpec[] | undefined;
  capabilitiesGranted: string[];
  capabilitiesRequired: string[];
  assetsStaged: PluginAssetRef[];
  connectorsRequired: PluginConnectorRef[];
  connectorsResolved: PluginConnectorBinding[];
  mcpServers: McpServerSpec[];
  query?: string | undefined;
}

export function createSnapshot(db: SqliteDb, input: CreateSnapshotInput): AppliedPluginSnapshot {
  const id = randomUUID();
  const now = Date.now();
  const knobs = readPluginEnvKnobs();
  // Per PB2: when a snapshot is created without an associated run, stamp an
  // expiry; when a run is already linked, the snapshot is referenced and the
  // GC worker never touches it.
  const expiresAt = input.runId
    ? null
    : knobs.snapshotUnreferencedTtlDays > 0
      ? now + knobs.snapshotUnreferencedTtlDays * 24 * 60 * 60 * 1000
      : null;

  db.prepare(`
    INSERT INTO applied_plugin_snapshots (
      id, project_id, conversation_id, run_id, plugin_id, plugin_spec_version, plugin_version,
      manifest_source_digest, source_marketplace_id, source_marketplace_entry_name,
      source_marketplace_entry_version, marketplace_trust, resolved_source,
      resolved_ref, archive_integrity, pinned_ref, task_kind,
      inputs_json, resolved_context_json, pipeline_json, genui_surfaces_json,
      capabilities_granted, capabilities_required, assets_staged_json,
      connectors_required_json, connectors_resolved_json, mcp_servers_json,
      plugin_title, plugin_description, query_text,
      status, applied_at, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'fresh', ?, ?)
  `).run(
    id,
    input.projectId,
    input.conversationId ?? null,
    input.runId ?? null,
    input.pluginId,
    input.pluginSpecVersion ?? OPEN_DESIGN_PLUGIN_SPEC_VERSION,
    input.pluginVersion,
    input.manifestSourceDigest,
    input.sourceMarketplaceId ?? null,
    input.sourceMarketplaceEntryName ?? null,
    input.sourceMarketplaceEntryVersion ?? null,
    input.marketplaceTrust ?? null,
    input.resolvedSource ?? null,
    input.resolvedRef ?? null,
    input.archiveIntegrity ?? null,
    input.pinnedRef ?? null,
    input.taskKind,
    JSON.stringify(input.inputs),
    JSON.stringify(input.resolvedContext),
    input.pipeline ? JSON.stringify(input.pipeline) : null,
    JSON.stringify(input.genuiSurfaces ?? []),
    JSON.stringify(input.capabilitiesGranted),
    JSON.stringify(input.capabilitiesRequired),
    JSON.stringify(input.assetsStaged),
    JSON.stringify(input.connectorsRequired),
    JSON.stringify(input.connectorsResolved),
    JSON.stringify(input.mcpServers),
    input.pluginTitle ?? null,
    input.pluginDescription ?? null,
    input.query ?? null,
    now,
    expiresAt,
  );

  const snapshot: AppliedPluginSnapshot = buildSnapshot({
    id,
    appliedAt: now,
    input,
    status: 'fresh',
  });
  return snapshot;
}

export function getSnapshot(db: SqliteDb, snapshotId: string): AppliedPluginSnapshot | null {
  const row = db.prepare(`SELECT * FROM applied_plugin_snapshots WHERE id = ?`).get(snapshotId) as DbRow | undefined;
  if (!row) return null;
  return rowToSnapshot(row);
}

export function listSnapshotsForProject(db: SqliteDb, projectId: string): AppliedPluginSnapshot[] {
  const rows = db
    .prepare(`SELECT * FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC`)
    .all(projectId) as DbRow[];
  return rows.map(rowToSnapshot);
}

export function linkSnapshotToRun(db: SqliteDb, snapshotId: string, runId: string): void {
  db.prepare(`
    UPDATE applied_plugin_snapshots
       SET run_id = ?, expires_at = NULL
     WHERE id = ?
  `).run(runId, snapshotId);
}

// Pin a snapshot to a project row. Mirrors `linkSnapshotToRun` but
// updates `projects.applied_plugin_snapshot_id` (added by `migratePlugins`)
// and also clears `expires_at` because a project-pinned snapshot is now
// referenced (PB2 reproducibility-first). Idempotent — re-linking the
// same id is a no-op.
export function linkSnapshotToProject(db: SqliteDb, snapshotId: string, projectId: string): void {
  db.prepare(
    `UPDATE applied_plugin_snapshots
        SET project_id = ?, expires_at = NULL
      WHERE id = ?`,
  ).run(projectId, snapshotId);
  db.prepare(
    `UPDATE projects
        SET applied_plugin_snapshot_id = ?
      WHERE id = ?`,
  ).run(snapshotId, projectId);
}

// Pin a snapshot to a conversation row. Same shape as
// `linkSnapshotToProject` but mutates `conversations.applied_plugin_snapshot_id`.
// Used when a plugin is applied inside an existing chat composer (§8.4).
export function linkSnapshotToConversation(
  db: SqliteDb,
  snapshotId: string,
  conversationId: string,
): void {
  db.prepare(
    `UPDATE applied_plugin_snapshots
        SET conversation_id = ?, expires_at = NULL
      WHERE id = ?`,
  ).run(conversationId, snapshotId);
  db.prepare(
    `UPDATE conversations
        SET applied_plugin_snapshot_id = ?
      WHERE id = ?`,
  ).run(snapshotId, conversationId);
}

export function markSnapshotStale(db: SqliteDb, snapshotId: string): void {
  db.prepare(`UPDATE applied_plugin_snapshots SET status = 'stale' WHERE id = ?`).run(snapshotId);
}

// Phase 5 / PB2 enforcement (§16). Deletes every `applied_plugin_snapshots`
// row whose `expires_at` is non-null and not in the future. Returns the
// count + the ids that were removed so callers can audit. Pure side-effect
// over SQLite; safe to call from a periodic worker. The caller decides the
// `now` clock so tests can pin time.
export interface PruneExpiredResult {
  removed: number;
  ids: string[];
}

export interface PruneExpiredOptions {
  // Override for tests so the clock is deterministic.
  now?: number;
  // Operator escape hatch: force-delete unreferenced rows older than
  // this unix-ms timestamp even when their TTL has not yet expired.
  // Does NOT touch referenced rows (run_id IS NOT NULL); the
  // `retentionDays` knob below is the only way to reach those.
  before?: number;
  // Plan §3.M1 / spec PB2 / §16 Phase 5 — operator-opt-in
  // referenced-row TTL. When set, snapshots are eligible for deletion
  // even after they have been linked to a run / conversation / project,
  // provided two conditions:
  //
  //   (1) `applied_at < now - retentionDays * 86_400_000`
  //   (2) the referenced run / conversation / project is "terminal"
  //
  // v1 implements (2) as: the snapshot's `project_id` no longer
  // appears in `projects` (i.e. the project was deleted). Runs are
  // in-memory in v1 so we cannot distinguish "active" vs "completed"
  // from SQLite alone; `conversations.archived_at` does not exist.
  // The conservative rule keeps reproducibility wins for live
  // projects while letting operators clean up after `od project
  // delete <id>` so dangling snapshot rows don't accumulate.
  retentionDays?: number;
}

export function pruneExpiredSnapshots(
  db: SqliteDb,
  options: PruneExpiredOptions = {},
): PruneExpiredResult {
  const now = options.now ?? Date.now();
  const cutoff = typeof options.before === 'number' ? options.before : now;
  const expiredIds = db
    .prepare(
      `SELECT id FROM applied_plugin_snapshots
        WHERE expires_at IS NOT NULL AND expires_at <= ?`,
    )
    .all(cutoff) as Array<{ id: string }>;
  const beforeIds = typeof options.before === 'number'
    ? (db
        .prepare(
          `SELECT id FROM applied_plugin_snapshots
            WHERE expires_at IS NULL AND run_id IS NULL AND applied_at <= ?`,
        )
        .all(options.before) as Array<{ id: string }>)
    : [];

  // Plan §3.M1 — referenced-row TTL.
  //
  // Pull every snapshot whose `applied_at` is older than
  // `now - retentionDays * 86_400_000` and whose `project_id` no
  // longer exists in `projects`. The LEFT JOIN approach lets us run
  // a single query per sweep instead of N project lookups.
  const retentionIds: Array<{ id: string }> = [];
  if (typeof options.retentionDays === 'number' && options.retentionDays > 0) {
    const retentionCutoff = now - options.retentionDays * 24 * 60 * 60 * 1000;
    const rows = db
      .prepare(
        `SELECT s.id AS id
           FROM applied_plugin_snapshots s
           LEFT JOIN projects p ON p.id = s.project_id
          WHERE s.applied_at <= ?
            AND p.id IS NULL`,
      )
      .all(retentionCutoff) as Array<{ id: string }>;
    retentionIds.push(...rows);
  }

  const ids = [...expiredIds, ...beforeIds, ...retentionIds].map((r) => r.id);
  // Dedupe — a row might match both expires_at and retentionDays.
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return { removed: 0, ids: [] };
  const placeholders = unique.map(() => '?').join(', ');
  db.prepare(`DELETE FROM applied_plugin_snapshots WHERE id IN (${placeholders})`).run(...unique);
  return { removed: unique.length, ids: unique };
}

export function countSnapshotsForProject(db: SqliteDb, projectId: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM applied_plugin_snapshots WHERE project_id = ?`).get(projectId) as DbRow;
  return Number(row['n'] ?? 0);
}

function buildSnapshot(args: {
  id: string;
  appliedAt: number;
  input: CreateSnapshotInput;
  status: AppliedPluginSnapshot['status'];
}): AppliedPluginSnapshot {
  const { id, appliedAt, input, status } = args;
  const snapshot: AppliedPluginSnapshot = {
    snapshotId:           id,
    pluginId:             input.pluginId,
    pluginSpecVersion:    input.pluginSpecVersion ?? OPEN_DESIGN_PLUGIN_SPEC_VERSION,
    pluginVersion:        input.pluginVersion,
    manifestSourceDigest: input.manifestSourceDigest,
    sourceMarketplaceId:  input.sourceMarketplaceId ?? undefined,
    sourceMarketplaceEntryName: input.sourceMarketplaceEntryName ?? undefined,
    sourceMarketplaceEntryVersion: input.sourceMarketplaceEntryVersion ?? undefined,
    marketplaceTrust:     input.marketplaceTrust ?? undefined,
    resolvedSource:       input.resolvedSource ?? undefined,
    resolvedRef:          input.resolvedRef ?? undefined,
    archiveIntegrity:     input.archiveIntegrity ?? undefined,
    pinnedRef:            input.pinnedRef ?? undefined,
    inputs:               input.inputs,
    resolvedContext:      input.resolvedContext,
    capabilitiesGranted:  input.capabilitiesGranted,
    capabilitiesRequired: input.capabilitiesRequired,
    assetsStaged:         input.assetsStaged,
    taskKind:             input.taskKind,
    appliedAt,
    connectorsRequired:   input.connectorsRequired,
    connectorsResolved:   input.connectorsResolved,
    mcpServers:           input.mcpServers,
    pipeline:             input.pipeline,
    genuiSurfaces:        input.genuiSurfaces,
    pluginTitle:          input.pluginTitle,
    pluginDescription:    input.pluginDescription,
    query:                input.query,
    status,
  };
  return snapshot;
}

export function rowToSnapshot(row: DbRow): AppliedPluginSnapshot {
  const pipeline = parseJsonOrUndefined<PluginPipeline>(row['pipeline_json']);
  const snapshot: AppliedPluginSnapshot = {
    snapshotId:           String(row['id']),
    pluginId:             String(row['plugin_id']),
    pluginSpecVersion:    row['plugin_spec_version'] != null ? String(row['plugin_spec_version']) : undefined,
    pluginVersion:        String(row['plugin_version']),
    manifestSourceDigest: String(row['manifest_source_digest']),
    sourceMarketplaceId:  row['source_marketplace_id'] != null ? String(row['source_marketplace_id']) : undefined,
    sourceMarketplaceEntryName: row['source_marketplace_entry_name'] != null ? String(row['source_marketplace_entry_name']) : undefined,
    sourceMarketplaceEntryVersion: row['source_marketplace_entry_version'] != null ? String(row['source_marketplace_entry_version']) : undefined,
    marketplaceTrust:     row['marketplace_trust'] != null ? row['marketplace_trust'] as AppliedPluginSnapshot['marketplaceTrust'] : undefined,
    resolvedSource:       row['resolved_source'] != null ? String(row['resolved_source']) : undefined,
    resolvedRef:          row['resolved_ref'] != null ? String(row['resolved_ref']) : undefined,
    archiveIntegrity:     row['archive_integrity'] != null ? String(row['archive_integrity']) : undefined,
    pinnedRef:            row['pinned_ref'] != null ? String(row['pinned_ref']) : undefined,
    inputs:               parseJsonOr<Record<string, string | number | boolean>>(row['inputs_json'], {}),
    resolvedContext:      parseJsonOr<ResolvedContext>(row['resolved_context_json'], { items: [] }),
    capabilitiesGranted:  parseJsonOr<string[]>(row['capabilities_granted'], []),
    capabilitiesRequired: parseJsonOr<string[]>(row['capabilities_required'], []),
    assetsStaged:         parseJsonOr<PluginAssetRef[]>(row['assets_staged_json'], []),
    taskKind:             row['task_kind'] as AppliedPluginSnapshot['taskKind'],
    appliedAt:            Number(row['applied_at']),
    connectorsRequired:   parseJsonOr<PluginConnectorRef[]>(row['connectors_required_json'], []),
    connectorsResolved:   parseJsonOr<PluginConnectorBinding[]>(row['connectors_resolved_json'], []),
    mcpServers:           parseJsonOr<McpServerSpec[]>(row['mcp_servers_json'], []),
    pipeline,
    genuiSurfaces:        parseJsonOr<GenUISurfaceSpec[]>(row['genui_surfaces_json'], []),
    pluginTitle:          row['plugin_title'] != null ? String(row['plugin_title']) : undefined,
    pluginDescription:    row['plugin_description'] != null ? String(row['plugin_description']) : undefined,
    query:                row['query_text'] != null ? String(row['query_text']) : undefined,
    status:               row['status'] === 'stale' ? 'stale' : 'fresh',
  };
  return snapshot;
}

function parseJsonOr<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseJsonOrUndefined<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
