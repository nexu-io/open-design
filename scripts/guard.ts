import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

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
  "packages/contracts/esbuild.config.mjs",
  "packages/platform/esbuild.config.mjs",
  "packages/sidecar/esbuild.config.mjs",
  "packages/sidecar-proto/esbuild.config.mjs",
  // Maintainer utility scripts ported from the media branch. They are
  // executed directly by Node and are not loaded by the app runtime.
  "scripts/import-prompt-templates.mjs",
  "scripts/postinstall.mjs",
  "apps/packaged/esbuild.config.mjs",
  // Browser service workers must be served as JavaScript files.
  "apps/web/public/od-notifications-sw.js",
  "scripts/bake-html-ppt-examples.mjs",
  "scripts/scaffold-html-ppt-skills.mjs",
  "scripts/sync-hyperframes-skill.mjs",
  "scripts/verify-media-models.mjs",
  "tools/dev/bin/tools-dev.mjs",
  "tools/dev/esbuild.config.mjs",
  "tools/pack/bin/tools-pack.mjs",
  "tools/pack/esbuild.config.mjs",
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
  // Vendored upstream HyperFrames skill helper scripts.
  "skills/hyperframes/scripts/",
  // Vendored upstream html-ppt skill runtime assets (lewislulu/html-ppt-skill).
  "skills/html-ppt/assets/",
  "test-results/",
  "vendor/",
];

function isResidualAllowedPath(repositoryPath: string): boolean {
  if (residualAllowedExactPaths.has(repositoryPath)) return true;
  return residualAllowedPathPrefixes.some((prefix) => repositoryPath.startsWith(prefix));
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
const e2eAllowedScripts = ["test", "typecheck"];

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
      if (repositoryPath !== "e2e/scripts/playwright.ts") {
        violations.push(`${repositoryPath} -> e2e scripts currently allow only scripts/playwright.ts`);
      }
      continue;
    }

    violations.push(`${repositoryPath} -> e2e source files must live in specs/, tests/, ui/, resources/, lib/, or scripts/playwright.ts`);
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

const checks: GuardCheck[] = [
  { name: "residual JavaScript", run: checkResidualJavaScript },
  { name: "test layout", run: checkTestLayout },
  { name: "e2e layout", run: checkE2eLayout },
  { name: "web test layout", run: checkWebTestLayout },
];

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

if (results.some((passed) => !passed)) {
  process.exitCode = 1;
}
