import { execFile, spawn } from "node:child_process";
import { access, chmod, cp, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, posix } from "node:path";
import { promisify } from "node:util";

import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type DesktopEvalResult,
  type DesktopScreenshotResult,
  type DesktopStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  convergeSidecarLaunch,
  findSidecarProcesses,
  getSidecarStatus,
  invokeSidecar,
  stopSidecars,
  type SidecarStamp,
} from "@open-design/sidecar";
import { createPackageManagerInvocation, readLogTail } from "@open-design/platform";

import type { ToolPackConfig } from "./config/index.js";
import {
  allPackagedSidecarStopRequests,
  packagedSidecarStopRequests,
  toolPackSidecarStamp,
} from "./config/sidecar-stamps.js";
import { domToPptxBundleResource } from "./dom-to-pptx-resource.js";
import { copyBundledResourceTrees, linuxResources, packBundledDshRuntime } from "./resources/index.js";
import { copyOptionalVelaCliBinary } from "./vela-cli.js";
import { electronBuilderVersionForAppVersion, readRuntimeAppVersion } from "./versioning/index.js";
import { runWorkspaceBuild } from "./workspace-build.js";

const execFileAsync = promisify(execFile);

const PRODUCT_NAME = "Open Design";
const APP_IMAGE_PRODUCT_NAME = "Open-Design";
const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";
// The containerized build sets this to the standalone pnpm binary fetched by
// buildDockerArgs; runProductionInstall reads it to avoid invoking `npm` inside
// `electronuserland/builder:base`, which strips npm/npx/corepack.
const PRODUCTION_INSTALL_PNPM_BIN_ENV = "OD_TOOLS_PACK_PNPM_BIN";
const CONTAINER_PNPM_PATH = "/tmp/pnpm";
const CONTAINER_PNPM_HOME = "/tmp/pnpm-home";
const CONTAINER_NODE_VERSION = "24.14.1";
const CONTAINER_TOOLS_PACK_CLI_PATH = "tools/pack/bin/tools-pack.mjs";

