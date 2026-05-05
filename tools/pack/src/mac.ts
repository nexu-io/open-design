import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type DesktopStatusSnapshot,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { createSidecarLaunchEnv, requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import {
  collectProcessTreePids,
  createPackageManagerInvocation,
  createProcessStampArgs,
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail,
  spawnBackgroundProcess,
  stopProcesses,
} from "@open-design/platform";

import type { ToolPackBuildOutput, ToolPackConfig } from "./config.js";
import { copyBundledResourceTrees, macResources } from "./resources.js";

const execFileAsync = promisify(execFile);
const PRODUCT_NAME = "Open Design";

const INTERNAL_PACKAGES = [
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

type PackedTarballInfo = {
  fileName: string;
  packageName: (typeof INTERNAL_PACKAGES)[number]["name"];
};

type MacPaths = {
  appBuilderConfigPath: string;
  appBuilderOutputRoot: string;
  appPath: string;
  assembledAppRoot: string;
  assembledMainEntryPath: string;
  assembledPackageJsonPath: string;
  dmgPath: string;
  installApplicationsRoot: string;
  installedAppPath: string;
  latestMacYmlPath: string;
  mountPoint: string;
  packagedConfigPath: string;
  resourceRoot: string;
  systemApplicationsAppPath: string;
  tarballsRoot: string;
  userApplicationsAppPath: string;
  webStandaloneHookAuditPath: string;
  webStandaloneHookConfigPath: string;
  zipPath: string;
};

export type MacPackResult = {
  appPath: string;
  dmgPath: string | null;
  latestMacYmlPath: string | null;
  outputRoot: string;
  resourceRoot: string;
  runtimeNamespaceRoot: string;
  sizeReport: MacSizeReport;
  to: ToolPackBuildOutput;
  zipPath: string | null;
};

type MacStartSource = "built" | "installed" | "system-applications" | "user-applications";

export type MacStartResult = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: MacStartSource;
  status: DesktopStatusSnapshot | null;
};

type DesktopRootIdentityMarker = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespaceRoot: string;
  pid: number;
  ppid: number;
  stamp: SidecarStamp;
  startedAt: string;
  updatedAt: string;
  version: 1;
};

type DesktopRootIdentityFallback = {
  marker?: Partial<DesktopRootIdentityMarker>;
  markerPath: string;
  processCommand?: string;
  reason: string;
};

export type MacStopResult = {
  fallback?: DesktopRootIdentityFallback;
  gracefulRequested: boolean;
  namespace: string;
  remainingPids: number[];
  status: "not-running" | "partial" | "stopped" | "unmanaged";
  stoppedPids: number[];
};

export type MacInstallResult = {
  detached: boolean;
  dmgPath: string;
  installedAppPath: string;
  mountPoint: string;
  namespace: string;
};

export type MacUninstallResult = {
  installedAppPath: string;
  namespace: string;
  removed: boolean;
  stop: MacStopResult;
};

export type MacCleanupResult = {
  detachedMount: boolean;
  namespace: string;
  outputRoot: string;
  removedOutputRoot: boolean;
  removedRuntimeNamespaceRoot: boolean;
  runtimeNamespaceRoot: string;
  stop: MacStopResult;
};

export type ElectronBuilderTarget = "dir" | "dmg" | "zip";

const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";
const WEB_STANDALONE_HOOK_CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
const WEB_STANDALONE_RESOURCE_NAME = "open-design-web-standalone";
const ELECTRON_BUILDER_ASAR = false;
const ELECTRON_BUILDER_FILE_PATTERNS = [
  "**/*",
  "!**/node_modules/.bin",
  "!**/node_modules/electron{,/**/*}",
  "!**/*.map",
  "!**/*.tsbuildinfo",
  "!**/.next/cache",
  "!**/.next/cache/**",
  "!**/node_modules/better-sqlite3/build/Release/obj",
  "!**/node_modules/better-sqlite3/build/Release/obj/**",
  "!**/node_modules/better-sqlite3/deps",
  "!**/node_modules/better-sqlite3/deps/**",
] as const;

