/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-tokens-fixture-sync.ts
 *
 * Guard checks that enforce the design-system token contract.
 *
 * The shared schema lives in `design-systems/_schema/tokens.schema.ts`;
 * its A2 fallback values mirror into `design-systems/_schema/defaults.css`.
 * Every brand under `design-systems/<brand>/` ships two consumer-facing
 * artifacts:
 *
 *   - tokens.css       — canonical token bindings (`:root { ... }`)
 *   - components.html  — self-contained fixture whose first <style>
 *                        embeds the same `:root` so the file renders
 *                        standalone in any browser.
 *
 * This file exports six check functions, each registered as its own
 * entry in `pnpm guard` so failures attribute to a specific contract.
 *
 *   1. checkDesignSystemTokenFixtureSync
 *        components.html `:root` is byte-equivalent to tokens.css
 *        `:root` after canonical normalization.
 *
 *   2. checkDesignSystemA1RequiredTokens
 *        Every brand declares every A1-identity / A1-structure token
 *        from the schema. Missing → fail.
 *
 *   3. checkDesignSystemA2RequiredTokens
 *        Every brand declares every A2 token from the schema. Missing
 *        → fail (until the derive script lands; see _schema/AGENTS.md).
 *
 *   4. checkDesignSystemBSlotRequiredTokens
 *        Every brand declares every B-slot token. The brand may bind
 *        independently or alias the named sibling via `var(...)`, but
 *        it must appear in `:root`; artifacts paste a single `:root`
 *        block, so a missing slot resolves to nothing at runtime.
 *
 *   5. checkDesignSystemUnknownTokens
 *        Every token a brand declares is either in the shared schema
 *        or explicitly allowed by `BRAND_EXTENSIONS` /
 *        `BRAND_EXTENSION_PREFIXES`. Stray names → fail.
 *
 *   6. checkDesignSystemA2DefaultsParity
 *        Each A2 declaration in `_schema/defaults.css` matches the
 *        `fallback` field on the matching entry in `tokens.schema.ts`.
 *
 * Run standalone: `pnpm exec tsx scripts/check-tokens-fixture-sync.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRAND_EXTENSIONS,
  BRAND_EXTENSION_PREFIXES,
  TOKEN_SCHEMA,
  getAllSchemaNames,
  getBSlotNames,
  getRequiredA1Names,
  getRequiredA2Names,
  isAllowedExtension,
} from "../design-systems/_schema/tokens.schema.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");
const schemaRoot = path.join(designSystemsRoot, "_schema");
const defaultsCssPath = path.join(schemaRoot, "defaults.css");

const SKIPPED_BRAND_DIRECTORIES = new Set(["_schema"]);

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

// ─── CSS parsing utilities ──────────────────────────────────────────

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractUnscopedRootBlockBody(commentlessCss: string): string | null {
  const match = commentlessCss.match(/:root(?!\[)\s*\{([\s\S]*?)\}/);
  return match == null ? null : (match[1] ?? null);
}

function canonicalizeRootBlockBody(body: string): string {
  const declarations = body
    .split(";")
    .map((decl) =>
      decl
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*:\s*/, ": "),
    )
    .filter((decl) => decl.length > 0);
  return declarations.map((decl) => `${decl};`).join("\n");
}

/** Parse a normalized `:root` body into a name→value map for tokens (--*). */
function parseTokenDeclarations(commentlessRootBody: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const rawDecl of commentlessRootBody.split(";")) {
    const decl = rawDecl.trim();
    if (decl.length === 0) continue;
    const colonIndex = decl.indexOf(":");
    if (colonIndex === -1) continue;
    const name = decl.slice(0, colonIndex).trim();
    if (!name.startsWith("--")) continue;
    const value = decl
      .slice(colonIndex + 1)
      .trim()
      .replace(/\s+/g, " ");
    declarations.set(name, value);
  }
  return declarations;
}

/** Normalize a CSS expression for byte-level comparison. */
function normalizeCssValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// ─── Brand discovery ────────────────────────────────────────────────

type BrandSources = {
  brand: string;
  tokensPath: string;
  fixturePath: string;
  tokensCss: string;
  fixtureHtml: string;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

type BrandDiscovery = { sources: BrandSources[]; pairingErrors: string[] };

async function discoverBrandSources(): Promise<BrandDiscovery> {
  let designSystemEntries;
  try {
    designSystemEntries = await readdir(designSystemsRoot, { withFileTypes: true });
  } catch {
    return { sources: [], pairingErrors: [] };
  }

  const sources: BrandSources[] = [];
  const pairingErrors: string[] = [];

  for (const entry of designSystemEntries) {
    if (!entry.isDirectory()) continue;
    if (SKIPPED_BRAND_DIRECTORIES.has(entry.name)) continue;

    const brand = entry.name;
    const brandRoot = path.join(designSystemsRoot, brand);
    const tokensPath = path.join(brandRoot, "tokens.css");
    const fixturePath = path.join(brandRoot, "components.html");

    const [tokensExists, fixtureExists] = await Promise.all([fileExists(tokensPath), fileExists(fixturePath)]);

    if (!tokensExists && !fixtureExists) continue;

    if (tokensExists !== fixtureExists) {
      const present = tokensExists ? tokensPath : fixturePath;
      const missing = tokensExists ? fixturePath : tokensPath;
      pairingErrors.push(
        `${toRepositoryPath(present)} exists but ${toRepositoryPath(missing)} does not — ` +
          `token / fixture pairs must travel together so agents always have both the values and a working example.`,
      );
      continue;
    }

    const [tokensCss, fixtureHtml] = await Promise.all([readFile(tokensPath, "utf8"), readFile(fixturePath, "utf8")]);

    sources.push({ brand, tokensPath, fixturePath, tokensCss, fixtureHtml });
  }

  sources.sort((a, b) => a.brand.localeCompare(b.brand));
  return { sources, pairingErrors };
}

function reportFailure(checkLabel: string, violations: string[], remediation?: string): boolean {
  if (violations.length === 0) return true;
  console.error(`${checkLabel} violations:`);
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  if (remediation != null) console.error(remediation);
  return false;
}

// ─── 1. Sync between tokens.css and components.html ──────────────────

function describeFirstDivergence(canonicalTokens: string, canonicalFixture: string): string {
  const tokenLines = canonicalTokens.split("\n");
  const fixtureLines = canonicalFixture.split("\n");
  const longest = Math.max(tokenLines.length, fixtureLines.length);
  for (let index = 0; index < longest; index += 1) {
    if (tokenLines[index] !== fixtureLines[index]) {
      const left = tokenLines[index] ?? "(missing — fixture has extra declarations beyond tokens.css)";
      const right = fixtureLines[index] ?? "(missing — tokens.css has extra declarations beyond fixture)";
      return [
        `  first divergence at declaration ${index + 1}:`,
        `    tokens.css      → ${left}`,
        `    components.html → ${right}`,
      ].join("\n");
    }
  }
  return "  declarations align by index but the canonical strings still differ — inspect manually";
}

export async function checkDesignSystemTokenFixtureSync(): Promise<boolean> {
  const { sources, pairingErrors } = await discoverBrandSources();
  const violations = [...pairingErrors];
  let pairsChecked = 0;

  for (const { brand, tokensPath, fixturePath, tokensCss, fixtureHtml } of sources) {
    const tokensRootBody = extractUnscopedRootBlockBody(stripCssComments(tokensCss));
    const fixtureRootBody = extractUnscopedRootBlockBody(stripCssComments(fixtureHtml));

    if (tokensRootBody == null) {
      violations.push(`${toRepositoryPath(tokensPath)} contains no \`:root { ... }\` rule.`);
      continue;
    }
    if (fixtureRootBody == null) {
      violations.push(
        `${toRepositoryPath(fixturePath)} contains no \`:root { ... }\` rule — fixture must paste the canonical token bindings into a <style>.`,
      );
      continue;
    }

    const canonicalTokens = canonicalizeRootBlockBody(tokensRootBody);
    const canonicalFixture = canonicalizeRootBlockBody(fixtureRootBody);

    pairsChecked += 1;

    if (canonicalTokens !== canonicalFixture) {
      violations.push(
        [
          `[${brand}] ${toRepositoryPath(fixturePath)} :root drifted from ${toRepositoryPath(tokensPath)} :root.`,
          describeFirstDivergence(canonicalTokens, canonicalFixture),
          `  Re-paste the canonical block from tokens.css (declarations only — comments and whitespace are normalized).`,
        ].join("\n"),
      );
    }
  }

  const passed = reportFailure(
    "Design system token-fixture sync",
    violations,
    "Each design-systems/<brand>/components.html must keep its first `:root { ... }` block byte-equivalent (after comment / whitespace normalization) to the same brand's tokens.css `:root` block.",
  );
  if (passed) {
    console.log(
      `Design system token-fixture sync passed: ${pairsChecked} brand pair${pairsChecked === 1 ? "" : "s"} aligned (components.html :root matches tokens.css :root).`,
    );
  }
  return passed;
}

