// Phase 4 / spec §23.3.5 — bundled plugin boot walker.
//
// On daemon startup, scan `<repo-root>/plugins/_official/**` for
// folders that look like installable plugin manifests (a SKILL.md
// + open-design.json pair) and register every match into the
// `installed_plugins` table under `source_kind='bundled'` /
// `trust='bundled'`. Bundled plugins are the preinstalled cache of the
// official registry source: they can carry marketplace provenance while
// their bytes stay inside the runtime image for offline first-run use.
// They never enter the user's home install root; their fs_path stays
// inside the repo so a daemon upgrade rotates them in lockstep with the
// daemon code.
//
// `od plugin uninstall` of a bundled plugin is rejected by the
// installer (a future patch); for now, removing the row leaves the
// next boot to re-register, so it's safe.
//
// The walker is idempotent: re-running it updates the manifest_json
// + version column for any folder that changed since last boot,
// matching the spec §23 promise that "bundled plugins replace only on
// daemon upgrade".

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type Database from 'better-sqlite3';
import {
  deleteInstalledPlugin,
  resolvePluginFolder,
  upsertInstalledPlugin,
  type RegistryRoots,
} from './registry.js';
import type { InstalledPluginRecord, MarketplaceTrust } from '@open-design/contracts';

type SqliteDb = Database.Database;

export interface RegisterBundledPluginsInput {
  db: SqliteDb;
  // Absolute path to `<repo-root>/plugins/_official`. The walker
  // recurses one level down (`atoms/<atom>`, `scenarios/<scenario>`,
  // `bundles/<bundle>`) so the layout matches spec §23.3.5.
  bundledRoot: string;
  // Optional registry roots override; bundled plugins do not write to
  // userPluginsRoot but the installer code path expects one anyway.
  roots?: RegistryRoots;
  marketplaceProvenance?: {
    sourceMarketplaceId: string;
    marketplaceTrust: MarketplaceTrust;
    entryNamePrefix: string;
  };
}

export interface RegisterBundledPluginsResult {
  registered: InstalledPluginRecord[];
  // Bundled rows deleted because their folder is gone from this image.
  pruned: string[];
  warnings: string[];
}

const SAFE_BASENAME = /^[a-z0-9][a-z0-9._-]*$/;

export async function registerBundledPlugins(
  input: RegisterBundledPluginsInput,
): Promise<RegisterBundledPluginsResult> {
  const out: InstalledPluginRecord[] = [];
  const warnings: string[] = [];
  // Every bundled folder we attempted this walk — including ones that
  // failed to parse. Pruning keys off this set so a folder that still
  // ships but has a broken manifest is warned about, not deleted.
  const seenFolderIds = new Set<string>();

  let topLevel;
  try {
    topLevel = await fsp.readdir(input.bundledRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // A missing bundledRoot is a packaging problem, not a removal of
      // every bundled plugin — never prune on this path.
      return { registered: [], pruned: [], warnings: [] };
    }
    throw err;
  }

  for (const tier of topLevel) {
    if (!tier.isDirectory()) continue;
    // Two layouts are supported:
    //   - plugins/_official/<plugin-id>/        — direct plugin
    //   - plugins/_official/atoms/<atom>/       — atom subtree
    //   - plugins/_official/scenarios/<id>/     — scenario subtree
    //   - plugins/_official/bundles/<id>/       — bundle subtree
    // We try the direct shape first, then recurse one level if the
    // tier directory itself isn't a manifest folder.
    const tierAbs = path.join(input.bundledRoot, tier.name);
    const tierManifest = path.join(tierAbs, 'open-design.json');
    if (await pathExists(tierManifest)) {
      // Direct: <bundledRoot>/<plugin-id>/open-design.json
      await registerOne({ folder: tierAbs, folderId: tier.name, out, warnings, seenFolderIds, input });
      continue;
    }
    let inner;
    try {
      inner = await fsp.readdir(tierAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of inner) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(tierAbs, entry.name);
      const manifest = path.join(folder, 'open-design.json');
      if (!(await pathExists(manifest))) continue;
      await registerOne({ folder, folderId: entry.name, out, warnings, seenFolderIds, input });
    }
  }

  const pruned = pruneRemovedBundledPlugins(input.db, seenFolderIds);
  return { registered: out, pruned, warnings };
}

// Bundled rows mirror the bundled tree: spec §23 promises that bundled
// plugins "replace only on daemon upgrade", and removal is part of that
// rotation. A folder dropped from this image must also leave the
// `installed_plugins` table, otherwise upgraded installs keep serving a
// record whose backing files no longer exist. Scoped to
// source_kind='bundled' so user installs are never touched, and only runs
// after a successful walk (the ENOENT early-return above never prunes).
function pruneRemovedBundledPlugins(
  db: SqliteDb,
  present: ReadonlySet<string>,
): string[] {
  const rows = db
    .prepare(`SELECT id FROM installed_plugins WHERE source_kind = 'bundled'`)
    .all() as Array<{ id: string }>;
  const pruned: string[] = [];
  for (const row of rows) {
    if (present.has(row.id)) continue;
    deleteInstalledPlugin(db, row.id);
    pruned.push(row.id);
  }
  return pruned;
}

async function registerOne(args: {
  folder: string;
  folderId: string;
  out: InstalledPluginRecord[];
  warnings: string[];
  seenFolderIds: Set<string>;
  input: RegisterBundledPluginsInput;
}): Promise<void> {
  const folderId = args.folderId.toLowerCase();
  if (!SAFE_BASENAME.test(folderId)) {
    args.warnings.push(`bundled folder name ${args.folderId} is not a safe id; skipped`);
    return;
  }
  args.seenFolderIds.add(folderId);
  const probe = await resolvePluginFolder({
    folder:     args.folder,
    folderId,
    sourceKind: 'bundled',
    source:     args.folder,
    // Ship the manifest under trust='bundled' per spec §23.3.4.
    // apply.ts coerces this to 'trusted' at apply time so the snapshot
    // contract stays binary; the source-of-truth for "this came from
    // the daemon image" is the source_kind column.
    trust: 'bundled',
  });
  if (!probe.ok) {
    args.warnings.push(`bundled plugin ${args.folderId} failed to parse: ${probe.errors.join('; ')}`);
    return;
  }
  const record = withMarketplaceProvenance(probe.record, args.input.marketplaceProvenance);
  upsertInstalledPlugin(args.input.db, record);
  args.seenFolderIds.add(record.id);
  args.out.push(record);
}

function withMarketplaceProvenance(
  record: InstalledPluginRecord,
  provenance: RegisterBundledPluginsInput['marketplaceProvenance'],
): InstalledPluginRecord {
  if (!provenance) return record;
  return {
    ...record,
    sourceMarketplaceId:           provenance.sourceMarketplaceId,
    sourceMarketplaceEntryName:    `${provenance.entryNamePrefix}/${record.id}`,
    sourceMarketplaceEntryVersion: record.version,
    marketplaceTrust:              provenance.marketplaceTrust,
    resolvedSource:                record.source,
  };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

// Default bundled root resolution. The daemon ships its `dist/` next to
// the repo, but the canonical bundled location is the repo root's
// `plugins/_official/` directory. We resolve that by walking up from
// the daemon binary's location until we find a `package.json` whose
// name matches the workspace root, or fall back to a sensible default.
export function defaultBundledRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'plugins', '_official');
}