export type MacSizeReport = {
  appBytes: number;
  builder: {
    asar: boolean;
    compression: ToolPackConfig["macCompression"];
    filePatterns: readonly string[];
    targets: ElectronBuilderTarget[];
    webOutputMode: ToolPackConfig["webOutputMode"];
  };
  dmgBytes: number | null;
  generatedAt: string;
  outputRootBytes: number;
  resourceRootBytes: number;
  runtimeNamespaceRoot: string;
  topLevel: {
    appResourcesBytes: number;
    electronFrameworksBytes: number;
    resourcesBytes: number;
  };
  tracked: {
    appNodeModulesBytes: number;
    betterSqlite3Bytes: number;
    betterSqlite3SourceResidueBytes: number;
    bundledNodeBytes: number;
    electronLocalesBytes: number;
    markdownBytes: number;
    nextBytes: number;
    nextSwcBytes: number;
    sharpLibvipsBytes: number;
    sourcemapBytes: number;
    tsbuildInfoBytes: number;
    webCopiedStandaloneBytes: number;
    webNextCacheBytes: number;
    webPackageBytes: number;
    webPackageStandaloneBytes: number;
  };
  zipBytes: number | null;
};

function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function macAppBundleName(namespace: string): string {
  return `${PRODUCT_NAME}.${sanitizeNamespace(namespace)}.app`;
}

function macAppExecutablePath(appPath: string): string {
  return join(appPath, "Contents", "MacOS", PRODUCT_NAME);
}

function resolveMacAppOutputDirectoryName(): string {
  return process.arch === "arm64" ? "mac-arm64" : "mac";
}

function resolveMacPaths(config: ToolPackConfig): MacPaths {
  const namespaceRoot = config.roots.output.namespaceRoot;
  const appBuilderOutputRoot = config.roots.output.appBuilderRoot;
  const namespaceToken = sanitizeNamespace(config.namespace);
  const appPath = join(
    appBuilderOutputRoot,
    resolveMacAppOutputDirectoryName(),
    `${PRODUCT_NAME}.app`,
  );
  const installApplicationsRoot = join(namespaceRoot, "install", "Applications");
  const installedAppPath = join(installApplicationsRoot, macAppBundleName(config.namespace));

  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot,
    appPath,
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    dmgPath: join(namespaceRoot, "dmg", `${PRODUCT_NAME}-${namespaceToken}.dmg`),
    installApplicationsRoot,
    installedAppPath,
    latestMacYmlPath: join(namespaceRoot, "zip", "latest-mac.yml"),
    mountPoint: join(namespaceRoot, "mount"),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
    systemApplicationsAppPath: join("/Applications", macAppBundleName(config.namespace)),
    tarballsRoot: join(namespaceRoot, "tarballs"),
    userApplicationsAppPath: join(homedir(), "Applications", macAppBundleName(config.namespace)),
    webStandaloneHookAuditPath: join(namespaceRoot, "web-standalone-after-pack-audit.json"),
    webStandaloneHookConfigPath: join(namespaceRoot, "web-standalone-after-pack-config.json"),
    zipPath: join(namespaceRoot, "zip", `${PRODUCT_NAME}-${namespaceToken}.zip`),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

async function sizePathBytes(
  path: string,
  options: { includeFile?: (path: string) => boolean } = {},
): Promise<number> {
  let metadata: Awaited<ReturnType<typeof lstat>>;
  try {
    metadata = await lstat(path);
  } catch {
    return 0;
  }

  if (!metadata.isDirectory()) {
    return options.includeFile == null || options.includeFile(toPosixPath(path)) ? metadata.size : 0;
  }

  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    total += await sizePathBytes(join(path, entry.name), options);
  }
  return total;
}

async function sizeExistingFileBytes(path: string): Promise<number | null> {
  try {
    const metadata = await stat(path);
    return metadata.size;
  } catch {
    return null;
  }
}

async function sumChildDirectorySizes(path: string, includeChild: (name: string) => boolean): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !includeChild(entry.name)) continue;
    total += await sizePathBytes(join(path, entry.name));
  }
  return total;
}

