import { execFile } from "node:child_process";
import { access, chmod, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
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

import type { ToolPackConfig } from "./config.js";
import { linuxResources } from "./resources.js";

const execFileAsync = promisify(execFile);

const PRODUCT_NAME = "Open Design";
const APP_IMAGE_PRODUCT_NAME = "Open-Design";

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

export function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

type DockerUserMapping = {
  uid: number;
  gid: number;
};

export function buildDockerArgs(
  config: ToolPackConfig,
  user: DockerUserMapping,
): string[] {
  const dockerHome = join(config.roots.toolPackRoot, ".docker-home");
  const electronCache = join(config.roots.toolPackRoot, ".docker-cache", "electron");
  const electronBuilderCache = join(config.roots.toolPackRoot, ".docker-cache", "electron-builder");

  const innerCommand =
    "corepack enable && pnpm install --frozen-lockfile && " +
    `pnpm tools-pack linux build --to ${config.to} --namespace ${config.namespace}`;

  return [
    "run",
    "--rm",
    "--user",
    `${user.uid}:${user.gid}`,
    "-v",
    `${config.workspaceRoot}:/project`,
    "-v",
    `${dockerHome}:/home/builder`,
    "-v",
    `${electronCache}:/home/builder/.cache/electron`,
    "-v",
    `${electronBuilderCache}:/home/builder/.cache/electron-builder`,
    "-e",
    "HOME=/home/builder",
    "-e",
    "ELECTRON_CACHE=/home/builder/.cache/electron",
    "-e",
    "ELECTRON_BUILDER_CACHE=/home/builder/.cache/electron-builder",
    "-w",
    "/project",
    "electronuserland/builder:base",
    "bash",
    "-lc",
    innerCommand,
  ];
}

export type DesktopTemplateValues = {
  namespace: string;
  execPath: string;
  iconName: string;
};

export function renderDesktopTemplate(template: string, values: DesktopTemplateValues): string {
  return template
    .replace(/@@NAMESPACE@@/g, values.namespace)
    .replace(/@@EXEC_PATH@@/g, values.execPath)
    .replace(/@@ICON_PATH@@/g, values.iconName);
}

export type AppImageProcessSnapshot = {
  pid: number;
  executable: string;
  env: Record<string, string>;
};

export function matchesAppImageProcess(
  snapshot: AppImageProcessSnapshot,
  installPath: string,
): boolean {
  if (snapshot.executable === installPath) return true;
  const isMountedRunner = /^\/tmp\/\.mount_[^/]+\/AppRun$/.test(snapshot.executable);
  if (!isMountedRunner) return false;
  return snapshot.env.APPIMAGE === installPath;
}

// --- Step 1: LinuxPaths type and resolveLinuxPaths ---

type LinuxPaths = {
  appBuilderConfigPath: string;
  appBuilderOutputRoot: string;
  appImagePath: string;
  assembledAppRoot: string;
  assembledMainEntryPath: string;
  assembledPackageJsonPath: string;
  installAppImagePath: string;
  installDesktopFilePath: string;
  installIconPath: string;
  packagedConfigPath: string;
  resourceRoot: string;
  tarballsRoot: string;
};

function appImageInstallName(namespace: string): string {
  return `${APP_IMAGE_PRODUCT_NAME}.${sanitizeNamespace(namespace)}.AppImage`;
}

function desktopFileName(namespace: string): string {
  return `open-design-${sanitizeNamespace(namespace)}.desktop`;
}

function iconFileName(namespace: string): string {
  return `open-design-${sanitizeNamespace(namespace)}.png`;
}

function resolveLinuxPaths(config: ToolPackConfig): LinuxPaths {
  const namespaceRoot = config.roots.output.namespaceRoot;
  const appBuilderOutputRoot = config.roots.output.appBuilderRoot;
  const home = homedir();
  return {
    appBuilderConfigPath: join(namespaceRoot, "builder-config.json"),
    appBuilderOutputRoot,
    appImagePath: "",
    assembledAppRoot: join(namespaceRoot, "assembled", "app"),
    assembledMainEntryPath: join(namespaceRoot, "assembled", "app", "main.cjs"),
    assembledPackageJsonPath: join(namespaceRoot, "assembled", "app", "package.json"),
    installAppImagePath: join(home, ".local", "bin", appImageInstallName(config.namespace)),
    installDesktopFilePath: join(home, ".local", "share", "applications", desktopFileName(config.namespace)),
    installIconPath: join(
      home,
      ".local",
      "share",
      "icons",
      "hicolor",
      "512x512",
      "apps",
      iconFileName(config.namespace),
    ),
    packagedConfigPath: join(namespaceRoot, "open-design-config.json"),
    resourceRoot: join(namespaceRoot, "resources", "open-design"),
    tarballsRoot: join(namespaceRoot, "tarballs"),
  };
}

// --- Step 2: Runtime helpers ---

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

async function buildWorkspaceArtifacts(config: ToolPackConfig): Promise<void> {
  const webNextEnvPath = join(config.workspaceRoot, "apps", "web", "next-env.d.ts");
  const previousWebNextEnv = await readFile(webNextEnvPath, "utf8").catch(() => null);

  await runPnpm(config, ["--filter", "@open-design/sidecar-proto", "build"]);
  await runPnpm(config, ["--filter", "@open-design/sidecar", "build"]);
  await runPnpm(config, ["--filter", "@open-design/platform", "build"]);
  await runPnpm(config, ["--filter", "@open-design/daemon", "build"]);
  try {
    await runPnpm(config, ["--filter", "@open-design/web", "build"], { OD_WEB_OUTPUT_MODE: "server" });
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

// --- Step 3: Tarball + resource helpers ---

type PackedTarballInfo = {
  fileName: string;
  packageName: (typeof INTERNAL_PACKAGES)[number]["name"];
};

async function collectWorkspaceTarballs(
  config: ToolPackConfig,
  paths: LinuxPaths,
): Promise<PackedTarballInfo[]> {
  await rm(paths.tarballsRoot, { force: true, recursive: true });
  await mkdir(paths.tarballsRoot, { recursive: true });
  const packed: PackedTarballInfo[] = [];

  for (const pkg of INTERNAL_PACKAGES) {
    const before = new Set(await readdir(paths.tarballsRoot));
    await runPnpm(config, ["-C", pkg.directory, "pack", "--pack-destination", paths.tarballsRoot]);
    const after = await readdir(paths.tarballsRoot);
    const novel = after.filter((e) => !before.has(e));
    if (novel.length !== 1 || novel[0] == null) {
      throw new Error(`expected one tarball for ${pkg.name}, got ${novel.length}`);
    }
    packed.push({ fileName: novel[0], packageName: pkg.name });
  }
  return packed;
}

async function copyResourceTree(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  await rm(paths.resourceRoot, { force: true, recursive: true });
  await mkdir(paths.resourceRoot, { recursive: true });
  await cp(join(config.workspaceRoot, "skills"), join(paths.resourceRoot, "skills"), { recursive: true });
  await cp(join(config.workspaceRoot, "design-systems"), join(paths.resourceRoot, "design-systems"), { recursive: true });
  await cp(join(config.workspaceRoot, "craft"), join(paths.resourceRoot, "craft"), { recursive: true });
  await cp(join(config.workspaceRoot, "assets", "frames"), join(paths.resourceRoot, "frames"), { recursive: true });
  await mkdir(join(paths.resourceRoot, "bin"), { recursive: true });
  await cp(process.execPath, join(paths.resourceRoot, "bin", "node"));
  await chmod(join(paths.resourceRoot, "bin", "node"), 0o755);
}

// --- Step 4: writeAssembledApp helper ---

async function writeAssembledApp(
  config: ToolPackConfig,
  paths: LinuxPaths,
  packed: PackedTarballInfo[],
): Promise<void> {
  await rm(paths.assembledAppRoot, { force: true, recursive: true });
  await mkdir(paths.assembledAppRoot, { recursive: true });

  const dependencies: Record<string, string> = {};
  for (const tarball of packed) {
    dependencies[tarball.packageName] = `file:${join(paths.tarballsRoot, tarball.fileName)}`;
  }

  const version = await readPackagedVersion(config);
  const packageJson = {
    name: "open-design-packaged",
    version,
    private: true,
    main: "main.cjs",
    dependencies,
  };
  await writeFile(paths.assembledPackageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const mainStub = `"use strict";\nrequire("@open-design/packaged");\n`;
  await writeFile(paths.assembledMainEntryPath, mainStub, "utf8");

  await runNpmInstall(paths.assembledAppRoot);
}

// --- Step 5: writeLinuxBuilderConfig helper ---

async function writeLinuxBuilderConfig(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  const productNameSafe = `${PRODUCT_NAME}`;
  const target = config.to === "dir" ? ["dir"] : ["AppImage"];

  const builderConfig: Record<string, unknown> = {
    appId: "io.nexu.opendesign",
    productName: productNameSafe,
    asar: true,
    directories: {
      app: paths.assembledAppRoot,
      output: paths.appBuilderOutputRoot,
      buildResources: dirname(linuxResources.icon),
    },
    electronVersion: config.electronVersion.replace(/^[^\d]*/, ""),
    electronDist: config.electronDistPath,
    linux: {
      target,
      icon: linuxResources.icon,
      category: "Development",
      synopsis: "Open Design",
      maintainer: "Open Design Contributors",
    },
    appImage: {
      license: undefined,
    },
  };

  if (!config.portable) {
    builderConfig.extraMetadata = {
      ...((builderConfig.extraMetadata as Record<string, unknown>) ?? {}),
      odToolsPackRuntimeRoot: config.roots.runtime.namespaceBaseRoot,
    };
  }

  await writeFile(paths.appBuilderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, "utf8");
}

// --- Step 6: runElectronBuilderLinux + findBuiltAppImage helpers ---

async function runElectronBuilderLinux(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  const args = [
    config.electronBuilderCliPath,
    "--linux",
    "--config",
    paths.appBuilderConfigPath,
    "--projectDir",
    paths.assembledAppRoot,
  ];
  await execFileAsync(process.execPath, args, {
    cwd: config.workspaceRoot,
    env: process.env,
  });
}

async function findBuiltAppImage(paths: LinuxPaths): Promise<string | null> {
  if (!(await pathExists(paths.appBuilderOutputRoot))) return null;
  const entries = await readdir(paths.appBuilderOutputRoot);
  const appImage = entries.find((entry) => entry.endsWith(".AppImage"));
  return appImage ? join(paths.appBuilderOutputRoot, appImage) : null;
}

// --- Step 7: packLinux orchestrator + result type + stub for runBuildInContainer ---

export type LinuxPackResult = {
  appImagePath: string | null;
  outputRoot: string;
  resourceRoot: string;
  runtimeNamespaceRoot: string;
  to: ToolPackConfig["to"];
  containerized: boolean;
};

export async function packLinux(config: ToolPackConfig): Promise<LinuxPackResult> {
  if (config.containerized) {
    await runBuildInContainer(config);
    const paths = resolveLinuxPaths(config);
    const appImagePath = config.to === "dir" ? null : await findBuiltAppImage(paths);
    return {
      appImagePath,
      outputRoot: paths.appBuilderOutputRoot,
      resourceRoot: paths.resourceRoot,
      runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
      to: config.to,
      containerized: true,
    };
  }

  const paths = resolveLinuxPaths(config);
  await mkdir(config.roots.output.namespaceRoot, { recursive: true });
  await buildWorkspaceArtifacts(config);
  await copyResourceTree(config, paths);
  const tarballs = await collectWorkspaceTarballs(config, paths);
  await writeAssembledApp(config, paths, tarballs);
  await writeLinuxBuilderConfig(config, paths);
  await runElectronBuilderLinux(config, paths);

  const appImagePath = config.to === "dir" ? null : await findBuiltAppImage(paths);
  return {
    appImagePath,
    outputRoot: paths.appBuilderOutputRoot,
    resourceRoot: paths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    to: config.to,
    containerized: false,
  };
}

async function runBuildInContainer(_config: ToolPackConfig): Promise<void> {
  throw new Error("runBuildInContainer not yet implemented; see Task 9");
}
