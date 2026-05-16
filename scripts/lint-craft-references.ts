// Lint craft section references across skills and design-templates.
//
// Background: `apps/daemon/src/craft.ts` resolves each slug under a
// skill's `od.craft.requires` into `craft/<slug>.md` and splices the
// snippet into the system prompt. The loader silently drops slugs
// that don't have a matching file, by deliberate design — skills are
// allowed to forward-reference future craft sections without
// breaking. (See the inline comment in `craft.ts`.)
//
// The downside is that typos drop silently too. A skill that asks
// for `typograpy` instead of `typography` quietly loses that
// knowledge slice at runtime, with no signal at PR time, no signal
// at boot, and no signal in `pnpm guard`.
//
// This script lints for that typo class without taking away the
// forward-reference allowance. It:
//
//   1. Reads every `skills/*/SKILL.md` and `design-templates/*/SKILL.md`,
//      extracts the `craft.requires` slug list.
//   2. Reads `craft/*.md` to learn which slugs do exist today.
//   3. Reads `craft/FUTURE_SECTIONS.md` (if present) for slugs the
//      project is intentionally forward-referencing. Falls back to an
//      empty list if absent — the policy decision on whether to keep
//      a future-section allowlist is tracked in #1886.
//   4. Reports any slug referenced by a skill but neither present in
//      `craft/` nor in the future list. That's the typo class.
//
// Exit code stays 0 by default — this is informational, matching the
// scope of #1886 ("RFC before code, please"). To make it blocking,
// pass `--strict` or wire it into `pnpm guard`; the runtime loader
// behavior in `craft.ts` is unchanged either way.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const craftDirectory = path.join(repoRoot, "craft");
const skillsDirectory = path.join(repoRoot, "skills");
const designTemplatesDirectory = path.join(repoRoot, "design-templates");
const futureSectionsFile = path.join(craftDirectory, "FUTURE_SECTIONS.md");

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type Reference = {
  manifestPath: string;
  slug: string;
};

async function readExistingCraftSlugs(): Promise<Set<string>> {
  const entries = await readdir(craftDirectory, { withFileTypes: true });
  const slugs = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name === "README.md") continue;
    const slug = entry.name.slice(0, -".md".length);
    if (SLUG_RE.test(slug)) slugs.add(slug);
  }
  return slugs;
}

async function readFutureSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  try {
    const text = await readFile(futureSectionsFile, "utf8");
    // Pick up slugs in any of three flavors. A `FUTURE_SECTIONS.md`
    // can use any of them:
    //   1. bullet-list items:        `- slug` or `* slug`
    //   2. inline-code spans:        `` `slug` ``
    //   3. bare slugs on their own line: `slug`
    // (1) and (2) cover slugs that sit inside prose paragraphs;
    // (3) covers the simplest flat list. The bare-line pattern is
    // anchored to the full line so prose like `Implement pixel-discipline`
    // doesn't grab `pixel-discipline` accidentally — only a line that
    // contains exactly the slug (and optional whitespace) counts.
    const patterns = [
      /(?:^[*\-]\s*|`)([a-z0-9][a-z0-9-]*)(?:`|$)/gm,
      /^[ \t]*([a-z0-9][a-z0-9-]*)[ \t]*$/gm,
    ];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const slug = match[1];
        if (slug && SLUG_RE.test(slug)) slugs.add(slug);
      }
    }
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      return slugs;
    }
    throw err;
  }
  return slugs;
}

function extractCraftRequiresSlugs(source: string): string[] {
  // SKILL.md frontmatter shape (yaml-flavored):
  //
  //   craft:
  //     requires: [typography, accessibility-baseline, state-coverage]
  //
  // or:
  //
  //   craft:
  //     requires:
  //       - typography
  //       - accessibility-baseline
  //
  const inlineMatch = /^\s*craft:\s*\n\s*requires:\s*\[([^\]\n]*)\]/m.exec(source);
  if (inlineMatch) {
    const list = inlineMatch[1];
    if (!list) return [];
    return list
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => part.replace(/^['"]|['"]$/g, ""));
  }
  const blockMatch = /^\s*craft:\s*\n\s*requires:\s*\n((?:\s*-\s*[^\n]+\n)+)/m.exec(source);
  if (blockMatch) {
    const block = blockMatch[1];
    if (!block) return [];
    return block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .map((token) => token.replace(/^['"]|['"]$/g, ""))
      .filter((token) => token.length > 0);
  }
  return [];
}

async function collectReferences(root: string): Promise<Reference[]> {
  const out: Reference[] = [];
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      return out;
    }
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(root, entry.name, "SKILL.md");
    let text: string;
    try {
      text = await readFile(skillPath, "utf8");
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        continue;
      }
      throw err;
    }
    for (const slug of extractCraftRequiresSlugs(text)) {
      out.push({ manifestPath: path.relative(repoRoot, skillPath), slug });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");

  const existing = await readExistingCraftSlugs();
  const future = await readFutureSlugs();
  const references = [
    ...(await collectReferences(skillsDirectory)),
    ...(await collectReferences(designTemplatesDirectory)),
  ];

  const unresolved = new Map<string, Reference[]>();
  let totalReferences = 0;
  for (const ref of references) {
    totalReferences += 1;
    if (existing.has(ref.slug)) continue;
    if (future.has(ref.slug)) continue;
    const list = unresolved.get(ref.slug) ?? [];
    list.push(ref);
    unresolved.set(ref.slug, list);
  }

  console.log(
    `craft references: ${totalReferences} total across ${references.length === 0 ? 0 : new Set(references.map((r) => r.manifestPath)).size} manifests`,
  );
  console.log(
    `craft sections present: ${existing.size} (${[...existing].sort().join(", ") || "—"})`,
  );
  if (future.size > 0) {
    console.log(
      `craft sections marked future-only: ${future.size} (${[...future].sort().join(", ")})`,
    );
  } else {
    console.log("craft sections marked future-only: 0 (no craft/FUTURE_SECTIONS.md present)");
  }
  console.log("");

  if (unresolved.size === 0) {
    console.log("OK — every craft.requires slug resolves against craft/<slug>.md or the future list.");
    return;
  }

  console.log(`Unresolved craft slugs (likely typos or missing-from-future-list): ${unresolved.size}`);
  for (const [slug, refs] of [...unresolved.entries()].sort()) {
    console.log(`  '${slug}' — referenced by ${refs.length} manifest(s):`);
    for (const ref of refs.slice(0, 5)) {
      console.log(`    - ${ref.manifestPath}`);
    }
    if (refs.length > 5) {
      console.log(`    - …and ${refs.length - 5} more`);
    }
  }

  if (strict) {
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("This report is informational (no --strict). See #1886 for the policy discussion.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