async function runPnpm(
  config: ToolPackConfig,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  const invocation = createPackageManagerInvocation(args, process.env);
  await execFileAsync(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function runNpmInstall(appRoot: string): Promise<void> {
  await execFileAsync("npm", ["install", "--omit=dev", "--no-package-lock"], {
    cwd: appRoot,
    env: process.env,
  });
}

async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  const packageJsonPath = join(config.workspaceRoot, "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing apps/packaged package version in ${packageJsonPath}`);
  }
  return packageJson.version;
}

async function assertWebStandaloneOutput(config: ToolPackConfig): Promise<void> {
  const webRoot = join(config.workspaceRoot, "apps", "web");
  const standaloneSourceRoot = join(webRoot, ".next", "standalone");
  const candidates = [
    join(standaloneSourceRoot, "apps", "web", "server.js"),
    join(standaloneSourceRoot, "server.js"),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return;
  }

  throw new Error("Next.js standalone server output was not produced under apps/web/.next/standalone");
}

async function writeWebStandaloneHookConfig(config: ToolPackConfig, paths: MacPaths): Promise<string> {
  const webRoot = join(config.workspaceRoot, "apps", "web");
  await assertWebStandaloneOutput(config);

  await mkdir(dirname(paths.webStandaloneHookConfigPath), { recursive: true });
  await writeFile(
    paths.webStandaloneHookConfigPath,
    `${JSON.stringify(
      {
        auditReportPath: paths.webStandaloneHookAuditPath,
        pruneCopiedSharp: true,
        pruneRootNext: true,
        pruneRootSharp: true,
        resourceName: WEB_STANDALONE_RESOURCE_NAME,
        standaloneSourceRoot: join(webRoot, ".next", "standalone"),
        version: 1,
        webPublicSourceRoot: join(webRoot, "public"),
        webStaticSourceRoot: join(webRoot, ".next", "static"),
        workspaceRoot: config.workspaceRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return paths.webStandaloneHookConfigPath;
}

async function buildWorkspaceArtifacts(config: ToolPackConfig): Promise<void> {
  const webNextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousWebNextEnv = await readFile(webNextEnvPath, "utf8").catch(() => null);

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

async function copyResourceTree(config: ToolPackConfig, paths: MacPaths): Promise<void> {
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

async function collectWorkspaceTarballs(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<PackedTarballInfo[]> {
  await rm(paths.tarballsRoot, { force: true, recursive: true });
  await mkdir(paths.tarballsRoot, { recursive: true });
  const packedTarballs: PackedTarballInfo[] = [];

  for (const packageInfo of INTERNAL_PACKAGES) {
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

async function writeAssembledApp(
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
  const dependencies = Object.fromEntries(
    INTERNAL_PACKAGES.map((packageInfo) => {
      const tarball = tarballByPackage[packageInfo.name];
      if (tarball == null) throw new Error(`missing tarball for ${packageInfo.name}`);
      return [packageInfo.name, `file:${relative(paths.assembledAppRoot, join(paths.tarballsRoot, tarball))}`];
    }),
  );

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
  await writeFile(
    paths.assembledMainEntryPath,
    'import("@open-design/packaged").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n',
    "utf8",
  );
  await writeFile(
    paths.packagedConfigPath,
    `${JSON.stringify(
      {
        appVersion: packagedVersion,
        namespace: config.namespace,
        nodeCommandRelative: "open-design/bin/node",
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

type MacBuildOutput = Extract<ToolPackBuildOutput, "all" | "app" | "dmg" | "zip">;

function resolveElectronBuilderTargets(to: MacBuildOutput): ElectronBuilderTarget[] {
  switch (to) {
    case "app":
      return ["dir"];
    case "dmg":
      return ["dir", "dmg"];
    case "zip":
      return ["dir", "zip"];
    case "all":
      return ["dir", "dmg", "zip"];
  }
}

async function runElectronBuilder(
  config: ToolPackConfig,
  paths: MacPaths,
  targets: ElectronBuilderTarget[],
): Promise<void> {
  const namespaceToken = sanitizeNamespace(config.namespace);
  const packagedVersion = await readPackagedVersion(config);
  const webStandaloneHookConfigPath = config.webOutputMode === "standalone"
    ? await writeWebStandaloneHookConfig(config, paths)
    : null;
  const builderConfig = {
    appId: "io.open-design.desktop",
    artifactName: `${PRODUCT_NAME}-${namespaceToken}.\${ext}`,
    afterPack: webStandaloneHookConfigPath == null ? undefined : macResources.webStandaloneAfterPackHook,
    afterSign: config.signed ? macResources.notarizeHook : undefined,
    asar: ELECTRON_BUILDER_ASAR,
    buildDependenciesFromSource: false,
    compression: config.macCompression,
    directories: {
      output: paths.appBuilderOutputRoot,
    },
    dmg: {
      icon: macResources.icon,
      iconSize: 96,
      title: `${PRODUCT_NAME}-${namespaceToken}`,
    },
    electronDist: config.electronDistPath,
    electronVersion: config.electronVersion,
    executableName: PRODUCT_NAME,
    extraMetadata: {
      main: "./main.cjs",
      name: "open-design-packaged-app",
      productName: PRODUCT_NAME,
      version: packagedVersion,
    },
    extraResources: [
      { from: paths.resourceRoot, to: "open-design" },
      { from: paths.packagedConfigPath, to: "open-design-config.json" },
    ],
    files: [...ELECTRON_BUILDER_FILE_PATTERNS],
    mac: {
      category: "public.app-category.developer-tools",
      entitlements: config.signed ? macResources.entitlements : undefined,
      entitlementsInherit: config.signed ? macResources.entitlementsInherit : undefined,
      gatekeeperAssess: false,
      hardenedRuntime: config.signed,
      icon: macResources.icon,
      identity: config.signed ? undefined : null,
      notarize: false,
      target: targets,
    },
    nodeGypRebuild: false,
    npmRebuild: false,
    productName: PRODUCT_NAME,
    icon: macResources.icon,
    publish: [
      {
        provider: "generic",
        url: "https://updates.invalid/open-design",
      },
    ],
  };

  await rm(paths.appBuilderOutputRoot, { force: true, recursive: true });
  await mkdir(dirname(paths.appBuilderConfigPath), { recursive: true });
  await writeFile(paths.appBuilderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, "utf8");
  await execFileAsync(process.execPath, [
    config.electronBuilderCliPath,
    "--mac",
    "--projectDir",
    paths.assembledAppRoot,
    "--config",
    paths.appBuilderConfigPath,
    "--publish",
    "never",
  ], {
    cwd: config.workspaceRoot,
    env: {
      ...process.env,
      ...(config.signed ? {} : { CSC_IDENTITY_AUTO_DISCOVERY: "false" }),
      ...(webStandaloneHookConfigPath == null ? {} : { [WEB_STANDALONE_HOOK_CONFIG_ENV]: webStandaloneHookConfigPath }),
    },
  });
}

async function clearQuarantine(path: string): Promise<void> {
  try {
    await execFileAsync("xattr", ["-dr", "com.apple.quarantine", path]);
  } catch {
    // Ignore when the attribute is absent or unsupported for local unsigned artifacts.
  }
}

async function moveBuilderArtifact(options: {
  destinationPath: string;
  label: string;
  sourcePath: string;
}): Promise<string> {
  if (!(await pathExists(options.sourcePath))) {
    throw new Error(`no ${options.label} produced at ${options.sourcePath}`);
  }
  await mkdir(dirname(options.destinationPath), { recursive: true });
  await rm(options.destinationPath, { force: true, recursive: true });
  await rename(options.sourcePath, options.destinationPath);
  await clearQuarantine(options.destinationPath);
  return options.destinationPath;
}

async function cleanBuilderScratchMetadata(paths: MacPaths): Promise<void> {
  const entries = await readdir(paths.appBuilderOutputRoot).catch(() => []);

  await Promise.all(
    entries
      .filter((entry) => entry === "latest-mac.yml" || entry.endsWith(".blockmap"))
      .map(async (entry) => {
        await rm(join(paths.appBuilderOutputRoot, entry), { force: true, recursive: true });
      }),
  );
}

async function writeLocalLatestMacYml(config: ToolPackConfig, paths: MacPaths): Promise<void> {
  const packagedVersion = await readPackagedVersion(config);
  const zipName = basename(paths.zipPath);
  const zipPayload = await readFile(paths.zipPath);
  const zipMetadata = await stat(paths.zipPath);
  const sha512 = createHash("sha512").update(zipPayload).digest("base64");

  await mkdir(dirname(paths.latestMacYmlPath), { recursive: true });
  await writeFile(
    paths.latestMacYmlPath,
    [
      `version: ${JSON.stringify(packagedVersion)}`,
      "files:",
      `  - url: ${JSON.stringify(zipName)}`,
      `    sha512: ${JSON.stringify(sha512)}`,
      `    size: ${zipMetadata.size}`,
      `path: ${JSON.stringify(zipName)}`,
      `sha512: ${JSON.stringify(sha512)}`,
      `releaseDate: ${JSON.stringify(new Date().toISOString())}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function finalizeMacArtifacts(
  config: ToolPackConfig,
  paths: MacPaths,
): Promise<Pick<MacPackResult, "dmgPath" | "latestMacYmlPath" | "zipPath">> {
  const namespaceToken = sanitizeNamespace(config.namespace);
  let dmgPath: string | null = null;
  let latestMacYmlPath: string | null = null;
  let zipPath: string | null = null;

  if (config.to === "dmg" || config.to === "all") {
    dmgPath = await moveBuilderArtifact({
      destinationPath: paths.dmgPath,
      label: "dmg artifact",
      sourcePath: join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.dmg`),
    });
  }

  if (config.to === "zip" || config.to === "all") {
    zipPath = await moveBuilderArtifact({
      destinationPath: paths.zipPath,
      label: "zip artifact",
      sourcePath: join(paths.appBuilderOutputRoot, `${PRODUCT_NAME}-${namespaceToken}.zip`),
    });
    await writeLocalLatestMacYml(config, paths);
    latestMacYmlPath = paths.latestMacYmlPath;
  }

  await cleanBuilderScratchMetadata(paths);

  return { dmgPath, latestMacYmlPath, zipPath };
}

function resolveDarwinArchToken(): "arm64" | "x64" {
  return process.arch === "arm64" ? "arm64" : "x64";
}

function isBetterSqlite3SourceResidue(path: string): boolean {
  return (
    path.includes("/node_modules/better-sqlite3/deps/") ||
    path.includes("/node_modules/better-sqlite3/build/Release/obj/")
  );
}

async function collectMacSizeReport(
  config: ToolPackConfig,
  paths: MacPaths,
  artifacts: Pick<MacPackResult, "dmgPath" | "zipPath">,
  targets: ElectronBuilderTarget[],
): Promise<MacSizeReport> {
  const appResourcesRoot = join(paths.appPath, "Contents", "Resources");
  const appNodeModulesRoot = join(appResourcesRoot, "app", "node_modules");
  const electronFrameworksRoot = join(paths.appPath, "Contents", "Frameworks");
  const electronFrameworkResourcesRoot = join(
    electronFrameworksRoot,
    "Electron Framework.framework",
    "Versions",
    "A",
    "Resources",
  );
  const darwinArch = resolveDarwinArchToken();

  return {
    appBytes: await sizePathBytes(paths.appPath),
    builder: {
      asar: ELECTRON_BUILDER_ASAR,
      compression: config.macCompression,
      filePatterns: ELECTRON_BUILDER_FILE_PATTERNS,
      targets,
      webOutputMode: config.webOutputMode,
    },
    dmgBytes: artifacts.dmgPath == null ? null : await sizeExistingFileBytes(artifacts.dmgPath),
    generatedAt: new Date().toISOString(),
    outputRootBytes: await sizePathBytes(config.roots.output.namespaceRoot),
    resourceRootBytes: await sizePathBytes(paths.resourceRoot),
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    topLevel: {
      appResourcesBytes: await sizePathBytes(join(appResourcesRoot, "app")),
      electronFrameworksBytes: await sizePathBytes(electronFrameworksRoot),
      resourcesBytes: await sizePathBytes(appResourcesRoot),
    },
    tracked: {
      appNodeModulesBytes: await sizePathBytes(appNodeModulesRoot),
      betterSqlite3Bytes: await sizePathBytes(join(appNodeModulesRoot, "better-sqlite3")),
      betterSqlite3SourceResidueBytes: await sizePathBytes(paths.appPath, {
        includeFile: isBetterSqlite3SourceResidue,
      }),
      bundledNodeBytes: await sizePathBytes(join(paths.resourceRoot, "bin", "node")),
      electronLocalesBytes: await sumChildDirectorySizes(electronFrameworkResourcesRoot, (name) => name.endsWith(".lproj")),
      markdownBytes: await sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".md") }),
      nextBytes: await sizePathBytes(join(appNodeModulesRoot, "next")),
      nextSwcBytes: await sumChildDirectorySizes(join(appNodeModulesRoot, "@next"), (name) => name.startsWith("swc-darwin-")),
      sharpLibvipsBytes: await sizePathBytes(join(appNodeModulesRoot, "@img", `sharp-libvips-darwin-${darwinArch}`)),
      sourcemapBytes: await sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".map") }),
      tsbuildInfoBytes: await sizePathBytes(paths.appPath, { includeFile: (path) => path.endsWith(".tsbuildinfo") }),
      webCopiedStandaloneBytes: await sizePathBytes(join(appResourcesRoot, WEB_STANDALONE_RESOURCE_NAME)),
      webNextCacheBytes: await sizePathBytes(join(appNodeModulesRoot, "@open-design", "web", ".next", "cache")),
      webPackageBytes: await sizePathBytes(join(appNodeModulesRoot, "@open-design", "web")),
      webPackageStandaloneBytes: await sizePathBytes(join(appNodeModulesRoot, "@open-design", "web", ".next", "standalone")),
    },
    zipBytes: artifacts.zipPath == null ? null : await sizeExistingFileBytes(artifacts.zipPath),
  };
}

