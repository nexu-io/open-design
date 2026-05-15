import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InstalledPluginRecord } from '@open-design/contracts';

export interface PluginLockEntry {
  name: string;
  version: string;
  source: string;
  sourceKind: string;
  sourceMarketplaceId?: string;
  sourceMarketplaceEntryName?: string;
  resolvedSource?: string;
  resolvedRef?: string;
  manifestDigest?: string;
  archiveIntegrity?: string;
  lockedAt: number;
}

export interface PluginLockfile {
  schemaVersion: 1;
  plugins: Record<string, PluginLockEntry>;
}

export function defaultPluginLockfile(): PluginLockfile {
  return { schemaVersion: 1, plugins: {} };
}

export function lockEntryFromInstalled(
  plugin: InstalledPluginRecord,
  lockedAt = Date.now(),
): PluginLockEntry {
  const entry: PluginLockEntry = {
    name: plugin.sourceMarketplaceEntryName ?? plugin.id,
    version: plugin.sourceMarketplaceEntryVersion ?? plugin.version,
    source: plugin.source,
    sourceKind: plugin.sourceKind,
    lockedAt,
  };
  if (plugin.sourceMarketplaceId) entry.sourceMarketplaceId = plugin.sourceMarketplaceId;
  if (plugin.sourceMarketplaceEntryName) entry.sourceMarketplaceEntryName = plugin.sourceMarketplaceEntryName;
  if (plugin.resolvedSource) entry.resolvedSource = plugin.resolvedSource;
  if (plugin.resolvedRef) entry.resolvedRef = plugin.resolvedRef;
  if (plugin.manifestDigest) entry.manifestDigest = plugin.manifestDigest;
  if (plugin.archiveIntegrity) entry.archiveIntegrity = plugin.archiveIntegrity;
  return entry;
}

export async function readPluginLockfile(filePath: string): Promise<PluginLockfile> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PluginLockfile;
    return {
      schemaVersion: 1,
      plugins: parsed && typeof parsed.plugins === 'object' && parsed.plugins
        ? parsed.plugins
        : {},
    };
  } catch {
    return defaultPluginLockfile();
  }
}

export async function writePluginLockfile(
  filePath: string,
  lockfile: PluginLockfile,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const sorted: PluginLockfile = {
    schemaVersion: 1,
    plugins: Object.fromEntries(
      Object.entries(lockfile.plugins).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
  await writeFile(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

export async function upsertPluginLockfileEntry(
  filePath: string,
  plugin: InstalledPluginRecord,
  lockedAt = Date.now(),
): Promise<PluginLockfile> {
  const lockfile = await readPluginLockfile(filePath);
  const entry = lockEntryFromInstalled(plugin, lockedAt);
  lockfile.plugins[entry.name] = entry;
  await writePluginLockfile(filePath, lockfile);
  return lockfile;
}
