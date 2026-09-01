import type Database from 'better-sqlite3';
import type {
  ProjectMetadata,
  ProjectScenarioBinding,
  ProjectScenarioBindingProvenance,
  ProjectScenarioTaskProfile,
} from '@open-design/contracts';
import { defaultScenarioTaskProfileForProjectMetadata } from '@open-design/contracts';

type SqliteDb = Database.Database;

interface ProjectBindingRow {
  id: string;
  metadataJson: string | null;
  snapshotId: string | null;
  pluginId: string | null;
  appliedAt: number | null;
}

function parseMetadata(value: string | null): ProjectMetadata | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as ProjectMetadata
      : undefined;
  } catch {
    return undefined;
  }
}

export function isProjectScenarioBinding(value: unknown): value is ProjectScenarioBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Partial<ProjectScenarioBinding>;
  return binding.schemaVersion === 1
    && (
      binding.provenance === 'automatic_default'
      || binding.provenance === 'explicit_user'
      || binding.provenance === 'legacy_unknown'
    )
    && typeof binding.pluginId === 'string'
    && binding.pluginId.length > 0
    && typeof binding.snapshotId === 'string'
    && binding.snapshotId.length > 0
    && typeof binding.boundAt === 'number'
    && Number.isFinite(binding.boundAt)
    && (
      binding.taskProfile === undefined
      || binding.taskProfile === 'prototype'
      || binding.taskProfile === 'ppt'
      || binding.taskProfile === 'marketing'
      || binding.taskProfile === 'hyperframes'
    );
}

/**
 * Return the only OD Next profile a daemon-owned automatic binding may carry.
 * The decision is based on exact product metadata plus the exact bundled
 * default plugin; broad project kinds such as `image` are intentionally not
 * sufficient.
 */
export function automaticScenarioTaskProfile(input: {
  metadata: ProjectMetadata | null | undefined;
  pluginId: string;
}): ProjectScenarioTaskProfile | null {
  return defaultScenarioTaskProfileForProjectMetadata(input.metadata, input.pluginId);
}

/**
 * One-way migration for projects created before exact provenance existed.
 * Existing pins are deliberately labelled `legacy_unknown`; this migration
 * never guesses that a historical binding came from the automatic router.
 */
export function migrateProjectScenarioBindings(db: SqliteDb): void {
  const rows = db.prepare(`
    SELECT p.id,
           p.metadata_json AS metadataJson,
           p.applied_plugin_snapshot_id AS snapshotId,
           s.plugin_id AS pluginId,
           s.applied_at AS appliedAt
      FROM projects p
      LEFT JOIN applied_plugin_snapshots s
        ON s.id = p.applied_plugin_snapshot_id
  `).all() as ProjectBindingRow[];

  const update = db.prepare(`UPDATE projects SET metadata_json = ? WHERE id = ?`);
  db.transaction(() => {
    for (const row of rows) {
      const metadata = parseMetadata(row.metadataJson);
      const current = metadata?.scenarioBinding;
      const hasExactCurrent = isProjectScenarioBinding(current)
        && current.snapshotId === row.snapshotId
        && current.pluginId === row.pluginId;
      const hadRetiredMarker = Boolean(
        metadata
        && Object.prototype.hasOwnProperty.call(metadata, 'automaticDefaultScenario'),
      );
      if (hasExactCurrent && !hadRetiredMarker) continue;

      const next: Record<string, unknown> = { ...(metadata ?? {}) };
      delete next.automaticDefaultScenario;
      if (row.snapshotId && row.pluginId) {
        next.scenarioBinding = {
          schemaVersion: 1,
          provenance: 'legacy_unknown',
          pluginId: row.pluginId,
          snapshotId: row.snapshotId,
          boundAt: row.appliedAt ?? 0,
        } satisfies ProjectScenarioBinding;
      } else {
        delete next.scenarioBinding;
      }
      update.run(Object.keys(next).length > 0 ? JSON.stringify(next) : null, row.id);
    }
  })();
}

export function writeProjectScenarioBinding(db: SqliteDb, input: {
  projectId: string;
  snapshotId: string;
  pluginId: string;
  provenance: ProjectScenarioBindingProvenance;
  taskProfile?: ProjectScenarioTaskProfile | null;
  boundAt?: number;
}): ProjectScenarioBinding {
  const row = db.prepare(`
    SELECT p.metadata_json AS metadataJson,
           p.applied_plugin_snapshot_id AS snapshotId,
           s.plugin_id AS pluginId
      FROM projects p
      LEFT JOIN applied_plugin_snapshots s
        ON s.id = p.applied_plugin_snapshot_id
     WHERE p.id = ?
  `).get(input.projectId) as Omit<ProjectBindingRow, 'id' | 'appliedAt'> | undefined;
  if (!row || row.snapshotId !== input.snapshotId || row.pluginId !== input.pluginId) {
    throw new Error(`Cannot stamp scenario provenance for an unbound snapshot (${input.projectId})`);
  }

  const metadata = parseMetadata(row.metadataJson);
  const expectedTaskProfile = automaticScenarioTaskProfile({
    metadata,
    pluginId: input.pluginId,
  });
  if (
    input.provenance === 'automatic_default'
      ? (input.taskProfile ?? null) !== expectedTaskProfile
      : input.taskProfile != null
  ) {
    throw new Error(`Cannot stamp mismatched scenario task profile (${input.projectId})`);
  }

  const binding: ProjectScenarioBinding = {
    schemaVersion: 1,
    provenance: input.provenance,
    pluginId: input.pluginId,
    snapshotId: input.snapshotId,
    ...(input.taskProfile ? { taskProfile: input.taskProfile } : {}),
    boundAt: input.boundAt ?? Date.now(),
  };
  const next: Record<string, unknown> = { ...(metadata ?? {}), scenarioBinding: binding };
  delete next.automaticDefaultScenario;
  db.prepare(`UPDATE projects SET metadata_json = ? WHERE id = ?`)
    .run(JSON.stringify(next), input.projectId);
  return binding;
}

export function readVerifiedProjectScenarioBinding(db: SqliteDb, input: {
  projectId: string;
  appliedPluginSnapshotId: string | null | undefined;
  metadata: ProjectMetadata | null | undefined;
}): ProjectScenarioBinding | null {
  const binding = input.metadata?.scenarioBinding;
  if (!isProjectScenarioBinding(binding)) return null;
  if (binding.snapshotId !== input.appliedPluginSnapshotId) return null;
  const row = db.prepare(`
    SELECT plugin_id AS pluginId
      FROM applied_plugin_snapshots
     WHERE id = ? AND project_id = ?
  `).get(binding.snapshotId, input.projectId) as { pluginId?: unknown } | undefined;
  if (row?.pluginId !== binding.pluginId) return null;
  if (binding.provenance !== 'automatic_default') {
    return binding.taskProfile === undefined ? binding : null;
  }
  return (binding.taskProfile ?? null) === automaticScenarioTaskProfile({
    metadata: input.metadata,
    pluginId: binding.pluginId,
  })
    ? binding
    : null;
}
