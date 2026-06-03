import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { checkDesignSystemManifests } from "./check-design-system-manifests.ts";
import { checkDesignSystemPackageQuality } from "./check-design-system-package-quality.ts";
import { checkDesignSystemComponentFixtureReport } from "./check-components-fixtures.ts";
import { checkDesignSystemFlagParity } from "./check-design-system-flag-parity.ts";
import { checkComponentsManifestExtraction } from "./check-components-manifest-extraction.ts";
import {
  checkDesignSystemA1RequiredTokens,
  checkDesignSystemA2DefaultsParity,
  checkDesignSystemA2RequiredTokens,
  checkDesignSystemBSlotRequiredTokens,
  checkDesignSystemTokenFixtureSync,
  checkDesignSystemUnknownTokens,
} from "./check-tokens-fixture-sync.ts";
import { collectCssHardcodedColorMatches, cssWideAndSpecialColorKeywords, realNamedColors } from "./style-policy.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const allowedE2eScripts = new Set([
  "e2e/scripts/playwright.ts",
  "e2e/scripts/release-smoke.ts",
  "e2e/scripts/visual-report.ts",
]);

type GuardCheck = {
  name: string;
  run: () => Promise<boolean>;
};

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

const residualExtensions = new Set([".js", ".mjs", ".cjs"]);

const residualSkippedDirectories = new Set([
  ".agents",
  ".astro",
  ".claude",
  ".claude-sessions",
  ".codex",
  ".cursor",
  ".git",
  ".od",
  ".od-e2e",
  ".opencode",
  ".task",
  ".tmp",
  ".vite",
  "dist",
  "node_modules",
  "out",
]);

const residualAllowedExactPaths = new Set([
  // esbuild config entrypoints are executed directly by Node before package
  // dist output exists.
  "packages/agui-adapter/esbuild.config.mjs",
  "packages/contracts/esbuild.config.mjs",
  "packages/diagnostics/esbuild.config.mjs",
  "packages/download/esbuild.config.mjs",
  "packages/host/esbuild.config.mjs",
  "packages/platform/esbuild.config.mjs",
  "packages/plugin-runtime/esbuild.config.mjs",
  "packages/registry-protocol/esbuild.config.mjs",
  "packages/sidecar/esbuild.config.mjs",
  "packages/sidecar-proto/esbuild.config.mjs",
  // Maintainer utility scripts ported from the media branch. They are
  // executed directly by Node and are not loaded by the app runtime.
  "scripts/import-prompt-templates.mjs",
  "scripts/postinstall.mjs",
  // Checked-in bin shim so pnpm can link `od` before daemon dist output exists.
  "apps/daemon/bin/od.mjs",
  "apps/packaged/esbuild.config.mjs",
  // Browser service workers must be served as JavaScript files.
  "apps/web/public/od-notifications-sw.js",
  // PostCSS loads Tailwind through a web-local .mjs compatibility config entry.
  "apps/web/postcss.config.mjs",
  "scripts/bake-html-ppt-examples.mjs",
  "scripts/scaffold-html-ppt-skills.mjs",
  "scripts/sync-hyperframes-skill.mjs",
  "scripts/verify-media-models.mjs",
  // AMR (vela) verifier: ad-hoc dev runner that imports the daemon's compiled
  // `dist/acp.js` and drives a real `vela agent run` against a live model.
  // Kept as .mjs so it can be invoked directly via Node without any transform.
  "apps/daemon/scripts/verify-amr-real-vela.mjs",
  // Fake `vela agent run --runtime opencode` ACP stdio stub used by the AMR
  // integration tests. The Vitest test spawns it via `child_process.spawn`,
  // which needs a directly-executable file (shebang + .mjs).
  "apps/daemon/tests/fixtures/fake-vela.mjs",
  "tools/dev/bin/tools-dev.mjs",
  "tools/dev/esbuild.config.mjs",
  "tools/pack/bin/tools-pack.mjs",
  "tools/pack/esbuild.config.mjs",
  "tools/serve/bin/tools-serve.mjs",
  "tools/serve/esbuild.config.mjs",
  "tools/pack/resources/mac/notarize.cjs",
  // electron-builder hook path; CJS compatibility entry used by tools-pack desktop builds.
  "tools/pack/resources/web-standalone-after-pack.cjs",
]);

