import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";
import type { DesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";
import { extractComponentsManifest } from "../packages/contracts/src/design-systems/components-manifest.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");
const SKIPPED_DIRECTORIES = new Set(["_schema"]);

export type DesignSystemPackageQualityInput = {
  readonly id: string;
  readonly manifest: DesignSystemProjectManifest;
  readonly designMd: string;
  readonly tokensCss: string;
  readonly componentsHtml?: string | undefined;
  readonly usageMd?: string | undefined;
};

export type DesignSystemPackageQualityResult = {
  readonly migrated: boolean;
  readonly score: number;
  readonly checks: readonly string[];
  readonly violations: readonly string[];
};

export function evaluateDesignSystemPackageQuality(
  input: DesignSystemPackageQualityInput,
): DesignSystemPackageQualityResult {
  const checks: string[] = [];
  const violations: string[] = [];
  const migrated = isMigratedPackage(input.manifest);

  if (!migrated) {
    return { migrated: false, score: 0, checks, violations };
  }

  recordMinimum("DESIGN.md section coverage", countMarkdownH2(input.designMd) >= 7);
  recordMinimum("tokens.css token coverage", collectCssTokenNames(input.tokensCss).size >= 26);

  if (input.manifest.usage !== undefined) {
    const usage = input.usageMd ?? "";
    for (const heading of ["Read Order", "Design Highlights", "Do", "Avoid"]) {
      recordMinimum(`USAGE.md includes ${heading}`, hasMarkdownH2(usage, heading));
    }
  } else {
    violations.push("rich packages must declare usage");
  }

  if (input.manifest.componentsManifest !== undefined && input.componentsHtml !== undefined) {
    const manifest = extractComponentsManifest({
      brandId: input.id,
      fixtureHtml: input.componentsHtml,
      tokensCss: input.tokensCss,
    });
    recordMinimum("component fixture selectors", manifest.fixture.selectorCount >= 10);
    recordMinimum("component fixture token references", manifest.tokens.referenced.length >= 8);
    recordMinimum("component groups present", manifest.groups.filter((group) => group.present).length >= 4);
  } else {
    violations.push("rich packages must declare componentsManifest and components.html");
  }

  const previewPages = input.manifest.preview?.pages ?? [];
  recordMinimum("preview page count", previewPages.length >= 3);
  for (const role of ["colors", "typography", "spacing"]) {
    recordMinimum(`preview includes ${role}`, previewPages.some((page) => page.role === role));
  }

  if (input.manifest.source.type !== "bundled") {
    recordMinimum("imported package has source evidence", input.manifest.sourceFiles !== undefined);
    recordMinimum("imported package has token evidence", input.manifest.sourceFiles?.tokens !== undefined);
  }

  const score = checks.length === 0 ? 0 : Math.round(((checks.length - violations.length) / checks.length) * 100);
  return { migrated: true, score, checks, violations };

  function recordMinimum(label: string, passed: boolean): void {
    checks.push(label);
    if (!passed) violations.push(label);
  }
}

export async function checkDesignSystemPackageQuality(): Promise<boolean> {
  const brandRoots = await discoverManifestBrandRoots();
  const violations: string[] = [];
  let migratedCount = 0;
  let totalScore = 0;

  for (const brandRoot of brandRoots) {
    const manifestPath = path.join(brandRoot, "manifest.json");
    const repositoryManifestPath = toRepositoryPath(manifestPath);
    const parsed = parseDesignSystemProjectManifest(await readFile(manifestPath, "utf8"));
    if (!parsed.ok) continue;

    const manifest = parsed.manifest;
    const [designMd, tokensCss, componentsHtml, usageMd] = await Promise.all([
      readFile(path.join(brandRoot, manifest.files.design), "utf8"),
      readFile(path.join(brandRoot, manifest.files.tokens), "utf8"),
      manifest.files.components === undefined
        ? Promise.resolve(undefined)
        : readFile(path.join(brandRoot, manifest.files.components), "utf8"),
      manifest.usage === undefined
        ? Promise.resolve(undefined)
        : readFile(path.join(brandRoot, manifest.usage), "utf8"),
    ]);

    const result = evaluateDesignSystemPackageQuality({
      id: manifest.id,
      manifest,
      designMd,
      tokensCss,
      componentsHtml,
      usageMd,
    });
    if (!result.migrated) continue;

    migratedCount += 1;
    totalScore += result.score;
    if (result.violations.length > 0) {
      for (const violation of result.violations) {
        violations.push(`${repositoryManifestPath}: ${violation}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Design system package quality violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  const averageScore = migratedCount === 0 ? 0 : Math.round(totalScore / migratedCount);
  console.log(
    `Design system package quality passed: ${migratedCount} migrated package${migratedCount === 1 ? "" : "s"} checked; average score ${averageScore}.`,
  );
  return true;
}

async function discoverManifestBrandRoots(): Promise<string[]> {
  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  const roots: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const brandRoot = path.join(designSystemsRoot, entry.name);
    if (await exists(path.join(brandRoot, "manifest.json"))) roots.push(brandRoot);
  }
  return roots.sort((a, b) => a.localeCompare(b));
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isMigratedPackage(manifest: DesignSystemProjectManifest): boolean {
  return (
    manifest.usage !== undefined ||
    manifest.componentsManifest !== undefined ||
    manifest.preview !== undefined ||
    manifest.sourceFiles !== undefined
  );
}

function countMarkdownH2(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => /^##\s+\S/.test(line)).length;
}

function hasMarkdownH2(markdown: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^##\\s+${escaped}\\s*$`, "m").test(markdown);
}

function collectCssTokenNames(css: string): Set<string> {
  const tokens = new Set<string>();
  const tokenPattern = /--[A-Za-z0-9_-]+\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(css)) !== null) {
    tokens.add(match[0].slice(0, -1).trim());
  }
  return tokens;
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await checkDesignSystemPackageQuality();
  if (!ok) process.exitCode = 1;
}
