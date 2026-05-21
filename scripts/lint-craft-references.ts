import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const craftRoot = path.join(repoRoot, "craft");
const futureSectionsPath = path.join(craftRoot, "FUTURE_SECTIONS.md");
const manifestRoots = [
  "skills",
  "design-templates",
  "plugins/_official/examples",
  "docs/examples",
];

const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

type CraftReference = {
  manifestPath: string;
  slug: string;
};

type CraftLintOptions = {
  strict?: boolean;
};

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isRecord(value: unknown): value is { code?: unknown } {
  return typeof value === "object" && value !== null;
}

function isAbsenceError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isAbsenceError(error)) return false;
    throw error;
  }
}

async function collectSkillManifests(rootDirectory: string): Promise<string[]> {
  if (!(await pathExists(rootDirectory))) return [];

  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const manifests: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...(await collectSkillManifests(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      manifests.push(fullPath);
    }
  }

  return manifests;
}

function extractFrontmatter(source: string): string | null {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) return null;
  return lines.slice(1, endIndex).join("\n");
}

function indentation(line: string): number {
  const match = /^ */.exec(line);
  return match?.[0].length ?? 0;
}

function stripSlugDecorators(value: string): string {
  return value.trim().replace(/^["'`]+/, "").replace(/["'`]+$/, "").trim();
}

function parseInlineSlugList(rawValue: string): string[] | null {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  return trimmed
    .slice(1, -1)
    .split(",")
    .map(stripSlugDecorators)
    .filter((value) => value.length > 0);
}

function parseBlockSlugList(lines: string[], startIndex: number, parentIndent: number): string[] {
  const slugs: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) continue;

    const lineIndent = indentation(line);
    if (lineIndent <= parentIndent) break;

    const match = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const slug = stripSlugDecorators(match[1] ?? "");
    if (slug) slugs.push(slug);
  }

  return slugs;
}

function extractRequiresFromCraftBlock(lines: string[], craftIndex: number): string[] {
  const slugs: string[] = [];
  const craftIndent = indentation(lines[craftIndex] ?? "");

  for (let index = craftIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) continue;

    const lineIndent = indentation(line);
    if (lineIndent <= craftIndent) break;

    const match = /^\s*requires:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;

    const inlineSlugs = parseInlineSlugList(match[1] ?? "");
    if (inlineSlugs) {
      slugs.push(...inlineSlugs);
      continue;
    }

    slugs.push(...parseBlockSlugList(lines, index, lineIndent));
  }

  return slugs;
}

export function extractCraftRequiresSlugs(source: string): string[] {
  const frontmatter = extractFrontmatter(source);
  if (!frontmatter) return [];

  const lines = frontmatter.split(/\r?\n/);
  const slugs: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*craft:\s*$/.test(lines[index] ?? "")) {
      slugs.push(...extractRequiresFromCraftBlock(lines, index));
    }
  }

  return slugs;
}

async function collectCraftReferences(): Promise<CraftReference[]> {
  const manifests = (
    await Promise.all(manifestRoots.map((root) => collectSkillManifests(path.join(repoRoot, root))))
  ).flat();
  const references: CraftReference[] = [];

  for (const manifest of manifests) {
    const source = await readFile(manifest, "utf8");
    const manifestPath = toRepositoryPath(manifest);
    for (const slug of extractCraftRequiresSlugs(source)) {
      references.push({ manifestPath, slug });
    }
  }

  return references.sort((a, b) => (
    a.slug.localeCompare(b.slug) || a.manifestPath.localeCompare(b.manifestPath)
  ));
}

async function collectExistingCraftSlugs(): Promise<Set<string>> {
  const entries = await readdir(craftRoot, { withFileTypes: true });
  const slugs = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".md") continue;
    const slug = path.basename(entry.name, ".md");
    if (slug === "README" || slug === "FUTURE_SECTIONS") continue;
    if (slugPattern.test(slug)) slugs.add(slug);
  }

  return slugs;
}