const residualAllowedPathPrefixes = [
  "apps/daemon/dist/",
  "apps/web/.next/",
  "apps/web/out/",
  "generated/",
  "e2e/playwright-report/",
  "e2e/reports/html/",
  "e2e/reports/playwright-html-report/",
  "e2e/reports/test-results/",
  "e2e/ui/.od-data/",
  "e2e/ui/reports/playwright-html-report/",
  "e2e/ui/reports/test-results/",
  "e2e/ui/test-results/",
  // Vendored upstream HyperFrames helper scripts (design template).
  "design-templates/hyperframes/scripts/",
  // Vendored upstream Last30Days runtime helper used by the engine (design template).
  "design-templates/last30days/scripts/lib/vendor/",
  // Vendored upstream html-ppt runtime assets (lewislulu/html-ppt-skill, design template).
  "design-templates/html-ppt/assets/",
  // Replay-based mock CLIs that impersonate the agent CLIs OD spawns
  // (opencode/claude/codex/gemini/cursor-agent + ACP family). Need to
  // be directly executable via Node so `child_process.spawn` from test
  // harnesses and PATH-overlay shells work without any transform step.
  // `mocks/scripts/` holds the maintainer-facing helpers (manifest math,
  // fetch from R2) which are also pure-node single-file modules — same
  // precedent as `apps/daemon/tests/fixtures/fake-vela.mjs` (an ACP
  // stdio stub, allowlisted individually above). See `mocks/README.md`.
  "mocks/lib/",
  "mocks/mock-agent.mjs",
  "mocks/scripts/",
  "test-results/",
  "vendor/",
];

const residualAllowedPathPatterns: RegExp[] = [
  // Vendored upstream Zara template runtimes — one design template per template,
  // name prefix `html-ppt-zhangzara-` (zarazhangrui/beautiful-html-templates).
  // Only the vendored deck-stage runtime asset is allowlisted; any other
  // JavaScript under these design-template directories must still be converted
  // to TypeScript or explicitly listed in `residualAllowedExactPaths`.
  /^design-templates\/html-ppt-zhangzara-[^/]+\/assets\/deck-stage\.js$/,
  // Bundled example/skill plugins copy the upstream skill's `assets/`
  // and `references/` directories verbatim so the daemon's preview
  // surface can render the baked HTML without staging detours. Those
  // assets are vendored runtime, never project-owned code, and must
  // not be retypecasted to TypeScript.
  /^plugins\/_official\/examples\/[^/]+\/(assets|references)\/.+$/,
];

function isResidualAllowedPath(repositoryPath: string): boolean {
  if (residualAllowedExactPaths.has(repositoryPath)) return true;
  if (residualAllowedPathPrefixes.some((prefix) => repositoryPath.startsWith(prefix))) return true;
  return residualAllowedPathPatterns.some((pattern) => pattern.test(repositoryPath));
}

function isResidualSkippedDirectoryName(directoryName: string): boolean {
  return (
    residualSkippedDirectories.has(directoryName) || directoryName === ".next" || directoryName.startsWith(".next-")
  );
}

async function collectResidualJavaScript(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const residualFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const repositoryPath = toRepositoryPath(fullPath);

    if (entry.isDirectory()) {
      if (isResidualSkippedDirectoryName(entry.name) || isResidualAllowedPath(`${repositoryPath}/`)) {
        continue;
      }

      residualFiles.push(...(await collectResidualJavaScript(fullPath)));
      continue;
    }

    if (!entry.isFile() || !residualExtensions.has(path.extname(entry.name))) {
      continue;
    }

    if (isResidualAllowedPath(repositoryPath)) {
      continue;
    }

    residualFiles.push(repositoryPath);
  }

  return residualFiles;
}

async function checkResidualJavaScript(): Promise<boolean> {
  const residualFiles = await collectResidualJavaScript(repoRoot);

  if (residualFiles.length > 0) {
    console.error("Residual project-owned JavaScript files found:");
    for (const filePath of residualFiles) {
      console.error(`- ${filePath}`);
    }
    console.error("Convert these files to TypeScript or add a documented generated/vendor/output allowlist entry.");
    return false;
  }

  console.log("Residual JavaScript check passed: project-owned code is TypeScript-only.");
  return true;
}

const sourcePackageManifestRootPaths = ["package.json", "e2e/package.json"];
const sourcePackageManifestScopedDirectories = ["apps", "packages", "tools"];
const packageDependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const packageManagerOverridePaths = ["pnpm.overrides", "overrides", "resolutions"];
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const exactNpmAliasPattern = /^npm:(?:@[^/]+\/)?[^@]+@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

type DependencySpecViolation = {
  filePath: string;
  fieldPath: string;
  name: string;
  spec: unknown;
  reason: string;
};