export const INTERNAL_PACKAGES = [
  { directory: "packages/release", name: "@open-design/release" },
  { directory: "packages/components", name: "@open-design/components" },
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/registry-protocol", name: "@open-design/registry-protocol" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/launcher-proto", name: "@open-design/launcher-proto" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/download", name: "@open-design/download" },
  { directory: "packages/host", name: "@open-design/host" },
  { directory: "packages/agui-adapter", name: "@open-design/agui-adapter" },
  { directory: "packages/plugin-runtime", name: "@open-design/plugin-runtime" },
  { directory: "packages/diagnostics", name: "@open-design/diagnostics" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

export function sanitizeNamespace(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export type LinuxLifecycleAction = "cleanup" | "install" | "start" | "stop" | "uninstall";
export type LinuxLifecycleMode = "appimage" | "headless";

export function resolveLinuxLifecycleMode(
  options: { headless?: boolean },
  _action: LinuxLifecycleAction,
): LinuxLifecycleMode {
  return options.headless === true ? "headless" : "appimage";
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

function toDockerMountPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildDockerArgs(
  config: ToolPackConfig,
  user: DockerUserMapping,
): string[] {
  const workspaceRoot = toDockerMountPath(config.workspaceRoot);
  const toolPackRoot = toDockerMountPath(config.roots.toolPackRoot);
  const dockerHome = toDockerMountPath(join(config.roots.toolPackRoot, ".docker-home"));
  const electronCache = toDockerMountPath(join(config.roots.toolPackRoot, ".docker-cache", "electron"));
  const electronBuilderCache = toDockerMountPath(join(config.roots.toolPackRoot, ".docker-cache", "electron-builder"));

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
  //     to one of "all" | "appimage" | "deb" | "dir"
  //   - config.portable is a boolean
  //   - config.appVersion is shell-quoted below because release versions can
  //     carry punctuation that is not part of the namespace / target enums.
  //
  // The `electronuserland/builder:base` image is intentionally minimal: it
  // strips node/npm/npx/corepack from PATH. Every "ask the image to invoke a
  // package-manager shim" path fails with `command not found`.
  //
  // Download the official pnpm `linuxstatic-<arch>` standalone binary at
  // container start. The binary bundles its own Node runtime, so it does not
  // depend on the image's npm tooling. Select the asset by the container CPU so
  // amd64 GitHub runners and arm64 local Docker hosts both work. Stage it under
  // `/tmp/pnpm`, which is writable by the unprivileged container user. Then use
  // it to install a pinned Node into PNPM_HOME so root lifecycle scripts and the
  // final tools-pack CLI can run through an explicit `node .../tools-pack.mjs`
  // entrypoint instead of generated `node_modules/.bin/*` shims.
  //
  // Route bootstrap and install diagnostics to stderr so stdout remains
  // machine-readable when the inner `tools-pack linux build --json` emits JSON.
  //
  // The pinned version matches the `packageManager` field in the root
  // package.json so reproducibility is preserved.
  const PNPM_VERSION = "10.33.2";
  const pnpmLinuxStaticX64Sha256 = "a47be715939bafa420fbdc5e34f7f9d8292c032402162c89ccb611e944e526d6";
  const pnpmLinuxStaticArm64Sha256 = "4d402d0ef12cdc4d81ca339904e68638d841f4e27c73e460534d06e6b56048a9";
  const pnpmReleaseUrl = `https://github.com/pnpm/pnpm/releases/download/v${PNPM_VERSION}`;
  const setupPnpm =
    `command -v curl >/dev/null || { echo "curl not found in container image" >&2; exit 127; } && ` +
    `mkdir -p ${CONTAINER_PNPM_HOME} && ` +
    `case "$(uname -m)" in ` +
    `x86_64) PNPM_ASSET=pnpm-linuxstatic-x64; PNPM_SHA256=${pnpmLinuxStaticX64Sha256} ;; ` +
    `aarch64) PNPM_ASSET=pnpm-linuxstatic-arm64; PNPM_SHA256=${pnpmLinuxStaticArm64Sha256} ;; ` +
    `*) echo "unsupported container arch: $(uname -m)" >&2; exit 1 ;; ` +
    `esac && ` +
    `curl --retry 3 --retry-all-errors --connect-timeout 10 --max-time 60 -fsSL "${pnpmReleaseUrl}/$PNPM_ASSET" -o ${CONTAINER_PNPM_PATH}.tmp && ` +
    `echo "$PNPM_SHA256  ${CONTAINER_PNPM_PATH}.tmp" | sha256sum -c - && ` +
    `mv ${CONTAINER_PNPM_PATH}.tmp ${CONTAINER_PNPM_PATH} && ` +
    `chmod +x ${CONTAINER_PNPM_PATH} && ` +
    `PNPM_HOME=${CONTAINER_PNPM_HOME} PATH=${CONTAINER_PNPM_HOME}:$PATH ${CONTAINER_PNPM_PATH} env use --global ${CONTAINER_NODE_VERSION} && ` +
    // Put the pnpm-managed Node bin (node/npm/npx/corepack) on PATH and expose the
    // standalone pnpm as a bare `pnpm`. electron-builder's node-module-collector
    // spawns the detected package manager directly (pnpm here — the assembled app
    // has a node_modules/.pnpm dir); builder:base ships none of these on PATH,
    // which surfaced as "Node module collector process exited with code 127".
    `export PNPM_HOME=${CONTAINER_PNPM_HOME} PATH=${CONTAINER_PNPM_HOME}/nodejs/${CONTAINER_NODE_VERSION}/bin:${CONTAINER_PNPM_HOME}:$PATH && ` +
    `ln -sf ${CONTAINER_PNPM_PATH} ${CONTAINER_PNPM_HOME}/pnpm && ` +
    `command -v node >/dev/null && command -v npm >/dev/null && command -v pnpm >/dev/null`;
  const pnpmCmd = CONTAINER_PNPM_PATH;
  const innerArgs = [
    `node ${CONTAINER_TOOLS_PACK_CLI_PATH} linux build`,
    `--to ${config.to}`,
    `--namespace ${config.namespace}`,
    "--dir /tools-pack",
  ];
  if (config.requireVelaCli) {
    innerArgs.push("--require-vela-cli");
  }
  if (config.portable) {
    innerArgs.push("--portable");
  }
  if (config.appVersion != null) {
    innerArgs.push(`--app-version ${shellQuote(config.appVersion)}`);
  }
  const innerCommand = `{ ${setupPnpm} && ${pnpmCmd} install --frozen-lockfile; } >&2 && ` + innerArgs.join(" ");

  const dockerArgs = [
    "run",
    "--rm",
    "--user",
    `${user.uid}:${user.gid}`,
    "-v",
    `${workspaceRoot}:/project`,
    "-v",
    `${toolPackRoot}:/tools-pack`,
    "-v",
    `${dockerHome}:/home/builder`,
    "-v",
    `${electronCache}:/home/builder/.cache/electron`,
    "-v",
    `${electronBuilderCache}:/home/builder/.cache/electron-builder`,
    "-e",
    "HOME=/home/builder",
    // Match the CI environment the containerized build models. The inner
    // `pnpm install --frozen-lockfile` runs against the mounted /project, which
    // on a developer machine already contains a host-installed node_modules with
    // a different store/config. pnpm decides that modules directory must be
    // purged and rebuilt; without a TTY and without CI it refuses the
    // destructive purge and aborts with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
    // A fresh CI checkout has no node_modules so this never triggers there.
    // Setting CI=true makes pnpm proceed non-interactively, exactly as it does in
    // CI. Note: this reinstalls node_modules inside the mounted workspace, so a
    // local containerized build leaves the host tree with container-built native
    // modules; re-run host `pnpm install` afterward if you switch back to host dev.
    "-e",
    "CI=true",
    "-e",
    "ELECTRON_CACHE=/home/builder/.cache/electron",
    "-e",
    "ELECTRON_BUILDER_CACHE=/home/builder/.cache/electron-builder",
    // Production install of the assembled app uses npm (resolveProductionInstallCommand's
    // default), NOT the standalone pnpm. npm is available because the PATH export below
    // includes the pnpm-managed Node bin, which bundles npm. We deliberately do not set
    // OD_TOOLS_PACK_PNPM_BIN: a pnpm `--prod --no-lockfile` install over the file: tarballs
    // failed to materialize transitive deps (jszip's `setimmediate` went missing), yielding
    // a package that built but crashed on boot. npm's flat hoist matches the working host
    // build and installs the full tree.
    // Nested `runPnpm` calls (buildWorkspaceArtifacts, collectWorkspaceTarballs)
    // route through createPackageManagerInvocation, which prefers `npm_execpath`
    // and otherwise falls back to `corepack pnpm …`. The inner build is launched
    // as `node tools-pack.mjs` (not via pnpm), so npm_execpath is unset, and the
    // builder:base image has no corepack on PATH (pnpm's managed Node only
    // symlinks `node` into PNPM_HOME) — the fallback dies with `spawn corepack
    // ENOENT`. Point npm_execpath at the standalone pnpm we bootstrapped so every
    // nested invocation runs `${CONTAINER_PNPM_PATH} …` directly, bypassing
    // corepack entirely.
    "-e",
    `npm_execpath=${CONTAINER_PNPM_PATH}`,
  ];
  if (config.telemetryRelayUrl != null) {
    dockerArgs.push("-e", `OPEN_DESIGN_TELEMETRY_RELAY_URL=${config.telemetryRelayUrl}`);
  }
  const velaBinHost = process.env.OPEN_DESIGN_VELA_CLI_BIN?.trim();
  if (velaBinHost) {
    // The container only mounts /project, /tools-pack and cache/home dirs by
    // default, so a Vela CLI living outside those (a host path like
    // `~/.local/bin/vela` is the common dev case) would be invisible inside.
    // Bind-mount the containing directory read-only and rewrite the env to
    // the container-side path so `copyOptionalVelaCliBinary` can actually
    // read it.
    const hostVelaDir = dirname(velaBinHost);
    const velaBinBase = basename(velaBinHost);
    const containerVelaDir = "/opt/vela-cli";
    dockerArgs.push("-v", `${hostVelaDir}:${containerVelaDir}:ro`);
    dockerArgs.push("-e", `OPEN_DESIGN_VELA_CLI_BIN=${containerVelaDir}/${velaBinBase}`);
  }
  if (config.amrProfile != null) {
    dockerArgs.push("-e", `OPEN_DESIGN_AMR_PROFILE=${config.amrProfile}`);
  }
  // The vela web origin is resolved on the host (from the build-time secret)
  // but the packaged config is written inside the container, so the containerized
  // build needs it forwarded or the workspace-team gate stays closed.
  if (config.velaWebUrl != null) {
    dockerArgs.push("-e", `OD_VELA_WEB_URL=${config.velaWebUrl}`);
  }
  dockerArgs.push(
    "-w",
    "/project",
    "electronuserland/builder:base",
    "bash",
    "-lc",
    innerCommand,
  );
  return dockerArgs;
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

export function renderLinuxPackagedMainEntry(): string {
  return 'import("@open-design/packaged").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n';
}

export function renderLinuxAppImageAppRun(): string {
  return `#!/bin/bash
set -e

THIS="$0"
args=("$@")
NUMBER_OF_ARGS="$#"

if [ -z "$APPDIR" ] ; then
  path="$(dirname "$(readlink -f "\${THIS}")")"
  while [[ "$path" != "" && ! -e "$path/AppRun" ]]; do
    path=\${path%/*}
  done
  APPDIR="$path"
fi

export PATH="\${APPDIR}:\${APPDIR}/usr/sbin:\${PATH}"
export XDG_DATA_DIRS="./share/:/usr/share/gnome:/usr/local/share/:/usr/share/:\${XDG_DATA_DIRS}"
export LD_LIBRARY_PATH="\${APPDIR}/usr/lib:\${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="\${APPDIR}"/usr/share/:"\${XDG_DATA_DIRS}":/usr/share/gnome/:/usr/local/share/:/usr/share/
export GSETTINGS_SCHEMA_DIR="\${APPDIR}/usr/share/glib-2.0/schemas:\${GSETTINGS_SCHEMA_DIR}"

BIN="$APPDIR/${PRODUCT_NAME}"

if [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then
  trap atexit EXIT
fi

isEulaAccepted=1

atexit()
{
  if [ $isEulaAccepted == 1 ] ; then
    unset ELECTRON_RUN_AS_NODE
    if [ $NUMBER_OF_ARGS -eq 0 ] ; then
      exec "$BIN"
    else
      exec "$BIN" "\${args[@]}"
    fi
  fi
}

if [ -z "$APPIMAGE" ] ; then
  export APPIMAGE="$APPDIR/AppRun"
  # not running from within an AppImage; hence using the AppRun for Exec=
fi
`;
}

export const LINUX_APPIMAGE_EXECUTABLE_ARGS = ["--no-sandbox"] as const;

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
  if ((isMountedRunner || isExtractedRunner) && snapshot.env.APPIMAGE === installPath) {
    return true;
  }

  // Direct AppRun launches do not know the installed .AppImage path. Our AppRun
  // fallback sets $APPIMAGE to the sibling AppRun before execing Electron.
  return (
    posix.basename(snapshot.executable) === PRODUCT_NAME &&
    snapshot.env.APPIMAGE === posix.join(posix.dirname(snapshot.executable), "AppRun")
  );
}

// --- Step 1: LinuxPaths type and resolveLinuxPaths ---

type LinuxPaths = {
  appBuilderConfigPath: string;
  appBuilderOutputRoot: string;
  appImageAppRunPath: string;
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
    appImageAppRunPath: join(namespaceRoot, "appimage", "AppRun"),
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

export type ProductionInstallCommand = { command: string; args: string[] };

// Picks the package manager used to materialize the assembled-app node_modules
// during writeAssembledApp. Both the host and (now) the containerized build use
// npm: it hoists the file: internal deps flat and installs the full transitive
// tree, which is what actually boots. The containerized build exposes npm by
// putting the pnpm-managed Node bin on PATH (see buildDockerArgs), so it no longer
// sets OD_TOOLS_PACK_PNPM_BIN. The OD_TOOLS_PACK_PNPM_BIN branch is retained as an
// opt-in escape hatch, but it is not the container default anymore: a pnpm
// `--prod --no-lockfile` install over the file: tarballs dropped transitive deps
// (jszip's `setimmediate`), yielding a package that built but crashed on boot.
export function resolveProductionInstallCommand(env: NodeJS.ProcessEnv): ProductionInstallCommand {
  const pnpmBin = env[PRODUCTION_INSTALL_PNPM_BIN_ENV];
  if (pnpmBin != null && pnpmBin.length > 0) {
    return {
      command: pnpmBin,
      args: ["install", "--prod", "--no-lockfile", "--config.node-linker=hoisted"],
    };
  }
  return { command: "npm", args: ["install", "--omit=dev", "--no-package-lock"] };
}

async function runProductionInstall(appRoot: string): Promise<void> {
  const { command, args } = resolveProductionInstallCommand(process.env);
  await execFileAsync(command, args, {
    cwd: appRoot,
    env: process.env,
  });
}

async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  return readRuntimeAppVersion(config);
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
  await packBundledDshRuntime({
    workspaceRoot: config.workspaceRoot,
    resourceRoot: paths.resourceRoot,
  });
  await mkdir(join(paths.resourceRoot, "bin"), { recursive: true });
  await cp(process.execPath, join(paths.resourceRoot, "bin", "node"));
  await chmod(join(paths.resourceRoot, "bin", "node"), 0o755);
  await copyOptionalVelaCliBinary({
    platform: "linux",
    requireBundled: config.requireVelaCli,
    resourceRoot: paths.resourceRoot,
  });
}

// --- Step 4: writeAssembledApp helper ---

async function writeAssembledApp(
  config: ToolPackConfig,
  paths: LinuxPaths,
  packed: PackedTarballInfo[],
): Promise<void> {
  await rm(paths.assembledAppRoot, { force: true, recursive: true });
  await mkdir(paths.assembledAppRoot, { recursive: true });
  await cp(
    join(config.workspaceRoot, "apps", "desktop", "dist", "main", "preload.cjs"),
    join(paths.assembledAppRoot, "preload.cjs"),
  );

  const dependencies: Record<string, string> = {};
  for (const tarball of packed) {
    dependencies[tarball.packageName] = `file:${join(paths.tarballsRoot, tarball.fileName)}`;
  }

  const version = await readPackagedVersion(config);
  const packageVersion = electronBuilderVersionForAppVersion(version);
  const packageJson = {
    name: "open-design-packaged",
    version: packageVersion,
    private: true,
    main: "main.cjs",
    dependencies,
    description: "Local-first design product: detects your installed code-agent CLI, runs design skills + design systems, streams artifacts into a sandboxed preview.",
    author: "Open Design Team",
    repository: {
      type: "git",
      url: "https://github.com/nexu-io/open-design.git"
    }
  };
  await writeFile(paths.assembledPackageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  await writeFile(paths.assembledMainEntryPath, renderLinuxPackagedMainEntry(), "utf8");

  await writeFile(
    paths.packagedConfigPath,
    `${JSON.stringify(
      {
        ...(config.amrProfile == null ? {} : { amrProfile: config.amrProfile }),
        appVersion: version,
        namespace: config.namespace,
        nodeCommandRelative: "open-design/bin/node",
        ...(config.telemetryRelayUrl == null ? {} : { telemetryRelayUrl: config.telemetryRelayUrl }),
        ...(config.posthogKey == null ? {} : { posthogKey: config.posthogKey }),
        ...(config.posthogHost == null ? {} : { posthogHost: config.posthogHost }),
        ...(config.velaWebUrl == null ? {} : { velaWebUrl: config.velaWebUrl }),
        ...(config.velaWebUrls == null ? {} : { velaWebUrls: config.velaWebUrls }),
        ...(config.portable ? {} : { namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot }),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await runProductionInstall(paths.assembledAppRoot);
}

async function writeLinuxAppImageAppRun(paths: LinuxPaths): Promise<void> {
  await mkdir(dirname(paths.appImageAppRunPath), { recursive: true });
  await writeFile(paths.appImageAppRunPath, renderLinuxAppImageAppRun(), "utf8");
  await chmod(paths.appImageAppRunPath, 0o755);
}

// --- Step 5: writeLinuxBuilderConfig helper ---

// Maps the tools-pack `--to` target to the electron-builder Linux target list.
// "dir" produces an unpacked tree, "deb" a Debian package, and everything else
// ("appimage"/"all") an AppImage — the historical default.
//
// Note: on Linux `all` == AppImage only, which is intentionally NOT symmetric with
// Windows (`all` == dir+nsis+zip). The deb build is a SEPARATE electron-builder run:
// its productName ("OpenDesign", for a path-safe /opt) is mutually exclusive with
// the AppImage's ("Open Design"), so they cannot be produced in one combined run.
// `all` therefore stays AppImage-only; build the deb explicitly with `--to deb`.
export function resolveLinuxBuilderTargets(to: ToolPackConfig["to"]): string[] {
  if (to === "dir") return ["dir"];
  if (to === "deb") return ["deb"];
  return ["AppImage"];
}

// The AppRun wrapper and its extraFiles injection are AppImage-only concerns.
// deb/dir builds must not receive them: a .deb installs Electron directly under
// /opt and symlinks the executable into /usr/bin, with no FUSE AppRun shim.
export function linuxBuildsAppImage(to: ToolPackConfig["to"]): boolean {
  return to === "all" || to === "appimage";
}

// Debian archive package name, install directory, and display name. These are
// deliberately distinct concerns that electron-builder couples to a single
// `productName`:
//   - DEB_PACKAGE_NAME  -> control `Package:` + /usr/share/doc/<name> (via fpm)
//   - DEB_PRODUCT_NAME  -> /opt/<dir> and the executable base (path-safe, no space)
//   - DEB_DISPLAY_NAME  -> the .desktop `Name=` shown in menus (keeps the brand)
const DEB_PACKAGE_NAME = "open-design";
const DEB_PRODUCT_NAME = "OpenDesign";
const DEB_DISPLAY_NAME = "Open Design";

// electron-builder ships no machine-readable copyright (lintian: no-copyright-file,
// an error) and an auto-generated changelog that lintian rejects as "not a Debian
// changelog". Stage the checked-in DEP-5 copyright and render the Debian changelog
// template (from tools/pack/resources/linux/debian/), then map them into the
// package via fpm args. Returns their staged paths.
async function writeDebMetadataFiles(
  paths: LinuxPaths,
  version: string,
): Promise<{ copyrightPath: string; changelogPath: string; lintianOverridesPath: string }> {
  const metaDir = join(dirname(paths.appBuilderConfigPath), "deb-meta");
  await mkdir(metaDir, { recursive: true });

  // Copyright is fully static — copy the checked-in DEP-5 file verbatim.
  const copyrightPath = join(metaDir, "copyright");
  await cp(linuxResources.debianCopyright, copyrightPath);

  // lintian overrides: a static, checked-in file documenting the deviations
  // inherent to a bundled Electron package (see the file for rationale).
  const lintianOverridesPath = join(metaDir, "lintian-overrides");
  await cp(linuxResources.debianLintianOverrides, lintianOverridesPath);

  // Changelog carries the build version and date; render the template. The date
  // must be RFC 5322 with a numeric zone — toUTCString gives the correct
  // day-of-week and "... GMT", which we rewrite to "+0000".
  const changelogPath = join(metaDir, "changelog");
  const date = new Date().toUTCString().replace(/ GMT$/, " +0000");
  const changelogTemplate = await readFile(linuxResources.debianChangelogTemplate, "utf8");
  const changelog = changelogTemplate
    .replace(/@@PACKAGE@@/g, DEB_PACKAGE_NAME)
    .replace(/@@VERSION@@/g, version)
    .replace(/@@DATE@@/g, date);
  await writeFile(changelogPath, changelog, "utf8");

  return { copyrightPath, changelogPath, lintianOverridesPath };
}

/**
 * electron-builder `files` patterns for the Linux bundle: everything in the
 * assembled app minus the node_modules cruft no Linux runtime needs. Keeping it
 * out is what makes the .deb clean (lintian) and smaller; every exclusion below
 * names the tag or the bytes it removes.
 *
 * `hostArch` is Node's `process.arch` of the machine producing the bundle
 * (electron-builder targets the host arch): prebuilt native binaries for every
 * other platform/arch are dropped. Anything not listed is kept, so a new
 * multi-platform dependency shows up in lintian before it silently bloats the
 * package.
 */
export function linuxBundledFilePatterns(hostArch: string): string[] {
  const arch = hostArch === "arm64" ? "arm64" : "x64";
  const otherArch = arch === "x64" ? "arm64" : "x64";
  return [
    "**/*",
    "!**/node_modules/.bin",
    "!**/node_modules/electron{,/**/*}",
    // eslint configs (package-contains-eslint-config-file) and node-pty's
    // Windows-only winpty build sources (its python helper scripts trip
    // python3-script-but-no-python3-dep on Linux, where they never run).
    "!**/.eslintrc{,.*}",
    "!**/eslint.config.{js,cjs,mjs,ts}",
    "!**/node_modules/node-pty/deps/winpty{,/**/*}",
    // Editor backup files published by mistake in @ffmpeg-installer/ffmpeg
    // (backup-file-in-package).
    "!**/*~",
    // node-pty ships prebuilt bindings for every platform; only the Linux
    // ones can load here.
    "!**/node_modules/node-pty/prebuilds/{darwin,win32}-*{,/**/*}",
    // onnxruntime-node (via hyperframes) bundles every platform and arch
    // (binary-from-other-architecture, ~100 MB), plus the CUDA/TensorRT
    // execution providers for linux (~345 MB) that need a CUDA toolkit this
    // package does not depend on. hyperframes falls back to the CPU provider
    // when they are absent.
    "!**/node_modules/onnxruntime-node/bin/napi-v3/{darwin,win32}{,/**/*}",
    `!**/node_modules/onnxruntime-node/bin/napi-v3/linux/${otherArch}{,/**/*}`,
    `!**/node_modules/onnxruntime-node/bin/napi-v3/linux/${arch}/libonnxruntime_providers_{cuda,tensorrt}.so`,
  ];
}

async function writeLinuxBuilderConfig(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  const target = resolveLinuxBuilderTargets(config.to);
  const buildsAppImage = linuxBuildsAppImage(config.to);
  const namespaceToken = sanitizeNamespace(config.namespace);
  const packagedVersion = await readPackagedVersion(config);
  const packageVersion = electronBuilderVersionForAppVersion(packagedVersion);

  // The deb installs to /opt and symlinks into /usr/bin, so its product/executable
  // names must be path-safe (no space). The AppImage keeps "Open Design" because
  // matchesAppImageProcess and the AppRun wrapper match that exact binary name.
  const isDeb = config.to === "deb";
  const linuxProductName = isDeb ? DEB_PRODUCT_NAME : PRODUCT_NAME;
  const linuxExecutableName = isDeb ? DEB_PACKAGE_NAME : PRODUCT_NAME;
  const debMeta = isDeb ? await writeDebMetadataFiles(paths, packageVersion) : null;
  // Distinct one-line synopsis + a concise single-line description. A bare
  // product-name description trips lintian's description-is-pkg-name.
  const linuxSynopsis = "Local-first design agent driven by your installed code CLI";
  const linuxDescription = "Runs design skills and design systems, previewing artifacts in a sandbox.";

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
    // See tools/pack/src/win/builder.ts: rely on electron-builder's own
    // Electron download rather than node_modules' dist, which pnpm does not
    // reliably materialize on CI runners.
    executableName: linuxExecutableName,
    extraMetadata: {
      main: "./main.cjs",
      name: "open-design-packaged-app",
      productName: linuxProductName,
      version: packageVersion,
      ...(config.portable ? {} : { odToolsPackRuntimeRoot: config.roots.runtime.namespaceBaseRoot }),
    },
    extraResources: [
      { from: paths.resourceRoot, to: "open-design" },
      { from: paths.packagedConfigPath, to: "open-design-config.json" },
      // Vendored dom-to-pptx browser bundle for editable PPTX export (read from
      // process.resourcesPath by the desktop main at runtime).
      domToPptxBundleResource(config),
    ],
    ...(buildsAppImage
      ? {
          extraFiles: [
            {
              from: paths.appImageAppRunPath,
              to: "AppRun",
            },
          ],
        }
      : {}),
    files: linuxBundledFilePatterns(process.arch),
    icon: linuxResources.icon,
    linux: {
      target,
      icon: linuxResources.icon,
      category: "Development",
      synopsis: linuxSynopsis,
      description: linuxDescription,
      // Path-safe product name (OpenDesign) keeps /opt and /usr/bin clean, but the
      // menu entry should still show the real brand. Override the .desktop Name so
      // the display stays "Open Design" regardless of the executable/dir name.
      desktop: { entry: { Name: DEB_DISPLAY_NAME } },
      // Debian Policy requires an RFC822 `Maintainer: Name <email>`; a bare name
      // trips lintian's maintainer-address-malformed. Community project → a neutral
      // project role address, never a personal one (it is shown by `apt show` on
      // every install). Maintainers can point this at their preferred packaging
      // contact. Used for deb (and rpm) via electron-builder's shared linux.maintainer.
      maintainer: "Open Design Contributors <contributors@open-design.ai>",
    },
    // Debian package metadata. Only consulted when the `deb` target is built.
    // `deb.depends` is set explicitly below (not left to electron-builder's
    // defaults): overriding REPLACES — does not merge — the whole list, so it must
    // carry every runtime dep itself, including libc6 and the t64-aware libraries.
    // The artifactName follows the Debian convention `<pkg>_<version>_<arch>.deb`
    // (lowercase, no spaces), unlike the AppImage which keeps the product name.
    // Gate on debMeta (non-null iff the deb target is built) rather than
    // re-testing config.to: this lets TypeScript narrow debMeta to non-null
    // inside the block, so the fpm passthrough needs no non-null assertions.
    ...(debMeta
      ? {
          deb: {
            priority: "optional",
            // Debian archive Section. fpm/electron-builder otherwise emit
            // `Section: default`, which lintian flags as unknown-section. "devel"
            // is the Debian section for development tools, matching the freedesktop
            // Development category above.
            packageCategory: "devel",
            // fpm passthrough for the deb only:
            //   --name          -> Debian `Package:` field. electron-builder would
            //                      otherwise derive it from the internal Electron app
            //                      name (`open-design-packaged-app`), a cross-platform
            //                      build identity, not a distro package name. The
            //                      Debian Package name is independent of the npm name,
            //                      so this touches nothing macOS/Windows/launcher use.
            //   --deb-changelog -> replaces electron-builder's invalid auto changelog.
            //   --license       -> fills the fpm License field (else "unknown").
            //   copyright=...   -> DEP-5 copyright at /usr/share/doc/<pkg>/copyright
            //                      (electron-builder ships none: lintian no-copyright-file).
            //   lintian-overrides=... -> documents the assumed bundled-Electron
            //                      deviations at /usr/share/lintian/overrides/<pkg>.
            //   --description  -> electron-builder already indents the extended
            //                      description line, then fpm indents it again
            //                      (description-starts-with-leading-spaces); passing
            //                      the raw two-line text here lets fpm indent once.
            fpm: [
              "--name",
              DEB_PACKAGE_NAME,
              "--description",
              `${linuxSynopsis}\n${linuxDescription}`,
              "--license",
              "Apache-2.0",
              "--deb-changelog",
              debMeta.changelogPath,
              `${debMeta.copyrightPath}=/usr/share/doc/${DEB_PACKAGE_NAME}/copyright`,
              `${debMeta.lintianOverridesPath}=/usr/share/lintian/overrides/${DEB_PACKAGE_NAME}`,
            ],
            // Debian-standard filename `<package>_<version>_<arch>.deb`. The
            // namespace is intentionally omitted (unlike the AppImage artifact):
            // each namespace already writes to its own output directory, so the
            // token adds nothing here and would break the Debian convention.
            // Release channels stay distinguishable through the version suffix
            // (e.g. 0.15.1-beta.1) baked into ${version}.
            artifactName: "open-design_${version}_${arch}.deb",
            // Runtime shared libraries for an Electron 41 app. electron-builder's
            // defaults already resolve on Debian, but we spell out the intent and
            // alternate the two libraries renamed by the time_t 64-bit (t64)
            // transition so resolution never relies solely on compat `Provides:`:
            //   - libgtk-3-0     -> libgtk-3-0t64     (trixie+/sid)
            //   - libatspi2.0-0  -> libatspi2.0-0t64  (trixie+/sid)
            // Verified installable on bookworm (native names) and trixie/sid.
            depends: [
              // electron-builder's baseline deb.depends (which we replace here)
              // omits libc6; hardcoding the list drops the shlib-scanned libc dep,
              // so declare it explicitly (lintian: missing-dependency-on-libc).
              "libc6",
              "libgtk-3-0 | libgtk-3-0t64",
              "libnotify4",
              "libnss3",
              "libxss1",
              "libxtst6",
              "xdg-utils",
              "libatspi2.0-0 | libatspi2.0-0t64",
              "libuuid1",
              "libsecret-1-0",
            ],
            // System-tray indicator is optional. libappindicator3-1 was removed
            // from bookworm/trixie/sid; the Ayatana fork provides it, so prefer it
            // and fall back to the historical name.
            recommends: ["libayatana-appindicator3-1 | libappindicator3-1"],
          },
        }
      : {}),
    // Keep the AppImage launch fallback explicit. Our top-level AppRun wrapper
    // clears ELECTRON_RUN_AS_NODE before these Chromium flags reach Electron,
    // including for AppImageLauncher-generated desktop entries.
    appImage: {
      executableArgs: [...LINUX_APPIMAGE_EXECUTABLE_ARGS],
    },
    nodeGypRebuild: false,
    npmRebuild: false,
    productName: linuxProductName,
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

async function findBuiltArtifact(paths: LinuxPaths, ext: string): Promise<string | null> {
  if (!(await pathExists(paths.appBuilderOutputRoot))) return null;
  const entries = await readdir(paths.appBuilderOutputRoot);
  const match = entries.find((entry) => entry.endsWith(ext));
  return match ? join(paths.appBuilderOutputRoot, match) : null;
}

async function findBuiltAppImage(paths: LinuxPaths): Promise<string | null> {
  return findBuiltArtifact(paths, ".AppImage");
}

// --- Step 7: packLinux orchestrator + result type + stub for runBuildInContainer ---

export type LinuxPackResult = {
  appImagePath: string | null;
  debPath: string | null;
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
    const appImagePath = linuxBuildsAppImage(config.to) ? await findBuiltAppImage(paths) : null;
    const debPath = config.to === "deb" ? await findBuiltArtifact(paths, ".deb") : null;
    return {
      appImagePath,
      debPath,
      outputRoot: paths.appBuilderOutputRoot,
      resourceRoot: paths.resourceRoot,
      runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
      to: config.to,
      containerized: true,
    };
  }

  const paths = resolveLinuxPaths(config);
  await mkdir(config.roots.output.namespaceRoot, { recursive: true });
  await runWorkspaceBuild(
    config,
    async (args, extraEnv) => await runPnpm(config, args, extraEnv),
  );
  await copyResourceTree(config, paths);
  const tarballs = await collectWorkspaceTarballs(config, paths);
  await writeAssembledApp(config, paths, tarballs);
  if (linuxBuildsAppImage(config.to)) {
    await writeLinuxAppImageAppRun(paths);
  }
  await writeLinuxBuilderConfig(config, paths);
  await runElectronBuilderLinux(config, paths);

  const appImagePath = linuxBuildsAppImage(config.to) ? await findBuiltAppImage(paths) : null;
  const debPath = config.to === "deb" ? await findBuiltArtifact(paths, ".deb") : null;
  return {
    appImagePath,
    debPath,
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

export type LinuxInspectResult = {
  eval?: DesktopEvalResult;
  screenshot?: DesktopScreenshotResult;
  status: DesktopStatusSnapshot | null;
};

export function shouldRejectLinuxHeadlessInspectOptions(options: {
  expr?: string;
  path?: string;
}): boolean {
  return options.expr != null || options.path != null;
}

type SidecarDiscoveryFallback = {
  reason: string;
};

export type LinuxStopResult = {
  fallback?: SidecarDiscoveryFallback;
  gracefulRequested: boolean;
  namespace: string;
  remainingPids: number[];
  status: "not-running" | "partial" | "stopped" | "unmanaged";
  stoppedPids: number[];
};

function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log");
}

function linuxStamp(
  config: ToolPackConfig,
  options: {
    app?: SidecarStamp["app"];
    mode?: string;
    source?: typeof SIDECAR_SOURCES.TOOLS_PACK | typeof SIDECAR_SOURCES.PACKAGED;
  } = {},
): SidecarStamp {
  return toolPackSidecarStamp(config, options);
}

export function createLinuxDesktopLaunchEnv(
  _config: ToolPackConfig,
  _stamp: SidecarStamp,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv, [DESKTOP_LOG_ECHO_ENV]: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

type ReachableLinuxSidecar<T> = {
  stamp: SidecarStamp;
  status: T;
};

async function resolveReachableLinuxSidecar<T>(
  stamps: readonly SidecarStamp[],
  timeoutMs: number,
): Promise<ReachableLinuxSidecar<T> | null> {
  const probes = await Promise.all(stamps.map(async (stamp): Promise<ReachableLinuxSidecar<T> | null> => {
    const status = await getSidecarStatus<T>(stamp, { timeoutMs }).catch(() => null);
    return status == null ? null : { stamp, status };
  }));
  return probes.find((probe): probe is ReachableLinuxSidecar<T> => probe != null) ?? null;
}

async function waitForLinuxStatus<T>(stamps: readonly SidecarStamp[], timeoutMs: number): Promise<ReachableLinuxSidecar<T> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const active = await resolveReachableLinuxSidecar<T>(stamps, 1_000);
    if (active != null) return active;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
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

  const stamp = linuxStamp(config);
  const launchStamps = [
    stamp,
    linuxStamp(config, { source: SIDECAR_SOURCES.PACKAGED }),
  ];

  // --appimage-extract-and-run bypasses FUSE-mounted SquashFS, which is too slow
  // for daemon startup on first launch (smoke testing showed startup exceeded the
  // packaged sidecar's 35-second timeout when running from FUSE).
  const convergence = await convergeSidecarLaunch({
    args: ["--appimage-extract-and-run"],
    command: appImagePath,
    cwd: dirname(appImagePath),
    env: createLinuxDesktopLaunchEnv(config, stamp),
    logFd: null,
    resources: {
      dataRoot: join(config.roots.runtime.namespaceRoot, "data"),
      ownerPid: null,
      port: 0,
      runtimeRoot: join(config.roots.runtime.namespaceRoot, "runtime"),
    },
    stamp,
  }, { ownerStamps: launchStamps, timeoutMs: 60_000 });

  // 60s ceiling: AppImage --appimage-extract-and-run unpacks ~200MB to /tmp on
  // first launch before exec'ing the inner electron, which adds substantial
  // overhead vs mac's direct .app launch.
  //
  const active = await waitForLinuxStatus<DesktopStatusSnapshot>(launchStamps, 60_000);
  if (active == null) {
    await stopSidecars(launchStamps.map((candidate) => ({ stamp: candidate }))).catch(() => undefined);
    throw new Error(`desktop sidecar did not become ready within 60s for ${config.namespace}`);
  }

  return {
    appImagePath,
    executablePath: appImagePath,
    logPath,
    namespace: config.namespace,
    pid: convergence.description.resources.pid,
    source,
    status: active.status,
  };
}

export async function stopPackedLinuxApp(config: ToolPackConfig): Promise<LinuxStopResult> {
  const stopped = await stopSidecars(allPackagedSidecarStopRequests(config));

  return {
    gracefulRequested: stopped.gracefulAccepted,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length > 0 ? "partial" : stopped.matchedPids.length > 0 ? "stopped" : "not-running",
    stoppedPids: stopped.stoppedPids,
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

export async function inspectPackedLinuxApp(
  config: ToolPackConfig,
  options: { expr?: string; headless?: boolean; path?: string },
): Promise<LinuxInspectResult> {
  if (options.headless === true && shouldRejectLinuxHeadlessInspectOptions(options)) {
    throw new Error("linux inspect --headless supports status only; omit --expr and --path");
  }

  const stamps = [
    linuxStamp(config, { mode: options.headless === true ? "headless" : SIDECAR_MODES.RUNTIME }),
    linuxStamp(config, {
      mode: options.headless === true ? "headless" : SIDECAR_MODES.RUNTIME,
      source: SIDECAR_SOURCES.PACKAGED,
    }),
  ];
  const active = await resolveReachableLinuxSidecar<DesktopStatusSnapshot>(stamps, 2000);
  const stamp = active?.stamp ?? stamps[0];
  const status = active?.status ?? null;

  if (options.headless === true) {
    return { status };
  }

  return {
    ...(options.expr == null
      ? {}
      : {
          eval: await invokeSidecar<DesktopEvalResult>(stamp, SIDECAR_MESSAGES.EVAL, { expression: options.expr }, { timeoutMs: 5000 }),
        }),
    ...(options.path == null
      ? {}
      : {
          screenshot: await invokeSidecar<DesktopScreenshotResult>(stamp, SIDECAR_MESSAGES.SCREENSHOT, { path: options.path }, { timeoutMs: 10000 }),
        }),
    status,
  };
}

export type LinuxUninstallResult = {
  namespace: string;
  removed: {
    appImage: "ok" | "already-removed";
    desktop: "ok" | "already-removed";
    icon: "ok" | "already-removed";
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
function assertLinuxStopComplete(stop: LinuxStopResult, operation: string): void {
  if (stop.status === "stopped" || stop.status === "not-running") return;
  throw new Error(
    `cannot ${operation} packaged namespace while sidecar processes remain: ${stop.remainingPids.join(", ") || stop.status}`,
  );
}

export async function uninstallPackedLinuxApp(config: ToolPackConfig): Promise<LinuxUninstallResult> {
  const paths = resolveLinuxPaths(config);
  const stop = await stopPackedLinuxApp(config);
  assertLinuxStopComplete(stop, "uninstall");

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

export type LinuxHeadlessUninstallResult = {
  launcherPath: string;
  namespace: string;
  removed: "ok" | "already-removed";
  stop: LinuxStopResult;
};

export async function uninstallPackedLinuxHeadless(
  config: ToolPackConfig,
): Promise<LinuxHeadlessUninstallResult> {
  const stop = await stopPackedLinuxHeadless(config);
  const launcherPath = headlessLauncherPath(config);
  assertLinuxStopComplete(stop, "uninstall");

  return {
    launcherPath,
    namespace: config.namespace,
    removed: await tryRemove(launcherPath),
    stop,
  };
}

export type LinuxCleanupResult = {
  namespace: string;
  outputRoot: string;
  removedOutputRoot: boolean;
  removedRuntimeNamespaceRoot: boolean;
  runtimeNamespaceRoot: string;
  // Headless cleanup leaves the namespace intact when a desktop-mode owner is
  // still active; a partial stop itself fails before this result is produced.
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
  status: DesktopStatusSnapshot;
};

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
    `OD_PACKAGED_NAMESPACE=${JSON.stringify(config.namespace)} OD_DATA_DIR=${JSON.stringify(dataDir)} OD_RESOURCE_ROOT=${JSON.stringify(paths.resourceRoot)} exec ${JSON.stringify(nodePath)} ${JSON.stringify(entryPath)} "$@"`,
  ].join("\n") + "\n";

  await writeFile(launcherPath, script, { encoding: "utf8", mode: 0o755 });

  return { launcherPath, namespace: config.namespace };
}

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

  const stamp = linuxStamp(config, { mode: "headless" });
  const launchStamps = [
    stamp,
    linuxStamp(config, { mode: "headless", source: SIDECAR_SOURCES.PACKAGED }),
  ];
  const logHandle = await open(logPath, "a");
  let child: { pid: number };
  try {
    const convergence = await convergeSidecarLaunch({
      args: [entryPath],
      command: nodeCommand,
      cwd: dirname(entryPath),
      env: {
        ...process.env,
        OD_PACKAGED_NAMESPACE: config.namespace,
        OD_DATA_DIR: dirname(config.roots.runtime.namespaceBaseRoot),
        OD_RESOURCE_ROOT: paths.resourceRoot,
      },
      logFd: logHandle.fd,
      resources: {
        dataRoot: join(config.roots.runtime.namespaceRoot, "data"),
        ownerPid: null,
        port: 0,
        runtimeRoot: join(config.roots.runtime.namespaceRoot, "runtime"),
      },
      stamp,
    }, { ownerStamps: launchStamps, timeoutMs: 95_000 });
    child = { pid: convergence.description.resources.pid };
  } finally {
    await logHandle.close().catch(() => undefined);
  }

  const active = await waitForLinuxStatus<DesktopStatusSnapshot>(launchStamps, 95_000);
  if (active == null) {
    await stopSidecars(launchStamps.map((candidate) => ({ stamp: candidate }))).catch(() => undefined);
    throw new Error(`headless sidecar did not become ready within 95s for ${config.namespace}`);
  }

  return {
    launcherPath: headlessLauncherPath(config),
    logPath,
    namespace: config.namespace,
    pid: child.pid,
    status: active.status,
  };
}

export async function stopPackedLinuxHeadless(config: ToolPackConfig): Promise<LinuxStopResult> {
  const stopped = await stopSidecars(packagedSidecarStopRequests(config, "headless"));

  return {
    gracefulRequested: stopped.gracefulAccepted,
    namespace: config.namespace,
    remainingPids: stopped.remainingPids,
    status: stopped.remainingPids.length > 0 ? "partial" : stopped.matchedPids.length > 0 ? "stopped" : "not-running",
    stoppedPids: stopped.stoppedPids,
  };
}

export async function cleanupPackedLinuxNamespace(
  config: ToolPackConfig,
  options: { headless?: boolean } = {},
): Promise<LinuxCleanupResult> {
  const mode = resolveLinuxLifecycleMode(options, "cleanup");
  const stop = mode === "headless"
    ? await stopPackedLinuxHeadless(config)
    : await stopPackedLinuxApp(config);
  const outputRoot = config.roots.output.namespaceRoot;
  const runtimeNamespaceRoot = config.roots.runtime.namespaceRoot;

  assertLinuxStopComplete(stop, "cleanup");

  if (mode === "headless") {
    const desktopRunning = await Promise.all([
      findSidecarProcesses(linuxStamp(config)),
      findSidecarProcesses(linuxStamp(config, { source: SIDECAR_SOURCES.PACKAGED })),
    ]);
    if (desktopRunning.some((processes) => processes.length > 0)) {
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
