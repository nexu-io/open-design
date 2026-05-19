import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { chmod, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createPackageManagerInvocation } from "@open-design/platform";

import { ToolPackCache } from "./cache.js";
import type { ToolPackConfig } from "./config.js";
import { copyBundledResourceTrees } from "./resources.js";
import { ensureWorkspaceBuildArtifacts } from "./workspace-build.js";
import { collectWorkspaceTarballs, writeAssembledApp } from "./mac/app.js";
import { finalizeMacArtifacts } from "./mac/artifacts.js";
import { clearQuarantine, pathExists } from "./mac/fs.js";
import { resolveMacPaths, sanitizeNamespace } from "./mac/paths.js";
import { collectMacSizeReport } from "./mac/report.js";
import type { ElectronBuilderTarget, MacBuildOutput, MacPackResult, MacPackTiming } from "./mac/types.js";
import { PRODUCT_NAME } from "./mac/constants.js";
import { resolveWinPaths } from "./win/paths.js";
import type { WinPackResult, WinPackTiming } from "./win/types.js";
import type { LinuxPackResult } from "./linux.js";

type LoggedCommandOptions = Pick<SpawnOptionsWithoutStdio, "cwd" | "env" | "windowsVerbatimArguments">;

type TauriBundleTarget = "app" | "appimage" | "dmg" | "nsis";

type TauriResourcePaths = {
  assembledAppRoot: string;
  mergeConfigPath: string;
  packagedConfigPath: string;
  resourceRoot: string;
};

function quoteCommandPart(value: string): string {
  if (!/[\s"'$`\\]/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandLine(command: string, args: string[]): string {
  return [command, ...args].map(quoteCommandPart).join(" ");
}

async function execLogged(
  command: string,
  args: string[],
  options: LoggedCommandOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  process.stderr.write(`[tools-pack tauri] run ${commandLine(command, args)}\n`);
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.once("error", rejectCommand);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveCommand();
        return;
      }
      const suffix = signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectCommand(new Error(`command failed with ${suffix}: ${commandLine(command, args)}`));
    });
  });
  process.stderr.write(`[tools-pack tauri] done ${commandLine(command, args)} durationMs=${Date.now() - startedAt}\n`);
}