type DependencySpecStats = {
  exact: number;
  manifests: number;
  total: number;
  workspace: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedDependencySpec(spec: string): boolean {
  return spec === "workspace:*" || exactVersionPattern.test(spec) || exactNpmAliasPattern.test(spec);
}

function dependencySpecReason(spec: string): string {
  if (spec.startsWith("workspace:") && spec !== "workspace:*") {
    return "workspace dependencies must use exactly workspace:*";
  }

  return "dependency specs must be exact versions like 1.2.3 or workspace:*";
}

function dependencySpecFieldValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function collectScopedPackageManifestPaths(scopeDirectory: string): Promise<string[]> {
  const scopeRoot = path.join(repoRoot, scopeDirectory);
  const entries = await readdir(scopeRoot, { withFileTypes: true });
  const manifestPaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const packageDirectory = path.join(scopeRoot, entry.name);
    const packageEntries = await readdir(packageDirectory, { withFileTypes: true });
    if (packageEntries.some((packageEntry) => packageEntry.isFile() && packageEntry.name === "package.json")) {
      manifestPaths.push(`${scopeDirectory}/${entry.name}/package.json`);
    }
  }

  return manifestPaths;
}

async function collectSourcePackageManifestPaths(): Promise<string[]> {
  const scopedManifestPaths = (
    await Promise.all(sourcePackageManifestScopedDirectories.map((scope) => collectScopedPackageManifestPaths(scope)))
  ).flat();

  return [...sourcePackageManifestRootPaths, ...scopedManifestPaths].sort();
}

function getPackageJsonField(packageJson: Record<string, unknown>, fieldPath: string): unknown {
  let current: unknown = packageJson;
  for (const part of fieldPath.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function checkDependencySpecRecord(
  record: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
  violations: DependencySpecViolation[],
  stats: DependencySpecStats,
): void {
  for (const [name, spec] of Object.entries(record).sort(([left], [right]) => left.localeCompare(right))) {
    if (isRecord(spec)) {
      checkDependencySpecRecord(spec, filePath, `${fieldPath}.${name}`, violations, stats);
      continue;
    }

    stats.total += 1;
    if (typeof spec !== "string") {
      violations.push({
        filePath,
        fieldPath,
        name,
        spec,
        reason: "dependency specs must be strings",
      });
      continue;
    }

    if (spec === "workspace:*") {
      stats.workspace += 1;
      continue;
    }

    if (isAllowedDependencySpec(spec)) {
      stats.exact += 1;
      continue;
    }

    violations.push({
      filePath,
      fieldPath,
      name,
      spec,
      reason: dependencySpecReason(spec),
    });
  }
}

async function checkPackageDependencySpecs(): Promise<boolean> {
  const manifestPaths = await collectSourcePackageManifestPaths();
  const violations: DependencySpecViolation[] = [];
  const stats: DependencySpecStats = {
    exact: 0,
    manifests: manifestPaths.length,
    total: 0,
    workspace: 0,
  };

  for (const manifestPath of manifestPaths) {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, manifestPath), "utf8")) as Record<string, unknown>;

    for (const section of packageDependencySections) {
      const value = packageJson[section];
      if (value === undefined) continue;
      if (!isRecord(value)) {
        violations.push({
          filePath: manifestPath,
          fieldPath: section,
          name: section,
          spec: value,
          reason: "dependency sections must be objects",
        });
        continue;
      }

      checkDependencySpecRecord(value, manifestPath, section, violations, stats);
    }

    for (const overridePath of packageManagerOverridePaths) {
      const value = getPackageJsonField(packageJson, overridePath);
      if (value === undefined) continue;
      if (!isRecord(value)) {
        violations.push({
          filePath: manifestPath,
          fieldPath: overridePath,
          name: overridePath,
          spec: value,
          reason: "package-manager override sections must be objects",
        });
        continue;
      }

      checkDependencySpecRecord(value, manifestPath, overridePath, violations, stats);
    }
  }

  if (violations.length > 0) {
    console.error("Package dependency spec violations found:");
    for (const violation of violations) {
      console.error(
        `- ${violation.filePath} ${violation.fieldPath}.${violation.name}=${dependencySpecFieldValue(violation.spec)} -> ${violation.reason}`,
      );
    }
    return false;
  }

  console.log(
    `Package dependency spec check passed: ${stats.manifests} package.json files, ${stats.exact} exact specs, ${stats.workspace} workspace:* specs.`,
  );
  return true;
}

const testLayoutScopedDirectories = ["apps", "packages", "tools"];
const testLayoutSkippedDirectories = new Set([".next", ".od-data", "dist", "node_modules", "out", "reports", "test-results"]);

