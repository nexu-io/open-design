import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { createTarArchive } from "@open-design/download";

import { execFileAsync } from "../mac/commands.js";
import { WORKSPACE_ROOT } from "../workspace-root.js";

export const RELEASE_EXECUTOR_PRODUCT_SCHEMA = 1;

export type ReleaseExecutorProductManifest = {
  arch: NodeJS.Architecture;
  entries: {
    pack: "pack/dist/index.mjs";
    release: "release/dist/index.mjs";
  };
  platform: NodeJS.Platform;
  protocol: "open-design-release-executor-v1";
  schemaVersion: typeof RELEASE_EXECUTOR_PRODUCT_SCHEMA;
};

export type ReleaseExecutorExportOptions = {
  arch?: NodeJS.Architecture;
  output: string;
  platform?: NodeJS.Platform;
  copyRelease?: (destination: string) => Promise<void>;
  runDeploy?: (packageName: string, destination: string, includeOptional: boolean) => Promise<void>;
};

async function removeCommandLinks(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory() && entry.name === ".bin") {
      await rm(path, { force: true, recursive: true });
    } else if (entry.isDirectory()) {
      await removeCommandLinks(path);
    }
  }
}

async function pruneForeignPlatformBinaries(root: string): Promise<void> {
  const modules = join(root, "node_modules");
  const appBuilder = join(modules, "app-builder-bin");
  const sevenZip = join(modules, "7zip-bin");
  const platformDirectory = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
  for (const directory of ["linux", "mac", "win"]) {
    if (directory !== platformDirectory) {
      await rm(join(appBuilder, directory), { force: true, recursive: true });
      await rm(join(sevenZip, directory), { force: true, recursive: true });
    }
  }
  if (process.platform === "darwin") {
    const appBuilderBinary = process.arch === "arm64" ? "app-builder_arm64" : "app-builder_amd64";
    for (const entry of await readdir(join(appBuilder, "mac")).catch(() => [])) {
      if (entry !== appBuilderBinary) await rm(join(appBuilder, "mac", entry), { force: true, recursive: true });
    }
    const sevenZipBinary = process.arch === "arm64" ? "arm64" : "x64";
    for (const entry of await readdir(join(sevenZip, "mac")).catch(() => [])) {
      if (entry !== sevenZipBinary) await rm(join(sevenZip, "mac", entry), { force: true, recursive: true });
    }
  }
}

async function assertPortableTree(root: string, boundary = root): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      const canonical = await realpath(path);
      const fromBoundary = relative(await realpath(boundary), canonical);
      if (fromBoundary === ".." || fromBoundary.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromBoundary)) {
        throw new Error(`release executor link escapes its root: ${path}`);
      }
      continue;
    }
    if (metadata.isDirectory()) await assertPortableTree(path, boundary);
    else if (!metadata.isFile()) throw new Error(`release executor contains a special file: ${path}`);
  }
}

export function pnpmInvocation(
  platform: NodeJS.Platform = process.platform,
  npmExecPath: string | undefined = process.env.npm_execpath,
): { args: string[]; command: string } {
  if (platform !== "win32") return { args: [], command: "pnpm" };
  if (npmExecPath == null || npmExecPath.length === 0) {
    throw new Error("release executor export on Windows requires npm_execpath");
  }
  return { args: [npmExecPath], command: process.execPath };
}

