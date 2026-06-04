/*
 * Helper for the Solution use-case pages: pick a fixed, ordered set of
 * catalogue records by manifest id, failing the build (rather than silently
 * shipping a short grid) when any id is missing.
 *
 * AGENTS.md prefers crash-visible failures over hidden fallbacks: the
 * featured ids are required content, so a renamed or removed plugin should
 * break the build loudly instead of degrading the page.
 */
import type { BundledPluginRecord } from './bundled-plugins';

export function pickSolutionPlugins(
  pool: ReadonlyArray<BundledPluginRecord>,
  ids: ReadonlyArray<string>,
  context: string,
): BundledPluginRecord[] {
  const byId = new Map(pool.map((p) => [p.manifestId, p]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(
      `[solutions/${context}] featured catalogue records not found: ${missing.join(', ')}. ` +
        `These manifest ids must exist in plugins/_official/ (the build emits their previews). ` +
        `Update the FEATURED_* list or fix the renamed/removed plugin.`,
    );
  }
  return ids.map((id) => byId.get(id)!);
}
