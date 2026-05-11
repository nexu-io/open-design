/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-tokens-fixture-sync.ts
 *
 * Drift guard for the token / fixture pair introduced in #1231.
 *
 * Each design system in `design-systems/<brand>/` ships two files that
 * agents consume in tandem:
 *
 *   - tokens.css         — the canonical token bindings (`:root { ... }`)
 *   - components.html    — a self-contained fixture whose first <style>
 *                          embeds the same `:root { ... }` so the file
 *                          renders standalone in any browser
 *
 * The fixture's :root block is a *copy* of tokens.css's :root block. If
 * the two drift apart, agents that paste the fixture's :root will quietly
 * generate artifacts whose token values disagree with the canonical
 * brand definition. There is no compile step linking the two — only a
 * comment in components.html asking authors to keep them in sync — so
 * this guard exists to make the contract enforceable.
 *
 * What it checks:
 *   - For every brand directory under design-systems/, if both
 *     tokens.css and components.html exist, their first unscoped
 *     `:root { ... }` block must be byte-equivalent after canonical
 *     normalization (comments stripped, whitespace collapsed).
 *   - If only one of the pair exists, that's a violation — token /
 *     fixture pairs must travel together.
 *   - Scoped overrides like `:root[lang="zh-CN"]` and `:root[lang="ja"]`
 *     are *not* required to appear in the fixture (per the inline
 *     comment in design-systems/kami/components.html they are pasted
 *     only when an artifact's <html lang="..."> matches), so this guard
 *     only compares the unscoped `:root` block.
 *
 * Run standalone with: `pnpm exec tsx scripts/check-tokens-fixture-sync.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

/**
 * Strip every CSS block comment from the source. We do this *before*
 * looking for `:root { ... }` because file-level docstrings often
 * mention the literal text `:root { ... }` inside backticks; matching
 * the regex against raw source would happily extract the example body
 * instead of the real rule.
 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Extract the body of the first unscoped `:root { ... }` rule from
 * already-comment-stripped CSS.
 *
 * "Unscoped" means we skip rules like `:root[lang="zh-CN"]` — those are
 * brand-specific i18n overrides that should not appear in the fixture's
 * default paste block.
 */
function extractUnscopedRootBlockBody(commentlessCss: string): string | null {
  const match = commentlessCss.match(/:root(?!\[)\s*\{([\s\S]*?)\}/);
  return match == null ? null : (match[1] ?? null);
}

/**
 * Canonicalize a `:root { ... }` body for byte-level comparison.
 *
 * The two sources legitimately differ in formatting — tokens.css carries
 * extensive inline comments and per-section dividers, components.html
 * strips them for a minimal paste — so comparing raw bytes always fails.
 * Canonicalization normalizes both to the same shape so only meaningful
 * value differences remain. Comments are assumed already stripped.
 */
function canonicalizeRootBlockBody(body: string): string {
  const declarations = body
    .split(";")
    .map((decl) =>
      decl
        .trim()
        // Collapse any internal whitespace run to one space.
        .replace(/\s+/g, " ")
        // Normalize spacing around the property/value separator. CSS
        // ignores it (`--x:y` and `--x: y` are equivalent) so we should
        // not flag it as drift.
        .replace(/\s*:\s*/, ": "),
    )
    .filter((decl) => decl.length > 0);
  return declarations.map((decl) => `${decl};`).join("\n");
}

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function checkDesignSystemTokenFixtureSync(): Promise<boolean> {
  let designSystemEntries;
  try {
    designSystemEntries = await readdir(designSystemsRoot, { withFileTypes: true });
  } catch {
    // No design-systems/ directory yet — nothing to check, treated as
    // pass so the guard does not block repos pre-dating the feature.
    console.log("Token-fixture sync skipped: no design-systems/ directory.");
    return true;
  }

  const violations: string[] = [];
  let pairsChecked = 0;

  for (const entry of designSystemEntries) {
    if (!entry.isDirectory()) continue;

    const brandRoot = path.join(designSystemsRoot, entry.name);
    const tokensPath = path.join(brandRoot, "tokens.css");
    const fixturePath = path.join(brandRoot, "components.html");

    const [tokensExists, fixtureExists] = await Promise.all([fileExists(tokensPath), fileExists(fixturePath)]);

    if (!tokensExists && !fixtureExists) continue;

    if (tokensExists !== fixtureExists) {
      const present = tokensExists ? tokensPath : fixturePath;
      const missing = tokensExists ? fixturePath : tokensPath;
      violations.push(
        `${toRepositoryPath(present)} exists but ${toRepositoryPath(missing)} does not — ` +
          `token / fixture pairs must travel together so agents always have both the values and a working example.`,
      );
      continue;
    }

    const [tokensCss, fixtureHtml] = await Promise.all([readFile(tokensPath, "utf8"), readFile(fixturePath, "utf8")]);

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
          `${toRepositoryPath(fixturePath)} :root block drifted from ${toRepositoryPath(tokensPath)} :root.`,
          describeFirstDivergence(canonicalTokens, canonicalFixture),
          `  Re-paste the canonical block from tokens.css (declarations only — comments and whitespace are normalized).`,
        ].join("\n"),
      );
    }
  }

  if (violations.length > 0) {
    console.error("Design system token-fixture sync violations:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    console.error(
      "Each design-systems/<brand>/components.html must keep its first `:root { ... }` block byte-equivalent (after comment / whitespace normalization) to the same brand's tokens.css `:root` block.",
    );
    return false;
  }

  console.log(
    `Design system token-fixture sync passed: ${pairsChecked} brand pair${pairsChecked === 1 ? "" : "s"} aligned (components.html :root matches tokens.css :root).`,
  );
  return true;
}

const isInvokedDirectly = process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isInvokedDirectly) {
  const passed = await checkDesignSystemTokenFixtureSync();
  if (!passed) {
    process.exitCode = 1;
  }
}
