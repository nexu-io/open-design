import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

import { createPackageManagerInvocation } from "@open-design/platform";
import { build as esbuild } from "esbuild";

import { copyBundledResourceTrees, winResources } from "../resources.js";
import {
  SERVER_DEPLOY_HASH_PROBE_ENTRYPOINT,
  bundleServerDaemon,
} from "./bundle.js";
import {
  assertNativeServerTarget,
  type ServerPackConfig,
} from "./config.js";
import {
  SERVER_DAEMON_ENTRYPOINT,
  writeServerReleaseManifest,
  type ServerReleaseManifest,
} from "./manifest.js";
import { formatSha256SumsEntry, writeSha256SumsFile } from "./feed.js";
import { materializeServerRuntimeDependencies } from "./runtime-dependencies.js";

export const SERVER_PRIVATE_NODE_VERSION = "24.14.1";

const SERVER_WORKSPACE_BUILD_PACKAGES = [
  "@open-design/release",
  "@open-design/contracts",
  "@open-design/registry-protocol",
  "@open-design/sidecar-proto",
  "@open-design/launcher-proto",
  "@open-design/sidecar",
  "@open-design/platform",
  "@open-design/download",
  "@open-design/host",
  "@open-design/agui-adapter",
  "@open-design/plugin-runtime",
  "@open-design/diagnostics",
  "@open-design/components",
  "@open-design/daemon",
] as const;

export type ServerBuildResult = {
  appVersion: string;
  arch: ServerPackConfig["target"]["arch"];
  archivePath: string;
  manifestPath: string;
  platform: ServerPackConfig["target"]["platform"];
  releaseRoot: string;
  sha256: string;
  sha256Path: string;
  sha256SumsPath: string;
};

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  windowsVerbatimArguments?: boolean;
};

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<void> {
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });
    child.once("error", rejectCommand);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveCommand();
        return;
      }
      rejectCommand(
        new Error(
          `command failed (${signal ?? `exit ${String(code)}`}): ${command} ${args.join(" ")}`,
        ),
      );
    });
  });
}

async function runPnpm(
  config: ServerPackConfig,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const invocation = createPackageManagerInvocation(args, env);
  await runCommand(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

async function buildServerWorkspace(config: ServerPackConfig): Promise<void> {
  for (const packageName of SERVER_WORKSPACE_BUILD_PACKAGES) {
    await runPnpm(config, ["--filter", packageName, "build"]);
  }

  const nextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousNextEnv = await readFile(nextEnvPath, "utf8").catch(() => null);
  const webEnv = { ...process.env };
  delete webEnv.OD_WEB_DIST_DIR;
  delete webEnv.OD_WEB_OUTPUT_MODE;
  delete webEnv.OD_WEB_PROD;
  try {
    await runPnpm(config, ["--filter", "@open-design/web", "build"], webEnv);
  } finally {
    if (previousNextEnv == null) await rm(nextEnvPath, { force: true });
    else await writeFile(nextEnvPath, previousNextEnv, "utf8");
  }
}

async function removeFilesNamed(root: string, suffix: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        await removeFilesNamed(path, suffix);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        await rm(path, { force: true });
      }
    }),
  );
}

function posixNodeRuntimePath(
  installRootExpression: string,
  config: ServerPackConfig,
): string {
  return `${installRootExpression}/runtime/node-v${SERVER_PRIVATE_NODE_VERSION}-${config.target.platform}-${config.target.arch}/bin/node`;
}

export function renderPosixServerLauncher(config: ServerPackConfig): string {
  return [
    "#!/bin/sh",
    "set -eu",
    'source_path=$0',
    'while [ -L "$source_path" ]; do',
    '  source_dir=$(CDPATH= cd -- "$(dirname -- "$source_path")" && pwd -P)',
    '  source_target=$(readlink "$source_path")',
    '  case "$source_target" in',
    '    /*) source_path=$source_target ;;',
    '    *) source_path=$source_dir/$source_target ;;',
    "  esac",
    "done",
    'bin_dir=$(CDPATH= cd -- "$(dirname -- "$source_path")" && pwd -P)',
    'release_root=$(CDPATH= cd -- "$bin_dir/.." && pwd -P)',
    'install_root=$(CDPATH= cd -- "$release_root/../.." && pwd -P)',
    'node_bin=""',
    `if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(\".\")[0] + \" \" + process.platform + \"-\" + process.arch' 2>/dev/null || true)" = "24 ${config.target.platform}-${config.target.arch}" ]; then`,
    '  node_bin=$(command -v node)',
    "else",
    `  node_bin=${posixNodeRuntimePath('"$install_root"', config)}`,
    '  if [ ! -x "$node_bin" ]; then',
    '    echo "Open Design requires Node 24; reinstall to provision the private runtime." >&2',
    "    exit 1",
    "  fi",
    "fi",
    'daemon_cli=$release_root/apps/daemon/dist/daemon-cli.mjs',
    'export OD_BIN=$source_path',
    'export OD_DAEMON_CLI_PATH=$daemon_cli',
    'export OD_INSTALLATION_DIR=$install_root',
    'export OD_RESOURCE_ROOT=$release_root/resources',
    'export OD_NODE_BIN=$node_bin',
    'if [ -z "${OD_DATA_DIR:-}" ]; then',
    '  OD_DATA_DIR=$install_root/data',
    "  export OD_DATA_DIR",
    "fi",
    'exec "$node_bin" "$daemon_cli" "$@"',
    "",
  ].join("\n");
}