export async function packMac(config: ToolPackConfig): Promise<MacPackResult> {
  const paths = resolveMacPaths(config);
  const targets = resolveElectronBuilderTargets(config.to as MacBuildOutput);
  await buildWorkspaceArtifacts(config);
  await copyResourceTree(config, paths);
  const tarballs = await collectWorkspaceTarballs(config, paths);
  await writeAssembledApp(config, paths, tarballs);
  await runElectronBuilder(config, paths, targets);
  await clearQuarantine(paths.appPath);
  const artifacts = await finalizeMacArtifacts(config, paths);
  const sizeReport = await collectMacSizeReport(config, paths, artifacts, targets);

  return {
    appPath: paths.appPath,
    dmgPath: artifacts.dmgPath,
    latestMacYmlPath: artifacts.latestMacYmlPath,
    outputRoot: config.roots.output.namespaceRoot,
    resourceRoot: paths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    sizeReport,
    to: config.to,
    zipPath: artifacts.zipPath,
  };
}

function desktopStamp(config: ToolPackConfig): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: config.namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace: config.namespace,
    source: SIDECAR_SOURCES.TOOLS_PACK,
  };
}

function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

function desktopIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isDesktopRootIdentityMarker(value: unknown): value is DesktopRootIdentityMarker {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.pid === "number" &&
    typeof value.ppid === "number" &&
    typeof value.appPath === "string" &&
    typeof value.executablePath === "string" &&
    typeof value.logPath === "string" &&
    typeof value.namespaceRoot === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.updatedAt === "string" &&
    isRecord(value.stamp)
  );
}