// ─── 2. A1 required tokens ──────────────────────────────────────────

export async function checkDesignSystemA1RequiredTokens(): Promise<boolean> {
  const { sources } = await discoverBrandSources();
  const requiredA1 = getRequiredA1Names();
  const violations: string[] = [];

  for (const { brand, tokensPath, tokensCss } of sources) {
    const rootBody = extractUnscopedRootBlockBody(stripCssComments(tokensCss));
    if (rootBody == null) continue; // sync check covers this case
    const declared = parseTokenDeclarations(rootBody);

    const missing = requiredA1.filter((name) => !declared.has(name));
    if (missing.length > 0) {
      violations.push(
        `[${brand}] ${toRepositoryPath(tokensPath)} is missing ${missing.length} A1 token${missing.length === 1 ? "" : "s"} (brand identity / structure must be explicit per brand):\n  ${missing.join(", ")}`,
      );
    }
  }

  const passed = reportFailure(
    "Design system A1 required tokens",
    violations,
    "A1 tokens (identity + structure) have no defensible cross-brand fallback. Every brand must declare them explicitly. See design-systems/_schema/AGENTS.md for the layer model.",
  );
  if (passed) {
    console.log(
      `Design system A1 required tokens passed: ${sources.length} brand${sources.length === 1 ? "" : "s"} declare all ${requiredA1.length} A1 tokens.`,
    );
  }
  return passed;
}

