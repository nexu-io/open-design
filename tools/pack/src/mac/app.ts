import { finalizeRuntimeManifest } from "../resources/runtime-manifest.js";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";

import { rebuild, type RebuildOptions } from "@electron/rebuild";
import { createTarArchive, extractArchive } from "@open-design/download";

import type { ToolPackConfig } from "../config/index.js";
import {
  MAC_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER,
  MAC_PREBUNDLE_COPIED_RUNTIME_DEPENDENCIES,
  MAC_PREBUNDLE_ESBUILD_TARGET,
  MAC_PREBUNDLE_POLICIES,
  MAC_PREBUNDLE_RUNTIME_DEPENDENCIES,
  MAC_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH,
  MAC_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH,
  MAC_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH,
  MAC_STANDALONE_PREBUNDLE_RESOLVER_PACKAGES,
  assertMacPrebundleMetafile,
  renderMacPackagedMainEntry,
  shouldInstallInternalPackageForMacPrebundle,
  shouldUseMacStandalonePrebundle,
} from "./prebundle.js";
import {
  prepareNodePtyRuntime,
  resolveNodePtyRuntimeArch,
} from "../node-pty-runtime.js";
import { copyBundledResourceTrees, packBundledDshRuntime } from "../resources/index.js";
import { copyOptionalVelaCliBinary } from "../vela-cli.js";
import { electronBuilderVersionForAppVersion } from "../versioning/index.js";
import { execFileAsync, runEsbuild, runNpmInstall, runNpmPrune } from "./commands.js";
import {
  ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
  ELECTRON_REBUILD_MODE,
  ELECTRON_REBUILD_NATIVE_MODULES,
  INTERNAL_PACKAGES,
} from "./constants.js";
import { resolveMacInstallIdentity } from "./identity.js";
import { readPackagedVersion } from "./manifest.js";
import type { MacPaths, PackedTarballInfo } from "./types.js";

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export async function toRelativeImportSpecifier(fromDirectory: string, targetPath: string): Promise<string> {
  const [canonicalFrom, canonicalTarget] = await Promise.all([
    realpath(fromDirectory),
    realpath(targetPath),
  ]);
  const specifier = toPosixPath(relative(canonicalFrom, canonicalTarget));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

async function buildPrebundledStandaloneRuntime(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<void> {
  const resolverNodeModules = join(config.roots.output.namespaceRoot, "prebundle-resolver", "node_modules");
  await rm(dirname(resolverNodeModules), { force: true, recursive: true });
  await mkdir(join(resolverNodeModules, "@open-design"), { recursive: true });
  for (const packageInfo of INTERNAL_PACKAGES) {
    await symlink(
      join(config.workspaceRoot, packageInfo.directory),
      join(resolverNodeModules, "@open-design", packageInfo.name.slice("@open-design/".length)),
      "dir",
    );
  }
  const resolverEnvironment = {
    NODE_PATH: [resolverNodeModules, join(paths.assembledAppRoot, "node_modules")].join(delimiter),
  };
  await mkdir(paths.assembledPrebundledRoot, { recursive: true });
  await mkdir(dirname(paths.packagedMainPrebundleMetaPath), { recursive: true });
  await runEsbuild(config, [
    join(config.workspaceRoot, "apps", "packaged", "dist", "index.mjs"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--target=${MAC_PREBUNDLE_ESBUILD_TARGET}`,
    ...MAC_PREBUNDLE_POLICIES.packagedMain.externals.map((dependency) => `--external:${dependency}`),
    `--outfile=${paths.packagedMainPrebundlePath}`,
    `--metafile=${paths.packagedMainPrebundleMetaPath}`,
  ], resolverEnvironment);
  await assertMacPrebundleMetafile({
    metafilePath: paths.packagedMainPrebundleMetaPath,
    policyName: "packagedMain",
  });
  await runEsbuild(config, [
    join(config.workspaceRoot, "apps", "web", "dist", "sidecar", "index.js"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--target=${MAC_PREBUNDLE_ESBUILD_TARGET}`,
    ...MAC_PREBUNDLE_POLICIES.webSidecar.externals.map((dependency) => `--external:${dependency}`),
    `--outfile=${paths.webSidecarPrebundlePath}`,
    `--metafile=${paths.webSidecarPrebundleMetaPath}`,
  ], resolverEnvironment);
  await assertMacPrebundleMetafile({
    metafilePath: paths.webSidecarPrebundleMetaPath,
    policyName: "webSidecar",
  });

  await mkdir(dirname(paths.daemonSidecarPrebundleEntrypointPath), { recursive: true });
  await writeFile(
    paths.daemonSidecarPrebundleEntrypointPath,
    `import ${JSON.stringify(
      await toRelativeImportSpecifier(
        dirname(paths.daemonSidecarPrebundleEntrypointPath),
        join(config.workspaceRoot, "apps", "daemon", "dist", "sidecar", "index.js"),
      ),
    )};\n`,
    "utf8",
  );
  await writeFile(
    paths.daemonCliPrebundleEntrypointPath,
    [
      'import { fileURLToPath } from "node:url";',
      "const selfPath = fileURLToPath(import.meta.url);",
      "process.env.OD_BIN ??= selfPath;",
      "process.env.OD_DAEMON_CLI_PATH ??= selfPath;",
      `await import(${JSON.stringify(
        await toRelativeImportSpecifier(
          dirname(paths.daemonCliPrebundleEntrypointPath),
          join(config.workspaceRoot, "apps", "daemon", "dist", "cli.js"),
        ),
      )});`,
      "",
    ].join("\n"),
    "utf8",
  );
  await runEsbuild(config, [
    paths.daemonSidecarPrebundleEntrypointPath,
    paths.daemonCliPrebundleEntrypointPath,
    "--bundle",
    "--splitting",
    "--platform=node",
    "--format=esm",
    `--target=${MAC_PREBUNDLE_ESBUILD_TARGET}`,
    `--banner:js=${MAC_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER}`,
    ...MAC_PREBUNDLE_POLICIES.daemonSidecar.externals.map((dependency) => `--external:${dependency}`),
    `--outdir=${paths.daemonPrebundleRoot}`,
    "--entry-names=[name]",
    "--chunk-names=chunks/[name]-[hash]",
    "--out-extension:.js=.mjs",
    `--metafile=${paths.daemonPrebundleMetaPath}`,
  ], resolverEnvironment);
  await assertMacPrebundleMetafile({
    metafilePath: paths.daemonPrebundleMetaPath,
    policyName: "daemonSidecar",
  });
  await assertMacPrebundleMetafile({
    metafilePath: paths.daemonPrebundleMetaPath,
    policyName: "daemonCli",
  });
}

export async function copyResourceTree(config: ToolPackConfig, paths: MacPaths): Promise<void> {
  await rm(paths.resourceRoot, { force: true, recursive: true });
  await mkdir(paths.resourceRoot, { recursive: true });

  await copyBundledResourceTrees({
    workspaceRoot: config.workspaceRoot,
    resourceRoot: paths.resourceRoot,
  });
  await packBundledDshRuntime({
    workspaceRoot: config.workspaceRoot,
    resourceRoot: paths.resourceRoot,
  });
  await copyOptionalVelaCliBinary({
    platform: "mac",
    requireBundled: config.requireVelaCli,
    resourceRoot: paths.resourceRoot,
  });
}

export function renderMacPackagedConfig(options: {
  appVersion: string;
  config: ToolPackConfig;
  usePrebundledStandaloneWeb: boolean;
}): string {
  return `${JSON.stringify(
    {
      ...(options.config.amrProfile == null ? {} : { amrProfile: options.config.amrProfile }),
      appVersion: options.appVersion,
      ...(options.usePrebundledStandaloneWeb ? { daemonCliEntryRelative: MAC_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH } : {}),
      ...(options.usePrebundledStandaloneWeb
        ? { daemonSidecarEntryRelative: MAC_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH }
        : {}),
      namespace: options.config.namespace,
      ...(options.config.telemetryRelayUrl == null ? {} : { telemetryRelayUrl: options.config.telemetryRelayUrl }),
      ...(options.config.updateMetadataUrl == null ? {} : { updateMetadataUrl: options.config.updateMetadataUrl }),
      ...(options.config.posthogKey == null ? {} : { posthogKey: options.config.posthogKey }),
      ...(options.config.posthogHost == null ? {} : { posthogHost: options.config.posthogHost }),
      ...(options.config.velaWebUrl == null ? {} : { velaWebUrl: options.config.velaWebUrl }),
      ...(options.config.velaWebUrls == null ? {} : { velaWebUrls: options.config.velaWebUrls }),
      ...(options.usePrebundledStandaloneWeb ? { webSidecarEntryRelative: MAC_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH } : {}),
      webOutputMode: options.config.webOutputMode,
      ...(options.config.portable ? {} : { namespaceBaseRoot: options.config.roots.runtime.namespaceBaseRoot }),
    },
    null,
    2,
  )}\n`;
}

export async function copyMacPrebundleRuntimeDependencies(
  config: ToolPackConfig,
  appRoot: string,
): Promise<void> {
  const daemonRequire = createRequire(join(config.workspaceRoot, "apps", "daemon", "package.json"));
  const toolRequire = createRequire(import.meta.url);
  let copiedDependencyRequire: NodeRequire;
  try {
    copiedDependencyRequire = createRequire(daemonRequire.resolve("chokidar/package.json"));
  } catch {
    copiedDependencyRequire = toolRequire;
  }
  for (const [packageName, expectedVersion] of Object.entries(MAC_PREBUNDLE_COPIED_RUNTIME_DEPENDENCIES)) {
    const sourceManifestPath = copiedDependencyRequire.resolve(`${packageName}/package.json`);
    const sourceRoot = dirname(sourceManifestPath);
    const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8")) as { version?: unknown };
    if (sourceManifest.version !== expectedVersion) {
      throw new Error(
        `mac prebundle runtime dependency ${packageName} expected ${expectedVersion}, found ${String(sourceManifest.version)}`,
      );
    }

    const nativeBindingPath = join(sourceRoot, `${packageName}.node`);
    if (!(await stat(nativeBindingPath)).isFile()) {
      throw new Error(`mac prebundle runtime dependency native binding is missing: ${nativeBindingPath}`);
    }

    const targetRoot = join(appRoot, "node_modules", packageName);
    await rm(targetRoot, { force: true, recursive: true });
    await cp(sourceRoot, targetRoot, { dereference: true, recursive: true });
  }
}

export function createMacElectronRebuildOptions(
  config: ToolPackConfig,
  appRoot: string,
): RebuildOptions {
  return {
    arch: process.arch,
    buildFromSource: ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE,
    buildPath: appRoot,
    electronVersion: config.electronVersion,
    force: true,
    mode: ELECTRON_REBUILD_MODE,
    onlyModules: [...ELECTRON_REBUILD_NATIVE_MODULES],
    platform: "darwin",
    projectRootPath: appRoot,
  };
}

function nativeRebuildOutputPath(appRoot: string): string {
  return join(appRoot, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
}

function formatMacNativeRebuildOutputStatError(nativePath: string, error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return `native module output is missing: ${nativePath}`;
  const detail = error instanceof Error ? error.message : String(error);
  return `native module output could not be inspected: ${nativePath}: ${detail}`;
}

export async function validateMacNativeRebuildOutput(appRoot: string): Promise<string | null> {
  const nativePath = nativeRebuildOutputPath(appRoot);
  try {
    const metadata = await stat(nativePath);
    if (metadata.size < 100_000) return `native module output is too small: ${nativePath}`;
    return null;
  } catch (error) {
    return formatMacNativeRebuildOutputStatError(nativePath, error);
  }
}

export async function runMacElectronRebuild(
  config: ToolPackConfig,
  appRoot: string,
): Promise<void> {
  const foundModules = new Set<string>();
  const rebuildResult = rebuild(createMacElectronRebuildOptions(config, appRoot));
  rebuildResult.lifecycle.on("modules-found", (modules: string[]) => {
    for (const moduleName of modules) foundModules.add(moduleName);
    process.stderr.write(`[tools-pack mac] rebuilding Electron ABI modules: ${modules.join(", ") || "none"}\n`);
  });
  await rebuildResult;
  const missingModules = ELECTRON_REBUILD_NATIVE_MODULES.filter((moduleName) => !foundModules.has(moduleName));
  if (missingModules.length > 0) {
    throw new Error(`Electron ABI rebuild did not discover required native module(s): ${missingModules.join(", ")}`);
  }
  const nativeValidationError = await validateMacNativeRebuildOutput(appRoot);
  if (nativeValidationError != null) throw new Error(nativeValidationError);
}

export async function collectWorkspaceTarballs(
  config: ToolPackConfig,
  paths: MacPaths,
  options: { includeResolvers?: boolean } = {},
): Promise<PackedTarballInfo[]> {
  await rm(paths.tarballsRoot, { force: true, recursive: true });
  await mkdir(paths.tarballsRoot, { recursive: true });
  const packedTarballs: PackedTarballInfo[] = [];
  const versions = await workspacePackageVersions(config);

  for (const packageInfo of INTERNAL_PACKAGES) {
    const installedAtRuntime = shouldInstallInternalPackageForMacPrebundle({
      packageName: packageInfo.name,
      webOutputMode: config.webOutputMode,
    });
    if (!installedAtRuntime && (options.includeResolvers === false || !MAC_STANDALONE_PREBUNDLE_RESOLVER_PACKAGES.includes(
      packageInfo.name as (typeof MAC_STANDALONE_PREBUNDLE_RESOLVER_PACKAGES)[number],
    ))) {
      continue;
    }

    const fileName = await packWorkspacePackage(config, paths.tarballsRoot, packageInfo, versions);
    packedTarballs.push({ fileName, packageName: packageInfo.name });
  }

  return packedTarballs;
}

export function resolveMacPrebundleResolverTarballs(
  paths: MacPaths,
  packedTarballs: readonly PackedTarballInfo[],
): string[] {
  return packedTarballs
    .filter((entry) => MAC_STANDALONE_PREBUNDLE_RESOLVER_PACKAGES.includes(
      entry.packageName as (typeof MAC_STANDALONE_PREBUNDLE_RESOLVER_PACKAGES)[number],
    ))
    .map((entry) => join(paths.tarballsRoot, entry.fileName));
}

async function workspacePackageVersions(config: ToolPackConfig): Promise<Map<string, string>> {
  return new Map(await Promise.all(INTERNAL_PACKAGES.map(async (entry) => {
    const manifest = JSON.parse(await readFile(join(config.workspaceRoot, entry.directory, "package.json"), "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    if (manifest.name !== entry.name || typeof manifest.version !== "string") {
      throw new Error(`invalid workspace package manifest: ${entry.directory}`);
    }
    return [entry.name, manifest.version] as const;
  })));
}

function rewriteWorkspaceDependencies(manifest: Record<string, unknown>, versions: Map<string, string>): void {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const) {
    const dependencies = manifest[field];
    if (dependencies == null || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const [name, raw] of Object.entries(dependencies as Record<string, unknown>)) {
      if (typeof raw !== "string" || !raw.startsWith("workspace:")) continue;
      const version = versions.get(name);
      if (version == null) throw new Error(`workspace package version is unavailable: ${name}`);
      const selector = raw.slice("workspace:".length);
      (dependencies as Record<string, unknown>)[name] = selector === "*"
        ? version
        : selector === "^"
          ? `^${version}`
          : selector === "~"
            ? `~${version}`
            : selector;
    }
  }
}

async function packWorkspacePackage(
  config: ToolPackConfig,
  destination: string,
  packageInfo: (typeof INTERNAL_PACKAGES)[number],
  versions: Map<string, string>,
): Promise<string> {
  const temporary = await mkdtemp(join(tmpdir(), "open-design-package-tarball-"));
  try {
    await execFileAsync("npm", [
      "pack",
      join(config.workspaceRoot, packageInfo.directory),
      "--pack-destination",
      temporary,
      "--ignore-scripts",
      "--silent",
    ]);
    const archives = (await readdir(temporary)).filter((entry) => entry.endsWith(".tgz"));
    if (archives.length !== 1 || archives[0] == null) {
      throw new Error(`expected one source tarball for ${packageInfo.name}, got ${archives.length}`);
    }
    const stage = join(temporary, "stage");
    await mkdir(stage);
    extractArchive(join(temporary, archives[0]), stage, "tar.gz");
    const manifestPath = join(stage, "package", "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    rewriteWorkspaceDependencies(manifest, versions);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    createTarArchive(join(destination, archives[0]), [{ directory: stage, entries: ["package"] }], { reproducible: true });
    return archives[0];
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

export async function writeAssembledApp(
  config: ToolPackConfig,
  paths: MacPaths,
  packedTarballs: PackedTarballInfo[],
  runtimeProductRoot?: string,
): Promise<void> {
  const packagedVersion = await readPackagedVersion(config);
  await rm(join(config.roots.output.namespaceRoot, "assembled"), { force: true, recursive: true });
  await mkdir(paths.assembledAppRoot, { recursive: true });
  await cp(
    join(config.workspaceRoot, "apps", "desktop", "dist", "main", "preload.cjs"),
    join(paths.assembledAppRoot, "preload.cjs"),
  );
  const usePrebundledStandaloneWeb = shouldUseMacStandalonePrebundle(config.webOutputMode);
  if (runtimeProductRoot == null) {
    await writeMacAssembledPackageJson(config, paths, packedTarballs, packagedVersion);
  } else {
    const productManifest = JSON.parse(await readFile(join(runtimeProductRoot, "app-package.json"), "utf8")) as Record<string, unknown>;
    const identity = resolveMacInstallIdentity(config);
    await writeFile(paths.assembledPackageJsonPath, `${JSON.stringify({
      ...productManifest,
      main: "./main.cjs",
      name: "open-design-packaged-app",
      private: true,
      productName: identity.productName,
      version: electronBuilderVersionForAppVersion(packagedVersion),
    }, null, 2)}\n`, "utf8");
  }
  const resolverTarballs = resolveMacPrebundleResolverTarballs(paths, packedTarballs);
  if (runtimeProductRoot == null) {
    await runNpmInstall(paths.assembledAppRoot, resolverTarballs);
  } else {
    await cp(join(runtimeProductRoot, "node_modules"), join(paths.assembledAppRoot, "node_modules"), {
      dereference: false,
      recursive: true,
    });
  }
  if (usePrebundledStandaloneWeb) await buildPrebundledStandaloneRuntime(config, paths);
  if (resolverTarballs.length > 0 || runtimeProductRoot != null) await runNpmPrune(paths.assembledAppRoot);
  await writeFile(
    paths.assembledMainEntryPath,
    renderMacPackagedMainEntry(usePrebundledStandaloneWeb),
    "utf8",
  );
  await writeFile(
    paths.packagedConfigPath,
    renderMacPackagedConfig({
      appVersion: packagedVersion,
      config,
      usePrebundledStandaloneWeb,
    }),
    "utf8",
  );
  if (runtimeProductRoot == null && usePrebundledStandaloneWeb) {
    await copyMacPrebundleRuntimeDependencies(config, paths.assembledAppRoot);
  }
  if (runtimeProductRoot == null) {
    await prepareNodePtyRuntime({
      appRoot: paths.assembledAppRoot,
      arch: resolveNodePtyRuntimeArch(process.arch),
      platform: "darwin",
    });
    await runMacElectronRebuild(config, paths.assembledAppRoot);
  }
  await finalizeRuntimeManifest(paths.assembledAppRoot);
}

export async function writeMacAssembledPackageJson(
  config: ToolPackConfig,
  paths: MacPaths,
  packedTarballs: PackedTarballInfo[],
  packagedVersion = "0.0.0",
): Promise<void> {
  const packageVersion = electronBuilderVersionForAppVersion(packagedVersion);
  const identity = resolveMacInstallIdentity(config);
  const tarballByPackage = Object.fromEntries(
    packedTarballs.map((entry) => [entry.packageName, entry.fileName] as const),
  );
  const usePrebundledStandaloneWeb = shouldUseMacStandalonePrebundle(config.webOutputMode);
  const internalDependencies = Object.fromEntries(
    INTERNAL_PACKAGES.filter((packageInfo) =>
      shouldInstallInternalPackageForMacPrebundle({
        packageName: packageInfo.name,
        webOutputMode: config.webOutputMode,
      })
    ).map((packageInfo) => {
      const tarball = tarballByPackage[packageInfo.name];
      if (tarball == null) throw new Error(`missing tarball for ${packageInfo.name}`);
      return [packageInfo.name, `file:${relative(paths.assembledAppRoot, join(paths.tarballsRoot, tarball))}`];
    }),
  );
  const dependencies = {
    ...internalDependencies,
    ...(usePrebundledStandaloneWeb ? MAC_PREBUNDLE_RUNTIME_DEPENDENCIES : {}),
  };
  const optionalDependencies = usePrebundledStandaloneWeb
    ? MAC_PREBUNDLE_COPIED_RUNTIME_DEPENDENCIES
    : undefined;

  await writeFile(
    paths.assembledPackageJsonPath,
    `${JSON.stringify(
      {
        dependencies,
        description: "Open Design packaged runtime",
        main: "./main.cjs",
        name: "open-design-packaged-app",
        ...(optionalDependencies == null ? {} : { optionalDependencies }),
        private: true,
        productName: identity.productName,
        version: packageVersion,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
