import { execFile, spawn } from "node:child_process";
import { access, chmod, cp, mkdir, open, readFile, readdir, readlink, rename, rm, stat, writeFile } from "node:fs/promises";
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
  readLogTail,
  spawnBackgroundProcess,
  stopProcesses,
} from "@open-design/platform";

import type { ToolPackConfig } from "./config.js";
import { copyBundledResourceTrees, linuxResources } from "./resources.js";

const execFileAsync = promisify(execFile);

const PRODUCT_NAME = "Open Design";
const APP_IMAGE_PRODUCT_NAME = "Open-Design";
const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";

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

  // The tool-pack root is mounted at a fixed container path so the inner build
  // can be told where to write output via `--dir /tools-pack`. Without this
  // mount + flag, the inner build would default to <workspaceRoot>/.tmp/tools-pack
  // and silently ignore the caller's `--dir`, breaking any orchestration (CI,
  // multi-namespace local builds) that pins tools-pack output outside the workspace.
  // The .docker-home and .docker-cache/* mounts below shadow this parent mount at
  // their specific paths under /home/builder, which is the supported overlap pattern.
  //
  // Shell-interpolation safety for the inner `bash -lc` command:
  //   - config.namespace is sanitized at config-time by resolveNamespace() in
  //     @open-design/sidecar-proto (restricted to namespace charset)
  //   - config.to is enum-validated by resolveToolPackBuildOutput() in config.ts
  //     to one of "all" | "appimage" | "dir"
  //   - config.portable is a boolean
  // None of these values can contain shell metacharacters, so direct
  // interpolation into the inner command string is safe.
  //
  // We can't rely on `corepack pnpm` here: although Node 16.10+ ships corepack,
  // the `electronuserland/builder:base` image strips the corepack binary, so
  // the inner `bash -lc` fails with `corepack: command not found`. We also
  // can't `corepack enable` ourselves — the container runs as the host's
  // non-root uid (--user above) and corepack would try to write shims next
  // to the system Node binary, which is owned by root in this image.
  //
  // Use `npx --yes pnpm@<version>` instead: `npx` ships with npm (always
  // present in the image), `--yes` skips the install confirmation, and the
  // package gets cached under `$HOME/.npm/_npx`, which is writable by the
  // unprivileged user. The pinned version matches the `packageManager`
  // field in the root package.json so reproducibility is preserved.
  const PNPM_VERSION = "10.33.2";
  const pnpmCmd = `npx --yes pnpm@${PNPM_VERSION}`;
  const innerArgs = [
    `${pnpmCmd} tools-pack linux build`,
    `--to ${config.to}`,
    `--namespace ${config.namespace}`,
    "--dir /tools-pack",
  ];
  if (config.portable) {
    innerArgs.push("--portable");
  }
  const innerCommand = `${pnpmCmd} install --frozen-lockfile && ` + innerArgs.join(" ");

  return [
    "run",
    "--rm",
    "--user",
    `${user.uid}:${user.gid}`,
    "-v",
    `${config.workspaceRoot}:/project`,
    "-v",
    `${config.roots.toolPackRoot}:/tools-pack`,
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
  // Two AppImage launch modes leave different executable paths in /proc/<pid>/exe:
  //   FUSE-mounted: /tmp/.mount_<hex>/AppRun
  //   --appimage-extract-and-run: /tmp/appimage_extracted_<hex>/<binary>
  // In both cases the AppImage runtime sets $APPIMAGE to the original install path.
  const isMountedRunner = /^\/tmp\/\.mount_[^/]+\/AppRun$/.test(snapshot.executable);
  const isExtractedRunner = /^\/tmp\/appimage_extracted_[^/]+\/[^/]+$/.test(snapshot.executable);
  if (!isMountedRunner && !isExtractedRunner) return false;
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

  await runPnpm(config, ["--filter", "@open-design/contracts", "build"]);
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
  await copyBundledResourceTrees({
    workspaceRoot: config.workspaceRoot,
    resourceRoot: paths.resourceRoot,
  });
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

  await writeFile(
    paths.packagedConfigPath,
    `${JSON.stringify(
      {
        appVersion: version,
        namespace: config.namespace,
        nodeCommandRelative: "open-design/bin/node",
        ...(config.portable ? {} : { namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot }),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await runNpmInstall(paths.assembledAppRoot);
}

// --- Step 5: writeLinuxBuilderConfig helper ---

async function writeLinuxBuilderConfig(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  const target = config.to === "dir" ? ["dir"] : ["AppImage"];
  const namespaceToken = sanitizeNamespace(config.namespace);
  const packagedVersion = await readPackagedVersion(config);

  const builderConfig: Record<string, unknown> = {
    appId: "io.open-design.desktop",
    artifactName: `${PRODUCT_NAME}-${namespaceToken}.\${ext}`,
    asar: false,
    buildDependenciesFromSource: false,
    compression: "maximum",
    directories: {
      app: paths.assembledAppRoot,
      output: paths.appBuilderOutputRoot,
      buildResources: dirname(linuxResources.icon),
    },
    electronVersion: config.electronVersion.replace(/^[^\d]*/, ""),
    electronDist: config.electronDistPath,
    executableName: PRODUCT_NAME,
    extraMetadata: {
      main: "./main.cjs",
      name: "open-design-packaged-app",
      productName: PRODUCT_NAME,
      version: packagedVersion,
      ...(config.portable ? {} : { odToolsPackRuntimeRoot: config.roots.runtime.namespaceBaseRoot }),
    },
    extraResources: [
      { from: paths.resourceRoot, to: "open-design" },
      { from: paths.packagedConfigPath, to: "open-design-config.json" },
    ],
    files: ["**/*", "!**/node_modules/.bin", "!**/node_modules/electron{,/**/*}"],
    icon: linuxResources.icon,
    linux: {
      target,
      icon: linuxResources.icon,
      category: "Development",
      synopsis: "Open Design",
      maintainer: "Open Design Contributors",
    },
    nodeGypRebuild: false,
    npmRebuild: false,
    productName: PRODUCT_NAME,
  };

  await mkdir(dirname(paths.appBuilderConfigPath), { recursive: true });
  await writeFile(paths.appBuilderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, "utf8");
}

// --- Step 6: runElectronBuilderLinux + findBuiltAppImage helpers ---

async function runElectronBuilderLinux(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  await rm(paths.appBuilderOutputRoot, { force: true, recursive: true });
  const args = [
    config.electronBuilderCliPath,
    "--linux",
    "--config",
    paths.appBuilderConfigPath,
    "--projectDir",
    paths.assembledAppRoot,
    "--publish",
    "never",
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

async function assertDockerAvailable(): Promise<void> {
  if (!(await commandExists("docker"))) {
    throw new Error(
      "tools-pack linux build --containerized requires Docker. Install Docker or omit --containerized for a native build.",
    );
  }
}

async function runBuildInContainer(config: ToolPackConfig): Promise<void> {
  await assertDockerAvailable();

  await mkdir(join(config.roots.toolPackRoot, ".docker-home"), { recursive: true });
  await mkdir(join(config.roots.toolPackRoot, ".docker-cache", "electron"), { recursive: true });
  await mkdir(join(config.roots.toolPackRoot, ".docker-cache", "electron-builder"), { recursive: true });

  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  const gid = typeof process.getgid === "function" ? process.getgid() : 0;
  const args = buildDockerArgs(config, { uid, gid });

  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: "inherit", env: process.env });
    // In Node's child-process `exit` event, code === null means the child was
    // terminated by a signal (SIGTERM, SIGKILL, etc.). A signal-terminated
    // build is NOT a successful build — the AppImage may be missing or partial,
    // so we surface it as a failure instead of resolving silently.
    child.on("exit", (code, signal) => {
      if (code === 0 && signal == null) {
        resolve();
        return;
      }
      if (signal != null) {
        reject(new Error(`docker build was terminated by signal ${signal}`));
        return;
      }
      reject(new Error(`docker build exited with code ${code}`));
    });
    child.on("error", (error: Error) => {
      reject(error);
    });
  });
}

export type LinuxInstallResult = {
  appImagePath: string;
  desktopFilePath: string;
  iconPath: string;
  namespace: string;
  postInstall: {
    desktopDatabase: "ok" | "missing" | "failed";
    iconCache: "ok" | "missing" | "failed";
  };
};

async function bestEffortRun(bin: string, args: string[]): Promise<"ok" | "missing" | "failed"> {
  if (!(await commandExists(bin))) return "missing";
  try {
    await execFileAsync(bin, args);
    return "ok";
  } catch {
    return "failed";
  }
}

export async function installPackedLinuxApp(config: ToolPackConfig): Promise<LinuxInstallResult> {
  const paths = resolveLinuxPaths(config);
  const builtAppImage = await findBuiltAppImage(paths);
  if (builtAppImage == null) {
    throw new Error("no AppImage found in builder output; run `tools-pack linux build` first");
  }

  await mkdir(dirname(paths.installAppImagePath), { recursive: true });
  await mkdir(dirname(paths.installDesktopFilePath), { recursive: true });
  await mkdir(dirname(paths.installIconPath), { recursive: true });

  // Copy AppImage with executable bit.
  await cp(builtAppImage, paths.installAppImagePath);
  await chmod(paths.installAppImagePath, 0o755);

  // Copy icon.
  await cp(linuxResources.icon, paths.installIconPath);

  // Render and atomic-write the .desktop file.
  const template = await readFile(linuxResources.desktopTemplate, "utf8");
  const rendered = renderDesktopTemplate(template, {
    namespace: sanitizeNamespace(config.namespace),
    execPath: paths.installAppImagePath,
    iconName: `open-design-${sanitizeNamespace(config.namespace)}`,
  });
  const tmpDesktopPath = `${paths.installDesktopFilePath}.tmp`;
  await writeFile(tmpDesktopPath, rendered, "utf8");
  await rename(tmpDesktopPath, paths.installDesktopFilePath);

  // Best-effort post-install hooks.
  const desktopDatabase = await bestEffortRun("update-desktop-database", [
    join(homedir(), ".local", "share", "applications"),
  ]);
  const iconCache = await bestEffortRun("gtk-update-icon-cache", [
    join(homedir(), ".local", "share", "icons", "hicolor"),
  ]);

  return {
    appImagePath: paths.installAppImagePath,
    desktopFilePath: paths.installDesktopFilePath,
    iconPath: paths.installIconPath,
    namespace: config.namespace,
    postInstall: { desktopDatabase, iconCache },
  };
}

type LinuxStartSource = "built" | "installed";

export type LinuxStartResult = {
  appImagePath: string;
  executablePath: string;
  logPath: string;
  namespace: string;
  pid: number;
  source: LinuxStartSource;
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

export type LinuxStopResult = {
  fallback?: DesktopRootIdentityFallback;
  gracefulRequested: boolean;
  namespace: string;
  remainingPids: number[];
  status: "not-running" | "partial" | "stopped" | "unmanaged";
  stoppedPids: number[];
};

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

async function readDesktopRootIdentityMarker(config: ToolPackConfig): Promise<{
  fallback: DesktopRootIdentityFallback;
  marker: DesktopRootIdentityMarker | null;
}> {
  const markerPath = desktopIdentityPath(config);
  let payload: unknown;
  try {
    payload = JSON.parse(await readFile(markerPath, "utf8"));
  } catch (error) {
    const code = isRecord(error) && "code" in error ? String(error.code) : null;
    return {
      fallback: { markerPath, reason: code === "ENOENT" ? "marker-not-found" : "marker-read-failed" },
      marker: null,
    };
  }
  if (!isDesktopRootIdentityMarker(payload)) {
    return { fallback: { markerPath, reason: "marker-invalid-shape" }, marker: null };
  }
  return {
    fallback: { marker: payload, markerPath, reason: "marker-present" },
    marker: payload,
  };
}

async function readProcessEnv(pid: number): Promise<Record<string, string>> {
  try {
    const raw = await readFile(`/proc/${pid}/environ`, "utf8");
    const result: Record<string, string> = {};
    for (const entry of raw.split("\0")) {
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      result[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
    return result;
  } catch {
    return {};
  }
}

async function readProcessExe(pid: number): Promise<string> {
  try {
    return await readlink(`/proc/${pid}/exe`);
  } catch {
    return "";
  }
}

function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

function desktopIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
}

function linuxDesktopStamp(config: ToolPackConfig): SidecarStamp {
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

async function waitForMarker(markerPath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pathExists(markerPath)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function fetchDesktopStatus(config: ToolPackConfig): Promise<DesktopStatusSnapshot | null> {
  try {
    const ipc = resolveAppIpcPath({
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: config.namespace,
      app: APP_KEYS.DESKTOP,
    });
    const reply = await requestJsonIpc(ipc, { type: SIDECAR_MESSAGES.STATUS });
    if (reply == null || typeof reply !== "object") return null;
    return reply as DesktopStatusSnapshot;
  } catch {
    return null;
  }
}

export async function startPackedLinuxApp(config: ToolPackConfig): Promise<LinuxStartResult> {
  const paths = resolveLinuxPaths(config);
  const installed = await pathExists(paths.installAppImagePath);
  const built = !installed ? await findBuiltAppImage(paths) : null;
  const appImagePath = installed ? paths.installAppImagePath : built;
  const source: LinuxStartSource = installed ? "installed" : "built";

  if (appImagePath == null) {
    throw new Error("no AppImage found; run `tools-pack linux build` and/or `linux install` first");
  }

  const logPath = desktopLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  // Remove any stale desktop-root.json from a previous run that didn't stop
  // cleanly (SIGKILL, OOM, crash). Otherwise waitForMarker below would return
  // instantly on the stale file instead of waiting for the new spawn's marker.
  await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);

  const stamp = linuxDesktopStamp(config);

  // --appimage-extract-and-run bypasses FUSE-mounted SquashFS, which is too slow
  // for daemon startup on first launch (smoke testing showed startup exceeded the
  // packaged sidecar's 35-second timeout when running from FUSE).
  const args = ["--appimage-extract-and-run", ...createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT)];

  const child = await spawnBackgroundProcess({
    args,
    command: appImagePath,
    cwd: dirname(appImagePath),
    env: createSidecarLaunchEnv({
      base: join(config.roots.runtime.namespaceRoot, "runtime"),
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      extraEnv: { ...process.env, [DESKTOP_LOG_ECHO_ENV]: "0" },
      stamp,
    }),
    logFd: null,
  });

  // 60s ceiling: AppImage --appimage-extract-and-run unpacks ~200MB to /tmp on
  // first launch before exec'ing the inner electron, which adds substantial
  // overhead vs mac's direct .app launch.
  //
  // If the readiness wait or the post-ready status fetch throws, the detached
  // child we just spawned is still running but unidentifiable to a future
  // `linux stop` (the marker is the only persistent identity source). Tear it
  // down via the same process-tree path stopPackedLinuxApp uses, then rethrow
  // so the failure surfaces to the caller. Any cleanup error is suppressed --
  // we want the original failure preserved in the rejection.
  const markerPath = desktopIdentityPath(config);
  let status: DesktopStatusSnapshot | null;
  try {
    const ready = await waitForMarker(markerPath, 60_000);
    if (!ready) {
      throw new Error(`desktop-root.json not written within 60s at ${markerPath}`);
    }
    status = await fetchDesktopStatus(config);
  } catch (error) {
    await teardownOrphanedStart(child.pid).catch(() => undefined);
    throw error;
  }

  return {
    appImagePath,
    executablePath: appImagePath,
    logPath,
    namespace: config.namespace,
    pid: child.pid,
    source,
    status,
  };
}

async function teardownOrphanedStart(rootPid: number): Promise<void> {
  const snapshots = await listProcessSnapshots();
  const treePids = collectProcessTreePids(snapshots, [rootPid]);
  await stopProcesses(treePids);
}

export async function stopPackedLinuxApp(config: ToolPackConfig): Promise<LinuxStopResult> {
  const paths = resolveLinuxPaths(config);
  const { fallback, marker } = await readDesktopRootIdentityMarker(config);

  if (marker == null) {
    return {
      fallback,
      gracefulRequested: false,
      namespace: config.namespace,
      remainingPids: [],
      status: "not-running",
      stoppedPids: [],
    };
  }

  // Validate the marker still represents a live, owned process.
  const snapshots = await listProcessSnapshots();
  const candidate = snapshots.find((s) => s.pid === marker.pid);
  if (candidate == null) {
    return {
      fallback: { ...fallback, reason: "marker-pid-not-running" },
      gracefulRequested: false,
      namespace: config.namespace,
      remainingPids: [],
      status: "not-running",
      stoppedPids: [],
    };
  }

  // Validate the marker stamp (file content written by apps/packaged itself)
  // rather than the process command line. Menu launches via the .desktop
  // entry don't pass createProcessStampArgs to the AppImage -- they only set
  // OD_PACKAGED_NAMESPACE -- so apps/packaged falls back to a SIDECAR_SOURCES.PACKAGED
  // stamp. Validating the process command would reject those legitimate
  // launches as `unmanaged`, which on uninstall would also remove the
  // AppImage/desktop/icon files out from under the still-running app.
  // Accept either TOOLS_PACK (CLI start) or PACKAGED (menu launch). Mirrors
  // the dual-source acceptance pattern in mac.ts:709-714.
  const expectedIpc = resolveAppIpcPath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: config.namespace,
  });
  const stampOk =
    marker.stamp.app === APP_KEYS.DESKTOP &&
    marker.stamp.mode === SIDECAR_MODES.RUNTIME &&
    marker.stamp.namespace === config.namespace &&
    marker.stamp.ipc === expectedIpc &&
    (marker.stamp.source === SIDECAR_SOURCES.TOOLS_PACK ||
      marker.stamp.source === SIDECAR_SOURCES.PACKAGED);
  const exePath = await readProcessExe(marker.pid);
  const env = await readProcessEnv(marker.pid);
  // marker.appPath is unreliable on Linux (apps/packaged writes "/"). Use the
  // canonical install path we know about, falling back to the built AppImage
  // for not-yet-installed builds.
  const candidateAppImagePath =
    (await pathExists(paths.installAppImagePath)) ? paths.installAppImagePath : await findBuiltAppImage(paths);
  const cmdOk = candidateAppImagePath != null && matchesAppImageProcess(
    { pid: marker.pid, executable: exePath, env },
    candidateAppImagePath,
  );

  if (!stampOk || !cmdOk || marker.namespaceRoot !== config.roots.runtime.namespaceRoot) {
    return {
      fallback: {
        ...fallback,
        marker: { pid: marker.pid, stamp: marker.stamp },
        processCommand: candidate.command,
        reason: "marker-validation-failed",
      },
      gracefulRequested: false,
      namespace: config.namespace,
      remainingPids: [marker.pid],
      status: "unmanaged",
      stoppedPids: [],
    };
  }

  // Try graceful shutdown via IPC first. mac.ts's pattern: best-effort SHUTDOWN
  // request with a short timeout so Electron renderers + sidecars get a chance
  // to flush state (SQLite WAL, logs) before SIGTERM.
  let gracefulRequested = false;
  try {
    await requestJsonIpc(marker.stamp.ipc, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1500 });
    gracefulRequested = true;
  } catch {
    gracefulRequested = false;
  }

  // Gather process tree, then SIGTERM -> SIGKILL via stopProcesses.
  const treePids = collectProcessTreePids(snapshots, [marker.pid]);
  const result = await stopProcesses(treePids);

  // Remove the marker on a clean stop so the next start has a fresh slate.
  if (result.remainingPids.length === 0) {
    await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  }

  return {
    gracefulRequested,
    namespace: config.namespace,
    remainingPids: result.remainingPids,
    status: result.remainingPids.length === 0 ? "stopped" : "partial",
    stoppedPids: result.stoppedPids,
  };
}

export async function readPackedLinuxLogs(config: ToolPackConfig): Promise<{
  logs: Record<string, { lines: string[]; logPath: string }>;
  namespace: string;
}> {
  const logsRoot = join(config.roots.runtime.namespaceRoot, "logs");
  const apps = [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON] as const;
  const logs: Record<string, { lines: string[]; logPath: string }> = {};
  for (const app of apps) {
    const logPath = join(logsRoot, app, "latest.log");
    const lines = (await pathExists(logPath)) ? await readLogTail(logPath, 200) : [];
    logs[app] = { lines, logPath };
  }
  return { logs, namespace: config.namespace };
}

export type LinuxUninstallResult = {
  namespace: string;
  removed: {
    appImage: "ok" | "already-removed" | "skipped-process-running";
    desktop: "ok" | "already-removed" | "skipped-process-running";
    icon: "ok" | "already-removed" | "skipped-process-running";
  };
  stop: LinuxStopResult;
  postUninstall: {
    desktopDatabase: "ok" | "missing" | "failed" | "skipped";
    iconCache: "ok" | "missing" | "failed" | "skipped";
  };
};

async function tryRemove(path: string): Promise<"ok" | "already-removed"> {
  if (!(await pathExists(path))) return "already-removed";
  await rm(path, { force: true });
  return "ok";
}

// "stopped" means we just brought the process tree down cleanly.
// "not-running" means there was nothing to stop in the first place.
// Either state makes it safe to delete install files. "partial" means
// remainingPids is non-empty (SIGTERM->SIGKILL didn't take everyone), and
// "unmanaged" means the marker pointed at a process we couldn't validate as
// ours -- in both cases something is still using the AppImage's mounted or
// extracted contents, so destructive removal would leave broken file handles
// and an orphan with stale state.
function isSafeToRemoveInstallFiles(stop: LinuxStopResult): boolean {
  return stop.status === "stopped" || stop.status === "not-running";
}

export async function uninstallPackedLinuxApp(config: ToolPackConfig): Promise<LinuxUninstallResult> {
  const paths = resolveLinuxPaths(config);
  const stop = await stopPackedLinuxApp(config);

  if (!isSafeToRemoveInstallFiles(stop)) {
    return {
      namespace: config.namespace,
      removed: {
        appImage: "skipped-process-running",
        desktop: "skipped-process-running",
        icon: "skipped-process-running",
      },
      stop,
      postUninstall: { desktopDatabase: "skipped", iconCache: "skipped" },
    };
  }

  const removedAppImage = await tryRemove(paths.installAppImagePath);
  const removedDesktop = await tryRemove(paths.installDesktopFilePath);
  const removedIcon = await tryRemove(paths.installIconPath);

  const desktopDatabase = await bestEffortRun("update-desktop-database", [
    join(homedir(), ".local", "share", "applications"),
  ]);
  const iconCache = await bestEffortRun("gtk-update-icon-cache", [
    join(homedir(), ".local", "share", "icons", "hicolor"),
  ]);

  return {
    namespace: config.namespace,
    removed: { appImage: removedAppImage, desktop: removedDesktop, icon: removedIcon },
    stop,
    postUninstall: { desktopDatabase, iconCache },
  };
}

export type LinuxCleanupResult = {
  namespace: string;
  outputRoot: string;
  removedOutputRoot: boolean;
  removedRuntimeNamespaceRoot: boolean;
  runtimeNamespaceRoot: string;
  // True when stopPackedLinuxApp returned "partial" or "unmanaged" -- the
  // output and runtime namespace roots may contain files held open by a
  // surviving process tree, so we leave them in place rather than yanking
  // SQLite WAL files / log handles / IPC sockets out from under it.
  // Both removed* flags will be false in this case.
  skipped: boolean;
  stop: LinuxStopResult;
};

// --- Headless lifecycle ---

// Paths resolved relative to the assembled app written during `tools-pack linux build`.
// The headless entry lives at:
//   <assembledAppRoot>/node_modules/@open-design/packaged/dist/headless.mjs
// The bundled Node binary lives at:
//   <namespaceRoot>/resources/open-design/bin/node  (populated by copyResourceTree)

function resolveHeadlessEntryPath(paths: LinuxPaths): string {
  return join(paths.assembledAppRoot, "node_modules", "@open-design", "packaged", "dist", "headless.mjs");
}

function resolveHeadlessBundledNodePath(paths: LinuxPaths): string {
  return join(paths.resourceRoot, "bin", "node");
}

function headlessLauncherPath(config: ToolPackConfig): string {
  return join(homedir(), ".local", "bin", `open-design-headless-${sanitizeNamespace(config.namespace)}`);
}

function headlessLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

export type LinuxHeadlessInstallResult = {
  launcherPath: string;
  namespace: string;
};

export type LinuxHeadlessStartResult = {
  launcherPath: string;
  logPath: string;
  namespace: string;
  pid: number;
  status: WebRootIdentity;
};

type WebRootIdentity = {
  namespace: string;
  pid: number;
  url: string;
  startedAt: string;
  version: 1;
};

function webIdentityPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "runtime", "web-root.json");
}

function isValidWebIdentity(
  identity: unknown,
  namespace: string,
  pid: number,
): identity is WebRootIdentity {
  if (typeof identity !== "object" || identity == null) return false;
  const obj = identity as Record<string, unknown>;
  return (
    obj.version === 1 &&
    obj.namespace === namespace &&
    obj.pid === pid &&
    typeof obj.url === "string" &&
    obj.url.length > 0
  );
}

async function waitForWebIdentity(config: ToolPackConfig, childPid: number, timeoutMs: number): Promise<WebRootIdentity | null> {
  const path = webIdentityPath(config);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(path, "utf8");
      const identity = JSON.parse(content);
      if (isValidWebIdentity(identity, config.namespace, childPid)) return identity;
    } catch {
      // File doesn't exist yet or invalid JSON
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

export async function installPackedLinuxHeadless(config: ToolPackConfig): Promise<LinuxHeadlessInstallResult> {
  const paths = resolveLinuxPaths(config);
  const entryPath = resolveHeadlessEntryPath(paths);
  const nodePath = resolveHeadlessBundledNodePath(paths);

  if (!(await pathExists(entryPath))) {
    throw new Error(
      `headless entry not found at ${entryPath}; run \`tools-pack linux build\` first`,
    );
  }
  if (!(await pathExists(nodePath))) {
    throw new Error(
      `bundled node binary not found at ${nodePath}; run \`tools-pack linux build\` first`,
    );
  }

  const launcherPath = headlessLauncherPath(config);
  await mkdir(dirname(launcherPath), { recursive: true });

  // Write a self-contained launcher script. The namespace is baked in so the
  // launcher name and the runtime namespace always agree. namespace is
  // pre-sanitized by sidecar-proto to [A-Za-z0-9._-]. OD_DATA_DIR is baked
  // so the headless process writes its runtime data under the same paths that
  // tools-pack stop/logs expect.
  const dataDir = dirname(config.roots.runtime.namespaceBaseRoot);
  const script = [
    "#!/bin/sh",
    `# Open Design headless launcher — namespace: ${config.namespace}`,
    `OD_NAMESPACE=${JSON.stringify(config.namespace)} OD_DATA_DIR=${JSON.stringify(dataDir)} OD_RESOURCE_ROOT=${JSON.stringify(paths.resourceRoot)} exec ${JSON.stringify(nodePath)} ${JSON.stringify(entryPath)} "$@"`,
  ].join("\n") + "\n";

  await writeFile(launcherPath, script, { encoding: "utf8", mode: 0o755 });

  return { launcherPath, namespace: config.namespace };
}

