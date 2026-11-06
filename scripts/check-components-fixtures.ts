/* ─────────────────────────────────────────────────────────────────────────
 * scripts/check-components-fixtures.ts
 *
 * Report-mode inventory for design-system `components.html` fixtures.
 *
 * This is intentionally non-blocking in PR 1: it lets us see whether each
 * fixture exposes the selector vocabulary agents should learn from, and where
 * component CSS still relies on concrete values instead of shared tokens.
 *
 * Run standalone:
 *   pnpm exec tsx scripts/check-components-fixtures.ts
 *
 * Guard integration:
 *   `checkDesignSystemComponentFixtureReport()` always returns true unless the
 *   script itself crashes. Later PRs can promote stable findings to hard-fail
 *   checks once the report is clean enough to enforce.
 * ─────────────────────────────────────────────────────────────────── */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");

const SKIPPED_DESIGN_SYSTEM_DIRECTORIES = new Set(["_schema"]);

type FixtureSource = {
  name: string;
  directoryPath: string;
  fixturePath: string;
  tokensPath: string;
  fixtureHtml: string;
  tokensCss: string | null;
};

type SelectorGroup = {
  name: string;
  selectors: readonly string[];
};

type FixtureReport = {
  source: FixtureSource;
  hasTokens: boolean;
  hasStyle: boolean;
  hasRoot: boolean;
  missingSelectorsByGroup: Map<string, string[]>;
  colorLiteralCount: number;
  pixelLiteralCount: number;
  hardcodedFontFamilyCount: number;
};

type AggregateSelectorGap = {
  groupName: string;
  selector: string;
  missingCount: number;
};

const selectorGroups: readonly SelectorGroup[] = [
  { name: "buttons", selectors: [".btn", ".btn-primary", ".btn-secondary", ":hover", ":focus-visible"] },
  { name: "inputs", selectors: [".field", "input", "label"] },
  { name: "cards", selectors: [".card"] },
  { name: "badges", selectors: [".badge"] },
  { name: "links", selectors: ["a"] },
  { name: "keyboard", selectors: ["kbd"] },
  { name: "icons", selectors: [".icon"] },
  { name: "typography", selectors: ["h1", "h2", "h3", ".lead", ".eyebrow", ".body-muted", ".body-sm"] },
  { name: "layout", selectors: [".container", "section", ".stack-3", ".stack-4", ".stack-6", ".row-between"] },
];

const colorLiteralPattern =
  /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|color-mix\([^)]*\)/g;
const pixelLiteralPattern = /(?<![\w-])-?\d*\.?\d+px\b/g;
const hardcodedFontFamilyPattern = /font-family\s*:\s*(?!var\()/g;

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function discoverFixtureSources(): Promise<FixtureSource[]> {
  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  const sources: FixtureSource[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIPPED_DESIGN_SYSTEM_DIRECTORIES.has(entry.name)) continue;

    const directoryPath = path.join(designSystemsRoot, entry.name);
    const fixturePath = path.join(directoryPath, "components.html");
    const tokensPath = path.join(directoryPath, "tokens.css");
    const fixtureHtml = await readTextIfExists(fixturePath);

    if (fixtureHtml == null) continue;

    sources.push({
      name: entry.name,
      directoryPath,
      fixturePath,
      tokensPath,
      fixtureHtml,
      tokensCss: await readTextIfExists(tokensPath),
    });
  }

  sources.sort((a, b) => a.name.localeCompare(b.name));
  return sources;
}

