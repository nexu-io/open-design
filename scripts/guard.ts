import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { checkDesignSystemFlagParity } from "./check-design-system-flag-parity.ts";
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
const migrationDocPath = path.join(repoRoot, "docs", "electron-to-tauri-migration.md");
const pnpmLockPath = path.join(repoRoot, "pnpm-lock.yaml");
const readmePath = path.join(repoRoot, "README.md");
const appsAgentsPath = path.join(repoRoot, "apps", "AGENTS.md");
const architectureDocPath = path.join(repoRoot, "docs", "architecture.md");
const guidanceReferenceFiles = [
  path.join(repoRoot, "AGENTS.md"),
  appsAgentsPath,
  path.join(repoRoot, "tools", "AGENTS.md"),
  path.join(repoRoot, "tools", "pack", "AGENTS.md"),
  path.join(repoRoot, "docs", "code-review-guidelines.md"),
  path.join(repoRoot, ".github", "pull_request_template.md"),
] as const;
const toolsDevConfigPath = path.join(repoRoot, "tools", "dev", "src", "config.ts");
const toolsPackConfigPath = path.join(repoRoot, "tools", "pack", "src", "config.ts");
const releaseBetaWorkflowPath = path.join(repoRoot, ".github", "workflows", "release-beta.yml");
const desktopPackageJsonPath = path.join(repoRoot, "apps", "desktop", "package.json");
const packagedPackageJsonPath = path.join(repoRoot, "apps", "packaged", "package.json");
const toolsPackPackageJsonPath = path.join(repoRoot, "tools", "pack", "package.json");
const electronRuntimeFiles = [
  path.join(repoRoot, "apps", "desktop", "src", "main", "index.ts"),
  path.join(repoRoot, "apps", "desktop", "src", "main", "preload.cts"),
  path.join(repoRoot, "apps", "desktop", "src", "main", "runtime.ts"),
] as const;
const electronPackResourceFiles = [
  path.join(repoRoot, "tools", "pack", "resources", "web-standalone-after-pack.cjs"),
] as const;
const electronTestDirectories = [
  path.join(repoRoot, "apps", "desktop", "tests"),
  path.join(repoRoot, "apps", "packaged", "tests"),
  path.join(repoRoot, "tools", "pack", "tests"),
] as const;

const m4PlatformGateLabels = [
  "Windows NSIS: build, install, start, inspect status/eval/screenshot, stop.",
  "Linux: build AppImage, install, start, inspect status/eval/screenshot, stop.",
  "Linux headless platform smoke remains supported and unaffected.",
] as const;
const m4EvidenceLogMarker =
  "Verified native Windows/Linux M4 package smoke with `scripts/verify-tauri-platform-gates.ts --update-migration-doc`.";
const m5ToolsDevDefaultLabel = "Change `tools-dev` default desktop runtime to Tauri.";
const m5ToolsPackDefaultLabel = "Change `tools-pack` default desktop runtime to Tauri.";
const m5ReleaseBetaDefaultLabel = "Change `release-beta` desktop runtime workflow default to Tauri.";
const m5ElectronFallbackLabel = "Keep Electron fallback explicit during the transition window.";
const m5PrimaryDocsLabel = "Update README, architecture docs, and directory guidance to describe Tauri as the primary runtime.";
const m6ElectronDepsLabel = "Remove `electron`, `electron-builder`, `@electron/rebuild`, and Electron-only package scripts.";
const m6ElectronRuntimeLabel = "Remove Electron preload/runtime code after Tauri bridge and packaging parity are complete.";
const m6ElectronResourcesLabel = "Remove Electron-only resources/hooks from `tools-pack`.";
const m6ElectronTestsLabel = "Delete or rewrite Electron-only tests.";
const m6ElectronGuidanceLabel = "Update AGENTS guidance and PR checklist references from Electron to Tauri.";

const allowedE2eScripts = new Set([
  "e2e/scripts/playwright.ts",
  "e2e/scripts/release-smoke.ts",
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
  // PostCSS loads Tailwind through a web-local .mjs compatibility config entry.
  "apps/web/postcss.config.mjs",
  "scripts/bake-html-ppt-examples.mjs",
  "scripts/scaffold-html-ppt-skills.mjs",
  "scripts/sync-hyperframes-skill.mjs",
  "scripts/verify-media-models.mjs",
  "tools/dev/bin/tools-dev.mjs",
  "tools/dev/esbuild.config.mjs",
  "tools/pack/bin/tools-pack.mjs",
  "tools/pack/esbuild.config.mjs",
  "tools/pr/bin/tools-pr.mjs",
  "tools/pr/esbuild.config.mjs",
  "tools/pack/resources/mac/notarize.cjs",
  // electron-builder hook path; CJS compatibility entry used by tools-pack desktop builds.
  "tools/pack/resources/web-standalone-after-pack.cjs",
]);

