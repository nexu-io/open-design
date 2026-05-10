import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

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

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function toRelativeImportSpecifier(fromDirectory: string, targetPath: string): string {
  const specifier = toPosixPath(relative(fromDirectory, targetPath));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
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
  await mkdir(join(paths.resourceRoot, "bin"), { recursive: true });
  await cp(process.execPath, join(paths.resourceRoot, "bin", "node"));
  await chmod(join(paths.resourceRoot, "bin", "node"), 0o755);
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
