import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const ASSET_CATALOG_SCHEMA_VERSION = "od-asset-catalog/v1";

export type AssetKind = "design-system" | "design-template" | "case-study";

export interface AssetRecord {
  id: string;
  kind: AssetKind;
  title: string;
  summary: string;
  sourcePath: string;
  previewPath?: string;
  tags: string[];
  useCases: string[];
  userWords: string[];
  visualTraits: string[];
  roles: string[];
  sourcePolicy: string;
  files: Record<string, string>;
}

export interface AssetCatalog {
  schemaVersion: typeof ASSET_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  assets: AssetRecord[];
}

const DESIGN_SYSTEM_SKIP_DIRS = new Set(["_schema"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value);
    if (text.length > 0) return text;
  }
  return "";
}

function compact(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = asString(value);
    if (text.length === 0 || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function splitWords(value: unknown): string[] {
  return asString(value)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[,\n|]+/g)
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function sentence(value: string, limit = 260): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trim()}…`;
}

function repositoryPath(repoRoot: string, filePath: string): string {
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

async function findDesignTemplatePreview(repoRoot: string, entryName: string, dir: string): Promise<string | undefined> {
  if (await exists(path.join(dir, "example.html"))) return `design-templates/${entryName}/example.html`;
  const examplesDir = path.join(dir, "examples");
  if (!(await exists(examplesDir))) return undefined;
  const examples = (await readdir(examplesDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
  const firstExample = examples[0];
  if (firstExample === undefined) return undefined;
  return repositoryPath(repoRoot, path.join(examplesDir, firstExample));
}

async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readText(filePath)) as unknown;
}

function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(text);
  if (!match) return {};

  const data: Record<string, string> = {};
  let parent = "";
  for (const raw of match[1]!.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    if (!raw.startsWith(" ") && trimmed.endsWith(":")) {
      parent = trimmed.slice(0, -1);
      continue;
    }
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    const fullKey = raw.startsWith(" ") && parent.length > 0 ? `${parent}.${key}` : key;
    data[fullKey] = value;
  }
  return data;
}

function parseDesignMarkdown(text: string, fallbackTitle: string): { title: string; category: string; summary: string } {
  let title = fallbackTitle;
  let category = "";
  let summary = "";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      title = trimmed.slice(2).replace(/^Design System Inspired by\s+/, "").trim();
      continue;
    }
    if (trimmed.startsWith("> Category:")) {
      category = trimmed.split(":", 2)[1]?.trim() ?? "";
      continue;
    }
    if (trimmed.startsWith(">") && summary.length === 0) {
      summary = trimmed.replace(/^>\s*/, "").trim();
    }
  }
  return { title, category, summary };
}

async function scanDesignSystems(repoRoot: string): Promise<AssetRecord[]> {
  const root = path.join(repoRoot, "design-systems");
  if (!(await exists(root))) return [];

  const records: AssetRecord[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || DESIGN_SYSTEM_SKIP_DIRS.has(entry.name)) continue;
    const dir = path.join(root, entry.name);
    const designPath = path.join(dir, "DESIGN.md");
    const manifestPath = path.join(dir, "manifest.json");
    if (!(await exists(designPath)) && !(await exists(manifestPath))) continue;

    const designText = (await exists(designPath)) ? await readText(designPath) : "";
    const markdown = parseDesignMarkdown(designText, entry.name);
    const parsedManifest = (await exists(manifestPath)) ? await readJson(manifestPath) : {};
    const manifest = isRecord(parsedManifest) ? parsedManifest : {};
    const source = isRecord(manifest.source) ? manifest.source : {};
    const files = isRecord(manifest.files) ? manifest.files : {};
    const componentsFile = firstNonEmpty(files.components);
    const previewPath = componentsFile.length > 0
      ? `design-systems/${entry.name}/${componentsFile}`
      : (await exists(path.join(dir, "components.html"))) ? `design-systems/${entry.name}/components.html` : undefined;
    const category = firstNonEmpty(manifest.category, markdown.category);
    const summary = sentence(firstNonEmpty(manifest.description, markdown.summary, `${entry.name} design system.`));

    records.push({
      id: `design-system:${entry.name}`,
      kind: "design-system",
      title: firstNonEmpty(manifest.name, markdown.title, entry.name),
      summary,
      sourcePath: repositoryPath(repoRoot, dir),
      ...(previewPath === undefined ? {} : { previewPath }),
      tags: compact([category, "design-system"]),
      useCases: compact(["visual direction", category]),
      userWords: compact([summary]),
      visualTraits: compact([category]),
      roles: ["visual-direction", "tokens"],
      sourcePolicy: firstNonEmpty(source.type, "unknown"),
      files: {
        ...(await exists(designPath) ? { design: `design-systems/${entry.name}/DESIGN.md` } : {}),
        ...(await exists(path.join(dir, "tokens.css")) ? { tokens: `design-systems/${entry.name}/tokens.css` } : {}),
        ...(previewPath === undefined ? {} : { preview: previewPath }),
      },
    });
  }
  return records;
}

async function scanDesignTemplates(repoRoot: string): Promise<AssetRecord[]> {
  const root = path.join(repoRoot, "design-templates");
  if (!(await exists(root))) return [];

  const records: AssetRecord[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root, entry.name);
    const skillPath = path.join(dir, "SKILL.md");
    if (!(await exists(skillPath))) continue;

    const skillText = await readText(skillPath);
    const fm = parseFrontmatter(skillText);
    const previewPath = await findDesignTemplatePreview(repoRoot, entry.name, dir);
    const summary = sentence(firstNonEmpty(fm.description, skillText.split("---").at(-1), `${entry.name} design template.`));
    const mode = firstNonEmpty(fm["od.mode"], fm.mode, "template");
    const category = firstNonEmpty(fm["od.category"], fm.category);

    records.push({
      id: `design-template:${entry.name}`,
      kind: "design-template",
      title: firstNonEmpty(fm.name, entry.name),
      summary,
      sourcePath: repositoryPath(repoRoot, dir),
      ...(previewPath === undefined ? {} : { previewPath }),
      tags: compact([mode, category, ...splitWords(fm.tags), "design-template"]),
      useCases: compact([category, mode]),
      userWords: compact([summary]),
      visualTraits: compact(splitWords(fm["od.visualTraits"])),
      roles: compact(["artifact-shape", mode]),
      sourcePolicy: firstNonEmpty(fm["od.sourcePolicy"], "template"),
      files: {
        skill: `design-templates/${entry.name}/SKILL.md`,
        ...(previewPath === undefined ? {} : { preview: previewPath }),
      },
    });
  }
  return records;
}

async function scanPersonalBlogCases(repoRoot: string): Promise<AssetRecord[]> {
  const catalogPath = path.join(repoRoot, "design-templates", "personal-blog-projects", "references", "catalog.json");
  if (!(await exists(catalogPath))) return [];
  const catalog = await readJson(catalogPath);
  if (!isRecord(catalog) || !Array.isArray(catalog.entries)) return [];

  const records: AssetRecord[] = [];
  for (const entry of catalog.entries) {
    if (!isRecord(entry)) continue;
    const site = isRecord(entry.site) ? entry.site : {};
    const capture = isRecord(entry.capture) ? entry.capture : {};
    const id = firstNonEmpty(entry.id);
    if (id.length === 0) continue;
    const siteType = firstNonEmpty(site.type);
    const why = sentence(firstNonEmpty(entry.why, siteType, "Personal site reference."));
    records.push({
      id: `personal-blog-projects:${id}`,
      kind: "case-study",
      title: firstNonEmpty(site.name, id),
      summary: why,
      sourcePath: "design-templates/personal-blog-projects/references/catalog.json",
      previewPath: "design-templates/personal-blog-projects/example.html",
      tags: compact([entry.group, site.language, site.region, siteType, "personal-blog"]),
      useCases: compact(["personal site", "blog", "digital garden", siteType]),
      userWords: compact([why]),
      visualTraits: compact([siteType]),
      roles: ["site-reference", "page-patterns", "block-patterns"],
      sourcePolicy: firstNonEmpty(capture.reusePolicy, site.license, "inspiration-only"),
      files: {
        catalog: "design-templates/personal-blog-projects/references/catalog.json",
        preview: "design-templates/personal-blog-projects/example.html",
      },
    });
  }
  return records;
}

async function scanCommercialLaunchCases(repoRoot: string): Promise<AssetRecord[]> {
  const catalogPath = path.join(repoRoot, "design-templates", "commercial-product-launches", "references", "catalog.json");
  if (!(await exists(catalogPath))) return [];
  const catalog = await readJson(catalogPath);
  if (!isRecord(catalog) || !Array.isArray(catalog.entries)) return [];

  const records: AssetRecord[] = [];
  for (const entry of catalog.entries) {
    if (!isRecord(entry)) continue;
    const brand = isRecord(entry.brand) ? entry.brand : {};
    const page = isRecord(entry.page) ? entry.page : {};
    const capture = isRecord(entry.capture) ? entry.capture : {};
    const id = firstNonEmpty(entry.id);
    if (id.length === 0) continue;
    const why = sentence(firstNonEmpty(entry.why, page.type, "Commercial launch reference."));
    records.push({
      id: `commercial-product-launches:${id}`,
      kind: "case-study",
      title: firstNonEmpty(brand.name, page.title, id),
      summary: why,
      sourcePath: "design-templates/commercial-product-launches/references/catalog.json",
      previewPath: "design-templates/commercial-product-launches/example.html",
      tags: compact([brand.sector, page.type, "commercial-launch"]),
      useCases: compact(["product launch", "marketing site", "commerce", page.type]),
      userWords: compact([why]),
      visualTraits: compact([brand.sector, page.type]),
      roles: ["brand-reference", "page-modules", "media-direction", "motion-patterns"],
      sourcePolicy: firstNonEmpty(capture.reusePolicy, "inspiration-only"),
      files: {
        catalog: "design-templates/commercial-product-launches/references/catalog.json",
        preview: "design-templates/commercial-product-launches/example.html",
      },
    });
  }
  return records;
}

async function scanProductUiProjectCases(repoRoot: string): Promise<AssetRecord[]> {
  const catalogPath = path.join(repoRoot, "design-templates", "product-ui-projects", "references", "catalog.json");
  if (!(await exists(catalogPath))) return [];
  const catalog = await readJson(catalogPath);
  if (!isRecord(catalog) || !Array.isArray(catalog.entries)) return [];

  const records: AssetRecord[] = [];
  for (const entry of catalog.entries) {
    if (!isRecord(entry)) continue;
    const project = isRecord(entry.project) ? entry.project : {};
    const capture = isRecord(entry.capture) ? entry.capture : {};
    const id = firstNonEmpty(entry.id);
    if (id.length === 0) continue;
    const projectType = firstNonEmpty(project.type);
    const captureDepth = firstNonEmpty(capture.captureDepth);
    const why = sentence(firstNonEmpty(entry.why, projectType, "Product UI project reference."));
    const surfaces = Array.isArray(entry.surfaces) ? entry.surfaces : [];
    const flows = Array.isArray(entry.flows) ? entry.flows : [];
    const states = Array.isArray(entry.states) ? entry.states : [];
    const components = Array.isArray(entry.components) ? entry.components : [];
    records.push({
      id: `product-ui-projects:${id}`,
      kind: "case-study",
      title: firstNonEmpty(project.name, id),
      summary: why,
      sourcePath: "design-templates/product-ui-projects/references/catalog.json",
      previewPath: "design-templates/product-ui-projects/example.html",
      tags: compact([project.sector, projectType, captureDepth, "product-ui"]),
      useCases: compact(["product UI", "SaaS", "console", projectType]),
      userWords: compact([why]),
      visualTraits: compact([project.sector, projectType]),
      roles: compact([
        "project-reference",
        surfaces.length > 0 ? "surface-suite" : "",
        flows.length > 0 ? "flow-patterns" : "",
        states.length > 0 ? "state-patterns" : "",
        components.length > 0 ? "component-patterns" : "",
      ]),
      sourcePolicy: firstNonEmpty(capture.reusePolicy, "inspiration-only"),
      files: {
        catalog: "design-templates/product-ui-projects/references/catalog.json",
        preview: "design-templates/product-ui-projects/example.html",
      },
    });
  }
  return records;
}

export async function buildAssetCatalog(repoRoot: string): Promise<AssetCatalog> {
  const root = path.resolve(repoRoot);
  const assets = [
    ...(await scanDesignSystems(root)),
    ...(await scanDesignTemplates(root)),
    ...(await scanPersonalBlogCases(root)),
    ...(await scanCommercialLaunchCases(root)),
    ...(await scanProductUiProjectCases(root)),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  return {
    schemaVersion: ASSET_CATALOG_SCHEMA_VERSION,
    generatedAt: new Date(0).toISOString(),
    assets,
  };
}

export function validateAssetCatalog(catalog: AssetCatalog): string[] {
  const errors: string[] = [];
  if (catalog.schemaVersion !== ASSET_CATALOG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${ASSET_CATALOG_SCHEMA_VERSION}`);
  }
  const ids = new Set<string>();
  for (const asset of catalog.assets) {
    if (asset.id.length === 0) errors.push("asset id must not be empty");
    if (ids.has(asset.id)) errors.push(`duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    for (const [field, value] of Object.entries({ sourcePath: asset.sourcePath, previewPath: asset.previewPath ?? "" })) {
      if (value.startsWith("/") || value.split(/[\\/]/).includes("..")) {
        errors.push(`${asset.id}: ${field} must be a repository-relative path`);
      }
    }
    if (asset.title.length === 0) errors.push(`${asset.id}: title must not be empty`);
    if (asset.summary.length === 0) errors.push(`${asset.id}: summary must not be empty`);
    if (asset.roles.length === 0) errors.push(`${asset.id}: roles must not be empty`);
    if (asset.useCases.length === 0) errors.push(`${asset.id}: useCases must not be empty`);
  }
  return errors;
}

export async function writeAssetCatalog(repoRoot: string, outPath = "catalog/assets.json"): Promise<AssetCatalog> {
  const catalog = await buildAssetCatalog(repoRoot);
  const errors = validateAssetCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(`Asset catalog validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  const destination = path.resolve(repoRoot, outPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return catalog;
}

export async function checkAssetCatalog(repoRoot = path.resolve("."), outPath = "catalog/assets.json"): Promise<boolean> {
  const catalog = await buildAssetCatalog(repoRoot);
  const errors = validateAssetCatalog(catalog);
  if (errors.length > 0) {
    console.error(`Asset catalog validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    return false;
  }

  const destination = path.resolve(repoRoot, outPath);
  const expected = `${JSON.stringify(catalog, null, 2)}\n`;
  const actual = (await exists(destination)) ? await readText(destination) : "";
  if (actual !== expected) {
    console.error(`${repositoryPath(repoRoot, destination)} is out of date. Run scripts/build-asset-catalog.ts.`);
    return false;
  }

  console.log(`Asset catalog check passed: ${catalog.assets.length} assets indexed.`);
  return true;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repoIndex = args.indexOf("--repo");
  const outIndex = args.indexOf("--out");
  const check = args.includes("--check");
  const repoRoot = repoIndex >= 0 ? path.resolve(args[repoIndex + 1] ?? ".") : path.resolve(".");
  const outPath = outIndex >= 0 ? args[outIndex + 1] ?? "catalog/assets.json" : "catalog/assets.json";
  if (check) {
    if (!(await checkAssetCatalog(repoRoot, outPath))) process.exitCode = 1;
    return;
  }
  const catalog = await writeAssetCatalog(repoRoot, outPath);
  console.log(`Wrote ${outPath} with ${catalog.assets.length} assets.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