const residualAllowedPathPrefixes = [
  "apps/daemon/dist/",
  // Rust/Tauri build output generated by `cargo` and `tauri build`.
  "apps/desktop/src-tauri/target/",
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
  "test:ui:critical",
  "test:ui:extended",
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
  ["pr", "directory"],
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
      violations.push(`${repositoryPath} -> tools/ top-level entries are allowlisted; expected only AGENTS.md, dev/, pack/, and pr/`);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isChecklistLineChecked(content: string, label: string): boolean {
  const checked = new RegExp(`^- \\[x\\] ${escapeRegExp(label)}$`, "m");
  const unchecked = new RegExp(`^- \\[ \\] ${escapeRegExp(label)}$`, "m");
  if (checked.test(content)) return true;
  if (unchecked.test(content)) return false;
  throw new Error(`missing migration checklist line: ${label}`);
}

function readDefaultDesktopRuntime(source: string, label: string): "electron" | "tauri" {
  const match = source.match(/export const DEFAULT_DESKTOP_RUNTIME = "([^"]+)"/);
  const runtime = match?.[1];
  if (runtime === "electron" || runtime === "tauri") return runtime;
  throw new Error(`${label} must export DEFAULT_DESKTOP_RUNTIME as "electron" or "tauri"`);
}

function leadingWhitespaceLength(line: string): number {
  return line.match(/^(\s*)/)?.[1]?.length ?? 0;
}

function readReleaseBetaDesktopRuntimeDefault(source: string): "electron" | "tauri" {
  const lines = source.split(/\r?\n/);
  const desktopRuntimeIndex = lines.findIndex((line) => /^\s+desktop_runtime:\s*$/.test(line));
  if (desktopRuntimeIndex < 0) {
    throw new Error('release-beta workflow must define a "desktop_runtime" input');
  }

  const desktopRuntimeIndent = leadingWhitespaceLength(lines[desktopRuntimeIndex] ?? "");
  for (const line of lines.slice(desktopRuntimeIndex + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const indent = leadingWhitespaceLength(line);
    if (indent <= desktopRuntimeIndent) {
      break;
    }

    const match = line.match(/^\s+default:\s*(electron|tauri)\s*$/);
    if (match?.[1] === "electron" || match?.[1] === "tauri") {
      return match[1];
    }
  }

  throw new Error('release-beta desktop_runtime input must default to "electron" or "tauri"');
}

function sourceAllowsElectronFallback(source: string): boolean {
  return /DESKTOP_RUNTIME_KINDS = \["electron", "tauri"\] as const/.test(source);
}

function containsElectronDefaultTransitionText(source: string): boolean {
  return (
    /Electron (?:remains|is) the (?:current )?default/i.test(source) ||
    /Public downloads are still Electron artifacts/i.test(source)
  );
}

function containsElectronTestReference(source: string): boolean {
  return /\b[Ee]lectron\b|@electron\/|electron-builder|electronuserland/.test(source);
}

function containsElectronGuidanceReference(source: string): boolean {
  return /\b[Ee]lectron\b|electron-builder|electronuserland/.test(source);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFilesWithExtensions(directory: string, extensions: ReadonlySet<string>): Promise<string[]> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesWithExtensions(fullPath, extensions)));
      continue;
    }
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectElectronTestReferenceFiles(): Promise<string[]> {
  const testFiles = (
    await Promise.all(
      electronTestDirectories.map((directory) => collectFilesWithExtensions(directory, new Set([".ts", ".tsx"]))),
    )
  ).flat();
  const fileSources = await Promise.all(
    testFiles.map(async (filePath) => ({
      filePath,
      source: await readFile(filePath, "utf8"),
    })),
  );
  return fileSources
    .filter(({ source }) => containsElectronTestReference(source))
    .map(({ filePath }) => filePath)
    .sort();
}

async function collectElectronGuidanceReferenceFiles(): Promise<string[]> {
  const fileSources = await Promise.all(
    guidanceReferenceFiles.map(async (filePath) => ({
      filePath,
      source: await readFile(filePath, "utf8"),
    })),
  );
  return fileSources
    .filter(({ source }) => containsElectronGuidanceReference(source))
    .map(({ filePath }) => filePath)
    .sort();
}

