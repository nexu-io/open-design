import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { createTarArchive, extractArchive } from "@open-design/download";
import type { ToolPackConfig } from "../config/index.js";
import { finalizeRuntimeManifest } from "../resources/runtime-manifest.js";
import { electronBuilderVersionForAppVersion } from "../versioning/index.js";
import { prepareNodePtyRuntime, resolveNodePtyRuntimeArch } from "../node-pty-runtime.js";
import { execFileAsync, runEsbuild, runNpmInstall, runNpmPrune } from "./product-commands.js";
import { INTERNAL_PACKAGES } from "./constants.js";
import { resolveMacInstallIdentity } from "./identity.js";
import { readPackagedVersion } from "./manifest.js";
import type { MacPaths, PackedTarballInfo } from "./types.js";
import { buildPrebundledStandaloneRuntime, renderMacPackagedConfig, copyMacPrebundleRuntimeDependencies, runMacElectronRebuild } from "./app.js";
import { MAC_PREBUNDLE_RUNTIME_DEPENDENCIES, MAC_PREBUNDLE_COPIED_RUNTIME_DEPENDENCIES, MAC_STANDALONE_PREBUNDLE_RESOLVER_PACKAGES, renderMacPackagedMainEntry, shouldInstallInternalPackageForMacPrebundle, shouldUseMacStandalonePrebundle } from "./prebundle.js";
async function buildExistingRuntime(config: ToolPackConfig, paths: MacPaths): Promise<void> {
  const resolverNodeModules = join(config.roots.output.namespaceRoot, "prebundle-resolver", "node_modules");
  await rm(dirname(resolverNodeModules), { force: true, recursive: true });
  await mkdir(join(resolverNodeModules, "@open-design"),{ recursive: true });
  for (const packageInfo of INTERNAL_PACKAGES) await symlink(join(config.workspaceRoot,packageInfo.directory),join(resolverNodeModules, "@open-design",packageInfo.name.slice("@open-design/".length)),"dir");
  const env = { NODE_PATH: [resolverNodeModules, join(paths.assembledAppRoot, "node_modules")].join(delimiter) };
  await buildPrebundledStandaloneRuntime(config, paths, async (c, args) => runEsbuild(c, args, env));
}
export async function collectExistingWorkspaceTarballs(
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

export async function writeExistingAssembledApp(
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
  if (usePrebundledStandaloneWeb) await buildExistingRuntime(config, paths);
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
  await assertExistingMacMaterialization(config, paths, packagedVersion);
}

export async function assertExistingMacMaterialization(config: ToolPackConfig, paths: MacPaths, appVersion: string): Promise<void> {
  const actualConfig = JSON.parse(await readFile(paths.packagedConfigPath, "utf8"));
  const expectedConfig = JSON.parse(renderMacPackagedConfig({appVersion, config, usePrebundledStandaloneWeb: shouldUseMacStandalonePrebundle(config.webOutputMode)}));
  if (!isDeepStrictEqual(actualConfig, expectedConfig)) throw new Error("existing Mac package configuration was not materialized for this release");
  const manifest = JSON.parse(await readFile(paths.assembledPackageJsonPath, "utf8"));
  if (manifest.version !== electronBuilderVersionForAppVersion(appVersion) || manifest.productName !== resolveMacInstallIdentity(config).productName) {
    throw new Error("existing Mac package version or channel identity differs from this release");
  }
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