async function defaultDeploy(packageName: string, destination: string, includeOptional: boolean): Promise<void> {
  const pnpm = pnpmInvocation();
  await execFileAsync(pnpm.command, [
    ...pnpm.args,
    "--filter",
    packageName,
    "--prod",
    ...(includeOptional ? [] : ["--no-optional"]),
    "deploy",
    "--legacy",
    "--prefer-offline",
    "--ignore-scripts",
    "--config.node-linker=hoisted",
    destination,
  ]);
  const electronRoot = join(destination, "node_modules", "electron");
  const electronBinary = process.platform === "darwin"
    ? join(electronRoot, "dist", "Electron.app", "Contents", "MacOS", "Electron")
    : process.platform === "win32"
      ? join(electronRoot, "dist", "electron.exe")
      : join(electronRoot, "dist", "electron");
  if (!(await stat(electronBinary).catch(() => null))?.isFile()) {
    await execFileAsync(process.execPath, [join(electronRoot, "install.js")], { cwd: electronRoot, env: process.env });
  }
  for (const entry of [
    electronBinary,
    join(destination, "node_modules", "esbuild", "bin", "esbuild"),
    join(destination, "node_modules", "pnpm", "bin", "pnpm.cjs"),
  ]) {
    if (!(await stat(entry).catch(() => null))?.isFile()) {
      throw new Error(`release executor dependency is missing: ${entry}`);
    }
  }
}

async function defaultCopyRelease(destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  await cp(join(WORKSPACE_ROOT, "tools/release/dist"), join(destination, "dist"), { recursive: true });
  await cp(join(WORKSPACE_ROOT, "tools/release/resources"), join(destination, "resources"), { recursive: true });
}

export function releaseExecutorManifest(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): ReleaseExecutorProductManifest {
  return {
    arch,
    entries: {
      pack: "pack/dist/index.mjs",
      release: "release/dist/index.mjs",
    },
    platform,
    protocol: "open-design-release-executor-v1",
    schemaVersion: RELEASE_EXECUTOR_PRODUCT_SCHEMA,
  };
}

export async function exportReleaseExecutorProduct(options: ReleaseExecutorExportOptions): Promise<{
  archive: string;
  bytes: number;
  manifest: ReleaseExecutorProductManifest;
}> {
  const output = resolve(options.output);
  const manifest = releaseExecutorManifest(options.platform, options.arch);
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error(`release executor target ${manifest.platform}/${manifest.arch} differs from host ${process.platform}/${process.arch}`);
  }
  if ((await stat(output).catch(() => null)) != null) throw new Error(`release executor output already exists: ${output}`);

  await mkdir(dirname(output), { recursive: true });
  // Keep pnpm deploy on the output drive. Hosted Windows runners check out on
  // D: while exposing TEMP on C:, and legacy deploy misresolves cross-drive
  // destinations beneath the workspace root.
  const temporary = await realpath(await mkdtemp(join(dirname(output), ".release-executor-")));
  const stage = join(temporary, "executor");
  const runDeploy = options.runDeploy ?? defaultDeploy;
  const copyRelease = options.copyRelease ?? defaultCopyRelease;
  try {
    await mkdir(stage, { recursive: true });
    await runDeploy("@open-design/tools-pack", join(stage, "pack"), true);
    await copyRelease(join(stage, "release"));
    await removeCommandLinks(stage);
    await pruneForeignPlatformBinaries(join(stage, "pack"));
    await assertPortableTree(stage);
    for (const entry of Object.values(manifest.entries)) {
      if (!(await stat(join(stage, entry)).catch(() => null))?.isFile()) {
        throw new Error(`release executor entry is missing: ${entry}`);
      }
    }
    await writeFile(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    createTarArchive(output, [{ directory: stage, entries: ["manifest.json", "pack", "release"] }], {
      dereference: false,
      reproducible: true,
    });
    return { archive: output, bytes: (await stat(output)).size, manifest };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

export async function readReleaseExecutorManifest(path: string): Promise<ReleaseExecutorProductManifest> {
  const value = JSON.parse(await readFile(path, "utf8")) as Partial<ReleaseExecutorProductManifest>;
  if (
    value.schemaVersion !== RELEASE_EXECUTOR_PRODUCT_SCHEMA
    || value.protocol !== "open-design-release-executor-v1"
    || typeof value.platform !== "string"
    || typeof value.arch !== "string"
    || value.entries?.pack !== "pack/dist/index.mjs"
    || value.entries?.release !== "release/dist/index.mjs"
  ) {
    throw new Error("invalid release executor manifest");
  }
  return value as ReleaseExecutorProductManifest;
}