function isTestFile(fileName: string): boolean {
  return /\.test\.tsx?$/.test(fileName);
}

function expectedTestPath(repositoryPath: string): string {
  const [scope, project, ...relativeParts] = repositoryPath.split("/");
  if (!testLayoutScopedDirectories.includes(scope ?? "") || project == null || relativeParts.length === 0) {
    return repositoryPath;
  }

  const normalizedRelativeParts = relativeParts[0] === "src" ? relativeParts.slice(1) : relativeParts;
  return [scope, project, "tests", ...normalizedRelativeParts].join("/");
}

function isAllowedScopedTestPath(repositoryPath: string): boolean {
  const [scope, project, directory] = repositoryPath.split("/");
  return testLayoutScopedDirectories.includes(scope ?? "") && project != null && directory === "tests";
}

async function collectTestLayoutViolations(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const violations: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (testLayoutSkippedDirectories.has(entry.name)) {
        continue;
      }

      violations.push(...(await collectTestLayoutViolations(fullPath)));
      continue;
    }

    if (!entry.isFile() || !isTestFile(entry.name)) {
      continue;
    }

    const repositoryPath = toRepositoryPath(fullPath);
    if (!isAllowedScopedTestPath(repositoryPath)) {
      violations.push(repositoryPath);
    }
  }

  return violations;
}

async function checkTestLayout(): Promise<boolean> {
  const violations = (
    await Promise.all(
      testLayoutScopedDirectories.map((directory) => collectTestLayoutViolations(path.join(repoRoot, directory))),
    )
  ).flat();

  if (violations.length > 0) {
    console.error("Test files under apps/, packages/, and tools/ must live in tests/ sibling to src/:");
    for (const violation of violations) {
      console.error(`- ${violation} -> ${expectedTestPath(violation)}`);
    }
    return false;
  }

  console.log("Test layout check passed: apps/packages/tools tests live in sibling tests directories.");
  return true;
}

const e2ePackageJsonPath = path.join(repoRoot, "e2e", "package.json");
const e2eSkippedDirectories = new Set([".od-data", "node_modules", "reports", "test-results"]);
const e2eAllowedScripts = [
  "test",
  "test:p0",
  "test:p0p1",
  "test:p1",
  "test:p2",
  "test:ui",
  "test:ui:critical",
  "test:ui:extended",
  "test:ui:p0",
  "test:ui:p0p1",
  "test:ui:p1",
  "test:ui:p2",
  "typecheck",
];

async function collectRepositoryFiles(directory: string, skippedDirectoryNames = new Set<string>()): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirectoryNames.has(entry.name)) continue;
      files.push(...(await collectRepositoryFiles(fullPath, skippedDirectoryNames)));
      continue;
    }
    if (entry.isFile()) files.push(toRepositoryPath(fullPath));
  }

  return files;
}

const productNeutralitySkippedDirectories = new Set([
  ".git",
  ".od",
  ".tmp",
  "dist",
  "node_modules",
  "out",
  "test-results",
]);
// Public contracts, help/prompt strings, docs, and shipped content should
// describe the integration role, not name a private deployment. The default
// check blocks named "orchestrator such as ..." examples; private forks can
// add stricter local terms through OD_PRODUCT_NEUTRALITY_FORBIDDEN_TERMS.
const productNeutralityCheckedPathPrefixes = [
  "apps/daemon/src/",
  "apps/web/app/",
  "apps/web/src/",
  "craft/",
  "design-systems/",
  "design-templates/",
  "docs/",
  "packages/contracts/src/",
  "skills/",
];
const productNeutralityTextExtensions = new Set([".md", ".mdx", ".ts", ".tsx"]);
const productNeutralityDocFilePattern =
  /(?:^|\/)(?:AGENTS|CLAUDE|CONTRIBUTING(?:\.[^.]+)?|QUICKSTART|README(?:\.[^.]+)?)\.md$/;
