import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import { containsElectronGuidanceReference, containsElectronTestReference } from "./tauri-migration-policy.ts";

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
  root: string;
};

type InventoryEntry = {
  dependencies?: string[];
  path: string;
};

type TauriMigrationInventory = {
  blockers: {
    electronDependencyManifests: number;
    electronGuidanceReferences: number;
    electronLockfileImporters: number;
    electronResourceFiles: number;
    electronRuntimeFiles: number;
    electronTestReferences: number;
  };
  guidanceReferences: string[];
  lockfileImporters: InventoryEntry[];
  packageManifests: InventoryEntry[];
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
  process.stdout.write(formatInventory(inventory));
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { json: false, root: defaultRoot };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--root") {
      if (value == null) throw new Error("--root requires a path");
      parsed.root = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write("usage: tsx scripts/tauri-migration-inventory.ts [--root <repo>] [--json]\n");
      process.exit(0);
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

async function readTauriMigrationInventory(root: string): Promise<TauriMigrationInventory> {
  const [packageManifests, lockfileImportersWithDeps, runtimeFiles, resourceFiles, testReferences, guidanceReferences] =
    await Promise.all([
      readPackageManifestInventory(root),
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
      electronResourceFiles: resourceFiles.length,
      electronRuntimeFiles: runtimeFiles.length,
      electronTestReferences: testReferences.length,
    },
    guidanceReferences,
    lockfileImporters: lockfileImportersWithDeps,
    packageManifests,
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
      const dependencies = [...readPackageDependencyNames(source)].filter((dependencyName) =>
        electronDependencyNames.includes(dependencyName as (typeof electronDependencyNames)[number]),
      );
      return { dependencies, path: repositoryPath };
    }),
  );
  return entries.filter((entry) => entry.dependencies.length > 0);
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
    `Blockers: manifests=${inventory.blockers.electronDependencyManifests}, lockfileImporters=${inventory.blockers.electronLockfileImporters}, runtimeFiles=${inventory.blockers.electronRuntimeFiles}, resourceFiles=${inventory.blockers.electronResourceFiles}, testRefs=${inventory.blockers.electronTestReferences}, guidanceRefs=${inventory.blockers.electronGuidanceReferences}`,
    "Package manifest dependencies:",
    ...formatDependencyEntries(inventory.packageManifests),
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
