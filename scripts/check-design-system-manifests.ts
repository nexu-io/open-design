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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");
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

    const requiredFiles = [
      manifest.files.design,
      manifest.files.tokens,
      ...(manifest.files.components === undefined ? [] : [manifest.files.components]),
    ];
    for (const fileName of requiredFiles) {
      const target = path.join(brandRoot, fileName);
      if (!(await exists(target))) {
        violations.push(`${repositoryManifestPath}: ${fileName} is declared but ${toRepositoryPath(target)} does not exist`);
      }
    }

    if (manifest.assetsDir !== undefined && !(await exists(path.join(brandRoot, manifest.assetsDir)))) {
      violations.push(`${repositoryManifestPath}: assetsDir is declared but ${manifest.assetsDir}/ does not exist`);
    }
    if (manifest.previewDir !== undefined && !(await exists(path.join(brandRoot, manifest.previewDir)))) {
      violations.push(`${repositoryManifestPath}: previewDir is declared but ${manifest.previewDir}/ does not exist`);
    }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await checkDesignSystemManifests();
  if (!ok) process.exitCode = 1;
}
