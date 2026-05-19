import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import {
  containsElectronGuidanceReference,
  containsElectronPackageScriptReference,
  containsElectronTestReference,
} from "./tauri-migration-policy.ts";

const defaultRoot = resolve(import.meta.dirname, "..");
const electronDependencyNames = ["electron", "electron-builder", "@electron/rebuild"] as const;

const packageManifestPaths = [
  "apps/desktop/package.json",
  "apps/packaged/package.json",
  "tools/pack/package.json",
] as const;

const lockfileImporters = ["apps/desktop", "apps/packaged", "tools/pack"] as const;

const electronRuntimePaths = [
  "apps/desktop/src/main/index.ts",
  "apps/desktop/src/main/preload.cts",
  "apps/desktop/src/main/runtime.ts",
] as const;

const electronResourcePaths = ["tools/pack/resources/web-standalone-after-pack.cjs"] as const;

const electronTestDirectories = ["apps/desktop/tests", "apps/packaged/tests", "tools/pack/tests"] as const;

const guidanceReferencePaths = [
  "AGENTS.md",
  "apps/AGENTS.md",
  "tools/AGENTS.md",
  "tools/pack/AGENTS.md",
  "docs/code-review-guidelines.md",
  ".github/pull_request_template.md",
] as const;

type Args = {
  json: boolean;
  plan: boolean;
  root: string;
};

type InventoryEntry = {
  dependencies?: string[];
  packageName?: string;
  path: string;
};

type TauriMigrationInventory = {
  blockers: {
    electronDependencyManifests: number;
    electronGuidanceReferences: number;
    electronLockfileImporters: number;
    electronPackageScriptReferences: number;
    electronResourceFiles: number;
    electronRuntimeFiles: number;
    electronTestReferences: number;
  };
  guidanceReferences: string[];
  lockfileImporters: InventoryEntry[];
  packageManifests: InventoryEntry[];
  packageScriptReferences: string[];
  resourceFiles: string[];
  root: string;
  runtimeFiles: string[];
  testReferences: string[];
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inventory = await readTauriMigrationInventory(args.root);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
    return;
  }
  if (args.plan) {
    process.stdout.write(formatM6CleanupPlan(inventory));
    return;
  }
  process.stdout.write(formatInventory(inventory));
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { json: false, plan: false, root: defaultRoot };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--plan") {
      parsed.plan = true;
      continue;
    }
    if (arg === "--root") {
      if (value == null) throw new Error("--root requires a path");
      parsed.root = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write("usage: tsx scripts/tauri-migration-inventory.ts [--root <repo>] [--json] [--plan]\n");
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function readTauriMigrationInventory(root: string): Promise<TauriMigrationInventory> {
  const [
    packageManifests,
    packageScriptReferences,
    lockfileImportersWithDeps,
    runtimeFiles,
    resourceFiles,
    testReferences,
    guidanceReferences,
  ] = await Promise.all([
      readPackageManifestInventory(root),
      readPackageScriptReferenceInventory(root),
      readLockfileInventory(root),
      existingRepositoryPaths(root, electronRuntimePaths),
      existingRepositoryPaths(root, electronResourcePaths),
      collectElectronTestReferenceFiles(root),
      collectElectronGuidanceReferenceFiles(root),
    ]);

  return {
    blockers: {
      electronDependencyManifests: packageManifests.length,
      electronGuidanceReferences: guidanceReferences.length,
      electronLockfileImporters: lockfileImportersWithDeps.length,
      electronPackageScriptReferences: packageScriptReferences.length,
      electronResourceFiles: resourceFiles.length,
      electronRuntimeFiles: runtimeFiles.length,
      electronTestReferences: testReferences.length,
    },
    guidanceReferences,
    lockfileImporters: lockfileImportersWithDeps,
    packageManifests,
    packageScriptReferences,
    resourceFiles,
    root,
    runtimeFiles,
    testReferences,
  };
}

async function readPackageManifestInventory(root: string): Promise<InventoryEntry[]> {
  const entries = await Promise.all(
    packageManifestPaths.map(async (repositoryPath) => {
      const source = await readFile(join(root, repositoryPath), "utf8");
      const packageName = readPackageName(source);
      const dependencies = [...readPackageDependencyNames(source)].filter((dependencyName) =>
        electronDependencyNames.includes(dependencyName as (typeof electronDependencyNames)[number]),
      );
      return { dependencies, ...(packageName == null ? {} : { packageName }), path: repositoryPath };
    }),
  );
  return entries.filter((entry) => entry.dependencies.length > 0);
}

async function readPackageScriptReferenceInventory(root: string): Promise<string[]> {
  const entries = await Promise.all(
    packageManifestPaths.map(async (repositoryPath) => {
      const source = await readFile(join(root, repositoryPath), "utf8");
      return collectElectronPackageScriptReferences(repositoryPath, source);
    }),
  );
  return entries.flat().sort();
}

function collectElectronPackageScriptReferences(repositoryPath: string, source: string): string[] {
  const parsed = JSON.parse(source) as { scripts?: Record<string, unknown> };
  return Object.entries(parsed.scripts ?? {})
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && containsElectronPackageScriptReference(entry[0], entry[1]),
    )
    .map(([scriptName]) => `${repositoryPath}:scripts.${scriptName}`);
}

