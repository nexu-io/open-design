import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseFrontmatter } from "../packages/plugin-runtime/src/parsers/frontmatter.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const craftRoot = path.join(repoRoot, "craft");
const futureSectionsPath = path.join(craftRoot, "FUTURE_SECTIONS.md");
const skillManifestRoots = [
  "skills",
  "design-templates",
  "plugins/_official/examples",
  "docs/examples",
];
const pluginManifestRoot = "plugins/_official";
const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

export type CraftReference = {
  manifestPath: string;
  slug: unknown;
};

export type CraftReferenceViolation = CraftReference & {
  kind: "invalid" | "unresolved";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbsenceError(error: unknown): boolean {
  return isRecord(error) && (error["code"] === "ENOENT" || error["code"] === "ENOTDIR");
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

function toRepositoryPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function extractCraftRequiresSlugs(source: string): unknown[] {
  const { data } = parseFrontmatter(source);
  const od = data["od"];
  if (!isRecord(od)) return [];

  const craft = od["craft"];
  if (!isRecord(craft)) return [];

  const requires = craft["requires"];
  return Array.isArray(requires) ? [...requires] : [];
}

export function extractPluginManifestContextCraftSlugs(source: string): unknown[] {
  const manifest: unknown = JSON.parse(source);
  if (!isRecord(manifest)) return [];

  const od = manifest["od"];
  if (!isRecord(od)) return [];

  const context = od["context"];
  if (!isRecord(context)) return [];

  const craft = context["craft"];
  return Array.isArray(craft) ? [...craft] : [];
}

export function findCraftReferenceViolations(
  references: CraftReference[],
  existingSlugs: ReadonlySet<string>,
  futureSlugs: ReadonlySet<string>,
): CraftReferenceViolation[] {
  const violations: CraftReferenceViolation[] = [];

  for (const reference of references) {
    if (typeof reference.slug !== "string" || !slugPattern.test(reference.slug)) {
      violations.push({ ...reference, kind: "invalid" });
      continue;
    }
    if (!existingSlugs.has(reference.slug) && !futureSlugs.has(reference.slug)) {
      violations.push({ ...reference, kind: "unresolved" });
    }
  }

  return violations;
}

async function collectNamedManifests(directory: string, fileName: string): Promise<string[]> {
  if (!(await pathExists(directory))) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const manifests: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...(await collectNamedManifests(fullPath, fileName)));
    } else if (entry.isFile() && entry.name === fileName) {
      manifests.push(fullPath);
    }
  }

  return manifests;
}

export async function collectCraftReferences(root: string = repoRoot): Promise<CraftReference[]> {
  const skillManifests = (
    await Promise.all(
      skillManifestRoots.map((manifestRoot) =>
        collectNamedManifests(path.join(root, manifestRoot), "SKILL.md"),
      ),
    )
  ).flat();
  const pluginManifests = await collectNamedManifests(
    path.join(root, pluginManifestRoot),
    "open-design.json",
  );
  const references: CraftReference[] = [];

  for (const manifestPath of skillManifests) {
    const source = await readFile(manifestPath, "utf8");
    for (const slug of extractCraftRequiresSlugs(source)) {
      references.push({
        manifestPath: toRepositoryPath(root, manifestPath),
        slug,
      });
    }
  }

  for (const manifestPath of pluginManifests) {
    const source = await readFile(manifestPath, "utf8");
    for (const slug of extractPluginManifestContextCraftSlugs(source)) {
      references.push({
        manifestPath: toRepositoryPath(root, manifestPath),
        slug,
      });
    }
  }

  return references.sort((left, right) => left.manifestPath.localeCompare(right.manifestPath));
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

function extractFutureCraftSlugs(source: string): Set<string> {
  const slugs = new Set<string>();

  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*[-*]\s+`?([a-z0-9][a-z0-9-]*)`?\s*$/.exec(line);
    if (match?.[1]) slugs.add(match[1]);
  }

  return slugs;
}

async function collectFutureCraftSlugs(): Promise<Set<string>> {
  if (!(await pathExists(futureSectionsPath))) return new Set();
  return extractFutureCraftSlugs(await readFile(futureSectionsPath, "utf8"));
}

function formatSlug(slug: unknown): string {
  return typeof slug === "string" ? `'${slug}'` : JSON.stringify(slug);
}

function printViolations(violations: CraftReferenceViolation[]): void {
  const invalid = violations.filter((violation) => violation.kind === "invalid");
  const unresolved = violations.filter((violation) => violation.kind === "unresolved");

  if (invalid.length > 0) {
    console.error("Invalid craft reference entries:");
    for (const violation of invalid) {
      console.error(`- ${violation.manifestPath}: ${formatSlug(violation.slug)}`);
    }
    console.error("Craft slugs must be strings containing lowercase letters, digits, and hyphens only.");
  }

  if (unresolved.length > 0) {
    console.error("Unresolved craft reference slugs:");
    for (const violation of unresolved) {
      console.error(`- ${violation.manifestPath}: ${formatSlug(violation.slug)}`);
    }
    console.error("Add craft/<slug>.md, fix the typo, or list an intentional forward reference in craft/FUTURE_SECTIONS.md.");
  }
}

export async function checkCraftReferences(): Promise<boolean> {
  const references = await collectCraftReferences();
  const existingSlugs = await collectExistingCraftSlugs();
  const futureSlugs = await collectFutureCraftSlugs();
  const violations = findCraftReferenceViolations(references, existingSlugs, futureSlugs);
  const manifestCount = new Set(references.map((reference) => reference.manifestPath)).size;

  if (violations.length > 0) {
    printViolations(violations);
    return false;
  }

  console.log(
    `Craft reference check passed: ${references.length} references across ${manifestCount} manifests resolve or are explicitly planned.`,
  );
  return true;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain && !(await checkCraftReferences())) {
  process.exitCode = 1;
}