function firstStyleBlock(html: string): string | null {
  return html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? null;
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripFirstRootBlock(css: string): string {
  return css.replace(/:root(?!\[)\s*\{[\s\S]*?\}/, "");
}

function hasUnscopedRoot(css: string | null): boolean {
  return css != null && /:root(?!\[)\s*\{/.test(stripCssComments(css));
}

function selectorPattern(selector: string): RegExp {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^[a-z]+$/.test(selector)) {
    return new RegExp(`(^|[^.#\\w-])${escaped}(?=\\s*[{,.#:>+~\\[])`);
  }
  return new RegExp(`${escaped}(?=\\s*[{,.#:>+~\\s]|$)`);
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

function analyzeFixture(source: FixtureSource): FixtureReport {
  const style = firstStyleBlock(source.fixtureHtml);
  const commentlessStyle = style == null ? "" : stripCssComments(style);
  const componentCss = stripFirstRootBlock(commentlessStyle);
  const missingSelectorsByGroup = new Map<string, string[]>();

  for (const group of selectorGroups) {
    const missing = group.selectors.filter((selector) => !selectorPattern(selector).test(componentCss));
    if (missing.length > 0) missingSelectorsByGroup.set(group.name, missing);
  }

  return {
    source,
    hasTokens: source.tokensCss != null,
    hasStyle: style != null,
    hasRoot: hasUnscopedRoot(style),
    missingSelectorsByGroup,
    colorLiteralCount: countMatches(componentCss, colorLiteralPattern),
    pixelLiteralCount: countMatches(componentCss, pixelLiteralPattern),
    hardcodedFontFamilyCount: countMatches(componentCss, hardcodedFontFamilyPattern),
  };
}

function countCompleteGroup(reports: readonly FixtureReport[], groupName: string): number {
  return reports.filter((report) => !report.missingSelectorsByGroup.has(groupName)).length;
}

function selectorGaps(reports: readonly FixtureReport[]): AggregateSelectorGap[] {
  const gapCounts = new Map<string, AggregateSelectorGap>();

  for (const report of reports) {
    for (const [groupName, selectors] of report.missingSelectorsByGroup) {
      for (const selector of selectors) {
        const key = `${groupName}\0${selector}`;
        const existing = gapCounts.get(key);
        if (existing == null) {
          gapCounts.set(key, { groupName, selector, missingCount: 1 });
        } else {
          existing.missingCount += 1;
        }
      }
    }
  }

  return [...gapCounts.values()].sort((a, b) => b.missingCount - a.missingCount || a.selector.localeCompare(b.selector));
}

function topBy<T>(items: readonly T[], score: (item: T) => number, limit: number): T[] {
  return [...items]
    .filter((item) => score(item) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

function formatFixtureList(reports: readonly FixtureReport[], reason: (report: FixtureReport) => boolean): string[] {
  return reports
    .filter(reason)
    .map((report) => `  - ${toRepositoryPath(report.source.fixturePath)}`)
    .slice(0, 20);
}

export async function checkDesignSystemComponentFixtureReport(): Promise<boolean> {
  const sources = await discoverFixtureSources();
  const reports = sources.map(analyzeFixture);
  const total = reports.length;

  console.log(`Design system component fixture report: scanned ${total} components.html fixtures.`);

  const missingTokens = formatFixtureList(reports, (report) => !report.hasTokens);
  const missingStyle = formatFixtureList(reports, (report) => !report.hasStyle);
  const missingRoot = formatFixtureList(reports, (report) => !report.hasRoot);

  if (missingTokens.length > 0) {
    console.log(`Design system component fixture report: ${missingTokens.length} fixture(s) have no paired tokens.css.`);
    for (const line of missingTokens) console.log(line);
  }
  if (missingStyle.length > 0) {
    console.log(`Design system component fixture report: ${missingStyle.length} fixture(s) have no <style> block.`);
    for (const line of missingStyle) console.log(line);
  }
  if (missingRoot.length > 0) {
    console.log(`Design system component fixture report: ${missingRoot.length} fixture(s) have no unscoped :root block.`);
    for (const line of missingRoot) console.log(line);
  }

  console.log("Design system component fixture selector coverage:");
  for (const group of selectorGroups) {
    const covered = countCompleteGroup(reports, group.name);
    console.log(`- ${group.name}: ${covered}/${total} fixtures include ${group.selectors.join(", ")}`);
  }

  const gaps = selectorGaps(reports).slice(0, 16);
  if (gaps.length > 0) {
    console.log("Design system component fixture report: most common selector gaps (report-only):");
    for (const gap of gaps) {
      console.log(`- ${gap.groupName} ${gap.selector}: missing in ${gap.missingCount}/${total}`);
    }
  }

  const colorTotal = reports.reduce((sum, report) => sum + report.colorLiteralCount, 0);
  const pixelTotal = reports.reduce((sum, report) => sum + report.pixelLiteralCount, 0);
  const fontTotal = reports.reduce((sum, report) => sum + report.hardcodedFontFamilyCount, 0);
  console.log(
    `Design system component fixture literal inventory (outside :root): ${colorTotal} color expressions, ${pixelTotal} px values, ${fontTotal} hardcoded font-family declarations.`,
  );

  const literalLeaders = topBy(
    reports,
    (report) => report.colorLiteralCount + report.pixelLiteralCount + report.hardcodedFontFamilyCount,
    10,
  );
  if (literalLeaders.length > 0) {
    console.log("Design system component fixture report: top literal-heavy fixtures (report-only):");
    for (const report of literalLeaders) {
      console.log(
        `- ${toRepositoryPath(report.source.fixturePath)}: ${report.colorLiteralCount} colors, ${report.pixelLiteralCount} px, ${report.hardcodedFontFamilyCount} font-family`,
      );
    }
  }

  console.log("Design system component fixture report completed in report-only mode.");
  return true;
}

const isDirectRun = process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  await checkDesignSystemComponentFixtureReport();
}
