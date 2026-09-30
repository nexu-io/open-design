// Plugin catalog search, shared by the composer's two surfaces: the @-mention
// picker's ranked list and the tools-pane filter.
//
// Two behaviors that used to be wrong inline:
//
// 1. Localized titles were not indexed. The UI displays
//    `manifest.title_i18n[locale]` (see ./localization), but the search index
//    held only the raw English title/id/description/tags — so a plugin could
//    be found by "prototype" and never by its localized name 原型标注.
//    Every locale is indexed, not just the active one, so the two directions
//    both work.
//
// 2. Results were filtered and then truncated in catalog order. Hundreds of
//    example plugins carry generic tags (every web example is tagged
//    `prototype`), so a query that matches the NAME of a late-alphabet plugin
//    was crowded out by incidental tag hits. `rankPluginMatches` puts
//    name hits first.

import type { InstalledPluginRecord } from '@open-design/contracts';

/**
 * Localized values on a manifest (`title_i18n` / `description_i18n`) as a flat
 * list. Non-object or non-string entries are ignored rather than throwing —
 * plugin manifests are user-authored content.
 */
export function manifestLocalizedValues(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>)
    .filter((text): text is string => typeof text === 'string');
}

/** Title-ish search text: raw title + id + every localized title. */
export function pluginTitleSearchText(plugin: InstalledPluginRecord): string {
  return [
    plugin.title,
    plugin.id,
    ...manifestLocalizedValues(plugin.manifest?.title_i18n),
  ].join(' ').toLowerCase();
}

/** Full search text, including localized descriptions, source, and tags. */
export function pluginSearchText(plugin: InstalledPluginRecord): string {
  return [
    pluginTitleSearchText(plugin),
    plugin.sourceKind,
    plugin.source,
    plugin.manifest?.description ?? '',
    ...manifestLocalizedValues(plugin.manifest?.description_i18n),
    ...(plugin.manifest?.tags ?? []),
  ].join(' ').toLowerCase();
}

/** Case-insensitive substring match across the full search text. */
export function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return pluginSearchText(plugin).includes(q);
}

/**
 * Match strength, lowest first:
 *   0 — the name (title/id/localized title) starts with the query
 *   1 — the name contains the query
 *   2 — description / tags / source contain it (incidental)
 *  -1 — no match
 */
export function pluginMatchTier(plugin: InstalledPluginRecord, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const titles = pluginTitleSearchText(plugin);
  if (titles.includes(q)) return titles.startsWith(q) ? 0 : 1;
  return pluginSearchText(plugin).includes(q) ? 2 : -1;
}

/**
 * The plugin rows the picker should render for `query`: strongest matches
 * first, catalog order preserved within a tier, capped at `limit`.
 */
export function rankPluginMatches(
  plugins: InstalledPluginRecord[],
  query: string,
  limit = 8,
): InstalledPluginRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return plugins.slice(0, limit);
  const scored: { record: InstalledPluginRecord; tier: number }[] = [];
  for (const plugin of plugins) {
    const tier = pluginMatchTier(plugin, q);
    if (tier >= 0) scored.push({ record: plugin, tier });
  }
  // Array#sort is stable, so catalog order survives within a tier.
  scored.sort((a, b) => a.tier - b.tier);
  return scored.slice(0, limit).map((entry) => entry.record);
}