function extractFutureSlug(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const listMatch = /^[-*]\s+`?([a-z0-9][a-z0-9-]*)`?(?:\s*(?:#.*)?)?$/.exec(trimmed);
  if (listMatch) return listMatch[1] ?? null;

  const bareMatch = /^`?([a-z0-9][a-z0-9-]*)`?$/.exec(trimmed);
  return bareMatch?.[1] ?? null;
}

async function collectFutureCraftSlugs(): Promise<Set<string>> {
  if (!(await pathExists(futureSectionsPath))) return new Set();

  const source = await readFile(futureSectionsPath, "utf8");
  const slugs = new Set<string>();

  for (const line of source.split(/\r?\n/)) {
    const slug = extractFutureSlug(line);
    if (slug) slugs.add(slug);
  }

  return slugs;
}

function formatSlugList(slugs: Set<string>): string {
  const values = [...slugs].sort();
  if (values.length === 0) return "none";
  return values.join(", ");
}

function groupReferencesBySlug(references: CraftReference[]): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();

  for (const reference of references) {
    if (!grouped.has(reference.slug)) {
      grouped.set(reference.slug, new Set());
    }
    grouped.get(reference.slug)?.add(reference.manifestPath);
  }

  return new Map(
    [...grouped.entries()].map(([slug, manifestPaths]) => [
      slug,
      [...manifestPaths].sort(),
    ]),
  );
}

export function findInvalidCraftReferences(references: CraftReference[]): CraftReference[] {
  return references.filter((reference) => !slugPattern.test(reference.slug));
}

function printInvalidReferences(invalid: Map<string, string[]>): void {
  console.error(`Invalid craft slug syntax: ${invalid.size}`);
  for (const [slug, manifestPaths] of invalid) {
    console.error(`  '${slug}' is not a valid craft slug and is referenced by ${manifestPaths.length} manifest(s):`);
    for (const manifestPath of manifestPaths) {
      console.error(`    - ${manifestPath}`);
    }
  }
  console.error("Use lowercase letters, digits, and hyphens only; slugs must start with a letter or digit.");
}

function printUnresolvedReferences(unresolved: Map<string, string[]>): void {
  console.error(`Unresolved craft slugs: ${unresolved.size}`);
  for (const [slug, manifestPaths] of unresolved) {
    console.error(`  '${slug}' is referenced by ${manifestPaths.length} manifest(s):`);
    for (const manifestPath of manifestPaths) {
      console.error(`    - ${manifestPath}`);
    }
  }
  console.error("Add a matching craft/<slug>.md file, fix the typo, or list the planned slug in craft/FUTURE_SECTIONS.md.");
}

export async function checkCraftReferences(options: CraftLintOptions = {}): Promise<boolean> {
  const strict = options.strict ?? true;
  const references = await collectCraftReferences();
  const existingSlugs = await collectExistingCraftSlugs();
  const futureSlugs = await collectFutureCraftSlugs();
  const referencedManifestCount = new Set(references.map((reference) => reference.manifestPath)).size;

  console.log(`craft references: ${references.length} total across ${referencedManifestCount} manifests`);
  console.log(`craft sections present: ${existingSlugs.size} (${formatSlugList(existingSlugs)})`);
  console.log(`craft sections marked future-only: ${futureSlugs.size} (${formatSlugList(futureSlugs)})`);

  const invalidReferences = findInvalidCraftReferences(references);
  const validReferences = references.filter((reference) => slugPattern.test(reference.slug));
  const unresolvedReferences = validReferences.filter(
    (reference) => !existingSlugs.has(reference.slug) && !futureSlugs.has(reference.slug),
  );
  const invalid = groupReferencesBySlug(invalidReferences);
  const unresolved = groupReferencesBySlug(unresolvedReferences);

  if (invalid.size === 0 && unresolved.size === 0) {
    console.log("Craft reference check passed: every od.craft.requires slug resolves or is listed as planned.");
    return true;
  }

  if (invalid.size > 0) printInvalidReferences(invalid);
  if (unresolved.size > 0) printUnresolvedReferences(unresolved);
  return !strict;
}

async function main(): Promise<void> {
  const warnOnly = process.argv.includes("--warn-only");
  const passed = await checkCraftReferences({ strict: !warnOnly });
  if (!passed) process.exitCode = 1;
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  await main();
}
