/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-design-system-manifests.ts
 *
 * Guard for the Design System Project contract. PR1 only validates folders
 * that opt into the project shape by shipping `manifest.json`; legacy
 * DESIGN.md-only systems remain valid and are intentionally skipped.
 *
 * Run standalone: `pnpm exec tsx scripts/check-design-system-manifests.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { access, readFile, readdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";
import type { DesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";
import { extractComponentsManifest } from "../packages/contracts/src/design-systems/components-manifest.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");
const craftRoot = path.join(repoRoot, "craft");
const SKIPPED_DIRECTORIES = new Set(["_schema"]);

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function discoverManifestPaths(): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(designSystemsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const manifestPaths: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const manifestPath = path.join(designSystemsRoot, entry.name, "manifest.json");
    if (await exists(manifestPath)) manifestPaths.push(manifestPath);
  }
  manifestPaths.sort((a, b) => a.localeCompare(b));
  return manifestPaths;
}

export async function checkDesignSystemManifests(): Promise<boolean> {
  const manifestPaths = await discoverManifestPaths();
  const craftSlugs = await discoverCraftSlugs();
  const violations: string[] = [];

  for (const manifestPath of manifestPaths) {
    const brandRoot = path.dirname(manifestPath);
    const folderSlug = path.basename(brandRoot);
    const repositoryManifestPath = toRepositoryPath(manifestPath);
    const parsed = parseDesignSystemProjectManifest(await readFile(manifestPath, "utf8"));

    if (!parsed.ok) {
      for (const error of parsed.errors) violations.push(`${repositoryManifestPath}: ${error}`);
      continue;
    }

    const manifest = parsed.manifest;
    if (manifest.id !== folderSlug) {
      violations.push(`${repositoryManifestPath}: $.id must match folder slug "${folderSlug}"`);
    }
    validateManifestSemantics(violations, repositoryManifestPath, manifest, craftSlugs);

    const requiredFiles = [
      manifest.files.design,
      manifest.files.tokens,
      ...(manifest.files.components === undefined ? [] : [manifest.files.components]),
      ...(manifest.usage === undefined ? [] : [manifest.usage]),
      ...(manifest.componentsManifest === undefined ? [] : [manifest.componentsManifest]),
      ...(manifest.fonts ?? []).map((font) => font.file),
      ...(manifest.preview?.pages ?? []).map((page) => page.path),
      ...Object.values(manifest.sourceFiles ?? {}),
    ];
    for (const fileName of requiredFiles) {
      await requireDeclaredPathExists(violations, repositoryManifestPath, brandRoot, fileName);
    }

    if (manifest.assetsDir !== undefined && !(await exists(path.join(brandRoot, manifest.assetsDir)))) {
      violations.push(`${repositoryManifestPath}: assetsDir is declared but ${manifest.assetsDir}/ does not exist`);
    }
    if (manifest.previewDir !== undefined && !(await exists(path.join(brandRoot, manifest.previewDir)))) {
      violations.push(`${repositoryManifestPath}: previewDir is declared but ${manifest.previewDir}/ does not exist`);
    }
    if (manifest.preview !== undefined && !(await exists(path.join(brandRoot, manifest.preview.dir)))) {
      violations.push(`${repositoryManifestPath}: preview.dir is declared but ${manifest.preview.dir}/ does not exist`);
    }

    await validateDeclaredJsonFiles(violations, repositoryManifestPath, brandRoot, manifest.sourceFiles);
    await validateComponentsManifestCache(violations, repositoryManifestPath, brandRoot, folderSlug, manifest.componentsManifest);
  }

  if (violations.length > 0) {
    console.error("Design system manifest violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log(
    `Design system manifest check passed: ${manifestPaths.length} project manifest${manifestPaths.length === 1 ? "" : "s"} valid; DESIGN.md-only systems skipped.`,
  );
  return true;
}

async function discoverCraftSlugs(): Promise<Set<string>> {
  try {
    const entries = await readdir(craftRoot, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
        .map((entry) => entry.name.slice(0, -".md".length)),
    );
  } catch {
    return new Set();
  }
}

export function validateManifestSemantics(
  violations: string[],
  repositoryManifestPath: string,
  manifest: DesignSystemProjectManifest,
  craftSlugs: ReadonlySet<string>,
): void {
  const applies = manifest.craft?.applies ?? [];
  const suggested = manifest.craft?.suggested ?? [];
  const exemptions = manifest.craft?.exemptions ?? [];
  const declaredCraft = [
    ...applies.map((slug) => ({ slug, field: "applies" })),
    ...suggested.map((slug) => ({ slug, field: "suggested" })),
    ...exemptions.map((slug) => ({ slug, field: "exemptions" })),
  ];
  for (const { slug, field } of declaredCraft) {
    if (!craftSlugs.has(slug)) {
      violations.push(`${repositoryManifestPath}: $.craft.${field} references unknown craft "${slug}"`);
    }
  }

  const exemptionsSet = new Set(exemptions);
  for (const slug of applies) {
    if (exemptionsSet.has(slug)) {
      violations.push(`${repositoryManifestPath}: craft "${slug}" cannot be both applied and exempted`);
    }
  }

  if (manifest.importMode === "hybrid" && manifest.source?.type !== "bundled" && manifest.sourceFiles === undefined) {
    violations.push(`${repositoryManifestPath}: hybrid imports must declare sourceFiles evidence`);
  }
  if (manifest.importMode === "verbatim" && manifest.source?.type !== "bundled") {
    if (manifest.sourceFiles?.tokens === undefined) {
      violations.push(`${repositoryManifestPath}: verbatim imports must declare sourceFiles.tokens`);
    }
    if (manifest.sourceFiles?.snippets === undefined) {
      violations.push(`${repositoryManifestPath}: verbatim imports must declare sourceFiles.snippets`);
    }
  }
}

async function requireDeclaredPathExists(
  violations: string[],
  repositoryManifestPath: string,
  brandRoot: string,
  relativePath: string,
): Promise<void> {
  const target = path.join(brandRoot, relativePath);
  if (!(await exists(target))) {
    violations.push(`${repositoryManifestPath}: ${relativePath} is declared but ${toRepositoryPath(target)} does not exist`);
  }
}

async function validateDeclaredJsonFiles(
  violations: string[],
  repositoryManifestPath: string,
  brandRoot: string,
  sourceFiles: Record<string, string | undefined> | undefined,
): Promise<void> {
  const jsonPaths = [
    sourceFiles?.scanned,
    sourceFiles?.tokens,
    sourceFiles?.snippets,
  ].filter((fileName): fileName is string => fileName !== undefined);

  for (const fileName of jsonPaths) {
    try {
      await readJson(path.join(brandRoot, fileName));
    } catch (error) {
      violations.push(
        `${repositoryManifestPath}: ${fileName} is declared as JSON but could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

async function validateComponentsManifestCache(
  violations: string[],
  repositoryManifestPath: string,
  brandRoot: string,
  folderSlug: string,
  declaredComponentsManifest: string | undefined,
): Promise<void> {
  const cachePath = path.join(brandRoot, declaredComponentsManifest ?? "components.manifest.json");
  if (!(await exists(cachePath))) return;

  try {
    const [cachedManifest, fixtureHtml, tokensCss] = await Promise.all([
      readJson(cachePath),
      readFile(path.join(brandRoot, "components.html"), "utf8"),
      readFile(path.join(brandRoot, "tokens.css"), "utf8"),
    ]);
    const derivedManifest = extractComponentsManifest({
      brandId: folderSlug,
      fixtureHtml,
      tokensCss,
    });
    if (!isDeepStrictEqual(cachedManifest, derivedManifest)) {
      violations.push(
        `${repositoryManifestPath}: ${toRepositoryPath(cachePath)} is stale; regenerate it from components.html + tokens.css`,
      );
    }
  } catch (error) {
    violations.push(
      `${repositoryManifestPath}: failed to validate ${toRepositoryPath(cachePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await checkDesignSystemManifests();
  if (!ok) process.exitCode = 1;
}
