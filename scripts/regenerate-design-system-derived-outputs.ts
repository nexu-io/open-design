import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";
import {
  renderDesignTokensJson,
  renderTailwindV4Css,
  type DerivedDesignTokenBinding,
  type DerivedDesignTokenReport,
} from "../packages/contracts/src/design-systems/derived-token-outputs.ts";
import { extractComponentsManifest } from "../packages/contracts/src/design-systems/components-manifest.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");
const skippedDirectories = new Set(["_schema"]);

type CliOptions = {
  brandId?: string;
  dryRun: boolean;
  help: boolean;
};

type UpdateCounts = {
  designTokensJson: number;
  tailwindCss: number;
  componentsManifest: number;
};

function usage(): string {
  return [
    "Usage: node --experimental-strip-types scripts/regenerate-design-system-derived-outputs.ts [options]",
    "",
    "Options:",
    "  --brand <id>   Regenerate one design-system id instead of all manifest-backed ids.",
    "  --dry-run      Print what would change without writing files.",
    "  --help         Show this help text.",
  ].join("\n");
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--brand") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--brand requires a design-system id.");
      }
      options.brandId = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readManifestPaths(brandId?: string): Promise<string[]> {
  if (brandId !== undefined) {
    const manifestPath = path.join(designSystemsRoot, brandId, "manifest.json");
    return (await exists(manifestPath)) ? [manifestPath] : [];
  }

  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  const manifestPaths: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || skippedDirectories.has(entry.name)) continue;
    const manifestPath = path.join(designSystemsRoot, entry.name, "manifest.json");
    if (await exists(manifestPath)) manifestPaths.push(manifestPath);
  }
  manifestPaths.sort((left, right) => left.localeCompare(right));
  return manifestPaths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
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

function parseRootTokenNames(css: string): string[] {
  const rootPattern = /:root(?!\[)\s*\{([\s\S]*?)\}/g;
  const names: string[] = [];
  let rootMatch: RegExpExecArray | null;
  while ((rootMatch = rootPattern.exec(css)) !== null) {
    const body = rootMatch[1] ?? "";
    const declarationPattern = /(--[A-Za-z0-9_-]+)\s*:/g;
    let declarationMatch: RegExpExecArray | null;
    while ((declarationMatch = declarationPattern.exec(body)) !== null) {
      names.push(declarationMatch[1]!);
    }
  }
  return names;
}

async function writeIfChanged(filePath: string, nextText: string, dryRun: boolean): Promise<boolean> {
  const currentText = await readFile(filePath, "utf8");
  if (currentText === nextText) return false;
  if (!dryRun) {
    await writeFile(filePath, nextText, "utf8");
  }
  return true;
}

async function regenerateDerivedOutputs(options: CliOptions): Promise<UpdateCounts> {
  const manifestPaths = await readManifestPaths(options.brandId);
  if (options.brandId !== undefined && manifestPaths.length === 0) {
    throw new Error(`design system ${options.brandId} does not ship manifest.json`);
  }

  const counts: UpdateCounts = {
    designTokensJson: 0,
    tailwindCss: 0,
    componentsManifest: 0,
  };

  for (const manifestPath of manifestPaths) {
    const repositoryManifestPath = toRepositoryPath(manifestPath);
    const parsed = parseDesignSystemProjectManifest(await readFile(manifestPath, "utf8"));
    if (!parsed.ok) {
      throw new Error(`${repositoryManifestPath} is invalid:\n${parsed.errors.map((error) => `- ${error}`).join("\n")}`);
    }

    const manifest = parsed.manifest;
    const brandRoot = path.dirname(manifestPath);
    const tokensPath = path.join(brandRoot, manifest.files.tokens);
    const tokensCss = await readFile(tokensPath, "utf8");

    if (manifest.files.designTokens !== undefined) {
      const reportPath = manifest.sourceFiles?.report;
      if (reportPath === undefined) {
        throw new Error(`${repositoryManifestPath} declares ${manifest.files.designTokens} but has no sourceFiles.report`);
      }
      const reportJson = JSON.parse(await readFile(path.join(brandRoot, reportPath), "utf8")) as unknown;
      const report = toDerivedDesignTokenReport(reportJson);
      if (report === undefined) {
        throw new Error(`${repositoryManifestPath} has invalid ${reportPath}`);
      }
      const nextText = renderDesignTokensJson({
        bindings: report.tokens,
        report,
      });
      const filePath = path.join(brandRoot, manifest.files.designTokens);
      if (await writeIfChanged(filePath, nextText, options.dryRun)) {
        counts.designTokensJson += 1;
        console.log(`${options.dryRun ? "Would update" : "Updated"} ${toRepositoryPath(filePath)}`);
      }
    }

    if (manifest.files.tailwind !== undefined) {
      const nextText = renderTailwindV4Css(
        parseRootTokenNames(tokensCss).map((name) => ({ name })),
      );
      const filePath = path.join(brandRoot, manifest.files.tailwind);
      if (await writeIfChanged(filePath, nextText, options.dryRun)) {
        counts.tailwindCss += 1;
        console.log(`${options.dryRun ? "Would update" : "Updated"} ${toRepositoryPath(filePath)}`);
      }
    }

    const declaredComponentsManifest = manifest.componentsManifest ?? "components.manifest.json";
    const componentsManifestPath = path.join(brandRoot, declaredComponentsManifest);
    if (await exists(componentsManifestPath)) {
      const fixtureHtml = await readFile(path.join(brandRoot, "components.html"), "utf8");
      const nextText = `${JSON.stringify(
        extractComponentsManifest({
          brandId: manifest.id,
          fixtureHtml,
          tokensCss,
        }),
        null,
        2,
      )}\n`;
      if (await writeIfChanged(componentsManifestPath, nextText, options.dryRun)) {
        counts.componentsManifest += 1;
        console.log(`${options.dryRun ? "Would update" : "Updated"} ${toRepositoryPath(componentsManifestPath)}`);
      }
    }
  }

  return counts;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const counts = await regenerateDerivedOutputs(options);
  const total = counts.designTokensJson + counts.tailwindCss + counts.componentsManifest;
  console.log(
    `${options.dryRun ? "Would refresh" : "Refreshed"} ${total} derived file${total === 1 ? "" : "s"} `
    + `(${counts.designTokensJson} design-tokens.json, ${counts.tailwindCss} tailwind-v4.css, ${counts.componentsManifest} components.manifest.json).`,
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
