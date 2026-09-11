/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-bundled-design-system-plugins.ts
 *
 * Guard for the link between a brand package and the bundled plugin that
 * makes it reachable. A design system ships as `design-systems/<slug>/`, but
 * its card on /plugins/systems/ opens a detail page only when the same slug
 * also ships `plugins/_official/design-systems/<slug>/` and the marketplace
 * registry sources exactly that directory. Nothing enforced that pairing, so
 * a brand added to one side alone renders a card that links back to the
 * index (#6387).
 *
 * Checks:
 *  1. pairing — a brand and its bundled plugin exist on both sides;
 *  2. completeness — the bundled plugin ships a parseable open-design.json
 *     and a non-empty DESIGN.md, since an unreadable manifest resolves no
 *     detail page either;
 *  3. registry — exactly one entry sources each bundled plugin, at its exact
 *     expected path. A source naming another repository, another ref, or a
 *     path below the plugin directory does not resolve, so matching only the
 *     trailing slug would certify the broken card this check exists to catch.
 *
 * Run standalone: `pnpm exec tsx scripts/check-bundled-design-system-plugins.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────────── */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BRANDS_DIR = "design-systems";
const BUNDLED_DIR = "plugins/_official/design-systems";
const REGISTRY_PATH = "plugins/registry/official/open-design-marketplace.json";
/**
 * The registry addresses bundled plugins by their location in this repository
 * at this ref. Deliberately moving off it rewrites every entry, so pinning it
 * here turns that into one loud failure rather than silent drift.
 */
const EXPECTED_SOURCE_PREFIX = "github:nexu-io/open-design@main";
/** Not a brand package: the shared token schema the packages validate against. */
const NON_BRAND_ENTRIES = new Set(["_schema"]);

/**
 * How many gaps KNOWN_UNPAIRED may hold. Adding a brand to that list without
 * raising this number fails the check, so growth is a two-line diff naming
 * itself rather than one slug appended among nine. It cannot stop a determined
 * edit — nothing in the same file can — but it makes the intent reviewable, and
 * lowering it as brands are paired is what keeps the list shrinking.
 */
export const KNOWN_UNPAIRED_CEILING = 9;

/** Brands with no bundled plugin. Pairing one removes its entry; see check 1. */
export const KNOWN_UNPAIRED: readonly string[] = [
  "cisco",
  "cloudflare-kumo",
  "hud",
  "loom",
  "slack",
  "tom-modern",
  "trading-terminal",
  "webex",
  "wechat",
];

/** What check 2 judges, resolved by the caller so the rules stay pure. */
export type BundledPluginFiles = {
  manifest: "missing" | "unparseable" | "ok";
  design: "missing" | "empty" | "ok";
};

export type BundledDesignSystemInput = {
  /** Brand slugs under design-systems/, excluding non-brand entries. */
  brands: readonly string[];
  /** Slugs shipping a directory under plugins/_official/design-systems/. */
  bundled: readonly string[];
  /** Per bundled slug, the state of the files check 2 requires. */
  filesByBundledSlug: ReadonlyMap<string, BundledPluginFiles>;
  /** Every `source` string in the marketplace registry, in file order. */
  registrySources: readonly string[];
  knownUnpaired?: readonly string[];
  knownUnpairedCeiling?: number;
};

export function expectedRegistrySource(slug: string): string {
  return `${EXPECTED_SOURCE_PREFIX}/${BUNDLED_DIR}/${slug}`;
}

/** Registry `source` strings, skipping entries that carry none. */
export function registrySources(registry: unknown): string[] {
  const plugins =
    typeof registry === "object" && registry !== null && Array.isArray((registry as { plugins?: unknown }).plugins)
      ? (registry as { plugins: unknown[] }).plugins
      : [];
  const sources: string[] = [];
  for (const plugin of plugins) {
    const source = typeof plugin === "object" && plugin !== null ? (plugin as { source?: unknown }).source : undefined;
    if (typeof source === "string") sources.push(source);
  }
  return sources;
}

/** True for a source that is trying to address a bundled design system. */
function addressesADesignSystem(source: string): boolean {
  return source.includes(`/${BUNDLED_DIR}/`);
}

export function bundledDesignSystemViolations({
  brands,
  bundled,
  filesByBundledSlug,
  registrySources: sources,
  knownUnpaired = KNOWN_UNPAIRED,
  knownUnpairedCeiling = KNOWN_UNPAIRED_CEILING,
}: BundledDesignSystemInput): string[] {
  const violations: string[] = [];
  const brandSet = new Set(brands);
  const bundledSet = new Set(bundled);
  const unpaired = new Set(knownUnpaired);

  for (const slug of brands) {
    if (bundledSet.has(slug) || unpaired.has(slug)) continue;
    violations.push(
      `${BRANDS_DIR}/${slug}: no bundled plugin at ${BUNDLED_DIR}/${slug} — its card on /plugins/systems/ links back to the index instead of a detail page`,
    );
  }

  for (const slug of bundled) {
    if (!brandSet.has(slug)) {
      violations.push(
        `${BUNDLED_DIR}/${slug}: no brand package at ${BRANDS_DIR}/${slug} — the marketplace offers a design system whose tokens do not ship`,
      );
    }
    const files = filesByBundledSlug.get(slug);
    if (files === undefined) {
      violations.push(`${BUNDLED_DIR}/${slug}: could not read its files`);
      continue;
    }
    if (files.manifest === "missing") violations.push(`${BUNDLED_DIR}/${slug}: missing open-design.json`);
    if (files.manifest === "unparseable") {
      violations.push(`${BUNDLED_DIR}/${slug}: open-design.json is not valid JSON, so it resolves no detail page`);
    }
    if (files.design === "missing") violations.push(`${BUNDLED_DIR}/${slug}: missing DESIGN.md`);
    if (files.design === "empty") violations.push(`${BUNDLED_DIR}/${slug}: DESIGN.md is empty`);
  }

  if (knownUnpaired.length > knownUnpairedCeiling) {
    violations.push(
      `KNOWN_UNPAIRED holds ${knownUnpaired.length} brands but KNOWN_UNPAIRED_CEILING is ${knownUnpairedCeiling} — pair the brand instead of recording another gap, or say why the gap is growing`,
    );
  }

  for (const slug of knownUnpaired) {
    if (!brandSet.has(slug)) {
      violations.push(
        `${BRANDS_DIR}/${slug} no longer exists — drop "${slug}" from KNOWN_UNPAIRED in ${SELF_REPO_PATH}`,
      );
    } else if (bundledSet.has(slug)) {
      violations.push(
        `${slug} is paired now — drop it from KNOWN_UNPAIRED in ${SELF_REPO_PATH}, which records gaps rather than granting exemptions`,
      );
    }
  }

  const expected = new Map(bundled.map((slug) => [expectedRegistrySource(slug), slug] as const));
  const occurrences = new Map<string, number>();
  for (const source of sources) {
    occurrences.set(source, (occurrences.get(source) ?? 0) + 1);
  }

  for (const [source, slug] of expected) {
    const count = occurrences.get(source) ?? 0;
    if (count === 0) {
      violations.push(
        `${REGISTRY_PATH}: no entry sources "${source}" — the bundled plugin ships but the marketplace cannot offer it`,
      );
    } else if (count > 1) {
      violations.push(
        `${REGISTRY_PATH}: ${count} entries source ${BUNDLED_DIR}/${slug} — the marketplace would list it more than once`,
      );
    }
  }

  for (const source of new Set(sources)) {
    if (!addressesADesignSystem(source) || expected.has(source)) continue;
    violations.push(
      `${REGISTRY_PATH}: entry sources "${source}", which is not a shipped bundled design system — expected one of ${BUNDLED_DIR}/<slug> under ${EXPECTED_SOURCE_PREFIX}`,
    );
  }

  return violations;
}

const SELF_REPO_PATH = "scripts/check-bundled-design-system-plugins.ts";

async function directoryNames(root: string, relativeDir: string): Promise<string[]> {
  const absolute = path.join(root, relativeDir);
  const entries = await readdir(absolute, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    // `isDirectory()` is false for a symlink to a directory, and a symlinked
    // package still ships, so resolve the link before deciding.
    if (entry.isDirectory()) {
      names.push(entry.name);
    } else if (entry.isSymbolicLink()) {
      try {
        if ((await stat(path.join(absolute, entry.name))).isDirectory()) names.push(entry.name);
      } catch {
        // A broken link points at no package; leave it out.
      }
    }
  }
  return names.sort();
}

async function readPluginFiles(root: string, slug: string): Promise<BundledPluginFiles> {
  const dir = path.join(root, BUNDLED_DIR, slug);
  let manifest: BundledPluginFiles["manifest"] = "ok";
  try {
    JSON.parse(await readFile(path.join(dir, "open-design.json"), "utf8"));
  } catch (error) {
    manifest = (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT" ? "missing" : "unparseable";
  }

  let design: BundledPluginFiles["design"] = "ok";
  try {
    if ((await readFile(path.join(dir, "DESIGN.md"), "utf8")).trim().length === 0) design = "empty";
  } catch {
    design = "missing";
  }

  return { manifest, design };
}

export async function readBundledDesignSystemInput(root: string): Promise<BundledDesignSystemInput> {
  const brands = (await directoryNames(root, BRANDS_DIR)).filter((name) => !NON_BRAND_ENTRIES.has(name));
  const bundled = await directoryNames(root, BUNDLED_DIR);
  const filesByBundledSlug = new Map<string, BundledPluginFiles>();
  for (const slug of bundled) {
    filesByBundledSlug.set(slug, await readPluginFiles(root, slug));
  }
  const registry: unknown = JSON.parse(await readFile(path.join(root, REGISTRY_PATH), "utf8"));
  if (typeof registry !== "object" || registry === null || !Array.isArray((registry as { plugins?: unknown }).plugins)) {
    throw new Error(`${REGISTRY_PATH} has no "plugins" array`);
  }
  return { brands, bundled, filesByBundledSlug, registrySources: registrySources(registry) };
}

export async function checkBundledDesignSystemPlugins(repoRoot: string): Promise<boolean> {
  let input: BundledDesignSystemInput;
  try {
    input = await readBundledDesignSystemInput(repoRoot);
  } catch (error) {
    console.error(
      `Bundled design-system plugin check failed to read the repository: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }

  const violations = bundledDesignSystemViolations(input);
  if (violations.length > 0) {
    console.error("Bundled design-system plugin violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  const paired = input.brands.filter((slug) => input.bundled.includes(slug)).length;
  console.log(
    `Bundled design-system plugin check passed: ${paired} of ${input.brands.length} brands paired and listed in the marketplace registry, ${KNOWN_UNPAIRED.length} known unpaired.`,
  );
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await checkBundledDesignSystemPlugins(path.resolve(import.meta.dirname, ".."));
  if (!ok) process.exitCode = 1;
}
