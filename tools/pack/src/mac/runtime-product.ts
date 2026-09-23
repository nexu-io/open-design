import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { createTarArchive, downloadCopyAndClear, extractArchive, listArchive } from "@open-design/download";

import type { ToolPackConfig } from "../config/index.js";
import { prepareNodePtyRuntime, resolveNodePtyRuntimeArch } from "../node-pty-runtime.js";
import {
  collectWorkspaceTarballs,
  copyMacPrebundleRuntimeDependencies,
  resolveMacPrebundleResolverTarballs,
  runMacElectronRebuild,
  writeMacAssembledPackageJson,
} from "./app.js";
import { runNpmInstall } from "./commands.js";
import { resolveMacPaths } from "./paths.js";

export const MAC_RUNTIME_PRODUCT_SCHEMA = 2;

export type MacRuntimeProductManifest = {
  arch: NodeJS.Architecture;
  electronVersion: string;
  platform: "darwin";
  protocol: "open-design-mac-runtime-v2";
  schemaVersion: typeof MAC_RUNTIME_PRODUCT_SCHEMA;
};

export function macRuntimeProductManifest(config: ToolPackConfig): MacRuntimeProductManifest {
  return {
    arch: process.arch,
    electronVersion: config.electronVersion,
    platform: "darwin",
    protocol: "open-design-mac-runtime-v2",
    schemaVersion: MAC_RUNTIME_PRODUCT_SCHEMA,
  };
}

export async function validateMacRuntimeProductRoot(
  config: ToolPackConfig,
  rootPath: string,
): Promise<MacRuntimeProductManifest> {
  const root = resolve(rootPath);
  for (const file of ["manifest.json", "app-package.json"]) {
    if (!(await lstat(join(root, file)).catch(() => null))?.isFile()) {
      throw new Error(`mac runtime product is missing regular ${file}`);
    }
  }
  if (!(await lstat(join(root, "node_modules")).catch(() => null))?.isDirectory()) {
    throw new Error("mac runtime product is missing node_modules");
  }
  const packageManifest = JSON.parse(await readFile(join(root, "app-package.json"), "utf8")) as Record<string, unknown>;
  if (packageManifest.name !== "open-design-packaged-app" || typeof packageManifest.dependencies !== "object") {
    throw new Error("mac runtime product has an invalid package manifest");
  }
  return assertManifest(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")), config);
}

async function assertMaterializedTree(root: string): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const metadata = await lstat(path);
    if (metadata.isDirectory()) await assertMaterializedTree(path);
    else if (!metadata.isFile()) throw new Error(`mac runtime product contains a link or special file: ${path}`);
  }
}