// ─── 3. A2 required tokens ──────────────────────────────────────────

export async function checkDesignSystemA2RequiredTokens(): Promise<boolean> {
  const { sources } = await discoverBrandSources();
  const requiredA2 = getRequiredA2Names();
  const violations: string[] = [];

  for (const { brand, tokensPath, tokensCss } of sources) {
    const rootBody = extractUnscopedRootBlockBody(stripCssComments(tokensCss));
    if (rootBody == null) continue;
    const declared = parseTokenDeclarations(rootBody);

    const missing = requiredA2.filter((name) => !declared.has(name));
    if (missing.length > 0) {
      violations.push(
        `[${brand}] ${toRepositoryPath(tokensPath)} is missing ${missing.length} A2 token${missing.length === 1 ? "" : "s"} (default values exist in design-systems/_schema/defaults.css; copy or override):\n  ${missing.join(", ")}`,
      );
    }
  }

  const passed = reportFailure(
    "Design system A2 required tokens",
    violations,
    "A2 tokens carry sensible cross-brand defaults but artifacts paste a single :root block — agents that paste a tokens.css missing an A2 declaration will produce broken artifacts. Every brand's tokens.css must declare every A2 token (until the derive script lands and inlines fallbacks automatically).",
  );
  if (passed) {
    console.log(
      `Design system A2 required tokens passed: ${sources.length} brand${sources.length === 1 ? "" : "s"} declare all ${requiredA2.length} A2 tokens.`,
    );
  }
  return passed;
}