const namedOrchestratorExamplePattern =
  /\borchestrator\s+(?:such as|like|for example,?)\s+[`"']?[A-Z][A-Za-z0-9_-]+/gi;

type ProductNeutralityViolation = {
  filePath: string;
  lineNumber: number;
  reason: string;
};

export function isProductNeutralityCheckedPath(repositoryPath: string): boolean {
  return (
    productNeutralityCheckedPathPrefixes.some((prefix) => repositoryPath.startsWith(prefix)) ||
    productNeutralityDocFilePattern.test(repositoryPath)
  );
}

function isProductNeutralityTextFile(repositoryPath: string): boolean {
  return productNeutralityTextExtensions.has(path.extname(repositoryPath));
}

function productNeutralityForbiddenTerms(): string[] {
  return String(process.env.OD_PRODUCT_NEUTRALITY_FORBIDDEN_TERMS ?? "")
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

export function collectProductNeutralityViolationsFromSource(
  repositoryPath: string,
  source: string,
  forbiddenTerms = productNeutralityForbiddenTerms(),
): ProductNeutralityViolation[] {
  if (!isProductNeutralityCheckedPath(repositoryPath) || !isProductNeutralityTextFile(repositoryPath)) {
    return [];
  }

  const lowerSource = source.toLowerCase();
  const violations: ProductNeutralityViolation[] = [];

  for (const match of source.matchAll(namedOrchestratorExamplePattern)) {
    violations.push({
      filePath: repositoryPath,
      lineNumber: lineNumberForIndex(source, match.index ?? 0),
      reason: "use generic \"external orchestrator\" phrasing instead of named orchestrator examples",
    });
  }

  for (const term of forbiddenTerms) {
    const lowerTerm = term.toLowerCase();
    let index = lowerSource.indexOf(lowerTerm);

    while (index !== -1) {
      violations.push({
        filePath: repositoryPath,
        lineNumber: lineNumberForIndex(source, index),
        reason: "use generic \"external orchestrator\" phrasing instead of private deployment names",
      });
      index = lowerSource.indexOf(lowerTerm, index + lowerTerm.length);
    }
  }

  return violations;
}

async function checkProductNeutrality(): Promise<boolean> {
  const violations: ProductNeutralityViolation[] = [];

  for (const repositoryPath of await collectRepositoryFiles(repoRoot, productNeutralitySkippedDirectories)) {
    if (!isProductNeutralityCheckedPath(repositoryPath) || !isProductNeutralityTextFile(repositoryPath)) {
      continue;
    }
    const source = await readFile(path.join(repoRoot, repositoryPath), "utf8");
    violations.push(...collectProductNeutralityViolationsFromSource(repositoryPath, source));
  }

  if (violations.length > 0) {
    console.error("Product-neutrality violations found:");
    for (const violation of violations) {
      console.error(`${violation.filePath}:${violation.lineNumber} -> ${violation.reason}`);
    }
    return false;
  }

  console.log("Product-neutrality check passed: public docs, contracts, and prompts use generic orchestrator naming.");
  return true;
}

async function checkE2eLayout(): Promise<boolean> {
  const violations: string[] = [];
  const packageJson = JSON.parse(await readFile(e2ePackageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };
  const scriptNames = Object.keys(packageJson.scripts ?? {}).sort();
  if (scriptNames.join("\0") !== e2eAllowedScripts.join("\0")) {
    violations.push(
      `e2e/package.json scripts must be exactly ${e2eAllowedScripts.join(", ")} (found: ${scriptNames.join(", ")})`,
    );
  }

  const e2eRoot = path.join(repoRoot, "e2e");
  for (const repositoryPath of await collectRepositoryFiles(e2eRoot, e2eSkippedDirectories)) {
    if (
      repositoryPath === "e2e/package.json" ||
      repositoryPath === "e2e/tsconfig.json" ||
      repositoryPath === "e2e/vitest.config.ts" ||
      repositoryPath === "e2e/playwright.config.ts" ||
      repositoryPath === "e2e/playwright.visual.config.ts" ||
      repositoryPath === "e2e/AGENTS.md"
    ) {
      continue;
    }

    if (repositoryPath.startsWith("e2e/specs/")) {
      if (!/\.spec\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e specs must be *.spec.ts`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/tests/")) {
      if (!/\.test\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e tests must be *.test.ts`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/ui/")) {
      const relativePath = repositoryPath.slice("e2e/ui/".length);
      if (relativePath.includes("/") || !/\.test\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e UI files must be flat Playwright *.test.ts files under ui/`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/resources/")) {
      const relativePath = repositoryPath.slice("e2e/resources/".length);
      if (relativePath.includes("/") || !/\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e resources must be flat TypeScript files under resources/`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/lib/")) {
      if (!/\.ts$/.test(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e lib files must be TypeScript`);
      }
      continue;
    }

    if (repositoryPath.startsWith("e2e/scripts/")) {
      if (!allowedE2eScripts.has(repositoryPath)) {
        violations.push(`${repositoryPath} -> e2e scripts must be an approved package-owned entrypoint`);
      }
      continue;
    }

    violations.push(`${repositoryPath} -> e2e source files must live in specs/, tests/, ui/, resources/, lib/, or approved scripts`);
  }

  if (violations.length > 0) {
    console.error("E2E package layout violations found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("E2E layout check passed: Vitest, Playwright UI, resources, lib, and scripts stay in their lanes.");
  return true;
}

const webTestSkippedDirectories = new Set([".od-data", "reports", "test-results"]);

async function checkWebTestLayout(): Promise<boolean> {
  const violations: string[] = [];
  const webTestsRoot = path.join(repoRoot, "apps", "web", "tests");

  for (const repositoryPath of await collectRepositoryFiles(webTestsRoot, webTestSkippedDirectories)) {
    if (repositoryPath.startsWith("apps/web/tests/vitest/") || repositoryPath.startsWith("apps/web/tests/playwright/")) {
      violations.push(`${repositoryPath} -> web tests should stay lightweight under apps/web/tests/ without vitest/playwright nesting`);
      continue;
    }

    if (/\.(spec|test)\.tsx?$/.test(repositoryPath) && !/\.test\.tsx?$/.test(repositoryPath)) {
      violations.push(`${repositoryPath} -> web Vitest test files must be *.test.ts or *.test.tsx`);
    }
  }

  if (violations.length > 0) {
    console.error("Web test layout violations found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Web test layout check passed: web tests stay lightweight and Vitest-only.");
  return true;
}

const toolsRootAllowlist = new Map<string, "directory" | "file">([
  // Keep top-level tools intentionally small. `tools/launcher` was an incoming
  // Windows shim experiment from PR #683 and is not an active repo boundary.
  ["AGENTS.md", "file"],
  ["dev", "directory"],
  ["pack", "directory"],
  ["serve", "directory"],
]);

async function checkToolsLayout(): Promise<boolean> {
  const toolsRoot = path.join(repoRoot, "tools");
  const entries = await readdir(toolsRoot, { withFileTypes: true });
  const seen = new Set<string>();
  const violations: string[] = [];

  for (const entry of entries) {
    const expected = toolsRootAllowlist.get(entry.name);
    const repositoryPath = `tools/${entry.name}${entry.isDirectory() ? "/" : ""}`;

    if (expected == null) {
      violations.push(`${repositoryPath} -> tools/ top-level entries are allowlisted; expected only AGENTS.md, dev/, pack/, and serve/`);
      continue;
    }

    seen.add(entry.name);
    if (expected === "directory" && !entry.isDirectory()) {
      violations.push(`${repositoryPath} -> expected tools/${entry.name}/ to be a directory`);
    }
    if (expected === "file" && !entry.isFile()) {
      violations.push(`${repositoryPath} -> expected tools/${entry.name} to be a file`);
    }
  }

  for (const [entryName, expected] of toolsRootAllowlist) {
    if (!seen.has(entryName)) {
      violations.push(`tools/${entryName}${expected === "directory" ? "/" : ""} -> required tools boundary is missing`);
    }
  }

  if (violations.length > 0) {
    console.error("Tools layout violations found:");
    for (const violation of violations) console.error(`- ${violation}`);
    return false;
  }

  console.log("Tools layout check passed: tools/ top-level entries match the active boundary allowlist.");
  return true;
}

const stylePolicySkippedDirectories = new Set([
  ".next",
  ".od-data",
  "dist",
  "node_modules",
  "out",
  "reports",
  "test-results",
]);

const stylePolicySourcePrefixes = ["apps/web/app/", "apps/web/src/"];
const stylePolicyHardcodedColorEnforcedPrefixes = ["scripts/guard-style-policy-fixtures/"];
const stylePolicyCheckedDirectoryPrefixes = [
  ...new Set([...stylePolicySourcePrefixes, ...stylePolicyHardcodedColorEnforcedPrefixes]),
];
const stylePolicyExtensions = new Set([".css", ".ts", ".tsx"]);
const tailwindDefaultColorNames = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "white",
  "black",
].join("|");
const tailwindDefaultPaletteClassPrefixes = [
  "bg",
  "text",
  "border(?:-(?:x|y|s|e|t|r|b|l))?",
  "divide",
  "placeholder",
  "marker",
  "from",
  "via",
  "to",
  "ring(?:-offset)?",
  "outline",
  "decoration",
  "(?:inset-|text-|drop-)?shadow",
  "accent",
  "caret",
  "fill",
  "stroke",
].join("|");
const defaultTailwindPaletteClassPattern = new RegExp(
  `\\b(?:${tailwindDefaultPaletteClassPrefixes})-(?:${tailwindDefaultColorNames})(?:-\\d{2,3})?\\b`,
  "g",
);

const hardcodedColorPattern = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)|(?<quote>['"])\\s*(?<named>${realNamedColors.join("|")}|transparent|currentColor|currentcolor|inherit|initial|unset|revert)\\s*\\k<quote>`,
  "g",
);

type StylePolicyAllowlistEntry = {
  pathPattern: RegExp;
  valuePattern: RegExp;
  reason: string;
};

const hardcodedColorAllowlist: StylePolicyAllowlistEntry[] = [
  {
    pathPattern: /^apps\/web\/src\/index\.css$/,
    valuePattern: /^(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))$/,
    reason: "global token definitions, shadows, overlays, and retained migration inventory live in the CSS source of truth",
  },
  {
    pathPattern: /^apps\/web\/src\/components\/(?:AgentIcon|PaletteTweaks|PetSettings|SettingsDialog)\.tsx$/,
    valuePattern: /^(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))$/,
    reason: "brand accents, user accent choices, and legacy token fallbacks are classified as Phase 1 migration inventory",
  },
  {
    pathPattern: /^apps\/web\/src\/components\/(?:SketchEditor|SketchPreview|NewProjectPanel)\.tsx$/,
    valuePattern: /^(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|['\"](?:none|currentColor|currentcolor|transparent)['\"])$/,
    reason: "sketch/canvas data and SVG illustrations keep narrow hardcoded color exceptions until their migration slice",
  },
  {
    pathPattern: /^apps\/web\/src\/components\/(?:FileViewer|ManualEditPanel)\.tsx$/,
    valuePattern: /^(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))$/,
    reason: "user-authored file, inspect, and editable style colors are handled by the file/viewer migration slice",
  },
  {
    pathPattern: /^apps\/web\/src\/components\/(?:MemorySection|MemoryModelInline|MemoryToast)\.tsx$/,
    valuePattern: /^(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))$/,
    reason: "memory UI legacy color fallbacks are classified as Phase 1 migration inventory",
  },
  {
    pathPattern: /^apps\/web\/tests\//,
    valuePattern: /.*/,
    reason: "tests and fixtures may assert rejected colors explicitly",
  },
];

