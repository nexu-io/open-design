// Plugin registry. Phase 1 scope:
//
// - Scans `<daemonDataDir>/plugins/<id>/` (the OD-canonical install root) for
//   manifest folders.
// - Resolves a plugin folder into either an `open-design.json`-anchored
//   manifest or a synthesized one derived from `SKILL.md` /
//   `.claude-plugin/plugin.json` (per spec §3 compatibility matrix).
// - Persists discovered records into the `installed_plugins` SQLite row so
//   subsequent CLI / HTTP calls can read without rescanning the FS.
//
// Phase 2A will add the project-cwd tier and the legacy SKILL.md tiers; we
// keep this module narrow today so the loader / installer split stays
// honest. Adding more tiers is a pure data-source change and never a
// schema migration.

import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import {
  adaptAgentSkill,
  adaptClaudePlugin,
  mergeManifests,
  parseManifest,
  validateSafe,
  type ManifestParseResult,
} from '@open-design/plugin-runtime';
import type {
  InstalledPluginRecord,
  MarketplaceTrust,
  PluginManifest,
  PluginSourceKind,
  TrustTier,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;
type DbRow = Record<string, unknown>;

export interface RegistryRoots {
  // User-installed plugin bytes. Production passes a daemon data-root-derived
  // value; tests can point this at a sandbox.
  userPluginsRoot: string;
}

export function registryRootsForDataDir(dataDir: string): RegistryRoots {
  return {
    userPluginsRoot: path.join(dataDir, 'plugins'),
  };
}

export function defaultRegistryRoots(): RegistryRoots {
  return registryRootsForDataDir(path.resolve(process.env.OD_DATA_DIR ?? path.join(process.cwd(), '.od')));
}

export interface ScannedPlugin {
  record: InstalledPluginRecord;
  warnings: string[];
}

export interface ResolveOptions {
  // The on-disk folder. Used for both reading and computing the manifest's
  // sourceDigest. Phase 2A swaps this to the registry's discovered fsPath.
  folder: string;
  folderId: string;
  sourceKind?: PluginSourceKind;
  source?: string;
  pinnedRef?: string;
  trust?: TrustTier;
  capabilitiesGranted?: string[];
  sourceMarketplaceId?: string;
  sourceMarketplaceEntryName?: string;
  sourceMarketplaceEntryVersion?: string;
  marketplaceTrust?: MarketplaceTrust;
  resolvedSource?: string;
  resolvedRef?: string;
  manifestDigest?: string;
  archiveIntegrity?: string;
}

export interface ResolveOutcome {
  ok: true;
  record: InstalledPluginRecord;
  warnings: string[];
}

export interface ResolveFailure {
  ok: false;
  errors: string[];
  warnings: string[];
}

export type ResolveResult = ResolveOutcome | ResolveFailure;

// Resolve a single plugin folder into a typed InstalledPluginRecord. Pure
// FS read, no SQLite write — the installer module is the only writer.
export async function resolvePluginFolder(opts: ResolveOptions): Promise<ResolveResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const folder = opts.folder;

  let stats: fs.Stats;
  try {
    stats = await fsp.stat(folder);
  } catch (err) {
    return { ok: false, errors: [`Plugin folder not found: ${folder} (${(err as Error).message})`], warnings };
  }
  if (!stats.isDirectory()) {
    return { ok: false, errors: [`Plugin path is not a directory: ${folder}`], warnings };
  }

  const sidecarPath = path.join(folder, 'open-design.json');
  const skillPath = path.join(folder, 'SKILL.md');
  const claudePath = path.join(folder, '.claude-plugin', 'plugin.json');

  let sidecar: PluginManifest | undefined;
  if (fs.existsSync(sidecarPath)) {
    const rawSidecar = await fsp.readFile(sidecarPath, 'utf8');
    const parsed: ManifestParseResult = parseManifest(rawSidecar);
    if (!parsed.ok) {
      errors.push(...parsed.errors.map((e) => `open-design.json: ${e}`));
    } else {
      sidecar = parsed.manifest;
      warnings.push(...parsed.warnings);
    }
  }

  const adapters: PluginManifest[] = [];
  if (fs.existsSync(skillPath)) {
    const raw = await fsp.readFile(skillPath, 'utf8');
    const adapted = adaptAgentSkill(raw, { folderId: opts.folderId });
    adapters.push(adapted.manifest);
    warnings.push(...adapted.warnings);
  }
  if (fs.existsSync(claudePath)) {
    const raw = await fsp.readFile(claudePath, 'utf8');
    const adapted = adaptClaudePlugin(raw, { folderId: opts.folderId });
    adapters.push(adapted.manifest);
    warnings.push(...adapted.warnings);
  }

  if (!sidecar && adapters.length === 0) {
    return {
      ok: false,
      errors: [...errors, `Plugin folder contains no SKILL.md, no .claude-plugin/plugin.json, and no open-design.json: ${folder}`],
      warnings,
    };
  }

  const manifest = mergeManifests({ sidecar, adapters });
  const validation = validateSafe(manifest);
  warnings.push(...validation.warnings);
  if (!validation.ok) {
    return { ok: false, errors: [...errors, ...validation.errors], warnings };
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const now = Date.now();
  // The manifest name wins (spec §5.1: plugin id IS the manifest name). The
  // folderId fallback only kicks in when an adapter-only manifest forgot to
  // set name, which Zod validation already rejects.
  const id = (manifest.name ?? opts.folderId).toLowerCase();
  const record: InstalledPluginRecord = {
    id,
    title: manifest.title ?? manifest.name,
    version: manifest.version,
    sourceKind: opts.sourceKind ?? 'local',
    source: opts.source ?? folder,
    pinnedRef: opts.pinnedRef,
    sourceMarketplaceId: opts.sourceMarketplaceId,
    sourceMarketplaceEntryName: opts.sourceMarketplaceEntryName,
    sourceMarketplaceEntryVersion: opts.sourceMarketplaceEntryVersion,
    marketplaceTrust: opts.marketplaceTrust,
    resolvedSource: opts.resolvedSource,
    resolvedRef: opts.resolvedRef,
    manifestDigest: opts.manifestDigest,
    archiveIntegrity: opts.archiveIntegrity,
    trust: opts.trust ?? 'restricted',
    capabilitiesGranted: opts.capabilitiesGranted ?? defaultRestrictedCapabilities(),
    manifest,
    fsPath: folder,
    installedAt: now,
    updatedAt: now,
  };
  return { ok: true, record, warnings };
}

function defaultRestrictedCapabilities(): string[] {
  // Spec §5.3: restricted plugins start with prompt:inject only. Apply-time
  // grants land additional capabilities on the snapshot, never here.
  return ['prompt:inject'];
}

// Map a SQLite row back into an InstalledPluginRecord. Centralized so every
// reader gets the same JSON parsing contract.
export function rowToInstalledPlugin(row: DbRow): InstalledPluginRecord {
  const manifestJson = typeof row['manifest_json'] === 'string' ? (row['manifest_json'] as string) : '{}';
  const manifest = JSON.parse(manifestJson) as PluginManifest;
  const capabilitiesJson = typeof row['capabilities_granted'] === 'string' ? (row['capabilities_granted'] as string) : '[]';
  const capabilities = JSON.parse(capabilitiesJson) as string[];
  return {
    id:                  String(row['id']),
    title:               String(row['title']),
    version:             String(row['version']),
    sourceKind:          row['source_kind'] as PluginSourceKind,
    source:              String(row['source']),
    pinnedRef:           row['pinned_ref'] != null ? String(row['pinned_ref']) : undefined,
    sourceDigest:        row['source_digest'] != null ? String(row['source_digest']) : undefined,
    sourceMarketplaceId: row['source_marketplace_id'] != null ? String(row['source_marketplace_id']) : undefined,
    sourceMarketplaceEntryName: row['source_marketplace_entry_name'] != null ? String(row['source_marketplace_entry_name']) : undefined,
    sourceMarketplaceEntryVersion: row['source_marketplace_entry_version'] != null ? String(row['source_marketplace_entry_version']) : undefined,
    marketplaceTrust:    row['marketplace_trust'] != null ? row['marketplace_trust'] as MarketplaceTrust : undefined,
    resolvedSource:      row['resolved_source'] != null ? String(row['resolved_source']) : undefined,
    resolvedRef:         row['resolved_ref'] != null ? String(row['resolved_ref']) : undefined,
    manifestDigest:      row['manifest_digest'] != null ? String(row['manifest_digest']) : undefined,
    archiveIntegrity:    row['archive_integrity'] != null ? String(row['archive_integrity']) : undefined,
    trust:               row['trust'] as TrustTier,
    capabilitiesGranted: Array.isArray(capabilities) ? capabilities : [],
    manifest,
    fsPath:              String(row['fs_path']),
    installedAt:         Number(row['installed_at']),
    updatedAt:           Number(row['updated_at']),
  };
}

export function listInstalledPlugins(db: SqliteDb): InstalledPluginRecord[] {
  const rows = db.prepare(`SELECT * FROM installed_plugins ORDER BY title ASC`).all() as DbRow[];
  return rows.map(rowToInstalledPlugin);
}

export function getInstalledPlugin(db: SqliteDb, id: string): InstalledPluginRecord | null {
  const row = db.prepare(`SELECT * FROM installed_plugins WHERE id = ?`).get(id) as DbRow | undefined;
  return row ? rowToInstalledPlugin(row) : null;
}

export function upsertInstalledPlugin(db: SqliteDb, record: InstalledPluginRecord): void {
  db.prepare(`
    INSERT INTO installed_plugins (
      id, title, version, source_kind, source, pinned_ref, source_digest,
      source_marketplace_id, source_marketplace_entry_name,
      source_marketplace_entry_version, marketplace_trust, resolved_source,
      resolved_ref, manifest_digest, archive_integrity,
      trust, capabilities_granted, manifest_json,
      fs_path, installed_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      version = excluded.version,
      source_kind = excluded.source_kind,
      source = excluded.source,
      pinned_ref = excluded.pinned_ref,
      source_digest = excluded.source_digest,
      source_marketplace_id = excluded.source_marketplace_id,
      source_marketplace_entry_name = excluded.source_marketplace_entry_name,
      source_marketplace_entry_version = excluded.source_marketplace_entry_version,
      marketplace_trust = excluded.marketplace_trust,
      resolved_source = excluded.resolved_source,
      resolved_ref = excluded.resolved_ref,
      manifest_digest = excluded.manifest_digest,
      archive_integrity = excluded.archive_integrity,
      trust = excluded.trust,
      capabilities_granted = excluded.capabilities_granted,
      manifest_json = excluded.manifest_json,
      fs_path = excluded.fs_path,
      updated_at = excluded.updated_at
  `).run(
    record.id,
    record.title,
    record.version,
    record.sourceKind,
    record.source,
    record.pinnedRef ?? null,
    record.sourceDigest ?? null,
    record.sourceMarketplaceId ?? null,
    record.sourceMarketplaceEntryName ?? null,
    record.sourceMarketplaceEntryVersion ?? null,
    record.marketplaceTrust ?? null,
    record.resolvedSource ?? null,
    record.resolvedRef ?? null,
    record.manifestDigest ?? null,
    record.archiveIntegrity ?? null,
    record.trust,
    JSON.stringify(record.capabilitiesGranted ?? []),
    JSON.stringify(record.manifest),
    record.fsPath,
    record.installedAt,
    record.updatedAt,
  );
}

export function deleteInstalledPlugin(db: SqliteDb, id: string): boolean {
  const info = db.prepare(`DELETE FROM installed_plugins WHERE id = ?`).run(id);
  return info.changes > 0;
}
