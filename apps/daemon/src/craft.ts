// Craft references loader and request resolver. Skills and design systems
// can opt into sections explicitly, while deck generation receives the
// typography baseline even when it arrived through a plugin or freeform
// prompt with no persisted skill id. Missing files are dropped silently —
// a caller that lists `motion` before we ship motion.md should still work.

import { readFile } from "node:fs/promises";
import path from "node:path";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface ResolveCraftRequirementsInput {
  isWebCloneRun?: boolean;
  metadataKind?: string | null;
  skillModes?: Iterable<string>;
  freeformDeckSignal?: boolean;
  skillRequires?: readonly string[];
  designSystemApplies?: readonly string[];
  designSystemExemptions?: readonly string[];
}

function normalizeCraftSlugs(values: Iterable<string> | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const slug = value.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }
  return normalized;
}

/**
 * Resolve the craft sections for one run.
 *
 * Deck typography is a runtime invariant, not only a skill opt-in: official
 * deck plugins keep `project.skill_id` empty and freeform deck prompts can do
 * the same. Without this fallback those paths miss the CJK leading rules in
 * craft/typography.md and can render multi-line Chinese headings at Latin
 * poster leading.
 */
export function resolveCraftRequirements({
  isWebCloneRun = false,
  metadataKind,
  skillModes,
  freeformDeckSignal = false,
  skillRequires = [],
  designSystemApplies = [],
  designSystemExemptions = [],
}: ResolveCraftRequirementsInput): string[] {
  if (isWebCloneRun) return [];

  const modes = new Set(normalizeCraftSlugs(skillModes));
  const isDeckProject = metadataKind === "deck" || modes.has("deck");
  const isFreeformDeck =
    modes.size === 0
    && (!metadataKind || metadataKind === "other")
    && freeformDeckSignal;
  const requested = normalizeCraftSlugs([
    ...skillRequires,
    ...designSystemApplies,
    ...(isDeckProject || isFreeformDeck ? ["typography"] : []),
  ]);
  const excluded = new Set(normalizeCraftSlugs(designSystemExemptions));
  return requested.filter((slug) => !excluded.has(slug));
}

/**
 * @param {string} craftDir absolute path to the craft/ directory
 * @param {string[]} requested slugs from `od.craft.requires`
 * @returns {Promise<{ body: string, sections: string[] }>}
 *   body is the concatenated markdown (each file preceded by a level-3
 *   section header). sections lists which slugs actually resolved.
 */
export async function loadCraftSections(craftDir: string, requested: unknown[]) {
  if (!craftDir || !Array.isArray(requested) || requested.length === 0) {
    return { body: "", sections: [] };
  }
  const seen = new Set<string>();
  const parts: string[] = [];
  const sections: string[] = [];
  for (const raw of requested) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    try {
      const filePath = path.join(craftDir, `${slug}.md`);
      const text = await readFile(filePath, "utf8");
      const trimmed = text.trim();
      if (!trimmed) continue;
      parts.push(`### ${slug}\n\n${trimmed}`);
      sections.push(slug);
    } catch {
      // File doesn't exist or unreadable — skip silently. Skills can
      // forward-reference future craft sections without breaking.
    }
  }
  return { body: parts.join("\n\n---\n\n"), sections };
}