function readPackageDependencyNames(source: string, label: string): Set<string> {
  let parsed: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  try {
    parsed = JSON.parse(source) as typeof parsed;
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return new Set([
    ...Object.keys(parsed.dependencies ?? {}),
    ...Object.keys(parsed.devDependencies ?? {}),
    ...Object.keys(parsed.optionalDependencies ?? {}),
  ]);
}

function readPnpmImporterDependencyNames(source: string, importer: string): Set<string> {
  const lines = source.split(/\r?\n/);
  const importerHeader = importer === "." ? "  .:" : `  ${importer}:`;
  const startIndex = lines.indexOf(importerHeader);
  if (startIndex < 0) {
    throw new Error(`pnpm-lock.yaml must include importer ${importer}`);
  }

  const dependencyNames = new Set<string>();
  for (const line of lines.slice(startIndex + 1)) {
    if (/^  [^ ].*:$/.test(line)) {
      break;
    }

    const match = line.match(/^      ('?[@/A-Za-z0-9._-]+'?):\s*$/);
    if (match?.[1] != null) {
      dependencyNames.add(match[1].replace(/^'|'$/g, ""));
    }
  }
  return dependencyNames;
}

async function checkTauriMigrationOrder(): Promise<boolean> {
  const [
    migrationDoc,
    pnpmLock,
    readme,
    appsAgents,
    architectureDoc,
    toolsDevConfig,
    toolsPackConfig,
    releaseBetaWorkflow,
    desktopPackageJson,
    packagedPackageJson,
    toolsPackPackageJson,
    electronRuntimeFileExists,
    electronPackResourceFileExists,
    electronTestReferenceFiles,
    electronGuidanceReferenceFiles,
  ] = await Promise.all([
    readFile(migrationDocPath, "utf8"),
    readFile(pnpmLockPath, "utf8"),
    readFile(readmePath, "utf8"),
    readFile(appsAgentsPath, "utf8"),
    readFile(architectureDocPath, "utf8"),
    readFile(toolsDevConfigPath, "utf8"),
    readFile(toolsPackConfigPath, "utf8"),
    readFile(releaseBetaWorkflowPath, "utf8"),
    readFile(desktopPackageJsonPath, "utf8"),
    readFile(packagedPackageJsonPath, "utf8"),
    readFile(toolsPackPackageJsonPath, "utf8"),
    Promise.all(electronRuntimeFiles.map((filePath) => pathExists(filePath))),
    Promise.all(electronPackResourceFiles.map((filePath) => pathExists(filePath))),
    collectElectronTestReferenceFiles(),
    collectElectronGuidanceReferenceFiles(),
  ]);
  const toolsDevDefault = readDefaultDesktopRuntime(toolsDevConfig, "tools-dev");
  const toolsPackDefault = readDefaultDesktopRuntime(toolsPackConfig, "tools-pack");
  const releaseBetaDefault = readReleaseBetaDesktopRuntimeDefault(releaseBetaWorkflow);
  const packageDependencyNames = new Set([
    ...readPackageDependencyNames(desktopPackageJson, "apps/desktop/package.json"),
    ...readPackageDependencyNames(packagedPackageJson, "apps/packaged/package.json"),
    ...readPackageDependencyNames(toolsPackPackageJson, "tools/pack/package.json"),
  ]);
  const lockfileDependencyNames = new Set([
    ...readPnpmImporterDependencyNames(pnpmLock, "apps/desktop"),
    ...readPnpmImporterDependencyNames(pnpmLock, "apps/packaged"),
    ...readPnpmImporterDependencyNames(pnpmLock, "tools/pack"),
  ]);
  const m4PlatformGateStates = m4PlatformGateLabels.map((label) => isChecklistLineChecked(migrationDoc, label));
  const m4Complete = m4PlatformGateStates.every(Boolean);
  const m4PartiallyComplete = m4PlatformGateStates.some(Boolean) && !m4Complete;
  const m4EvidenceLogMarked = migrationDoc.includes(m4EvidenceLogMarker);
  const toolsDevDefaultFlipped = isChecklistLineChecked(migrationDoc, m5ToolsDevDefaultLabel);
  const toolsPackDefaultFlipped = isChecklistLineChecked(migrationDoc, m5ToolsPackDefaultLabel);
  const releaseBetaDefaultFlipped = isChecklistLineChecked(migrationDoc, m5ReleaseBetaDefaultLabel);
  const fallbackMarked = isChecklistLineChecked(migrationDoc, m5ElectronFallbackLabel);
  const primaryDocsMarked = isChecklistLineChecked(migrationDoc, m5PrimaryDocsLabel);
  const electronDepsRemoved = isChecklistLineChecked(migrationDoc, m6ElectronDepsLabel);
  const electronRuntimeRemoved = isChecklistLineChecked(migrationDoc, m6ElectronRuntimeLabel);
  const electronResourcesRemoved = isChecklistLineChecked(migrationDoc, m6ElectronResourcesLabel);
  const electronTestsRemoved = isChecklistLineChecked(migrationDoc, m6ElectronTestsLabel);
  const electronGuidanceUpdated = isChecklistLineChecked(migrationDoc, m6ElectronGuidanceLabel);
  const m6CleanupStates = [
    electronDepsRemoved,
    electronRuntimeRemoved,
    electronResourcesRemoved,
    electronTestsRemoved,
    electronGuidanceUpdated,
  ];
  const anyM6CleanupMarked = m6CleanupStates.some(Boolean);
  const m6CleanupComplete = m6CleanupStates.every(Boolean);
  const toolsAllowElectronFallback =
    sourceAllowsElectronFallback(toolsDevConfig) && sourceAllowsElectronFallback(toolsPackConfig);

  const violations: string[] = [];
  if (m4PartiallyComplete) {
    violations.push(
      "M4 Windows/Linux platform gate checkboxes must move together through the verified --update-migration-doc path.",
    );
  }
  if (m4Complete && !m4EvidenceLogMarked) {
    violations.push(
      "M4 platform gates are checked, but the migration doc is missing the verifier-applied native evidence log marker.",
    );
  }
  if (!m4Complete && (toolsDevDefault === "tauri" || toolsPackDefault === "tauri" || releaseBetaDefault === "tauri")) {
    violations.push("desktop runtime defaults cannot flip to Tauri before all M4 Windows/Linux platform gates are checked.");
  }
  if ((toolsDevDefault === "tauri") !== toolsDevDefaultFlipped) {
    violations.push("tools-dev DEFAULT_DESKTOP_RUNTIME and the M5 tools-dev checklist line must be updated together.");
  }
  if ((toolsPackDefault === "tauri") !== toolsPackDefaultFlipped) {
    violations.push("tools-pack DEFAULT_DESKTOP_RUNTIME and the M5 tools-pack checklist line must be updated together.");
  }
  if ((releaseBetaDefault === "tauri") !== releaseBetaDefaultFlipped) {
    violations.push("release-beta desktop_runtime default and the M5 release-beta checklist line must be updated together.");
  }
  const bothDefaultsTauri = toolsDevDefault === "tauri" && toolsPackDefault === "tauri";
  if (toolsDevDefault !== toolsPackDefault) {
    violations.push("tools-dev and tools-pack DEFAULT_DESKTOP_RUNTIME must move together during the M5 default flip.");
  }
  if ((releaseBetaDefault === "tauri") !== bothDefaultsTauri) {
    violations.push("release-beta desktop_runtime default must move with the tools-dev/tools-pack Tauri default flip.");
  }
  if (bothDefaultsTauri !== fallbackMarked) {
    violations.push("the M5 Electron fallback checklist line must reflect the post-flip runtime state.");
  }
  if (primaryDocsMarked !== bothDefaultsTauri) {
    violations.push("the M5 Tauri-primary documentation checklist line must move with the default runtime flip.");
  }
  if (anyM6CleanupMarked && !bothDefaultsTauri) {
    violations.push("M6 Electron cleanup cannot be checked before the M5 Tauri default flip is complete.");
  }
  if (
    primaryDocsMarked &&
    [readme, appsAgents, architectureDoc].some((source) => containsElectronDefaultTransitionText(source))
  ) {
    violations.push("Tauri-primary docs are checked, but README/app/architecture docs still describe Electron as the default.");
  }
  if (fallbackMarked && !m6CleanupComplete && !toolsAllowElectronFallback) {
    violations.push("Electron fallback is checked, but a tool no longer accepts both electron and tauri runtime values.");
  }
  if (m6CleanupComplete && toolsAllowElectronFallback) {
    violations.push("M6 Electron cleanup is complete, but tools-dev/tools-pack still accept the electron desktop runtime.");
  }
  const electronDependencyNames = ["electron", "electron-builder", "@electron/rebuild"];
  const electronDependenciesPresent = electronDependencyNames.filter((dependencyName) =>
    packageDependencyNames.has(dependencyName),
  );
  const electronLockfileDependenciesPresent = electronDependencyNames.filter((dependencyName) =>
    lockfileDependencyNames.has(dependencyName),
  );
  if (electronDepsRemoved && electronDependenciesPresent.length > 0) {
    violations.push(
      `the M6 Electron dependency cleanup is checked, but package manifests still include: ${electronDependenciesPresent.join(", ")}.`,
    );
  }
  if (!electronDepsRemoved && electronDependenciesPresent.length === 0) {
    violations.push("Electron dependencies were removed, but the M6 dependency cleanup checklist line is not checked.");
  }
  if (electronDepsRemoved && electronLockfileDependenciesPresent.length > 0) {
    violations.push(
      `the M6 Electron dependency cleanup is checked, but pnpm-lock.yaml importers still include: ${electronLockfileDependenciesPresent.join(", ")}.`,
    );
  }
  if (!electronDepsRemoved && electronLockfileDependenciesPresent.length === 0) {
    violations.push("Electron dependencies were removed from pnpm-lock.yaml importers, but the M6 dependency cleanup checklist line is not checked.");
  }
  const remainingElectronRuntimeFiles = electronRuntimeFiles.filter((_, index) => electronRuntimeFileExists[index]);
  if (electronRuntimeRemoved && remainingElectronRuntimeFiles.length > 0) {
    violations.push(
      `the M6 Electron runtime cleanup is checked, but these files still exist: ${remainingElectronRuntimeFiles
        .map(toRepositoryPath)
        .join(", ")}.`,
    );
  }
  if (!electronRuntimeRemoved && remainingElectronRuntimeFiles.length === 0) {
    violations.push("Electron runtime files were removed, but the M6 runtime cleanup checklist line is not checked.");
  }
  const remainingElectronResourceFiles = electronPackResourceFiles.filter(
    (_, index) => electronPackResourceFileExists[index],
  );
  if (electronResourcesRemoved && remainingElectronResourceFiles.length > 0) {
    violations.push(
      `the M6 Electron resources cleanup is checked, but these files still exist: ${remainingElectronResourceFiles
        .map(toRepositoryPath)
        .join(", ")}.`,
    );
  }
  if (!electronResourcesRemoved && remainingElectronResourceFiles.length === 0) {
    violations.push("Electron-only tools-pack resources were removed, but the M6 resources cleanup checklist line is not checked.");
  }
  if (electronTestsRemoved && electronTestReferenceFiles.length > 0) {
    violations.push(
      `the M6 Electron test cleanup is checked, but these tests still reference Electron: ${electronTestReferenceFiles
        .map(toRepositoryPath)
        .join(", ")}.`,
    );
  }
  if (!electronTestsRemoved && electronTestReferenceFiles.length === 0) {
    violations.push("Electron-only tests no longer reference Electron, but the M6 test cleanup checklist line is not checked.");
  }
  if (electronGuidanceUpdated && electronGuidanceReferenceFiles.length > 0) {
    violations.push(
      `the M6 AGENTS/PR guidance cleanup is checked, but these guidance files still reference Electron: ${electronGuidanceReferenceFiles
        .map(toRepositoryPath)
        .join(", ")}.`,
    );
  }
  if (!electronGuidanceUpdated && electronGuidanceReferenceFiles.length === 0) {
    violations.push("AGENTS/PR guidance no longer references Electron, but the M6 guidance cleanup checklist line is not checked.");
  }

  if (violations.length > 0) {
    console.error("Electron to Tauri migration order violations found:");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    return false;
  }

  console.log("Tauri migration order check passed: M5 defaults remain gated by M4 platform evidence.");
  return true;
}

const checks: GuardCheck[] = [
  { name: "residual JavaScript", run: checkResidualJavaScript },
  { name: "test layout", run: checkTestLayout },
  { name: "e2e layout", run: checkE2eLayout },
  { name: "web test layout", run: checkWebTestLayout },
  { name: "tools layout", run: checkToolsLayout },
  { name: "Tauri migration order", run: checkTauriMigrationOrder },
  { name: "style policy", run: checkStylePolicy },
  { name: "design system token-fixture sync", run: checkDesignSystemTokenFixtureSync },
  { name: "design system A1 required tokens", run: checkDesignSystemA1RequiredTokens },
  { name: "design system A2 required tokens", run: checkDesignSystemA2RequiredTokens },
  { name: "design system B-slot required tokens", run: checkDesignSystemBSlotRequiredTokens },
  { name: "design system unknown token allowlist", run: checkDesignSystemUnknownTokens },
  { name: "design system A2 defaults parity", run: checkDesignSystemA2DefaultsParity },
  { name: "design system flag parity", run: checkDesignSystemFlagParity },
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