async function normalizeInstalledDependencies(packagePath: string, nodeModulesRoot: string): Promise<void> {
  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as Record<string, unknown>;
  for (const field of ["dependencies", "optionalDependencies"] as const) {
    const dependencies = manifest[field];
    if (dependencies == null || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const [name, value] of Object.entries(dependencies as Record<string, unknown>)) {
      if (typeof value !== "string" || !value.startsWith("file:")) continue;
      const installed = JSON.parse(await readFile(join(nodeModulesRoot, name, "package.json"), "utf8")) as { version?: unknown };
      if (typeof installed.version !== "string" || installed.version.length === 0) {
        throw new Error(`mac runtime dependency has no installed version: ${name}`);
      }
      (dependencies as Record<string, unknown>)[name] = installed.version;
    }
  }
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function assertManifest(value: unknown, config: ToolPackConfig): MacRuntimeProductManifest {
  const manifest = value as Partial<MacRuntimeProductManifest>;
  if (
    manifest.schemaVersion !== MAC_RUNTIME_PRODUCT_SCHEMA
    || manifest.protocol !== "open-design-mac-runtime-v2"
    || manifest.platform !== "darwin"
    || manifest.arch !== process.arch
    || manifest.electronVersion !== config.electronVersion
  ) {
    throw new Error(
      `incompatible mac runtime product: expected darwin/${process.arch}/electron-${config.electronVersion}`,
    );
  }
  return manifest as MacRuntimeProductManifest;
}

export async function exportMacRuntimeProduct(config: ToolPackConfig, outputPath: string): Promise<{
  archive: string;
  bytes: number;
  manifest: MacRuntimeProductManifest;
  timings: { durationMs: number; phase: string }[];
}> {
  if (process.platform !== "darwin") throw new Error("mac runtime products must be built on macOS");
  const output = resolve(outputPath);
  if ((await stat(output).catch(() => null)) != null) throw new Error(`mac runtime product output already exists: ${output}`);
  const paths = resolveMacPaths(config);
  const timings: { durationMs: number; phase: string }[] = [];
  const runPhase = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    process.stderr.write(`[tools-pack mac runtime] phase:start phase=${phase}\n`);
    try {
      return await task();
    } finally {
      const durationMs = Date.now() - startedAt;
      timings.push({ durationMs, phase });
      process.stderr.write(`[tools-pack mac runtime] phase:done phase=${phase} durationMs=${durationMs}\n`);
    }
  };
  const assembledRoot = dirname(paths.assembledAppRoot);
  await rm(assembledRoot, { force: true, recursive: true });
  await mkdir(paths.assembledAppRoot, { recursive: true });
  const tarballs = await runPhase("workspace-tarballs", async () => collectWorkspaceTarballs(config, paths));
  await runPhase("package-manifest", async () => writeMacAssembledPackageJson(config, paths, tarballs));
  const resolverTarballs = resolveMacPrebundleResolverTarballs(paths, tarballs);
  await runPhase("npm-install", async () => runNpmInstall(paths.assembledAppRoot, resolverTarballs));
  await runPhase("copied-dependencies", async () => copyMacPrebundleRuntimeDependencies(config, paths.assembledAppRoot));
  await runPhase("node-pty", async () => prepareNodePtyRuntime({
    appRoot: paths.assembledAppRoot,
    arch: resolveNodePtyRuntimeArch(process.arch),
    platform: "darwin",
  }));
  await runPhase("electron-rebuild", async () => runMacElectronRebuild(config, paths.assembledAppRoot));
  await normalizeInstalledDependencies(
    paths.assembledPackageJsonPath,
    join(paths.assembledAppRoot, "node_modules"),
  );
  await rm(join(paths.assembledAppRoot, "node_modules", ".bin"), { force: true, recursive: true });
  await assertMaterializedTree(join(paths.assembledAppRoot, "node_modules"));

  const temporary = await mkdtemp(join(tmpdir(), "open-design-mac-runtime-"));
  const stage = join(temporary, "product");
  const manifest = macRuntimeProductManifest(config);
  try {
    await mkdir(stage, { recursive: true });
    await rename(join(paths.assembledAppRoot, "node_modules"), join(stage, "node_modules"));
    await rename(join(paths.assembledAppRoot, "package.json"), join(stage, "app-package.json"));
    await writeFile(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await mkdir(dirname(output), { recursive: true });
    await runPhase("archive", async () => createTarArchive(
      output,
      [{ directory: stage, entries: ["app-package.json", "manifest.json", "node_modules"] }],
      { dereference: false, reproducible: true },
    ));
    return { archive: output, bytes: (await stat(output)).size, manifest, timings };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

async function restoreArchive(config: ToolPackConfig, archive: string, outputPath: string): Promise<MacRuntimeProductManifest> {
  const output = resolve(outputPath);
  if ((await stat(output).catch(() => null)) != null) throw new Error(`mac runtime product output already exists: ${output}`);
  const entries = listArchive(archive, "tar.gz");
  for (const entry of entries) {
    const path = entry.replace(/\/$/, "");
    if (path.split("/").includes("..") || path.includes("\\")
      || (path !== "app-package.json" && path !== "manifest.json" && path !== "node_modules" && !path.startsWith("node_modules/"))) {
      throw new Error("mac runtime product archive escapes its declared outputs");
    }
  }
  const stage = await mkdtemp(join(tmpdir(), "open-design-mac-runtime-restore-"));
  try {
    extractArchive(archive, stage, "tar.gz");
    const manifest = await validateMacRuntimeProductRoot(config, stage);
    await assertMaterializedTree(join(stage, "node_modules"));
    await mkdir(dirname(output), { recursive: true });
    await rename(stage, output);
    return manifest;
  } catch (error) {
    await rm(stage, { force: true, recursive: true });
    throw error;
  }
}

export async function restoreMacRuntimeProduct(config: ToolPackConfig, options: {
  archive?: string;
  output: string;
  sha256?: string;
  url?: string;
}): Promise<{ bytes: number; manifest: MacRuntimeProductManifest; output: string }> {
  if (options.archive != null) {
    const archive = resolve(options.archive);
    const manifest = await restoreArchive(config, archive, options.output);
    return { bytes: (await stat(archive)).size, manifest, output: resolve(options.output) };
  }
  if (options.url == null || options.sha256 == null) throw new Error("remote mac runtime restore requires --url and --sha256");
  const url = new URL(options.url);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^[a-f0-9]{64}$/.test(options.sha256)) {
    throw new Error("invalid mac runtime product source");
  }
  const temporary = await mkdtemp(join(tmpdir(), "open-design-mac-runtime-download-"));
  try {
    const productZip = join(temporary, "product.zip");
    const signal = AbortSignal.timeout(120_000);
    const download = await downloadCopyAndClear({
      basePath: join(temporary, "download"),
      bucket: "mac-runtime",
      fetch: globalThis.fetch,
      fileName: "product.zip",
      maxAttempts: 2,
      onProgress: ({ receivedBytes }) => {
        if (receivedBytes > 1024 ** 3) throw new Error("mac runtime product exceeds 1 GiB");
      },
      outputPath: productZip,
      payload: { checksum: { algorithm: "sha256", value: options.sha256 }, url: options.url },
      signal,
    });
    const members = listArchive(productZip, "zip");
    if (members.length !== 1 || members[0] !== "workspace.tar.gz") throw new Error("unexpected mac runtime product wrapper");
    extractArchive(productZip, temporary, "zip", members);
    const manifest = await restoreArchive(config, join(temporary, "workspace.tar.gz"), options.output);
    return { bytes: download.bytes, manifest, output: resolve(options.output) };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}
