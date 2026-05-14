/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-design-system-flag-parity.ts
 *
 * Regression guard for the design-system token channel rolled out in
 * PR #1385 (the daemon path that injects `tokens.css` + `components.html`
 * into the agent system prompt when those siblings exist alongside
 * DESIGN.md). Two brands ship the structured form today (`default`,
 * `kami`); the other ~138 brands are prose-only and rely on the legacy
 * DESIGN.md-only behaviour.
 *
 * PR-D will flip the `OD_DESIGN_TOKEN_CHANNEL` env default from off to
 * on. For prose-only brands, that flip MUST be a no-op: missing files
 * resolve to `undefined`, undefined fields skip the new prompt blocks,
 * and the composed system prompt should be byte-identical to today's
 * output. This guard pins that contract end-to-end at every brand:
 *
 *   1. checkDesignSystemFlagParity
 *        For each prose-only brand, calling `composeSystemPrompt` with
 *        the new asset fields omitted (flag-off / no files) and with
 *        them set to the values `readDesignSystemAssets` actually
 *        returns (which is `{ undefined, undefined }` for these
 *        brands, i.e. the flag-on path with no files on disk) produces
 *        byte-identical strings.
 *
 *        For structured brands, the same call pair MUST diverge — the
 *        flag-on path must contain the `tokens.css` and
 *        `components.html` blocks. A silent regression that reverted
 *        the composer to skip those blocks would be caught here.
 *
 * The guard mirrors the runtime path the daemon takes in
 * `apps/daemon/src/server.ts` so the contract is exercised in the
 * shape that ships, not a synthetic stand-in.
 *
 * Run standalone: `pnpm exec tsx scripts/check-design-system-flag-parity.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readDesignSystemAssets,
  type DesignSystemAssets,
} from "../apps/daemon/src/design-systems.ts";
import { composeSystemPrompt } from "../apps/daemon/src/prompts/system.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");

const SKIPPED_BRAND_DIRECTORIES = new Set(["_schema"]);

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

type BrandSnapshot = {
  id: string;
  brandRoot: string;
  designMdPath: string;
  designMd: string;
  title: string;
  assets: DesignSystemAssets;
  isStructured: boolean;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (err) {
    // Only treat genuine "not there" failures as a clean false. Every
    // other fs error (`EACCES`, `EPERM`, `EIO`, a directory at the
    // file path, …) means the parity inventory cannot be read — and
    // since this guard exists precisely to catch silent
    // misconfigurations during the PR-D rollout, we must surface those
    // loudly instead of treating them as "brand absent".
    if (isAbsenceError(err)) return false;
    throw err;
  }
}

function isAbsenceError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function extractTitle(designMd: string, fallback: string): string {
  const match = /^#\s+(.+?)\s*$/m.exec(designMd);
  const raw = match?.[1] ?? fallback;
  // Mirror cleanTitle() in design-systems.ts so the title we feed
  // composeSystemPrompt matches the daemon's runtime title exactly.
  return raw.replace(/^Design System (Inspired by|for)\s+/i, "").trim();
}

async function discoverBrandSnapshots(): Promise<BrandSnapshot[]> {
  let entries;
  try {
    entries = await readdir(designSystemsRoot, { withFileTypes: true });
  } catch (err) {
    // Same absence-vs-real-error split as `fileExists` above. A
    // missing `design-systems/` directory is a non-issue (some
    // packaged distributions ship without it); every other readdir
    // failure means the parity check cannot enumerate brands and
    // must fail the guard loudly.
    if (isAbsenceError(err)) return [];
    throw err;
  }

  const snapshots: BrandSnapshot[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (SKIPPED_BRAND_DIRECTORIES.has(entry.name)) continue;

    const id = entry.name;
    const brandRoot = path.join(designSystemsRoot, id);
    const designMdPath = path.join(brandRoot, "DESIGN.md");

    if (!(await fileExists(designMdPath))) continue;

    const designMd = await readFile(designMdPath, "utf8");
    const assets = await readDesignSystemAssets(designSystemsRoot, id);
    const isStructured =
      assets.tokensCss !== undefined || assets.fixtureHtml !== undefined;

    snapshots.push({
      id,
      brandRoot,
      designMdPath,
      designMd,
      title: extractTitle(designMd, id),
      assets,
      isStructured,
    });
  }

  snapshots.sort((a, b) => a.id.localeCompare(b.id));
  return snapshots;
}

function describeFirstDivergence(left: string, right: string): string {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left.charCodeAt(index) === right.charCodeAt(index)) {
    index += 1;
  }
  // Show a small window around the first differing byte so the failure
  // is actionable without dumping the full ~80 KB system prompt.
  const window = 60;
  const start = Math.max(0, index - 8);
  return [
    `  first divergence at byte ${index} (lengths flag-off=${left.length}, flag-on=${right.length}):`,
    `    flag-off → …${JSON.stringify(left.slice(start, start + window))}…`,
    `    flag-on  → …${JSON.stringify(right.slice(start, start + window))}…`,
  ].join("\n");
}

export async function checkDesignSystemFlagParity(): Promise<boolean> {
  const snapshots = await discoverBrandSnapshots();
  const violations: string[] = [];

  let proseOnlyChecked = 0;
  let structuredChecked = 0;

  for (const brand of snapshots) {
    // Flag-off (today's default): assets fields absent from the
    // ComposeInput entirely. Equivalent to the legacy code path before
    // PR #1385 introduced the channel.
    const flagOff = composeSystemPrompt({
      designSystemBody: brand.designMd,
      designSystemTitle: brand.title,
    });

    // Flag-on: pass exactly what `readDesignSystemAssets` returned at
    // the top of this loop. For prose-only brands that's
    // `{ tokensCss: undefined, fixtureHtml: undefined }`, which the
    // composer already skips; for structured brands it's the verbatim
    // file contents.
    const flagOn = composeSystemPrompt({
      designSystemBody: brand.designMd,
      designSystemTitle: brand.title,
      designSystemTokensCss: brand.assets.tokensCss,
      designSystemFixtureHtml: brand.assets.fixtureHtml,
    });

    if (brand.isStructured) {
      structuredChecked += 1;
      if (flagOn === flagOff) {
        violations.push(
          [
            `[${brand.id}] structured brand produced byte-identical prompts under flag-off vs flag-on — the tokens.css / components.html injection is silently inert.`,
            `  ${toRepositoryPath(brand.brandRoot)} ships ${brand.assets.tokensCss !== undefined ? "tokens.css" : ""}${brand.assets.tokensCss !== undefined && brand.assets.fixtureHtml !== undefined ? " + " : ""}${brand.assets.fixtureHtml !== undefined ? "components.html" : ""} but the composer did not append the corresponding block.`,
            `  This usually means composeSystemPrompt was edited to drop the structured-tier blocks; restore the conditionals around \`designSystemTokensCss\` / \`designSystemFixtureHtml\` in apps/daemon/src/prompts/system.ts.`,
          ].join("\n"),
        );
      }
      continue;
    }

    proseOnlyChecked += 1;
    if (flagOn !== flagOff) {
      violations.push(
        [
          `[${brand.id}] prose-only brand produced different prompts under flag-off vs flag-on — flipping OD_DESIGN_TOKEN_CHANNEL would silently change behaviour for this brand.`,
          describeFirstDivergence(flagOff, flagOn),
          `  Either ${toRepositoryPath(brand.brandRoot)} now ships tokens.css / components.html (in which case it should be promoted to the structured tier and pass the divergence side of this check), or composeSystemPrompt is leaking output for undefined asset fields.`,
        ].join("\n"),
      );
    }
  }

  if (violations.length > 0) {
    console.error("Design system flag parity violations:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    console.error(
      "PR-D's promise is that flipping OD_DESIGN_TOKEN_CHANNEL on by default is a no-op for the ~138 prose-only brands and a deliberate uplift for the structured tier. Both halves of that promise must keep holding.",
    );
    return false;
  }

  const structuredLabel = `${structuredChecked} structured brand${structuredChecked === 1 ? "" : "s"}`;
  const proseLabel = `${proseOnlyChecked} prose-only brand${proseOnlyChecked === 1 ? "" : "s"}`;
  console.log(
    `Design system flag parity passed: ${proseLabel} produce byte-identical prompts under OD_DESIGN_TOKEN_CHANNEL flag-off vs flag-on; ${structuredLabel} show the expected token-channel divergence.`,
  );
  return true;
}

// ─── Standalone entrypoint ───────────────────────────────────────────

const isInvokedDirectly =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isInvokedDirectly) {
  const passed = await checkDesignSystemFlagParity();
  if (!passed) process.exitCode = 1;
}
