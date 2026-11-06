// Phase 4 / spec §13 / plan §3.Y1 — installed-plugin search + filters.
//
// Pure helper that filters and ranks an in-memory list of
// InstalledPluginRecord by an optional free-text query, plus
// structural filters (taskKind / mode / tag / trust).
//
// The function is consumed by:
//   - `od plugin search <query>` (new in §3.Y1) — searches installed
//     plugins for discovery,
//   - `od plugin list --filter ...` (new in §3.Y1) — same filter
//     surface without requiring a query.
//
// The matcher is intentionally simple — case-insensitive substring
// across id, title, description, and tag list. Spec §13's full-text
// + relevance-ranked search lives on the marketplace catalog side;
// this helper is for the local installed roster only and never
// pretends to be a search engine.

import type { InstalledPluginRecord, PluginManifest, TrustTier } from '@open-design/contracts';

export interface SearchInstalledPluginsInput {
  plugins: ReadonlyArray<InstalledPluginRecord>;
  // Free-text matcher. Empty / undefined → no text filter.
  query?: string;
  // Filter shapes (all optional, all AND'd together).
  taskKind?: string;
  mode?:     string;
  tag?:      string;
  trust?:    TrustTier;
  // When true, restrict to bundled plugins (source_kind='bundled'
  // OR trust='bundled'). False excludes them. Default: include all.
  bundled?:  boolean;
}

export interface SearchInstalledPluginsResultEntry {
  plugin: InstalledPluginRecord;
  // Lower is a better match. Roughly: 0=id exact, 1=title exact,
  // 2=tag exact, 3=substring on id, 4=substring on title, 5=
  // description, 6=tag substring, 9=structural-filter-only match.
  // Pure relative-rank field; the absolute number isn't an API.
  rank: number;
  // Which fields fired the match. Useful for the CLI to surface
  // 'matched on tag: figma-migration'.
  matched: Array<'id' | 'title' | 'description' | 'tag' | 'taskKind' | 'mode' | 'trust' | 'bundled'>;
}

export interface SearchInstalledPluginsResult {
  entries: SearchInstalledPluginsResultEntry[];
  total:   number;
}

export function searchInstalledPlugins(input: SearchInstalledPluginsInput): SearchInstalledPluginsResult {
  const query = (input.query ?? '').trim().toLowerCase();
  const taskKind = input.taskKind?.trim().toLowerCase();
  const mode     = input.mode?.trim().toLowerCase();
  const tag      = input.tag?.trim().toLowerCase();
  const trust    = input.trust;
  const bundledFilter = input.bundled;

  const out: SearchInstalledPluginsResultEntry[] = [];
  for (const plugin of input.plugins) {
    const manifest = plugin.manifest;
    const matched: SearchInstalledPluginsResultEntry['matched'] = [];

    // Structural filters first (cheap; short-circuit on miss).
    if (taskKind && (manifest.od?.taskKind ?? '').toLowerCase() !== taskKind) continue;
    if (taskKind) matched.push('taskKind');
    if (mode && (manifest.od?.mode ?? '').toLowerCase() !== mode) continue;
    if (mode) matched.push('mode');
    if (trust && plugin.trust !== trust) continue;
    if (trust) matched.push('trust');
    if (typeof bundledFilter === 'boolean') {
      const isBundled = plugin.sourceKind === 'bundled' || plugin.trust === 'bundled';
      if (isBundled !== bundledFilter) continue;
      if (bundledFilter) matched.push('bundled');
    }
    const tags = collectTags(manifest);
    if (tag && !tags.some((t) => t.toLowerCase() === tag)) continue;
    if (tag) matched.push('tag');

    // Free-text rank.
    let rank: number | undefined;
    if (query) {
      const id = plugin.id.toLowerCase();
      const title = (plugin.title ?? manifest.title ?? '').toLowerCase();
      const description = (manifest.description ?? '').toLowerCase();
      if (id === query)            { rank = 0; matched.push('id'); }
      else if (title === query)    { rank = 1; matched.push('title'); }
      else if (tags.some((t) => t.toLowerCase() === query)) { rank = 2; matched.push('tag'); }
      else if (id.includes(query)) { rank = 3; matched.push('id'); }
      else if (title.includes(query)) { rank = 4; matched.push('title'); }
      else if (description.includes(query)) { rank = 5; matched.push('description'); }
      else if (tags.some((t) => t.toLowerCase().includes(query))) { rank = 6; matched.push('tag'); }
      else continue; // query supplied but no field matched → skip.
    } else {
      rank = matched.length > 0 ? 9 : 0; // no query: all surviving entries kept
    }

    out.push({ plugin, rank, matched });
  }

  // Stable sort: rank ascending, then id alphabetical for tie-break.
  out.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.plugin.id.localeCompare(b.plugin.id);
  });

  return { entries: out, total: out.length };
}

function collectTags(manifest: PluginManifest): string[] {
  const raw = manifest.tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string' && t.length > 0);
}