async function readLockfileInventory(root: string): Promise<InventoryEntry[]> {
  const pnpmLock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  return lockfileImporters
    .map((importer) => {
      const dependencies = [...readPnpmImporterDependencyNames(pnpmLock, importer)].filter((dependencyName) =>
        electronDependencyNames.includes(dependencyName as (typeof electronDependencyNames)[number]),
      );
      return { dependencies, path: importer };
    })
    .filter((entry) => entry.dependencies.length > 0);
}

async function existingRepositoryPaths(root: string, repositoryPaths: readonly string[]): Promise<string[]> {
  const states = await Promise.all(repositoryPaths.map((repositoryPath) => pathExists(join(root, repositoryPath))));
  return repositoryPaths.filter((_, index) => states[index]);
}

async function collectElectronTestReferenceFiles(root: string): Promise<string[]> {
  const testFiles = (
    await Promise.all(
      electronTestDirectories.map((directory) => collectFilesWithExtensions(join(root, directory), new Set([".ts", ".tsx"]))),
    )
  ).flat();
  return filterFilesByReference(root, testFiles, containsElectronTestReference);
}

async function collectElectronGuidanceReferenceFiles(root: string): Promise<string[]> {
  const files = guidanceReferencePaths.map((repositoryPath) => join(root, repositoryPath));
  return filterFilesByReference(root, files, containsElectronGuidanceReference);
}

async function filterFilesByReference(
  root: string,
  files: string[],
  predicate: (source: string) => boolean,
): Promise<string[]> {
  const sources = await Promise.all(
    files.map(async (filePath) => ({
      path: toRepositoryPath(root, filePath),
      source: await readFile(filePath, "utf8"),
    })),
  );
  return sources
    .filter(({ source }) => predicate(source))
    .map(({ path }) => path)
    .sort();
}

async function collectFilesWithExtensions(directory: string, extensions: ReadonlySet<string>): Promise<string[]> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesWithExtensions(fullPath, extensions)));
      continue;
    }
    if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function readPackageDependencyNames(source: string): Set<string> {
  const parsed = JSON.parse(source) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  return new Set([
    ...Object.keys(parsed.dependencies ?? {}),
    ...Object.keys(parsed.devDependencies ?? {}),
    ...Object.keys(parsed.optionalDependencies ?? {}),
  ]);
}

function readPackageName(source: string): string | undefined {
  const parsed = JSON.parse(source) as { name?: unknown };
  return typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : undefined;
}