type StylePolicyViolation = {
  filePath: string;
  lineNumber: number;
  match: string;
  reason: string;
};

function lineNumberForIndex(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function isStylePolicySource(repositoryPath: string): boolean {
  return stylePolicySourcePrefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

function isHardcodedColorEnforcedPath(repositoryPath: string): boolean {
  return stylePolicyHardcodedColorEnforcedPrefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

function isHardcodedColorAllowlisted(repositoryPath: string, match: string): boolean {
  const normalizedMatch = match.trim();
  const unquotedMatch = normalizedMatch.replace(/^['"]|['"]$/g, "");
  if (cssWideAndSpecialColorKeywords.has(unquotedMatch.toLowerCase())) return true;

  return hardcodedColorAllowlist.some(
    (entry) => entry.pathPattern.test(repositoryPath) && entry.valuePattern.test(normalizedMatch),
  );
}

function addStylePolicyViolation(
  violations: StylePolicyViolation[],
  repositoryPath: string,
  source: string,
  index: number,
  match: string,
  reason: string,
): void {
  violations.push({
    filePath: repositoryPath,
    lineNumber: lineNumberForIndex(source, index),
    match,
    reason,
  });
}

function collectStylePolicyViolationsFromSource(repositoryPath: string, source: string): StylePolicyViolation[] {
  const violations: StylePolicyViolation[] = [];

  if (isStylePolicySource(repositoryPath)) {
    for (const match of source.matchAll(defaultTailwindPaletteClassPattern)) {
      violations.push({
        filePath: repositoryPath,
        lineNumber: lineNumberForIndex(source, match.index ?? 0),
        match: match[0],
        reason: "default Tailwind palette classes must use Open Design token utilities instead",
      });
    }
  }

  if (isStylePolicySource(repositoryPath) || isHardcodedColorEnforcedPath(repositoryPath)) {
    if (repositoryPath.endsWith(".css") && isHardcodedColorEnforcedPath(repositoryPath)) {
      for (const match of collectCssHardcodedColorMatches(source)) {
        const value = match.value;
        if (value === undefined || isHardcodedColorAllowlisted(repositoryPath, value)) continue;

        addStylePolicyViolation(
          violations,
          repositoryPath,
          source,
          match.index,
          value,
          "unregistered hardcoded UI colors must use Open Design tokens or an explicit allowlist entry",
        );
      }
    } else {
      for (const match of source.matchAll(hardcodedColorPattern)) {
        const value = match[0];
        if (isHardcodedColorAllowlisted(repositoryPath, value)) continue;
        if (!isHardcodedColorEnforcedPath(repositoryPath)) continue;

        addStylePolicyViolation(
          violations,
          repositoryPath,
          source,
          match.index ?? 0,
          value,
          "unregistered hardcoded UI colors must use Open Design tokens or an explicit allowlist entry",
        );
      }
    }
  }

  return violations;
}

async function collectStylePolicyViolations(directory: string): Promise<StylePolicyViolation[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const violations: StylePolicyViolation[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (stylePolicySkippedDirectories.has(entry.name)) continue;
      violations.push(...(await collectStylePolicyViolations(fullPath)));
      continue;
    }

    if (!entry.isFile() || !stylePolicyExtensions.has(path.extname(entry.name))) continue;

    const repositoryPath = toRepositoryPath(fullPath);
    if (!isStylePolicySource(repositoryPath) && !isHardcodedColorEnforcedPath(repositoryPath)) continue;

    violations.push(...collectStylePolicyViolationsFromSource(repositoryPath, await readFile(fullPath, "utf8")));
  }

  return violations;
}

async function repositoryDirectoryExists(repositoryPath: string): Promise<boolean> {
  const parentPath = path.join(repoRoot, path.dirname(repositoryPath));
  const directoryName = path.basename(repositoryPath);
  const entries = await readdir(parentPath, { withFileTypes: true });

  return entries.some((entry) => entry.name === directoryName && entry.isDirectory());
}

async function collectStylePolicyViolationsFromCheckedPaths(): Promise<StylePolicyViolation[]> {
  const violations: StylePolicyViolation[] = [];

  for (const repositoryPrefix of stylePolicyCheckedDirectoryPrefixes) {
    const repositoryDirectory = repositoryPrefix.replace(/\/$/, "");
    if (!(await repositoryDirectoryExists(repositoryDirectory))) continue;

    violations.push(...(await collectStylePolicyViolations(path.join(repoRoot, repositoryDirectory))));
  }

  return violations;
}

async function checkStylePolicy(): Promise<boolean> {
  const violations = await collectStylePolicyViolationsFromCheckedPaths();

  if (violations.length > 0) {
    console.error("Style policy violations found:");
    for (const violation of violations) {
      console.error(`- ${violation.filePath}:${violation.lineNumber} \`${violation.match}\` -> ${violation.reason}`);
    }
    console.error("Use Open Design token utilities/CSS variables or add a narrow allowlist entry with a reason.");
    return false;
  }

  console.log("Style policy check passed: Tailwind palette classes and enforced hardcoded UI colors stay token-first.");
  return true;
}

const checks: GuardCheck[] = [
  { name: "residual JavaScript", run: checkResidualJavaScript },
  { name: "package dependency specs", run: checkPackageDependencySpecs },
  { name: "product neutrality", run: checkProductNeutrality },
  { name: "test layout", run: checkTestLayout },
  { name: "e2e layout", run: checkE2eLayout },
  { name: "web test layout", run: checkWebTestLayout },
  { name: "tools layout", run: checkToolsLayout },
  { name: "style policy", run: checkStylePolicy },
  { name: "design system manifests", run: checkDesignSystemManifests },
  { name: "design system package quality", run: checkDesignSystemPackageQuality },
  { name: "design system component fixture report", run: checkDesignSystemComponentFixtureReport },
  { name: "design system token-fixture sync", run: checkDesignSystemTokenFixtureSync },
  { name: "design system A1 required tokens", run: checkDesignSystemA1RequiredTokens },
  { name: "design system A2 required tokens", run: checkDesignSystemA2RequiredTokens },
  { name: "design system B-slot required tokens", run: checkDesignSystemBSlotRequiredTokens },
  { name: "design system unknown token allowlist", run: checkDesignSystemUnknownTokens },
  { name: "design system A2 defaults parity", run: checkDesignSystemA2DefaultsParity },
  { name: "design system flag parity", run: checkDesignSystemFlagParity },
  { name: "design system component manifest extraction", run: checkComponentsManifestExtraction },
];

async function runChecks(): Promise<boolean> {
  const results: boolean[] = [];
  for (const check of checks) {
    try {
      results.push(await check.run());
    } catch (error) {
      console.error(`Guard check failed unexpectedly: ${check.name}`);
      console.error(error);
      results.push(false);
    }
  }

  return results.every(Boolean);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain && !(await runChecks())) {
  process.exitCode = 1;
}