// Waits up to 35s for the desktop identity marker, then up to 60s for the
// web identity (95s total).
export async function startPackedLinuxHeadless(config: ToolPackConfig): Promise<LinuxHeadlessStartResult> {
  const paths = resolveLinuxPaths(config);
  const entryPath = resolveHeadlessEntryPath(paths);
  const nodePath = resolveHeadlessBundledNodePath(paths);

  if (!(await pathExists(entryPath))) {
    throw new Error(
      `headless entry not found at ${entryPath}; run \`tools-pack linux build\` first`,
    );
  }

  const nodeCommand = (await pathExists(nodePath)) ? nodePath : process.execPath;
  const logPath = headlessLogPath(config);
  await mkdir(dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  // Remove stale identity markers from a previous run so waitForMarker and
  // waitForWebIdentity below wait for the newly spawned process.
  await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
  await rm(webIdentityPath(config), { force: true }).catch(() => undefined);

  // Open the log file so stdout/stderr from the headless process are captured.
  const logHandle = await open(logPath, "a");
  let child: { pid: number };
  try {
    child = await spawnBackgroundProcess({
      args: [entryPath],
      command: nodeCommand,
      cwd: dirname(entryPath),
      env: {
        ...process.env,
        // Bake in the namespace so headless uses the same namespace as the
        // tools-pack config regardless of the caller's environment.
        OD_NAMESPACE: config.namespace,
        // Point the headless data root at the tools-pack runtime directory so
        // the identity marker is written to the path this function polls.
        // headless.ts computes: join(OD_DATA_DIR, "namespaces") which must
        // equal config.roots.runtime.namespaceBaseRoot.
        OD_DATA_DIR: dirname(config.roots.runtime.namespaceBaseRoot),
        OD_RESOURCE_ROOT: paths.resourceRoot,
      },
      logFd: logHandle.fd,
    });
  } finally {
    // Close the parent-side handle; the child has already inherited the fd.
    await logHandle.close().catch(() => undefined);
  }

  const markerPath = desktopIdentityPath(config);
  const ready = await waitForMarker(markerPath, 35_000);
  if (!ready) {
    await teardownOrphanedStart(child.pid).catch(() => undefined);
    throw new Error(`headless identity marker not written within 35s at ${markerPath}`);
  }

  const webIdentity = await waitForWebIdentity(config, child.pid, 60_000);
  if (webIdentity == null) {
    await teardownOrphanedStart(child.pid).catch(() => undefined);
    throw new Error(`web-root.json not written within 60s at ${webIdentityPath(config)}`);
  }

  return {
    launcherPath: headlessLauncherPath(config),
    logPath,
    namespace: config.namespace,
    pid: child.pid,
    status: webIdentity,
  };
}

export async function stopPackedLinuxHeadless(config: ToolPackConfig): Promise<LinuxStopResult> {
  const { fallback, marker } = await readDesktopRootIdentityMarker(config);

  if (marker == null) {
    return {
      fallback,
      gracefulRequested: false,
      namespace: config.namespace,
      remainingPids: [],
      status: "not-running",
      stoppedPids: [],
    };
  }

  const snapshots = await listProcessSnapshots();
  const candidate = snapshots.find((s) => s.pid === marker.pid);
  if (candidate == null) {
    return {
      fallback: { ...fallback, reason: "marker-pid-not-running" },
      gracefulRequested: false,
      namespace: config.namespace,
      remainingPids: [],
      status: "not-running",
      stoppedPids: [],
    };
  }

  // Validate the stamp. Headless writes source=PACKAGED; skip the AppImage
  // process-command check used by stopPackedLinuxApp since the headless entry
  // is a plain Node process, not an AppImage.
  const expectedIpc = resolveAppIpcPath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: config.namespace,
  });
  const stampOk =
    marker.stamp.app === APP_KEYS.DESKTOP &&
    marker.stamp.mode === SIDECAR_MODES.RUNTIME &&
    marker.stamp.namespace === config.namespace &&
    marker.stamp.ipc === expectedIpc &&
    marker.stamp.source === SIDECAR_SOURCES.PACKAGED;

  if (!stampOk || marker.namespaceRoot !== config.roots.runtime.namespaceRoot) {
    return {
      fallback: {
        ...fallback,
        marker: { pid: marker.pid, stamp: marker.stamp },
        processCommand: candidate.command,
        reason: "marker-validation-failed",
      },
      gracefulRequested: false,
      namespace: config.namespace,
      remainingPids: [marker.pid],
      status: "unmanaged",
      stoppedPids: [],
    };
  }

  let gracefulRequested = false;
  try {
    await requestJsonIpc(marker.stamp.ipc, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1500 });
    gracefulRequested = true;
  } catch {
    gracefulRequested = false;
  }

  const treePids = collectProcessTreePids(snapshots, [marker.pid]);
  const result = await stopProcesses(treePids);

  if (result.remainingPids.length === 0) {
    await rm(desktopIdentityPath(config), { force: true }).catch(() => undefined);
    await rm(webIdentityPath(config), { force: true }).catch(() => undefined);
  }

  return {
    gracefulRequested,
    namespace: config.namespace,
    remainingPids: result.remainingPids,
    status: result.remainingPids.length === 0 ? "stopped" : "partial",
    stoppedPids: result.stoppedPids,
  };
}

export async function cleanupPackedLinuxNamespace(config: ToolPackConfig): Promise<LinuxCleanupResult> {
  const stop = await stopPackedLinuxApp(config);
  const outputRoot = config.roots.output.namespaceRoot;
  const runtimeNamespaceRoot = config.roots.runtime.namespaceRoot;

  if (!isSafeToRemoveInstallFiles(stop)) {
    return {
      namespace: config.namespace,
      outputRoot,
      removedOutputRoot: false,
      removedRuntimeNamespaceRoot: false,
      runtimeNamespaceRoot,
      skipped: true,
      stop,
    };
  }

  const hadOutput = await pathExists(outputRoot);
  if (hadOutput) await rm(outputRoot, { force: true, recursive: true });

  const hadRuntime = await pathExists(runtimeNamespaceRoot);
  if (hadRuntime) await rm(runtimeNamespaceRoot, { force: true, recursive: true });

  return {
    namespace: config.namespace,
    outputRoot,
    removedOutputRoot: hadOutput,
    removedRuntimeNamespaceRoot: hadRuntime,
    runtimeNamespaceRoot,
    skipped: false,
    stop,
  };
}