// ─── 4. B-slot required tokens ──────────────────────────────────────

export async function checkDesignSystemBSlotRequiredTokens(): Promise<boolean> {
  const { sources } = await discoverBrandSources();
  const bSlotNames = getBSlotNames();
  const violations: string[] = [];

  for (const { brand, tokensPath, tokensCss } of sources) {
    const rootBody = extractUnscopedRootBlockBody(stripCssComments(tokensCss));
    if (rootBody == null) continue;
    const declared = parseTokenDeclarations(rootBody);

    const missing = bSlotNames.filter((name) => !declared.has(name));
    if (missing.length > 0) {
      const hints = missing
        .map((name) => {
          const spec = TOKEN_SCHEMA.find((t) => t.name === name);
          return spec?.aliasTo != null ? `${name} (default alias: ${spec.aliasTo})` : name;
        })
        .join(", ");
      violations.push(
        `[${brand}] ${toRepositoryPath(tokensPath)} is missing ${missing.length} B-slot token${missing.length === 1 ? "" : "s"} (alias the named sibling via var(...) or bind independently):\n  ${hints}`,
      );
    }
  }

  const passed = reportFailure(
    "Design system B-slot required tokens",
    violations,
    "B-slot tokens (--fg-2, --meta, --surface-warm, --border-soft) let shared components target richer tiers without forking. Artifacts paste a single :root block — a missing slot resolves to nothing at runtime, so every brand must declare every B-slot, either as `var(--sibling)` (collapsed brand) or an independent value (richer brand). See design-systems/_schema/AGENTS.md.",
  );
  if (passed) {
    console.log(
      `Design system B-slot required tokens passed: ${sources.length} brand${sources.length === 1 ? "" : "s"} declare all ${bSlotNames.length} B-slot tokens.`,
    );
  }
  return passed;
}

// ─── 5. Unknown token allowlist ─────────────────────────────────────

export async function checkDesignSystemUnknownTokens(): Promise<boolean> {
  const { sources } = await discoverBrandSources();
  const schemaNames = new Set(getAllSchemaNames());
  const violations: string[] = [];

  for (const { brand, tokensPath, tokensCss } of sources) {
    const rootBody = extractUnscopedRootBlockBody(stripCssComments(tokensCss));
    if (rootBody == null) continue;
    const declared = parseTokenDeclarations(rootBody);

    const unknown: string[] = [];
    for (const name of declared.keys()) {
      if (schemaNames.has(name)) continue;
      if (isAllowedExtension(brand, name)) continue;
      unknown.push(name);
    }

    if (unknown.length > 0) {
      violations.push(
        `[${brand}] ${toRepositoryPath(tokensPath)} declares ${unknown.length} unknown token${unknown.length === 1 ? "" : "s"} (not in shared schema, not in BRAND_EXTENSIONS["${brand}"], not matching any BRAND_EXTENSION_PREFIXES):\n  ${unknown.join(", ")}`,
      );
    }
  }

  const passed = reportFailure(
    "Design system unknown token allowlist",
    violations,
    'Every token must be declared in design-systems/_schema/tokens.schema.ts (shared schema), or listed in BRAND_EXTENSIONS["<brand>"] (brand-specific), or match a prefix in BRAND_EXTENSION_PREFIXES. See _schema/AGENTS.md for the C → B-slot → A2 promotion path before adding new shared tokens.',
  );
  if (passed) {
    const totalTokens = sources.reduce((sum, source) => {
      const body = extractUnscopedRootBlockBody(stripCssComments(source.tokensCss));
      return sum + (body == null ? 0 : parseTokenDeclarations(body).size);
    }, 0);
    console.log(
      `Design system unknown token allowlist passed: ${totalTokens} declarations across ${sources.length} brand${sources.length === 1 ? "" : "s"} all match shared schema or brand extensions.`,
    );
  }
  return passed;
}