function summarizeDesktopMarker(
  marker: DesktopRootIdentityMarker | null,
): Partial<DesktopRootIdentityMarker> | undefined {
  if (marker == null) return undefined;
  return {
    appPath: marker.appPath,
    executablePath: marker.executablePath,
    logPath: marker.logPath,
    namespaceRoot: marker.namespaceRoot,
    pid: marker.pid,
    ppid: marker.ppid,
    stamp: marker.stamp,
    startedAt: marker.startedAt,
    updatedAt: marker.updatedAt,
    version: marker.version,
  };
}

async function readDesktopRootIdentityMarker(config: ToolPackConfig): Promise<{
  fallback: DesktopRootIdentityFallback;
  marker: DesktopRootIdentityMarker | null;
}> {
  const markerPath = desktopIdentityPath(config);
  let payload: unknown;

  try {
    payload = JSON.parse(await readFile(markerPath, "utf8"));
  } catch (error) {
    const code = typeof error === "object" && error != null && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;
    return {
      fallback: {
        markerPath,
        reason: code === "ENOENT" ? "marker-not-found" : "marker-read-failed",
      },
      marker: null,
    };
  }

  if (!isDesktopRootIdentityMarker(payload)) {
    return {
      fallback: {
        markerPath,
        reason: "marker-invalid-shape",
      },
      marker: null,
    };
  }

  return {
    fallback: {
      marker: summarizeDesktopMarker(payload),
      markerPath,
      reason: "marker-present",
    },
    marker: payload,
  };
}