async function runPnpm(
  config: ToolPackConfig,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  const invocation = createPackageManagerInvocation(args, process.env);
  await execLogged(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env: { ...process.env, ...extraEnv },
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

async function buildWorkspaceArtifacts(config: ToolPackConfig): Promise<void> {
  const webNextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousWebNextEnv = await readFile(webNextEnvPath, "utf8").catch(() => null);

  await runPnpm(config, ["--filter", "@open-design/contracts", "build"]);
  await runPnpm(config, ["--filter", "@open-design/sidecar-proto", "build"]);
  await runPnpm(config, ["--filter", "@open-design/sidecar", "build"]);
  await runPnpm(config, ["--filter", "@open-design/platform", "build"]);
  await runPnpm(config, ["--filter", "@open-design/daemon", "build"]);
  try {
    await runPnpm(config, ["--filter", "@open-design/web", "build"], {
      OD_WEB_OUTPUT_MODE: config.webOutputMode,
    });
    await runPnpm(config, ["--filter", "@open-design/web", "build:sidecar"]);
  } finally {
    if (previousWebNextEnv == null) {
      await rm(webNextEnvPath, { force: true });
    } else {
      await writeFile(webNextEnvPath, previousWebNextEnv, "utf8");
    }
  }
  await runPnpm(config, ["--filter", "@open-design/desktop", "build"]);
  await runPnpm(config, ["--filter", "@open-design/packaged", "build"]);
}

async function ensureTauriWorkspaceBuild(config: ToolPackConfig, cache: ToolPackCache): Promise<void> {
  await ensureWorkspaceBuildArtifacts(config, cache, async () => {
    await buildWorkspaceArtifacts(config);
  });
}

function resolveTauriResourcePaths(config: ToolPackConfig): TauriResourcePaths {
  const namespaceRoot = config.roots.output.namespaceRoot;
  return {
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    mergeConfigPath: join(namespaceRoot, "tauri-pack.conf.json"),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
  };
}

function tauriRuntimeConfig(config: ToolPackConfig): ToolPackConfig {
  return { ...config, webOutputMode: "server" };
}

function nodeResourceName(config: ToolPackConfig): string {
  return config.platform === "win" ? "node.exe" : "node";
}

async function copyResourceTree(config: ToolPackConfig, paths: TauriResourcePaths): Promise<void> {
  await rm(paths.resourceRoot, { force: true, recursive: true });
  await mkdir(paths.resourceRoot, { recursive: true });
  await copyBundledResourceTrees({
    workspaceRoot: config.workspaceRoot,
    resourceRoot: paths.resourceRoot,
  });
  await mkdir(join(paths.resourceRoot, "bin"), { recursive: true });
  const nodePath = join(paths.resourceRoot, "bin", nodeResourceName(config));
  await cp(process.execPath, nodePath);
  if (config.platform !== "win") {
    await chmod(nodePath, 0o755);
  }
}

function resolveTauriBundleTargets(config: ToolPackConfig): TauriBundleTarget[] {
  switch (config.platform) {
    case "mac":
      switch (config.to) {
        case "all":
          return ["app", "dmg"];
        case "app":
        case "zip":
          return ["app"];
        case "dmg":
          return ["dmg"];
        default:
          throw new Error(`unsupported mac Tauri --to target: ${config.to}`);
      }
    case "win":
      switch (config.to) {
        case "all":
        case "nsis":
          return ["nsis"];
        case "dir":
          throw new Error("tools-pack win build --desktop-runtime tauri --to dir is not implemented yet; use --to nsis");
        default:
          throw new Error(`unsupported win Tauri --to target: ${config.to}`);
      }
    case "linux":
      switch (config.to) {
        case "all":
        case "appimage":
          return ["appimage"];
        case "dir":
          throw new Error("tools-pack linux build --desktop-runtime tauri --to dir is not implemented yet; use --to appimage");
        default:
          throw new Error(`unsupported linux Tauri --to target: ${config.to}`);
      }
  }
}

function tauriTargetRoot(config: ToolPackConfig): string {
  return join(config.workspaceRoot, "apps", "desktop", "src-tauri", "target", "release", "bundle");
}

async function writeTauriMergeConfig(
  config: ToolPackConfig,
  paths: TauriResourcePaths,
  targets: TauriBundleTarget[],
): Promise<void> {
  await mkdir(dirname(paths.mergeConfigPath), { recursive: true });
  await writeFile(
    paths.mergeConfigPath,
    `${JSON.stringify(
      {
        mainBinaryName: PRODUCT_NAME,
        bundle: {
          targets,
          resources: {
            [paths.assembledAppRoot]: "app",
            [paths.resourceRoot]: "open-design",
            [paths.packagedConfigPath]: "open-design-config.json",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function runTauriBuild(
  config: ToolPackConfig,
  targets: TauriBundleTarget[],
  mergeConfigPath: string,
): Promise<void> {
  await rm(tauriTargetRoot(config), { force: true, recursive: true });
  const args = [
    config.tauriCliPath,
    "build",
    "--config",
    config.tauriConfigPath,
    "--config",
    mergeConfigPath,
    "--bundles",
    targets.join(","),
    "--ci",
  ];
  if (!config.signed) {
    args.push("--no-sign");
  }
  await execLogged(process.execPath, args, {
    cwd: join(config.workspaceRoot, "apps", "desktop"),
    env: process.env,
  });
}

async function findFirstFile(root: string, predicate: (entry: string) => boolean): Promise<string | null> {
  const entries = await readdir(root).catch(() => []);
  const match = entries.find(predicate);
  return match == null ? null : join(root, match);
}

function macTauriTargetsForReport(to: MacBuildOutput): ElectronBuilderTarget[] {
  switch (to) {
    case "all":
      return ["dir", "dmg", "zip"];
    case "app":
      return ["dir"];
    case "dmg":
      return ["dmg"];
    case "zip":
      return ["zip"];
  }
}

async function copyTauriMacArtifacts(config: ToolPackConfig): Promise<void> {
  const paths = resolveMacPaths(config);
  const targetRoot = tauriTargetRoot(config);
  const namespaceToken = sanitizeNamespace(config.namespace);
  const sourceApp = join(targetRoot, "macos", "Open Design.app");
  if (config.to === "all" || config.to === "app" || config.to === "zip") {
    if (!(await pathExists(sourceApp))) {
      throw new Error(`Tauri mac app bundle was not produced at ${sourceApp}`);
    }
    await rm(paths.appPath, { force: true, recursive: true });
    await mkdir(dirname(paths.appPath), { recursive: true });
    await cp(sourceApp, paths.appPath, { recursive: true });
    await clearQuarantine(paths.appPath);
  }
  if (config.to === "all" || config.to === "dmg") {
    const sourceDmg = await findFirstFile(join(targetRoot, "dmg"), (entry) => entry.endsWith(".dmg"));
    if (sourceDmg == null) {
      throw new Error(`Tauri mac dmg was not produced under ${join(targetRoot, "dmg")}`);
    }
    await mkdir(paths.appBuilderOutputRoot, { recursive: true });
    await cp(sourceDmg, join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.dmg`));
  }
  if (config.to === "all" || config.to === "zip") {
    if (!(await pathExists(paths.appPath))) {
      throw new Error(`cannot zip Tauri mac app because it is missing at ${paths.appPath}`);
    }
    const stagedZip = join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.zip`);
    await mkdir(dirname(stagedZip), { recursive: true });
    await rm(stagedZip, { force: true });
    await execLogged("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", paths.appPath, stagedZip]);
  }
}

export async function packTauriMac(config: ToolPackConfig): Promise<MacPackResult> {
  const runtimeConfig = tauriRuntimeConfig(config);
  const paths = resolveMacPaths(config);
  const assemblyPaths = resolveMacPaths(runtimeConfig);
  const resourcePaths = resolveTauriResourcePaths(config);
  const targets = resolveTauriBundleTargets(config);
  const cache = new ToolPackCache(config.roots.cacheRoot);
  const timings: MacPackTiming[] = [];
  const runPhase = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

  await runPhase("workspace-build", async () => {
    await ensureTauriWorkspaceBuild(runtimeConfig, cache);
  });
  await runPhase("resource-tree", async () => {
    await copyResourceTree(runtimeConfig, resourcePaths);
  });
  const tarballs = await runPhase("workspace-tarballs", async () =>
    collectWorkspaceTarballs(runtimeConfig, assemblyPaths)
  );
  await runPhase("assembled-app", async () => {
    await writeAssembledApp(runtimeConfig, assemblyPaths, tarballs);
  });
  await runPhase("tauri-config", async () => {
    await writeTauriMergeConfig(config, resourcePaths, targets);
  });
  await runPhase("tauri-build", async () => {
    await runTauriBuild(config, targets, resourcePaths.mergeConfigPath);
  });
  await runPhase("artifacts", async () => {
    await copyTauriMacArtifacts(config);
  });
  const artifacts = await finalizeMacArtifacts(config, paths);
  const sizeReport = await runPhase("size-report", async () =>
    collectMacSizeReport(runtimeConfig, paths, artifacts, macTauriTargetsForReport(config.to as MacBuildOutput))
  );

  return {
    appPath: paths.appPath,
    cacheReport: cache.report(),
    dmgPath: artifacts.dmgPath,
    latestMacYmlPath: artifacts.latestMacYmlPath,
    outputRoot: config.roots.output.namespaceRoot,
    resourceRoot: paths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    sizeReport,
    timings,
    to: config.to,
    zipPath: artifacts.zipPath,
  };
}

async function copyTauriWinArtifacts(config: ToolPackConfig): Promise<{ installerPath: string | null }> {
  const paths = resolveWinPaths(config);
  const targetRoot = tauriTargetRoot(config);
  const sourceInstaller = await findFirstFile(join(targetRoot, "nsis"), (entry) => entry.endsWith(".exe"));
  if (sourceInstaller == null) {
    throw new Error(`Tauri Windows NSIS installer was not produced under ${join(targetRoot, "nsis")}`);
  }
  await mkdir(dirname(paths.setupPath), { recursive: true });
  await cp(sourceInstaller, paths.setupPath);
  return { installerPath: paths.setupPath };
}

export async function packTauriWin(config: ToolPackConfig): Promise<WinPackResult> {
  const runtimeConfig = tauriRuntimeConfig(config);
  const targets = resolveTauriBundleTargets(config);
  const assemblyPaths = resolveMacPaths(runtimeConfig);
  const resourcePaths = resolveTauriResourcePaths(config);
  const cache = new ToolPackCache(config.roots.cacheRoot);
  const timings: WinPackTiming[] = [];
  const runPhase = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

  await runPhase("workspace-build", async () => {
    await ensureTauriWorkspaceBuild(runtimeConfig, cache);
  });
  await runPhase("resource-tree", async () => {
    await copyResourceTree(runtimeConfig, resourcePaths);
  });
  const tarballs = await runPhase("workspace-tarballs", async () =>
    collectWorkspaceTarballs(runtimeConfig, assemblyPaths)
  );
  await runPhase("assembled-app", async () => {
    await writeAssembledApp(runtimeConfig, assemblyPaths, tarballs);
  });
  await runPhase("tauri-config", async () => {
    await writeTauriMergeConfig(config, resourcePaths, targets);
  });
  await runPhase("tauri-build", async () => {
    await runTauriBuild(config, targets, resourcePaths.mergeConfigPath);
  });
  const artifacts = await runPhase("artifacts", async () => copyTauriWinArtifacts(config));

  return {
    blockmapPath: null,
    installerPath: artifacts.installerPath,
    latestYmlPath: null,
    outputRoot: config.roots.output.namespaceRoot,
    resourceRoot: resourcePaths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    cacheReport: cache.report(),
    sizeReport: {
      builder: {
        asar: false,
        buildDependenciesFromSource: false,
        filePatterns: [],
        nativeRebuild: { buildFromSource: false, mode: "sequential", modules: [] },
        nodeGypRebuild: false,
        npmRebuild: false,
        targets: ["nsis"],
        webOutputMode: config.webOutputMode,
      },
      generatedAt: new Date().toISOString(),
      installerBytes: artifacts.installerPath == null ? null : (await stat(artifacts.installerPath).catch(() => null))?.size ?? null,
      outputRootBytes: 0,
      resourceRootBytes: 0,
      runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
      topLevel: { appResourcesBytes: 0, copiedStandaloneBytes: 0, electronLocalesBytes: 0, resourcesBytes: 0 },
      tracked: {
        appNodeModulesBytes: 0,
        betterSqlite3Bytes: 0,
        betterSqlite3SourceResidueBytes: 0,
        bundledNodeBytes: 0,
        copiedStandaloneNextBytes: 0,
        copiedStandaloneNextSwcBytes: 0,
        copiedStandaloneNodeModulesBytes: 0,
        copiedStandalonePnpmHoistedNextBytes: 0,
        copiedStandaloneSharpLibvipsBytes: 0,
        copiedStandaloneSourcemapBytes: 0,
        copiedStandaloneTsbuildInfoBytes: 0,
        copiedStandaloneWebNextBytes: 0,
        copiedStandaloneWebNodeModulesBytes: 0,
        electronLocalesBytes: 0,
        markdownBytes: 0,
        nextBytes: 0,
        nextSwcBytes: 0,
        prebundledRuntimeBytes: 0,
        sharpLibvipsBytes: 0,
        sourcemapBytes: 0,
        tsbuildInfoBytes: 0,
        webCopiedStandaloneBytes: 0,
        webNextCacheBytes: 0,
        webPackageAppBytes: 0,
        webPackageBytes: 0,
        webPackageDistBytes: 0,
        webPackagePublicBytes: 0,
        webPackageSrcBytes: 0,
        webPackageStandaloneBytes: 0,
      },
      unpackedBytes: null,
    },
    timings,
    to: config.to,
    unpackedPath: null,
    webStandaloneHookAuditPath: null,
  };
}

async function copyTauriLinuxArtifacts(config: ToolPackConfig): Promise<string | null> {
  const targetRoot = tauriTargetRoot(config);
  const sourceAppImage = await findFirstFile(join(targetRoot, "appimage"), (entry) => entry.endsWith(".AppImage"));
  if (sourceAppImage == null) {
    throw new Error(`Tauri Linux AppImage was not produced under ${join(targetRoot, "appimage")}`);
  }
  const outputName = `${basename(sourceAppImage).replace(/\.AppImage$/, "")}-${config.namespace}.AppImage`;
  const outputPath = join(config.roots.output.appBuilderRoot, outputName);
  await mkdir(dirname(outputPath), { recursive: true });
  await cp(sourceAppImage, outputPath);
  await chmod(outputPath, 0o755);
  return outputPath;
}

export async function packTauriLinux(config: ToolPackConfig): Promise<LinuxPackResult> {
  if (config.containerized) {
    throw new Error("tools-pack linux build --desktop-runtime tauri --containerized is not implemented; run on a Linux host with Rust/Tauri tooling");
  }

  const runtimeConfig = tauriRuntimeConfig(config);
  const targets = resolveTauriBundleTargets(config);
  const assemblyPaths = resolveMacPaths(runtimeConfig);
  const resourcePaths = resolveTauriResourcePaths(config);
  const cache = new ToolPackCache(config.roots.cacheRoot);
  await ensureTauriWorkspaceBuild(runtimeConfig, cache);
  await copyResourceTree(runtimeConfig, resourcePaths);
  const tarballs = await collectWorkspaceTarballs(runtimeConfig, assemblyPaths);
  await writeAssembledApp(runtimeConfig, assemblyPaths, tarballs);
  await writeTauriMergeConfig(config, resourcePaths, targets);
  await runTauriBuild(config, targets, resourcePaths.mergeConfigPath);
  const appImagePath = await copyTauriLinuxArtifacts(config);

  return {
    appImagePath,
    outputRoot: config.roots.output.appBuilderRoot,
    resourceRoot: resourcePaths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    to: config.to,
    containerized: false,
  };
}
