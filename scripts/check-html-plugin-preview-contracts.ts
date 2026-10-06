/* ─────────────────────────────────────────────────────────────────────────
 * Guard the source contract for bundled HTML-backed example plugins.
 *
 * The preview baker treats non-HTML preview routes that return 404 as routine
 * skips. That is correct for image/video plugins, but it can hide a malformed
 * document template whose real source is HTML while its manifest points at a
 * placeholder poster. This guard catches that mismatch before the baker runs.
 *
 * Run standalone: `pnpm exec tsx scripts/check-html-plugin-preview-contracts.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────────── */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(import.meta.dirname, "..");
const EXAMPLES_REPO_PATH = "plugins/_official/examples";
const EXAMPLE_ENTRY = "./example.html";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHtmlSource(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isHtmlBackedTemplate(template: unknown): boolean {
  return (
    isRecord(template)
    && (template.format === "html" || typeof template.referenceHtml === "string")
  );
}

export type HtmlPluginPreviewContractInput = {
  pluginId: string;
  manifest: unknown;
  template: unknown;
  exampleHtml: string | undefined;
};

/** Validate one plugin without filesystem access so regression tests stay tiny. */
export function validateHtmlPluginPreviewContract({
  pluginId,
  manifest,
  template,
  exampleHtml,
}: HtmlPluginPreviewContractInput): string[] {
  if (!isHtmlBackedTemplate(template)) return [];

  const prefix = `${EXAMPLES_REPO_PATH}/${pluginId}`;
  const violations: string[] = [];
  if (!isRecord(manifest) || !isRecord(manifest.od)) {
    return [`${prefix}/open-design.json: HTML-backed template requires an od manifest object`];
  }

  const od = manifest.od;
  const preview = isRecord(od.preview) ? od.preview : undefined;
  if (preview?.type !== "html" || preview.entry !== EXAMPLE_ENTRY) {
    violations.push(
      `${prefix}/open-design.json: HTML-backed template preview must use type "html" and entry "${EXAMPLE_ENTRY}"`,
    );
  }

  const documentSurface = (
    isRecord(template)
    && (template.surface === "document" || od.scenario === "documents")
  );
  if (documentSurface && preview?.motion !== "scroll") {
    violations.push(`${prefix}/open-design.json: document HTML preview must declare motion "scroll"`);
  }

  const useCase = isRecord(od.useCase) ? od.useCase : undefined;
  const outputPaths = Array.isArray(useCase?.exampleOutputs)
    ? useCase.exampleOutputs.flatMap((output) => {
        if (!isRecord(output) || typeof output.path !== "string") return [];
        return [output.path];
      })
    : [];
  if (!outputPaths.includes(EXAMPLE_ENTRY)) {
    violations.push(`${prefix}/open-design.json: od.useCase.exampleOutputs must include "${EXAMPLE_ENTRY}"`);
  }

  const context = isRecord(od.context) ? od.context : undefined;
  if (!stringArray(context?.assets).includes(EXAMPLE_ENTRY)) {
    violations.push(`${prefix}/open-design.json: od.context.assets must include "${EXAMPLE_ENTRY}"`);
  }

  if (exampleHtml === undefined || exampleHtml.trim().length === 0) {
    violations.push(`${prefix}/example.html: HTML-backed template must ship a non-empty canonical preview`);
  } else if (
    isRecord(template)
    && typeof template.referenceHtml === "string"
    && normalizeHtmlSource(exampleHtml) !== normalizeHtmlSource(template.referenceHtml)
  ) {
    violations.push(`${prefix}/example.html: content has drifted from template.json referenceHtml`);
  }

  return violations;
}

async function readOptional(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function checkHtmlPluginPreviewContracts(repoRoot: string = defaultRepoRoot): Promise<boolean> {
  const examplesRoot = path.join(repoRoot, EXAMPLES_REPO_PATH);
  let entries;
  try {
    entries = await readdir(examplesRoot, { withFileTypes: true });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      console.log("HTML plugin preview contract check passed: no bundled examples directory.");
      return true;
    }
    console.error("HTML plugin preview contract violations:");
    console.error(`- ${EXAMPLES_REPO_PATH}: could not be read: ${formatError(error)}`);
    return false;
  }

  const violations: string[] = [];
  let checked = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const pluginRoot = path.join(examplesRoot, entry.name);
    let templateText: string | undefined;
    try {
      templateText = await readOptional(path.join(pluginRoot, "template.json"));
    } catch (error) {
      violations.push(
        `${EXAMPLES_REPO_PATH}/${entry.name}/template.json: could not be read: ${formatError(error)}`,
      );
      continue;
    }
    if (templateText === undefined) continue;

    let template: unknown;
    try {
      template = JSON.parse(templateText) as unknown;
    } catch (error) {
      violations.push(
        `${EXAMPLES_REPO_PATH}/${entry.name}/template.json: could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (!isHtmlBackedTemplate(template)) continue;
    checked += 1;

    let manifestText: string | undefined;
    try {
      manifestText = await readOptional(path.join(pluginRoot, "open-design.json"));
    } catch (error) {
      violations.push(
        `${EXAMPLES_REPO_PATH}/${entry.name}/open-design.json: could not be read: ${formatError(error)}`,
      );
      continue;
    }
    let manifest: unknown;
    try {
      manifest = manifestText === undefined ? undefined : JSON.parse(manifestText) as unknown;
    } catch (error) {
      violations.push(
        `${EXAMPLES_REPO_PATH}/${entry.name}/open-design.json: could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    let exampleHtml: string | undefined;
    try {
      exampleHtml = await readOptional(path.join(pluginRoot, "example.html"));
    } catch (error) {
      violations.push(
        `${EXAMPLES_REPO_PATH}/${entry.name}/example.html: could not be read: ${formatError(error)}`,
      );
      continue;
    }
    violations.push(...validateHtmlPluginPreviewContract({
      pluginId: entry.name,
      manifest,
      template,
      exampleHtml,
    }));
  }

  if (violations.length > 0) {
    console.error("HTML plugin preview contract violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log(
    `HTML plugin preview contract check passed: ${checked} HTML-backed example${checked === 1 ? "" : "s"} valid.`,
  );
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await checkHtmlPluginPreviewContracts();
  if (!ok) process.exitCode = 1;
}