function commandMatchesDesktopMarker(
  command: string,
  marker: DesktopRootIdentityMarker,
): boolean {
  return command.includes(marker.executablePath) || command.includes(macAppExecutablePath(marker.appPath));
}

async function resolveDesktopRootIdentityFallback(config: ToolPackConfig): Promise<{
  fallback: DesktopRootIdentityFallback;
  rootPid: number | null;
}> {
  const { fallback, marker } = await readDesktopRootIdentityMarker(config);
  if (marker == null) return { fallback, rootPid: null };

  let stamp: SidecarStamp;
  try {
    stamp = OPEN_DESIGN_SIDECAR_CONTRACT.normalizeStamp(marker.stamp);
  } catch {
    return {
      fallback: { ...fallback, reason: "marker-invalid-stamp" },
      rootPid: null,
    };
  }

  const expectedIpc = resolveAppIpcPath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: config.namespace,
  });
  if (
    stamp.app !== APP_KEYS.DESKTOP ||
    stamp.mode !== SIDECAR_MODES.RUNTIME ||
    stamp.namespace !== config.namespace ||
    stamp.ipc !== expectedIpc ||
    (stamp.source !== SIDECAR_SOURCES.PACKAGED && stamp.source !== SIDECAR_SOURCES.TOOLS_PACK)
  ) {
    return {
      fallback: { ...fallback, reason: "marker-stamp-mismatch" },
      rootPid: null,
    };
  }

  if (marker.namespaceRoot !== config.roots.runtime.namespaceRoot) {
    return {
      fallback: { ...fallback, reason: "marker-namespace-root-mismatch" },
      rootPid: null,
    };
  }

  const processes = await listProcessSnapshots();
  const processInfo = processes.find((entry) => entry.pid === marker.pid) ?? null;
  if (processInfo == null) {
    return {
      fallback: { ...fallback, reason: "marker-pid-not-running" },
      rootPid: null,
    };
  }

  if (!commandMatchesDesktopMarker(processInfo.command, marker)) {
    return {
      fallback: {
        ...fallback,
        processCommand: processInfo.command,
        reason: "marker-command-mismatch",
      },
      rootPid: null,
    };
  }

  return {
    fallback: {
      ...fallback,
      processCommand: processInfo.command,
      reason: "marker-matched",
    },
    rootPid: marker.pid,
  };
}