// ─── 6. A2 defaults parity (schema fallback ↔ defaults.css) ─────────

export async function checkDesignSystemA2DefaultsParity(): Promise<boolean> {
  let defaultsCss: string;
  try {
    defaultsCss = await readFile(defaultsCssPath, "utf8");
  } catch {
    return reportFailure(
      "Design system A2 defaults parity",
      [`${toRepositoryPath(defaultsCssPath)} does not exist — A2 fallback contract requires a CSS mirror of tokens.schema.ts.`],
    );
  }

  const rootBody = extractUnscopedRootBlockBody(stripCssComments(defaultsCss));
  if (rootBody == null) {
    return reportFailure(
      "Design system A2 defaults parity",
      [`${toRepositoryPath(defaultsCssPath)} contains no \`:root { ... }\` rule.`],
    );
  }

  const declared = parseTokenDeclarations(rootBody);
  const violations: string[] = [];

  const a2Specs = TOKEN_SCHEMA.filter((spec) => spec.layer === "A2");

  for (const spec of a2Specs) {
    const fallback = spec.fallback;
    if (fallback == null) {
      violations.push(
        `tokens.schema.ts entry ${spec.name} has layer "A2" but no \`fallback\` field — every A2 token must specify the value the derive script will inline.`,
      );
      continue;
    }
    const actual = declared.get(spec.name);
    if (actual == null) {
      violations.push(
        `${toRepositoryPath(defaultsCssPath)} is missing a declaration for ${spec.name} (schema fallback is \`${fallback}\`).`,
      );
      continue;
    }
    if (normalizeCssValue(actual) !== normalizeCssValue(fallback)) {
      violations.push(
        [
          `${spec.name} drifted between schema and defaults.css:`,
          `  tokens.schema.ts → ${normalizeCssValue(fallback)}`,
          `  defaults.css     → ${normalizeCssValue(actual)}`,
        ].join("\n"),
      );
    }
  }

  const a2Names = new Set(a2Specs.map((spec) => spec.name));
  for (const declaredName of declared.keys()) {
    if (!a2Names.has(declaredName)) {
      violations.push(
        `${toRepositoryPath(defaultsCssPath)} declares ${declaredName}, which is not an A2 token in tokens.schema.ts. defaults.css mirrors only A2 fallbacks.`,
      );
    }
  }

  const passed = reportFailure(
    "Design system A2 defaults parity",
    violations,
    "Update both tokens.schema.ts and defaults.css together. defaults.css exists as a human-readable mirror of A2 fallback fields and is the future input to the derive script.",
  );
  if (passed) {
    console.log(
      `Design system A2 defaults parity passed: ${a2Specs.length} A2 fallback${a2Specs.length === 1 ? "" : "s"} match tokens.schema.ts ↔ defaults.css byte-for-byte.`,
    );
  }
  return passed;
}

// ─── Standalone entrypoint ───────────────────────────────────────────

const isInvokedDirectly = process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isInvokedDirectly) {
  const checks = [
    checkDesignSystemTokenFixtureSync,
    checkDesignSystemA1RequiredTokens,
    checkDesignSystemA2RequiredTokens,
    checkDesignSystemBSlotRequiredTokens,
    checkDesignSystemUnknownTokens,
    checkDesignSystemA2DefaultsParity,
  ];
  const results = await Promise.all(checks.map((check) => check()));
  if (results.some((passed) => !passed)) {
    process.exitCode = 1;
  }
}
