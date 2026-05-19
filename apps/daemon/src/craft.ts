// Craft references loader. The active skill declares which sections it
// needs via `od.craft.requires`; this module reads the matching files
// from <projectRoot>/craft/<slug>.md and returns a single concatenated
// body ready to splice into the system prompt. Missing files are
// dropped silently — a skill that lists `motion` before we ship a
// motion.md should still work, just without the motion section.

import { readFile } from "node:fs/promises";
import path from "node:path";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

interface CraftResult {
  /** Concatenated markdown (each file preceded by a level-3 section header). */
  body: string;
  /** Slugs that actually resolved (files existed and were non-empty). */
  sections: string[];
}

export async function loadCraftSections(
  craftDir: string,
  requested: unknown[],
): Promise<CraftResult> {
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
      // File doesn't exist or unreadable — skip silently.
    }
  }
  return { body: parts.join("\n\n---\n\n"), sections };
}