function isUnmanagedDesktopFallback(fallback: DesktopRootIdentityFallback | undefined): boolean {
  return fallback != null && ![
    "marker-matched",
    "marker-not-found",
    "marker-pid-not-running",
  ].includes(fallback.reason);
}

async function waitForDesktopStatus(config: ToolPackConfig, timeoutMs = 45_000): Promise<DesktopStatusSnapshot | null> {
  const stamp = desktopStamp(config);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await requestJsonIpc<DesktopStatusSnapshot>(stamp.ipc, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 1000 });
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    }
  }
  return null;
}

async function resolvePackedMacStartTarget(config: ToolPackConfig): Promise<{
  appPath: string;
  executablePath: string;
  source: MacStartSource;
}> {
  const paths = resolveMacPaths(config);
  const candidates: Array<{ appPath: string; source: MacStartSource }> = [
    { appPath: paths.installedAppPath, source: "installed" },
    { appPath: paths.userApplicationsAppPath, source: "user-applications" },
    { appPath: paths.systemApplicationsAppPath, source: "system-applications" },
    { appPath: paths.appPath, source: "built" },
  ];

  for (const candidate of candidates) {
    const executablePath = macAppExecutablePath(candidate.appPath);
    if (await pathExists(executablePath)) {
      return { ...candidate, executablePath };
    }
  }

  throw new Error(
    `no mac .app executable found for namespace=${config.namespace}; run tools-pack mac build --to all and tools-pack mac install first`,
  );
}

async function detachMount(mountPoint: string): Promise<boolean> {
  try {
    await execFileAsync("hdiutil", ["detach", mountPoint, "-quiet"]);
    return true;
  } catch {
    try {
      await execFileAsync("hdiutil", ["detach", mountPoint, "-force", "-quiet"]);
      return true;
    } catch {
      return false;
    }
  }
}

export async function installPackedMacDmg(config: ToolPackConfig): Promise<MacInstallResult> {
  const paths = resolveMacPaths(config);
  if (!(await pathExists(paths.dmgPath))) {
    throw new Error(`no mac dmg found at ${paths.dmgPath}; run tools-pack mac build --to all first`);
  }

  await rm(paths.mountPoint, { force: true, recursive: true });
  await mkdir(paths.mountPoint, { recursive: true });
  await rm(paths.installedAppPath, { force: true, recursive: true });
  await mkdir(paths.installApplicationsRoot, { recursive: true });

  let detached = false;
  try {
    await execFileAsync("hdiutil", [
      "attach",
      paths.dmgPath,
      "-mountpoint",
      paths.mountPoint,
      "-nobrowse",
      "-quiet",
    ]);
    await execFileAsync("ditto", [join(paths.mountPoint, `${PRODUCT_NAME}.app`), paths.installedAppPath]);
    await clearQuarantine(paths.installedAppPath);
  } finally {
    detached = await detachMount(paths.mountPoint);
  }

  return {
    detached,
    dmgPath: paths.dmgPath,
    installedAppPath: paths.installedAppPath,
    mountPoint: paths.mountPoint,
    namespace: config.namespace,
  };
}

export async function startPackedMacApp(config: ToolPackConfig): Promise<MacStartResult> {
  const target = await resolvePackedMacStartTarget(config);
  const stamp = desktopStamp(config);
  const logPath = desktopLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  const spawned = await spawnBackgroundProcess({
    args: createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT),
    command: target.executablePath,
    cwd: target.appPath,
    env: createSidecarLaunchEnv({
      base: join(config.roots.runtime.namespaceRoot, "runtime"),
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      extraEnv: {
        ...process.env,
        [DESKTOP_LOG_ECHO_ENV]: "0",
      },
      stamp,
    }),
    logFd: null,
  });
  const status = await waitForDesktopStatus(config);
  return {
    appPath: target.appPath,
    executablePath: target.executablePath,
    logPath,
    namespace: config.namespace,
    pid: spawned.pid,
    source: target.source,
    status,
  };
}

