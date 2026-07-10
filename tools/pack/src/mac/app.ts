import { execFile } from "node:child_process";
import { chmod, cp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import {
  MAC_DAEMON_PREBUNDLE_ESM_REQUIRE_BANNER,
  MAC_PREBUNDLE_ESBUILD_TARGET,
  MAC_PREBUNDLE_POLICIES,
  MAC_PREBUNDLE_RUNTIME_DEPENDENCIES,
  MAC_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH,
  MAC_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH,
  MAC_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH,
  assertMacPrebundleMetafile,
  renderMacPackagedMainEntry,
  shouldInstallInternalPackageForMacPrebundle,
  shouldUseMacStandalonePrebundle,
} from "../mac-prebundle.js";
import { copyBundledResourceTrees } from "../resources.js";
import { runEsbuild, runNpmInstall, runPnpm } from "./commands.js";
import { INTERNAL_PACKAGES, PRODUCT_NAME } from "./constants.js";
import { readPackagedVersion } from "./manifest.js";
import type { MacPaths, PackedTarballInfo } from "./types.js";

const execFileAsync = promisify(execFile);

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function toRelativeImportSpecifier(fromDirectory: string, targetPath: string): string {
  const specifier = toPosixPath(relative(fromDirectory, targetPath));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

function isSystemMacLibraryPath(value: string): boolean {
  return value.startsWith("/System/") || value.startsWith("/usr/lib/");
}

function parseOtoolDependencies(stdout: string): string[] {
  return stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(" (")[0])
    .filter((value): value is string => value != null && value.length > 0);
}

async function listMachODependencies(binaryPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("otool", ["-L", binaryPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return parseOtoolDependencies(stdout);
}

async function rewriteInstallName(targetPath: string, args: string[]): Promise<void> {
  if (args.length === 0) return;
  await execFileAsync("install_name_tool", [...args, targetPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

async function bundleMacNodeRuntime(resourceRoot: string): Promise<void> {
  const binRoot = join(resourceRoot, "bin");
  const libRoot = join(resourceRoot, "lib");
  await mkdir(binRoot, { recursive: true });
  await mkdir(libRoot, { recursive: true });

  const sourceNodePath = await realpath(process.execPath);
  const nodeDestinationPath = join(binRoot, "node");
  await cp(sourceNodePath, nodeDestinationPath);
  await chmod(nodeDestinationPath, 0o755);

  type ResolvedDependency = {
    bundledBaseName: string;
    sourcePath: string;
  };

  const bundledLibraryPathByKey = new Map<string, string>();
  const pendingLibraries: ResolvedDependency[] = [];
  const sourceNodeLibRoot = join(dirname(sourceNodePath), "..", "lib");

  const resolveDependency = async (requestingBinaryPath: string, dependency: string): Promise<ResolvedDependency | null> => {
    if (dependency.startsWith("@rpath/")) {
      const bundledBaseName = dependency.slice("@rpath/".length);
      for (const candidate of [
        join(dirname(requestingBinaryPath), "..", "lib", bundledBaseName),
        join(sourceNodeLibRoot, bundledBaseName),
      ]) {
        try {
          return { bundledBaseName, sourcePath: await realpath(candidate) };
        } catch {
          // try next candidate
        }
      }
      return null;
    }

    if (dependency.startsWith("@loader_path/")) {
      const bundledBaseName = dependency.slice("@loader_path/".length);
      try {
        return {
          bundledBaseName,
          sourcePath: await realpath(join(dirname(requestingBinaryPath), bundledBaseName)),
        };
      } catch {
        return null;
      }
    }

    if (!dependency.startsWith("/") || isSystemMacLibraryPath(dependency)) {
      return null;
    }

    return {
      bundledBaseName: dependency.split("/").at(-1) ?? "library.dylib",
      sourcePath: await realpath(dependency),
    };
  };

  const ensureBundledLibrary = async ({ bundledBaseName, sourcePath }: ResolvedDependency): Promise<string> => {
    const key = `${sourcePath}::${bundledBaseName}`;
    const existing = bundledLibraryPathByKey.get(key);
    if (existing != null) {
      return existing;
    }

    const destinationPath = join(libRoot, bundledBaseName);
    await cp(sourcePath, destinationPath);
    bundledLibraryPathByKey.set(key, destinationPath);
    pendingLibraries.push({ bundledBaseName, sourcePath });
    return destinationPath;
  };

  for (const dependency of await listMachODependencies(sourceNodePath)) {
    const resolvedDependency = await resolveDependency(sourceNodePath, dependency);
    if (resolvedDependency == null) continue;
    await ensureBundledLibrary(resolvedDependency);
  }

  for (let index = 0; index < pendingLibraries.length; index += 1) {
    const pendingLibrary = pendingLibraries[index];
    if (pendingLibrary == null) continue;
    for (const dependency of await listMachODependencies(pendingLibrary.sourcePath)) {
      const resolvedDependency = await resolveDependency(pendingLibrary.sourcePath, dependency);
      if (resolvedDependency == null) continue;
      await ensureBundledLibrary(resolvedDependency);
    }
  }

  const resolveBundledDependencyPath = async (sourcePath: string, dependency: string): Promise<string | null> => {
    const resolvedDependency = await resolveDependency(sourcePath, dependency);
    if (resolvedDependency == null) return null;
    return bundledLibraryPathByKey.get(`${resolvedDependency.sourcePath}::${resolvedDependency.bundledBaseName}`) ?? null;
  };

  const rewriteDependencyReference = async (targetPath: string, sourcePath: string): Promise<void> => {
    const dependencies = await listMachODependencies(sourcePath);
    const changes: string[] = [];
    for (const dependency of dependencies) {
      const bundledDependencyPath = await resolveBundledDependencyPath(sourcePath, dependency);
      if (bundledDependencyPath == null) continue;
      const bundledBaseName = bundledDependencyPath.split("/").at(-1);
      if (bundledBaseName == null) continue;
      const nextReference = targetPath === nodeDestinationPath
        ? `@loader_path/../lib/${bundledBaseName}`
        : `@loader_path/${bundledBaseName}`;
      changes.push("-change", dependency, nextReference);
    }
    await rewriteInstallName(targetPath, changes);
  };

  await rewriteDependencyReference(nodeDestinationPath, sourceNodePath);
  for (const [key, bundledLibraryPath] of bundledLibraryPathByKey.entries()) {
    const [sourcePath] = key.split("::");
    const bundledBaseName = bundledLibraryPath.split("/").at(-1);
    if (sourcePath == null || bundledBaseName == null) continue;
    await rewriteInstallName(bundledLibraryPath, ["-id", `@loader_path/${bundledBaseName}`]);
    await rewriteDependencyReference(bundledLibraryPath, sourcePath);
  }

  for (const bundledLibraryPath of bundledLibraryPathByKey.values()) {
    await execFileAsync("codesign", ["--force", "--sign", "-", bundledLibraryPath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  }
  await execFileAsync("codesign", ["--force", "--sign", "-", nodeDestinationPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

async function buildPrebundledStandaloneRuntime(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<void> {
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
  ]);
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
  ]);
  await assertMacPrebundleMetafile({
    metafilePath: paths.webSidecarPrebundleMetaPath,
    policyName: "webSidecar",
  });

  await mkdir(dirname(paths.daemonSidecarPrebundleEntrypointPath), { recursive: true });
  await writeFile(
    paths.daemonSidecarPrebundleEntrypointPath,
    `import ${JSON.stringify(
      toRelativeImportSpecifier(
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
        toRelativeImportSpecifier(
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
  ]);
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
  await bundleMacNodeRuntime(paths.resourceRoot);
}

export async function collectWorkspaceTarballs(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<PackedTarballInfo[]> {
  await rm(paths.tarballsRoot, { force: true, recursive: true });
  await mkdir(paths.tarballsRoot, { recursive: true });
  const packedTarballs: PackedTarballInfo[] = [];

  for (const packageInfo of INTERNAL_PACKAGES) {
    if (
      !shouldInstallInternalPackageForMacPrebundle({
        packageName: packageInfo.name,
        webOutputMode: config.webOutputMode,
      })
    ) {
      continue;
    }

    const beforeEntries = new Set(await readdir(paths.tarballsRoot));
    await runPnpm(config, [
      "-C",
      packageInfo.directory,
      "pack",
      "--pack-destination",
      paths.tarballsRoot,
    ]);
    const afterEntries = await readdir(paths.tarballsRoot);
    const newEntries = afterEntries.filter((entry) => !beforeEntries.has(entry));
    if (newEntries.length !== 1 || newEntries[0] == null) {
      throw new Error(`expected one tarball for ${packageInfo.name}, got ${newEntries.length}`);
    }
    packedTarballs.push({ fileName: newEntries[0], packageName: packageInfo.name });
  }

  return packedTarballs;
}

export async function writeAssembledApp(
  config: ToolPackConfig,
  paths: MacPaths,
  packedTarballs: PackedTarballInfo[],
): Promise<void> {
  const packagedVersion = await readPackagedVersion(config);
  await rm(join(config.roots.output.namespaceRoot, "assembled"), { force: true, recursive: true });
  await mkdir(paths.assembledAppRoot, { recursive: true });
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

  await writeFile(
    paths.assembledPackageJsonPath,
    `${JSON.stringify(
      {
        dependencies,
        description: "Open Design packaged runtime",
        main: "./main.cjs",
        name: "open-design-packaged-app",
        private: true,
        productName: PRODUCT_NAME,
        version: packagedVersion,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (usePrebundledStandaloneWeb) {
    await buildPrebundledStandaloneRuntime(config, paths);
  }
  await writeFile(
    paths.assembledMainEntryPath,
    renderMacPackagedMainEntry(usePrebundledStandaloneWeb),
    "utf8",
  );
  await writeFile(
    paths.packagedConfigPath,
    `${JSON.stringify(
      {
        appVersion: packagedVersion,
        ...(usePrebundledStandaloneWeb ? { daemonCliEntryRelative: MAC_PREBUNDLED_DAEMON_CLI_RELATIVE_PATH } : {}),
        ...(usePrebundledStandaloneWeb ? { daemonSidecarEntryRelative: MAC_PREBUNDLED_DAEMON_SIDECAR_RELATIVE_PATH } : {}),
        namespace: config.namespace,
        nodeCommandRelative: "open-design/bin/node",
        ...(config.telemetryRelayUrl == null ? {} : { telemetryRelayUrl: config.telemetryRelayUrl }),
        ...(config.posthogKey == null ? {} : { posthogKey: config.posthogKey }),
        ...(config.posthogHost == null ? {} : { posthogHost: config.posthogHost }),
        ...(usePrebundledStandaloneWeb ? { webSidecarEntryRelative: MAC_PREBUNDLED_WEB_SIDECAR_RELATIVE_PATH } : {}),
        webOutputMode: config.webOutputMode,
        ...(config.portable ? {} : { namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot }),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await runNpmInstall(paths.assembledAppRoot);
}
