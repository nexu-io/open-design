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
import { TOKEN_SCHEMA } from "../design-systems/_schema/tokens.schema.ts";
import { extractComponentsManifest } from "../packages/contracts/src/design-systems/components-manifest.ts";
import {
  renderDesignTokensJson,
  renderTailwindV4Css,
  type DerivedDesignTokenBinding,
  type DerivedDesignTokenReport,
} from "../packages/contracts/src/design-systems/derived-token-outputs.ts";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      ...(manifest.files.designTokens === undefined ? [] : [manifest.files.designTokens]),
      ...(manifest.files.tailwind === undefined ? [] : [manifest.files.tailwind]),
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

    await validateDeclaredJsonFiles(violations, repositoryManifestPath, brandRoot, manifest);
    await validateDesignTokensJson(
      violations,
      repositoryManifestPath,
      brandRoot,
      manifest.files.tokens,
      manifest.files.designTokens,
      manifest.sourceFiles?.report,
    );
    await validateTailwindV4Css(
      violations,
      repositoryManifestPath,
      brandRoot,
      manifest.files.tokens,
      manifest.files.tailwind,
    );
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

export async function validateDesignTokensJson(
  violations: string[],
  repositoryManifestPath: string,
  brandRoot: string,
  tokensPath: string,
  designTokensPath: string | undefined,
  reportPath: string | undefined,
): Promise<void> {
  if (designTokensPath === undefined) return;
  const filePath = path.join(brandRoot, designTokensPath);
  let actualText: string;
  let parsed: unknown;
  try {
    actualText = await readFile(filePath, "utf8");
    parsed = JSON.parse(actualText) as unknown;
  } catch (error) {
    violations.push(
      `${repositoryManifestPath}: ${designTokensPath} could not be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  if (!isRecord(parsed)) {
    violations.push(`${repositoryManifestPath}: ${designTokensPath} must be a JSON object`);
    return;
  }
  if (parsed.format !== "od-design-tokens/v1") {
    violations.push(`${repositoryManifestPath}: ${designTokensPath} format must be od-design-tokens/v1`);
  }
  if (parsed.contract !== "TOKEN_SCHEMA") {
    violations.push(`${repositoryManifestPath}: ${designTokensPath} contract must be TOKEN_SCHEMA`);
  }
  if (!Array.isArray(parsed.tokens)) {
    violations.push(`${repositoryManifestPath}: ${designTokensPath} tokens must be an array`);
    return;
  }
  if (reportPath === undefined) {
    violations.push(`${repositoryManifestPath}: ${designTokensPath} requires sourceFiles.report`);
    return;
  }
  const reportFilePath = path.join(brandRoot, reportPath);
  let reportJson: unknown;
  try {
    reportJson = await readJson(reportFilePath);
  } catch (error) {
    violations.push(
      `${repositoryManifestPath}: ${reportPath} could not be parsed while validating ${designTokensPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  const report = toDerivedDesignTokenReport(reportJson);
  if (report === undefined) {
    violations.push(`${repositoryManifestPath}: ${reportPath} must contain generatedAt, summary, and token contract bindings`);
    return;
  }
  const expected = renderDesignTokensJson({
    bindings: report.tokens,
    report,
  });
  if (actualText !== expected) {
    violations.push(`${repositoryManifestPath}: ${designTokensPath} is stale; regenerate it from ${reportPath}`);
  }

  const reportNames = new Set(report.tokens.map((token) => token.name));
  for (const spec of TOKEN_SCHEMA) {
    if (!reportNames.has(spec.name)) {
      violations.push(`${repositoryManifestPath}: ${reportPath} is missing ${spec.name}`);
    }
  }

  let tokensCss: string;
  try {
    tokensCss = await readFile(path.join(brandRoot, tokensPath), "utf8");
  } catch (error) {
    violations.push(
      `${repositoryManifestPath}: ${tokensPath} could not be read while validating ${designTokensPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  const tokenDeclarations = parseRootTokenDeclarationDetails(tokensCss);
  for (const binding of report.tokens) {
    const declared = tokenDeclarations.get(binding.name);
    if (declared === undefined) {
      violations.push(`${repositoryManifestPath}: ${reportPath} token ${binding.name} is missing from ${tokensPath}`);
    } else if (declared.value !== normalizeTokenValue(binding.value)) {
      violations.push(`${repositoryManifestPath}: ${reportPath} token ${binding.name} value does not match ${tokensPath}`);
    }
    validateTokenSourceReferences(violations, repositoryManifestPath, reportPath, tokensPath, tokenDeclarations, binding);
  }
}

export async function validateTailwindV4Css(
  violations: string[],
  repositoryManifestPath: string,
  brandRoot: string,
  tokensPath: string,
  tailwindPath: string | undefined,
): Promise<void> {
  if (tailwindPath === undefined) return;
  let actualCss: string;
  try {
    actualCss = await readFile(path.join(brandRoot, tailwindPath), "utf8");
  } catch (error) {
    violations.push(
      `${repositoryManifestPath}: ${tailwindPath} could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  let tokensCss: string;
  try {
    tokensCss = await readFile(path.join(brandRoot, tokensPath), "utf8");
  } catch (error) {
    violations.push(
      `${repositoryManifestPath}: ${tokensPath} could not be read while validating ${tailwindPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  const expectedCss = renderTailwindV4Css(
    Array.from(parseRootTokenDeclarations(tokensCss).keys(), (name) => ({ name })),
  );
  if (actualCss !== expectedCss) {
    violations.push(`${repositoryManifestPath}: ${tailwindPath} is stale; regenerate it from ${tokensPath}`);
  }
}

function toDerivedDesignTokenReport(value: unknown): (DerivedDesignTokenReport & {
  tokens: DerivedDesignTokenBinding[];
}) | undefined {
  if (!isRecord(value) || typeof value.generatedAt !== "string" || !isRecord(value.summary) || !Array.isArray(value.tokens)) {
    return undefined;
  }
  const tokens: DerivedDesignTokenBinding[] = [];
  for (const token of value.tokens) {
    const binding = toDerivedDesignTokenBinding(token);
    if (binding === undefined) return undefined;
    tokens.push(binding);
  }
  return {
    generatedAt: value.generatedAt,
    summary: value.summary,
    tokens,
  };
}

function toDerivedDesignTokenBinding(value: unknown): DerivedDesignTokenBinding | undefined {
  if (
    !isRecord(value)
    || typeof value.name !== "string"
    || typeof value.layer !== "string"
    || typeof value.value !== "string"
    || typeof value.confidence !== "string"
    || typeof value.reason !== "string"
    || !Array.isArray(value.sources)
    || !value.sources.every((source): source is string => typeof source === "string")
    || (value.sourceName !== undefined && typeof value.sourceName !== "string")
  ) {
    return undefined;
  }
  return {
    name: value.name,
    layer: value.layer,
    value: value.value,
    confidence: value.confidence,
    reason: value.reason,
    sources: value.sources,
    ...(value.sourceName === undefined ? {} : { sourceName: value.sourceName }),
  };
}

function parseRootTokenDeclarations(css: string): Map<string, string> {
  return new Map(
    Array.from(parseRootTokenDeclarationDetails(css), ([name, declaration]) => [name, declaration.value]),
  );
}

type TokenDeclarationDetail = {
  readonly value: string;
  readonly line: number;
};

function parseRootTokenDeclarationDetails(css: string): Map<string, TokenDeclarationDetail> {
  const declarations = new Map<string, TokenDeclarationDetail>();
  const rootPattern = /:root(?!\[)\s*\{([\s\S]*?)\}/g;
  let rootMatch: RegExpExecArray | null;
  while ((rootMatch = rootPattern.exec(css)) !== null) {
    const body = rootMatch[1]!;
    const bodyStart = rootMatch.index + rootMatch[0].indexOf("{") + 1;
    let segmentStart = 0;
    for (const rawSegment of body.split(";")) {
      const declarationStartInSegment = rawSegment.match(/(^|\n)[^\S\n]*--[A-Za-z0-9_-]+\s*:/);
      if (declarationStartInSegment !== null && declarationStartInSegment.index !== undefined) {
        const declarationStart = segmentStart + declarationStartInSegment.index + declarationStartInSegment[1]!.length;
        const declaration = body.slice(declarationStart, segmentStart + rawSegment.length).trim();
        const colonIndex = declaration.indexOf(":");
        if (colonIndex !== -1) {
          declarations.set(declaration.slice(0, colonIndex).trim(), {
            value: normalizeTokenValue(declaration.slice(colonIndex + 1)),
            line: lineNumberAtOffset(css, bodyStart + declarationStart),
          });
        }
      }
      segmentStart += rawSegment.length + 1;
    }
  }
  return declarations;
}

function lineNumberAtOffset(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function validateTokenSourceReferences(
  violations: string[],
  repositoryManifestPath: string,
  reportPath: string,
  tokensPath: string,
  tokenDeclarations: ReadonlyMap<string, TokenDeclarationDetail>,
  binding: DerivedDesignTokenBinding,
): void {
  const sourceName = binding.sourceName ?? binding.name;
  const declared = tokenDeclarations.get(sourceName);
  if (declared === undefined) return;
  let hasTokensCssSource = false;
  for (const source of binding.sources) {
    const line = parseTokenSourceLine(source, tokensPath);
    if (line === undefined) continue;
    hasTokensCssSource = true;
    if (line !== declared.line) {
      violations.push(
        `${repositoryManifestPath}: ${reportPath} token ${binding.name} source ${source} must point to ${tokensPath}:${declared.line}`,
      );
    }
  }
  if (!hasTokensCssSource) {
    violations.push(
      `${repositoryManifestPath}: ${reportPath} token ${binding.name} must cite a ${tokensPath}:<line> source`,
    );
  }
}

function parseTokenSourceLine(source: string, tokensPath: string): number | undefined {
  const prefix = `${tokensPath}:`;
  if (!source.startsWith(prefix)) return undefined;
  const line = Number(source.slice(prefix.length));
  return Number.isInteger(line) && line > 0 ? line : undefined;
}

function normalizeTokenValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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
  manifest: DesignSystemProjectManifest,
): Promise<void> {
  const jsonPaths = [
    manifest.sourceFiles?.scanned,
    manifest.sourceFiles?.tokens,
    manifest.sourceFiles?.report,
    manifest.sourceFiles?.snippets,
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