function readPnpmImporterDependencyNames(source: string, importer: string): Set<string> {
  const lines = source.split(/\r?\n/);
  const importerHeader = `  ${importer}:`;
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toRepositoryPath(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join("/");
}

function formatInventory(inventory: TauriMigrationInventory): string {
  const lines = [
    "Tauri migration Electron inventory",
    `Root: ${inventory.root}`,
    `Blockers: manifests=${inventory.blockers.electronDependencyManifests}, packageScripts=${inventory.blockers.electronPackageScriptReferences}, lockfileImporters=${inventory.blockers.electronLockfileImporters}, runtimeFiles=${inventory.blockers.electronRuntimeFiles}, resourceFiles=${inventory.blockers.electronResourceFiles}, testRefs=${inventory.blockers.electronTestReferences}, guidanceRefs=${inventory.blockers.electronGuidanceReferences}`,
    "Package manifest dependencies:",
    ...formatDependencyEntries(inventory.packageManifests),
    "Package script references:",
    ...formatPaths(inventory.packageScriptReferences),
    "Lockfile importer dependencies:",
    ...formatDependencyEntries(inventory.lockfileImporters),
    "Runtime files:",
    ...formatPaths(inventory.runtimeFiles),
    "Resource files:",
    ...formatPaths(inventory.resourceFiles),
    "Test references:",
    ...formatPaths(inventory.testReferences),
    "Guidance references:",
    ...formatPaths(inventory.guidanceReferences),
    "",
  ];
  return lines.join("\n");
}

function formatM6CleanupPlan(inventory: TauriMigrationInventory): string {
  const lines = [
    "Tauri migration M6 cleanup plan",
    `Root: ${inventory.root}`,
    "",
    "Preconditions:",
    "  - M4 native Windows/Linux evidence is recorded by scripts/verify-tauri-platform-gates.ts --update-migration-doc.",
    "  - M5 default flip is complete and Electron remains only as an explicit fallback.",
    "  - Run pnpm guard before starting cleanup so failures are attributable to the cleanup diff.",
    "",
    "1. Remove Electron package dependencies:",
    ...formatDependencyRemovalCommands(inventory.packageManifests),
    "  - Remove any remaining Electron-only package scripts:",
    ...formatPaths(inventory.packageScriptReferences),
    "  - pnpm install",
    "",
    "2. Remove or replace Electron runtime entry files:",
    ...formatPaths(inventory.runtimeFiles),
    "",
    "3. Remove Electron-only tools-pack resources:",
    ...formatPaths(inventory.resourceFiles),
    "",
    "4. Delete or rewrite Electron-only tests:",
    ...formatPaths(inventory.testReferences),
    "",
    "5. Update Electron-specific guidance references:",
    ...formatPaths(inventory.guidanceReferences),
    "",
    "6. Finalize runtime constants and migration checklist:",
    "  - Remove electron from DESKTOP_RUNTIME_KINDS in tools/dev/src/config.ts and tools/pack/src/config.ts.",
    "  - Mark the five M6 checklist items in docs/electron-to-tauri-migration.md together.",
    "",
    "7. Required verification after cleanup:",
    "  - pnpm install",
    "  - pnpm guard",
    "  - pnpm typecheck",
    "  - pnpm --filter @open-design/web test",
    "  - pnpm --filter @open-design/desktop test",
    "  - pnpm --filter @open-design/packaged test",
    "  - pnpm --filter @open-design/tools-dev test",
    "  - pnpm --filter @open-design/tools-pack test",
    "  - cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml",
    "  - cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings",
    "  - cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml",
    "",
  ];
  return lines.join("\n");
}

function formatDependencyRemovalCommands(entries: InventoryEntry[]): string[] {
  if (entries.length === 0) {
    return ["  - none"];
  }
  return entries.map((entry) => {
    const filter = entry.packageName ?? `./${entry.path.replace(/\/package\.json$/, "")}`;
    return `  - pnpm --filter ${filter} remove ${entry.dependencies?.join(" ") ?? ""}`;
  });
}

function formatDependencyEntries(entries: InventoryEntry[]): string[] {
  if (entries.length === 0) {
    return ["  - none"];
  }
  return entries.map((entry) => `  - ${entry.path}: ${entry.dependencies?.join(", ") ?? "none"}`);
}

function formatPaths(paths: string[]): string[] {
  if (paths.length === 0) {
    return ["  - none"];
  }
  return paths.map((repositoryPath) => `  - ${repositoryPath}`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
