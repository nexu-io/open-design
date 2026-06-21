import type { AppliedPluginSnapshot, InstalledPluginRecord, PluginManifest } from '@open-design/contracts';

export function getPluginContextCraft(plugin: InstalledPluginRecord): string[] {
  return getManifestContextCraft(plugin.manifest);
}

export function getManifestContextCraft(manifest: PluginManifest): string[] {
  return normalizeCraftRequires(manifest.od?.context?.craft);
}

export function getSnapshotContextCraft(snapshot: AppliedPluginSnapshot): string[] {
  return normalizeCraftRequires(snapshot.craftRequires);
}

function normalizeCraftRequires(declared: unknown): string[] {
  if (!Array.isArray(declared) || declared.length === 0) return [];

  const seen = new Set<string>();
  const craft: string[] = [];
  for (const entry of declared) {
    if (typeof entry !== 'string') continue;
    const slug = entry.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    craft.push(slug);
  }
  return craft;
}