export function renderWindowsServerLauncher(config: ServerPackConfig): string {
  const privateNodeRelative =
    `runtime\\node-v${SERVER_PRIVATE_NODE_VERSION}-${config.target.platform}-${config.target.arch}\\node.exe`;
  return [
    "@echo off",
    "setlocal EnableExtensions DisableDelayedExpansion",
    'for %%I in ("%~dp0..") do set "OD_RELEASE_ROOT=%%~fI"',
    'for %%I in ("%OD_RELEASE_ROOT%\\..\\..") do set "OD_INSTALL_ROOT=%%~fI"',
    'set "OD_SELECTED_NODE="',
    `for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0] + ' ' + process.platform + '-' + process.arch" 2^>nul') do if "%%V"=="24 ${config.target.platform}-${config.target.arch}" set "OD_SELECTED_NODE=node"`,
    "if defined OD_SELECTED_NODE goto node_ready",
    'set "OD_SELECTED_NODE=%OD_INSTALL_ROOT%\\' +
      privateNodeRelative +
      '"',
    'if not exist "%OD_SELECTED_NODE%" (',
    "  echo Open Design requires Node 24; reinstall to provision the private runtime. 1>&2",
    "  exit /b 1",
    ")",
    ":node_ready",
    'set "OD_BIN=%~f0"',
    'set "OD_DAEMON_CLI_PATH=%OD_RELEASE_ROOT%\\apps\\daemon\\dist\\daemon-cli.mjs"',
    'set "OD_INSTALLATION_DIR=%OD_INSTALL_ROOT%"',
    'set "OD_RESOURCE_ROOT=%OD_RELEASE_ROOT%\\resources"',
    'set "OD_NODE_BIN=%OD_SELECTED_NODE%"',
    'if not defined OD_DATA_DIR set "OD_DATA_DIR=%OD_INSTALL_ROOT%\\data"',
    '"%OD_SELECTED_NODE%" "%OD_DAEMON_CLI_PATH%" %*',
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

async function writeServerLaunchers(config: ServerPackConfig): Promise<void> {
  const binRoot = join(config.releaseRoot, "bin");
  await mkdir(binRoot, { recursive: true });
  if (config.target.platform === "win32") {
    const launcher = renderWindowsServerLauncher(config);
    await writeFile(join(binRoot, "open-design.cmd"), launcher, "utf8");
    await writeFile(join(binRoot, "od.cmd"), launcher, "utf8");
    return;
  }
  const launcher = renderPosixServerLauncher(config);
  for (const name of ["open-design", "od"]) {
    const path = join(binRoot, name);
    await writeFile(path, launcher, "utf8");
    await chmod(path, 0o755);
  }
}

async function bundleInstallerCore(config: ServerPackConfig): Promise<void> {
  await mkdir(config.installerRoot, { recursive: true });
  const sourcePath = join(
    config.workspaceRoot,
    "tools",
    "pack",
    "src",
    "server",
    "install-core.ts",
  );
  const outputPath = join(config.installerRoot, "install-core.mjs");
  await esbuild({
    banner: { js: "#!/usr/bin/env node" },
    bundle: true,
    entryPoints: [sourcePath],
    format: "esm",
    legalComments: "none",
    logLevel: "info",
    outfile: outputPath,
    platform: "node",
    target: "node24",
  });
  await chmod(outputPath, 0o755);

  const resources = join(config.workspaceRoot, "tools", "pack", "resources", "server");
  await copyFile(join(resources, "install.sh"), join(config.installerRoot, "install.sh"));
  await copyFile(join(resources, "install.ps1"), join(config.installerRoot, "install.ps1"));
  await chmod(join(config.installerRoot, "install.sh"), 0o755);
}

function forbiddenReleasePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  return (
    normalized.includes("/apps/desktop/") ||
    normalized.includes("/apps/packaged/") ||
    normalized.includes("/node_modules/electron/") ||
    normalized.endsWith("/electron") ||
    normalized.endsWith("/electron.exe")
  );
}

export async function auditServerRelease(
  config: ServerPackConfig,
  manifest: ServerReleaseManifest,
): Promise<void> {
  const required = [
    resolve(config.releaseRoot, SERVER_DAEMON_ENTRYPOINT),
    join(
      config.releaseRoot,
      "apps",
      "daemon",
      "dist",
      SERVER_DEPLOY_HASH_PROBE_ENTRYPOINT,
    ),
    join(config.releaseRoot, "apps", "web", "out", "index.html"),
    join(config.releaseRoot, "node_modules", "better-sqlite3", "package.json"),
    join(config.releaseRoot, "node_modules", "blake3-wasm", "package.json"),
    join(config.releaseRoot, "node_modules", "node-pty", "package.json"),
    join(config.releaseRoot, "resources"),
    join(config.installerRoot, "install-core.mjs"),
    join(config.installerRoot, "install.ps1"),
    join(config.installerRoot, "install.sh"),
  ];
  if (config.target.platform === "win32") {
    required.push(join(config.releaseRoot, "bin", "open-design.cmd"));
  } else {
    required.push(join(config.releaseRoot, "bin", "open-design"));
  }
  for (const path of required) {
    await stat(path).catch(() => {
      throw new Error(`server release is missing required path: ${path}`);
    });
  }
  const forbidden = manifest.files
    .map((entry) => entry.path)
    .filter(forbiddenReleasePath);
  if (forbidden.length > 0) {
    throw new Error(`server release contains Electron/desktop files: ${forbidden.join(", ")}`);
  }
}

async function createArchive(config: ServerPackConfig): Promise<void> {
  await mkdir(dirname(config.archivePath), { recursive: true });
  await rm(config.archivePath, { force: true });
  if (config.target.platform === "win32") {
    await runCommand(
      winResources.sevenZipExe,
      ["a", "-tzip", "-mx=5", config.archivePath, config.topLevelName],
      { cwd: config.stageRoot },
    );
    return;
  }
  await runCommand(
    "tar",
    ["-czf", config.archivePath, "-C", config.stageRoot, config.topLevelName],
  );
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

export async function buildServerPackage(
  config: ServerPackConfig,
  options: { skipWorkspaceBuild?: boolean } = {},
): Promise<ServerBuildResult> {
  assertNativeServerTarget(config.target);
  await rm(config.stageRoot, { force: true, recursive: true });
  await mkdir(config.releaseRoot, { recursive: true });
  await mkdir(config.outputRoot, { recursive: true });

  if (options.skipWorkspaceBuild !== true) {
    await buildServerWorkspace(config);
  }

  const compiledCliPath = join(config.workspaceRoot, "apps", "daemon", "dist", "cli.js");
  const webOutputRoot = join(config.workspaceRoot, "apps", "web", "out");
  await stat(compiledCliPath);
  await stat(join(webOutputRoot, "index.html"));
  await removeFilesNamed(webOutputRoot, ".map");

  await bundleServerDaemon({
    compiledCliPath,
    compiledDeployPath: join(
      config.workspaceRoot,
      "apps",
      "daemon",
      "dist",
      "deploy.js",
    ),
    deployHashEntrySourcePath: join(
      config.outputRoot,
      "entrypoints",
      "deploy-hash-probe.ts",
    ),
    entrySourcePath: join(config.outputRoot, "entrypoints", "daemon-cli.ts"),
    metafilePath: join(config.outputRoot, "daemon.meta.json"),
    outdir: join(config.releaseRoot, "apps", "daemon", "dist"),
    workspaceRoot: config.workspaceRoot,
  });
  await cp(webOutputRoot, join(config.releaseRoot, "apps", "web", "out"), {
    dereference: true,
    recursive: true,
  });
  const nativeDependencies = await materializeServerRuntimeDependencies({
    releaseRoot: config.releaseRoot,
    target: config.target,
    workRoot: join(config.outputRoot, "runtime-dependencies"),
    workspaceRoot: config.workspaceRoot,
  });
  await copyBundledResourceTrees({
    resourceRoot: join(config.releaseRoot, "resources"),
    workspaceRoot: config.workspaceRoot,
  });
  await writeServerLaunchers(config);
  await bundleInstallerCore(config);
  const manifest = await writeServerReleaseManifest({
    appVersion: config.appVersion,
    nativeDependencies,
    nodeAbi: process.versions.modules,
    releaseId: config.releaseId,
    releaseRoot: config.releaseRoot,
    target: config.target,
  });
  await auditServerRelease(config, manifest);
  await createArchive(config);
  const sha256 = await hashFile(config.archivePath);
  const archiveName = basename(config.archivePath);
  const checksumLine = formatSha256SumsEntry(sha256, archiveName);
  await writeFile(config.sha256Path, checksumLine, "utf8");
  // Hosted bootstrap installs fetch v<version>/SHA256SUMS, not the
  // per-archive .sha256 sidecar. Emit the same entry in sums form so release
  // feed assembly can publish without re-hashing or reformatting.
  await writeSha256SumsFile(config.sha256SumsPath, [
    { archiveName, sha256 },
  ]);

  return {
    appVersion: config.appVersion,
    arch: config.target.arch,
    archivePath: config.archivePath,
    manifestPath: config.manifestPath,
    platform: config.target.platform,
    releaseRoot: config.releaseRoot,
    sha256,
    sha256Path: config.sha256Path,
    sha256SumsPath: config.sha256SumsPath,
  };
}