async function findManagedDesktopProcessTree(config: ToolPackConfig): Promise<{
  fallback?: DesktopRootIdentityFallback;
  pids: number[];
}> {
  const processes = await listProcessSnapshots();
  const stampedRootPids = processes
    .filter((processInfo) =>
      matchesStampedProcess(processInfo, {
        mode: SIDECAR_MODES.RUNTIME,
        namespace: config.namespace,
        source: SIDECAR_SOURCES.TOOLS_PACK,
      }, OPEN_DESIGN_SIDECAR_CONTRACT),
    )
    .map((processInfo) => processInfo.pid);
  const identity = await resolveDesktopRootIdentityFallback(config);
  const pids = collectProcessTreePids(processes, [
    ...stampedRootPids,
    identity.rootPid,
  ]);
  return { fallback: identity.fallback, pids };
}

async function waitForNoManagedDesktopProcesses(
  config: ToolPackConfig,
  timeoutMs = 6000,
): Promise<{ fallback?: DesktopRootIdentityFallback; pids: number[] }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await findManagedDesktopProcessTree(config);
    if (current.pids.length === 0) return current;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  return await findManagedDesktopProcessTree(config);
}

export async function stopPackedMacApp(config: ToolPackConfig): Promise<MacStopResult> {
  const stamp = desktopStamp(config);
  const before = await findManagedDesktopProcessTree(config);
  let gracefulRequested = false;

  try {
    await requestJsonIpc(stamp.ipc, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1500 });
    gracefulRequested = true;
  } catch {
    gracefulRequested = false;
  }

  const remainingAfterGraceful = gracefulRequested ? await waitForNoManagedDesktopProcesses(config) : before;
  if (remainingAfterGraceful.pids.length === 0) {
    const unmanaged = !gracefulRequested && before.pids.length === 0 && isUnmanagedDesktopFallback(before.fallback);
    if (!unmanaged) {
      await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
    }
    return {
      ...(before.fallback == null ? {} : { fallback: before.fallback }),
      gracefulRequested,
      namespace: config.namespace,
      remainingPids: [],
      status: unmanaged ? "unmanaged" : before.pids.length === 0 ? "not-running" : "stopped",
      stoppedPids: before.pids,
    };
  }

  const stopped = await stopProcesses(remainingAfterGraceful.pids);
  if (stopped.remainingPids.length === 0) {
    await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  }
  return {
    ...(remainingAfterGraceful.fallback == null ? {} : { fallback: remainingAfterGraceful.fallback }),
    gracefulRequested,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length === 0 ? "stopped" : "partial",
    stoppedPids: stopped.stoppedPids,
  };
}

export async function readPackedMacLogs(config: ToolPackConfig) {
  const entries = await Promise.all(
    [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON].map(async (app) => {
      const logPath = join(config.roots.runtime.namespaceRoot, "logs", app, "latest.log");
      return [app, { lines: await readLogTail(logPath, 200), logPath }] as const;
    }),
  );

  return {
    logs: Object.fromEntries(entries),
    namespace: config.namespace,
  };
}

export async function uninstallPackedMacApp(config: ToolPackConfig): Promise<MacUninstallResult> {
  const paths = resolveMacPaths(config);
  const stop = await stopPackedMacApp(config);
  const removed = await pathExists(paths.installedAppPath);
  await rm(paths.installedAppPath, { force: true, recursive: true });

  return {
    installedAppPath: paths.installedAppPath,
    namespace: config.namespace,
    removed,
    stop,
  };
}

export async function cleanupPackedMacNamespace(config: ToolPackConfig): Promise<MacCleanupResult> {
  const paths = resolveMacPaths(config);
  const stop = await stopPackedMacApp(config);
  const detachedMount = await detachMount(paths.mountPoint);
  const removedOutputRoot = await pathExists(config.roots.output.namespaceRoot);
  const removedRuntimeNamespaceRoot = await pathExists(config.roots.runtime.namespaceRoot);

  await rm(config.roots.output.namespaceRoot, { force: true, recursive: true });
  await rm(config.roots.runtime.namespaceRoot, { force: true, recursive: true });

  return {
    detachedMount,
    namespace: config.namespace,
    outputRoot: config.roots.output.namespaceRoot,
    removedOutputRoot,
    removedRuntimeNamespaceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    stop,
  };
}
