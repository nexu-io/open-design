import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, chmod, cp, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
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
  SidecarLaunchConvergenceError,
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
// First launch after a build/install extracts the whole AppImage payload into
// the user cache before Electron starts. The payload is large enough that the
// extraction alone can take a couple of minutes on a slow disk, so the start
// command waits longer than a warm launch would need.
const LINUX_APPIMAGE_LAUNCH_TIMEOUT_MS = 600_000;
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

// electron-builder's Linux target names. `all` stays AppImage-only on purpose:
// the release pipeline publishes exactly one Linux artifact, and adding
// optional formats must not make a release build depend on distro tooling
// (rpmbuild) that the release lane does not validate.
export type LinuxElectronTarget = "AppImage" | "dir" | "rpm";

export function resolveLinuxElectronTargets(to: ToolPackConfig["to"]): LinuxElectronTarget[] {
  switch (to) {
    case "dir":
      return ["dir"];
    case "rpm":
      return ["rpm"];
    case "appimage":
    case "all":
      return ["AppImage"];
    default:
      throw new Error(`unsupported linux build output: ${to}`);
  }
}

/**
 * RPM dependencies for the native package.
 *
 * The first block mirrors electron-builder's Fedora/RHEL defaults (the
 * `depends` field replaces them rather than appending). The last two sonames
 * are Electron 41 runtime links: `gtk3` does not pull them on Fedora, so
 * `dnf install` succeeds but the binary then fails with
 * `error while loading shared libraries: libgbm.so.1`. Sonames resolve on
 * Fedora/RHEL/openSUSE, where the providing package names differ.
 */
export const LINUX_RPM_DEPENDS = [
  "gtk3",
  "libnotify",
  "nss",
  "libXScrnSaver",
  "(libXtst or libXtst6)",
  "xdg-utils",
  "at-spi2-core",
  "(libuuid or libuuid1)",
  "libgbm.so.1()(64bit)",
  "libasound.so.2()(64bit)",
] as const;

/**
 * RPM packaging options that keep the payload encoder memory-bounded.
 *
 * electron-builder rewrites its `"xz"` default to fpm's `"xzmt"` (threaded
 * xz). On a 2.5 GB payload that encoder peaks at several times the payload
 * size and gets OOM-killed on ordinary 16 GB hosts. fpm accepts a later
 * `--rpm-compression` and the last value wins, so pin the single-threaded
 * encoder explicitly. The resulting RPM is the same size; it just takes longer
 * to build and uses a fraction of the RAM.
 */
export function linuxRpmBuilderOptions(
  targets: readonly LinuxElectronTarget[],
): { depends: string[]; fpm: string[] } | null {
  if (!targets.includes("rpm")) return null;
  return { depends: [...LINUX_RPM_DEPENDS], fpm: ["--rpm-compression", "xz"] };
}

export type LinuxArtifacts = {
  appImage: string | null;
  deb: string | null;
  rpm: string | null;
};

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
  //     to one of "all" | "appimage" | "dir"
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
    `export PNPM_HOME=${CONTAINER_PNPM_HOME} PATH=${CONTAINER_PNPM_HOME}:$PATH && ` +
    `command -v node >/dev/null`;
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
    "-e",
    "ELECTRON_CACHE=/home/builder/.cache/electron",
    "-e",
    "ELECTRON_BUILDER_CACHE=/home/builder/.cache/electron-builder",
    "-e",
    `${PRODUCTION_INSTALL_PNPM_BIN_ENV}=${CONTAINER_PNPM_PATH}`,
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

function desktopEntryQuote(value: string): string {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("`", "\\`")
    .replaceAll("$", "\\$")
    // Desktop-entry field codes are expanded even inside quotes; `%%` is the
    // literal-percent escape.
    .replaceAll("%", "%%")}"`;
}

export function renderDesktopTemplate(template: string, values: DesktopTemplateValues): string {
  return template
    .replace(/@@NAMESPACE@@/g, values.namespace)
    .replace(/@@EXEC_PATH@@/g, desktopEntryQuote(values.execPath))
    .replace(/@@ICON_PATH@@/g, values.iconName);
}

export type LinuxLauncherTemplateValues = {
  appImagePath: string;
  namespace: string;
};

export function renderLinuxLauncher(template: string, values: LinuxLauncherTemplateValues): string {
  return template
    .replace(/@@APPIMAGE_PATH@@/g, shellQuote(values.appImagePath))
    .replace(/@@NAMESPACE@@/g, shellQuote(values.namespace));
}

export function renderLinuxPackagedMainEntry(): string {
  return 'import("@open-design/packaged").catch((error) => {\n  console.error("packaged entry failed", error);\n  process.exit(1);\n});\n';
}

export function renderLinuxAppImageAppRun(): string {
  return `#!/bin/bash
set -e

THIS="$0"
args=("$@")

if [ -z "$APPDIR" ] ; then
  path="$(dirname "$(readlink -f "\${THIS}")")"
  while [[ "$path" != "" && ! -e "$path/AppRun" ]]; do
    path=\${path%/*}
  done
  APPDIR="$path"
fi

# A FUSE-mounted AppImage reads every payload file through a userspace daemon,
# which makes the packaged daemon's cold start several times slower than the
# same payload read from a local directory. Extract once into a per-identity
# cache and re-exec the cached AppRun on every later launch instead of paying
# that cost again. The cache key tracks the AppImage path, size, and mtime, so
# replacing the AppImage never reuses a stale payload.
appimage_cache_root() {
  if [ -n "\${XDG_CACHE_HOME:-}" ] ; then
    printf '%s' "$XDG_CACHE_HOME"
  elif [ -n "\${HOME:-}" ] ; then
    printf '%s' "$HOME/.cache"
  else
    printf '%s' "\${TMPDIR:-/tmp}/open-design-cache-\${UID:-0}"
  fi
}

appimage_cache_dir() {
  cache_root="$(appimage_cache_root)"
  key="$(printf '%s' "$APPIMAGE" | cksum | cut -d' ' -f1)-$(stat -c '%s-%Y' "$APPIMAGE" 2>/dev/null || printf 'unknown')"
  printf '%s/open-design/appimage/%s' "$cache_root" "$key"
}

# The lock is keyed to the AppImage path only, not to the cache key. Replacing
# the file at the same path (for example, tools-pack linux install while the
# old build is running) must not create a second instance; the new file still
# gets a new cache directory because that key includes size and mtime.
appimage_lock_path() {
  cache_root="$(appimage_cache_root)"
  key="$(printf '%s' "$APPIMAGE" | cksum | cut -d' ' -f1)"
  printf '%s/open-design/appimage/%s.lock' "$cache_root" "$key"
}

# The runtime's extract-and-run flag is still a valid manual fallback, but it
# extracts before this script starts and therefore cannot populate this cache.
# Only the runtime's FUSE mount (APPDIR under a */.mount_* directory) re-execs
# here; an extracted run (APPDIR=/tmp/appimage_extracted_*) continues normally.
# The launch lock below still applies to both modes. The lock file is keyed to
# the AppImage path (stable across replacements) and the fd is inherited
# through exec into the desktop. The detached sidecar supervisor takes
# ownership of this fd during bootstrap (OD_APPIMAGE_LOCK_FD) and holds it for
# the desktop generation, including payload handoffs. A cached AppRun sees the
# env var and skips re-acquisition.
lock_path=""
if [ -z "\${OD_APPIMAGE_LOCK_FD:-}" ] && [ -n "\${APPIMAGE:-}" ] ; then
  if lock_path="$(appimage_lock_path 2>/dev/null)" ; then
    lock_parent="$(dirname "$lock_path")"
    if mkdir -p "$lock_parent" 2>/dev/null ; then
      if command -v flock >/dev/null 2>&1 && exec 8>"$lock_path" ; then
        if ! flock -n 8 ; then
          echo "open-design: Open Design is already running." >&2
          exit 0
        fi
        export OD_APPIMAGE_LOCK_FD=8
      fi
    fi
  fi
fi

case "\${APPDIR:-}" in
  */.mount_*)
    if [ -z "\${OD_APPIMAGE_EXTRACTED_RUN:-}" ] && [ -n "\${APPIMAGE:-}" ] ; then
      export OD_APPIMAGE_EXTRACTED_RUN=1
      if cache_dir="$(appimage_cache_dir 2>/dev/null)" ; then
        cache_parent="$(dirname "$cache_dir")"
        if mkdir -p "$cache_parent" 2>/dev/null ; then
          if [ ! -x "$cache_dir/AppRun" ] ; then
            extract_dir="$cache_parent/.extract.$$"
            rm -rf "$extract_dir"
            if mkdir -p "$extract_dir" && ( cd "$extract_dir" && "$APPIMAGE" --appimage-extract >extract.log 2>&1 ) && [ -x "$extract_dir/squashfs-root/AppRun" ] ; then
              rm -rf "$cache_dir"
              mv "$extract_dir/squashfs-root" "$cache_dir" 2>/dev/null || true
            else
              if [ -f "$extract_dir/extract.log" ] ; then
                mv "$extract_dir/extract.log" "$cache_parent/extract.log" 2>/dev/null || true
              fi
              echo "open-design: could not prepare the AppImage cache; see $cache_parent/extract.log" >&2
            fi
            rm -rf "$extract_dir"
          fi
          if [ -x "$cache_dir/AppRun" ] ; then
            APPDIR="$cache_dir"
            export APPDIR
            exec "$cache_dir/AppRun" "\${args[@]}"
          fi
        fi
        # Cache setup failed (read-only cache root, full disk, ...). Continue
        # from the FUSE mount so the app still starts, just with slower reads.
      fi
    fi
    ;;
esac

export PATH="\${APPDIR}:\${APPDIR}/usr/sbin:\${PATH}"
export XDG_DATA_DIRS="./share/:/usr/share/gnome:/usr/local/share/:/usr/share/:\${XDG_DATA_DIRS}"
export LD_LIBRARY_PATH="\${APPDIR}/usr/lib:\${LD_LIBRARY_PATH}"
export XDG_DATA_DIRS="\${APPDIR}"/usr/share/:"\${XDG_DATA_DIRS}":/usr/share/gnome/:/usr/local/share/:/usr/share/
export GSETTINGS_SCHEMA_DIR="\${APPDIR}/usr/share/glib-2.0/schemas:\${GSETTINGS_SCHEMA_DIR}"

BIN="$APPDIR/${PRODUCT_NAME}"

# Chromium's namespace sandbox needs unprivileged user namespaces. Some hosts
# disable them (hardened kernels, kernel.unprivileged_userns_clone=0) or gate
# them behind AppArmor (Ubuntu 24.04+: kernel.apparmor_restrict_unprivileged_userns=1).
# Probe the capability instead of shipping --no-sandbox to every user: a probe
# that cannot run is treated as "unavailable" so the app still starts, and
# OD_LINUX_SANDBOX=on|off lets a user override either direction.
sandbox_unavailable() {
  case "\${OD_LINUX_SANDBOX:-auto}" in
    on) return 1 ;;
    off) return 0 ;;
  esac
  command -v unshare >/dev/null 2>&1 || return 0
  ! unshare -Ur true >/dev/null 2>&1
}

if sandbox_unavailable ; then
  sandbox_flag_present=0
  for arg in "\${args[@]}" ; do
    [ "$arg" = "--no-sandbox" ] && sandbox_flag_present=1
  done
  if [ "$sandbox_flag_present" = 0 ] ; then
    args+=("--no-sandbox")
  fi
else
  # Desktop-integration tooling (including electron-builder's generated
  # AppImage entry) passes --no-sandbox unconditionally. Drop it when the host
  # can actually sandbox, so the fallback stays a fallback.
  filtered=()
  for arg in "\${args[@]}" ; do
    [ "$arg" = "--no-sandbox" ] || filtered+=("$arg")
  done
  args=("\${filtered[@]}")
fi

if [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then
  trap atexit EXIT
fi

isEulaAccepted=1

atexit()
{
  if [ $isEulaAccepted == 1 ] ; then
    unset ELECTRON_RUN_AS_NODE
    exec "$BIN" "\${args[@]}"
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
  // Three AppImage launch modes leave different executable paths in /proc/<pid>/exe:
  //   FUSE-mounted: /tmp/.mount_<hex>/AppRun
  //   --appimage-extract-and-run: /tmp/appimage_extracted_<hex>/<binary>
  //   AppRun cache: <cache-root>/open-design/appimage/<key>/<binary>
  // In all three cases the AppImage runtime (or our AppRun) sets $APPIMAGE to
  // the original install path.
  const isMountedRunner = /^\/tmp\/\.mount_[^/]+\/AppRun$/.test(snapshot.executable);
  const isExtractedRunner = /^\/tmp\/appimage_extracted_[^/]+\/[^/]+$/.test(snapshot.executable);
  const isCachedRunner = /\/open-design\/appimage\/[^/]+\/[^/]+$/.test(snapshot.executable);
  if ((isMountedRunner || isExtractedRunner || isCachedRunner) && snapshot.env.APPIMAGE === installPath) {
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
  installLauncherPath: string;
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
    installLauncherPath: join(
      home,
      ".local",
      "share",
      "open-design",
      sanitizeNamespace(config.namespace),
      "launch.sh",
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

// npm 12 blocks dependency install scripts unless the project approves them in
// its `allowScripts` field. The packaged daemon needs better-sqlite3 and
// node-pty native bindings; the remaining packages keep the same native/runtime
// behavior the Linux artifact had under npm 11. The same list is rendered into
// the assembled app's `pnpm-workspace.yaml`, because the containerized build
// puts the assembled app outside the repository workspace and pnpm 10 does not
// read npm's `allowScripts`.
export const LINUX_ASSEMBLED_ALLOW_SCRIPTS = [
  "@ffmpeg-installer/linux-x64",
  "@google/genai",
  "better-sqlite3",
  "core-js",
  "esbuild",
  "node-pty",
  "onnxruntime-node",
  "protobufjs",
  "sharp",
] as const;

export function linuxAssembledAllowScripts(): Record<string, true> {
  return Object.fromEntries(LINUX_ASSEMBLED_ALLOW_SCRIPTS.map((name) => [name, true]));
}

// pnpm 10 approves dependency build scripts only when the package is listed in
// `onlyBuiltDependencies` in the nearest `pnpm-workspace.yaml`. The assembled
// app is materialized under `/tools-pack` in the containerized build, so the
// repository's pnpm-workspace.yaml is not an ancestor and cannot approve the
// binding builds. Render the same approval list next to the generated
// package.json instead.
//
// The internal workspace tarballs reference sibling packages by version
// (`@open-design/contracts: 0.25.1`), not by `file:`. npm hoists the root's
// tarball dependencies and resolves them; pnpm's strict resolver would ask the
// public registry and get a 404. Override each internal package back to the
// root tarball so the containerized install stays self-contained.
export function renderLinuxPnpmWorkspace(
  packages: readonly string[] = LINUX_ASSEMBLED_ALLOW_SCRIPTS,
  overrides: Readonly<Record<string, string>> = {},
): string {
  const lines = [
    "onlyBuiltDependencies:",
    ...packages.map((name) => `  - ${JSON.stringify(name)}`),
  ];
  const entries = Object.entries(overrides);
  if (entries.length > 0) {
    lines.push(
      "overrides:",
      ...entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

// Picks the package manager used to materialize the assembled-app node_modules
// during writeAssembledApp. The default (`npm`) preserves host behavior for
// developer-machine builds. When the build runs inside
// `electronuserland/builder:base` (which strips npm, npx, and corepack),
// buildDockerArgs sets OD_TOOLS_PACK_PNPM_BIN to the standalone pnpm binary it
// bootstrapped, and this resolver routes the install through that binary.
// `--config.node-linker=hoisted` keeps the resulting layout flat so
// electron-builder packs node_modules the same way it does for npm-installed
// trees.
//
// Native install scripts stay enabled because the packaged daemon runs the
// assembled `better-sqlite3` binding under the bundled Node binary. Skipping
// scripts (a common shortcut for avoiding the optional ONNX CUDA download)
// produces an AppImage that exits with `Could not locate the bindings file`
// before reporting sidecar status. The CUDA provider is optional; the CPU
// provider is bundled, so the production install skips the CUDA download by
// default and leaves `ONNXRUNTIME_NODE_INSTALL_CUDA` as the explicit opt-in.
export function resolveProductionInstallCommand(env: NodeJS.ProcessEnv): ProductionInstallCommand {
  const pnpmBin = env[PRODUCTION_INSTALL_PNPM_BIN_ENV];
  if (pnpmBin != null && pnpmBin.length > 0) {
    return {
      command: pnpmBin,
      args: [
        "install",
        "--prod",
        "--no-lockfile",
        "--config.node-linker=hoisted",
        "--config.ignore-scripts=false",
      ],
    };
  }
  return {
    command: "npm",
    args: ["install", "--omit=dev", "--no-package-lock", "--ignore-scripts=false"],
  };
}

export function resolveProductionInstallEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    npm_config_ignore_scripts: "false",
    ONNXRUNTIME_NODE_INSTALL_CUDA: env.ONNXRUNTIME_NODE_INSTALL_CUDA ?? "skip",
  };
}

async function runProductionInstall(appRoot: string): Promise<void> {
  const { command, args } = resolveProductionInstallCommand(process.env);
  await execFileAsync(command, args, {
    cwd: appRoot,
    env: resolveProductionInstallEnv(process.env),
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
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "https://github.com/nexu-io/open-design.git"
    },
    allowScripts: linuxAssembledAllowScripts(),
  };
  await writeFile(paths.assembledPackageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  // The pnpm/container path runs outside the repository workspace, so the
  // repo-level onlyBuiltDependencies and overrides do not apply. Keep both the
  // native-build approval list and the internal-tarball overrides beside the
  // generated package.json for that install.
  await writeFile(
    join(paths.assembledAppRoot, "pnpm-workspace.yaml"),
    renderLinuxPnpmWorkspace(LINUX_ASSEMBLED_ALLOW_SCRIPTS, dependencies),
    "utf8",
  );

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

/**
 * electron-builder's Linux target block.
 *
 * Native packages deliberately do not set `executableArgs`. electron-builder's
 * FpmTarget uses `templates/linux/after-install.tpl`, which installs the
 * AppArmor profile where supported and marks `chrome-sandbox` setuid (4755)
 * when unprivileged user namespaces are unavailable. Adding
 * `["--no-sandbox"]` here would disable Chromium's sandbox for every RPM user
 * instead of only the hosts that cannot sandbox.
 */
export function createLinuxTargetConfig(
  targets: readonly LinuxElectronTarget[],
): Record<string, unknown> {
  return {
    target: [...targets],
    icon: linuxResources.icon,
    category: "Development",
    synopsis: "Open Design",
    maintainer: "Open Design Contributors",
    vendor: "Open Design Team",
  };
}

async function writeLinuxBuilderConfig(config: ToolPackConfig, paths: LinuxPaths): Promise<void> {
  const targets = resolveLinuxElectronTargets(config.to);
  const buildsAppImage = targets.includes("AppImage");
  const rpmOptions = linuxRpmBuilderOptions(targets);
  const namespaceToken = sanitizeNamespace(config.namespace);
  const packagedVersion = await readPackagedVersion(config);
  const packageVersion = electronBuilderVersionForAppVersion(packagedVersion);

  const builderConfig: Record<string, unknown> = {
    appId: "io.open-design.desktop",
    artifactName: buildsAppImage
      ? `${PRODUCT_NAME}-${namespaceToken}.\${ext}`
      : `open-design-${namespaceToken}.\${ext}`,
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
    executableName: PRODUCT_NAME,
    extraMetadata: {
      main: "./main.cjs",
      name: "open-design-packaged-app",
      productName: PRODUCT_NAME,
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
    files: ["**/*", "!**/node_modules/.bin", "!**/node_modules/electron{,/**/*}"],
    icon: linuxResources.icon,
    linux: createLinuxTargetConfig(targets),
    // Keep the AppImage launch fallback explicit. Our top-level AppRun wrapper
    // clears ELECTRON_RUN_AS_NODE before these Chromium flags reach Electron,
    // including for AppImageLauncher-generated desktop entries, and strips the
    // flag again when the sandbox probe succeeds. Native packages get their
    // sandbox setup from electron-builder's after-install template instead.
    appImage: {
      executableArgs: [...LINUX_APPIMAGE_EXECUTABLE_ARGS],
    },
    ...(rpmOptions != null ? { rpm: rpmOptions } : {}),
    nodeGypRebuild: false,
    npmRebuild: false,
    productName: PRODUCT_NAME,
  };

  await mkdir(dirname(paths.appBuilderConfigPath), { recursive: true });
  await writeFile(paths.appBuilderConfigPath, `${JSON.stringify(builderConfig, null, 2)}\n`, "utf8");
}

// --- Step 6: runElectronBuilderLinux + findBuiltAppImage helpers ---

/**
 * Force electron-builder's manual traversal collector for the assembled app.
 *
 * electron-builder 26.8.1's pnpm collector predates pnpm 10.29.3's deduped
 * dependency listing. pnpm prints a repeated subtree once and later references
 * it as a childless `deduped` stub; the collector can therefore omit transitive
 * packages such as jszip's `setimmediate` even though they are present in the
 * installed tree. The resulting RPM/AppImage starts and then exits with
 * `Cannot find module 'setimmediate'`.
 *
 * The manual traversal collector is electron-builder's supported fallback for
 * package managers it cannot query. It walks the installed `node_modules` tree
 * directly, so it does not depend on pnpm's JSON shape and does not need npm or
 * pnpm on PATH (the official container intentionally ships pnpm only).
 * electron-builder's package-manager detection checks these npm/pnpm environment
 * markers before falling back to npm, so mark the child environment as
 * `traversal`. The marker is build-environment-only and never reaches the app.
 *
 * Upstream fixed the pnpm collector in electron-builder 26.9.0; this branch
 * keeps the pinned 26.8.1 and uses its supported traversal fallback instead of
 * bumping the dependency in this PR.
 */
export function resolveLinuxElectronBuilderEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    npm_config_user_agent: "traversal",
    npm_execpath: "traversal",
  };
}

export type LinuxPackagedDaemonPaths = {
  appOutDir: string;
  daemonCliPath: string;
  nodePath: string;
};

export function resolveLinuxPackagedDaemonPaths(appBuilderOutputRoot: string): LinuxPackagedDaemonPaths {
  const appOutDir = join(appBuilderOutputRoot, "linux-unpacked");
  return {
    appOutDir,
    daemonCliPath: join(
      appOutDir,
      "resources",
      "app",
      "node_modules",
      "@open-design",
      "daemon",
      "dist",
      "cli.js",
    ),
    nodePath: join(appOutDir, "resources", "open-design", "bin", "node"),
  };
}

async function reserveEphemeralPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = address != null && typeof address === "object" ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.pid == null || child.exitCode != null || child.signalCode != null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function terminateProbeChild(child: ChildProcess): void {
  if (child.pid == null || child.exitCode != null || child.signalCode != null) {
    return;
  }
  try {
    // The probe is detached so the daemon and any short-lived children share a
    // process group; kill the group so a failed probe cannot leave a daemon
    // holding the probe port.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

/**
 * Start the packaged daemon from `linux-unpacked` and wait for /api/health.
 *
 * This is a packaging gate, not a unit test: it loads the exact dependency tree
 * electron-builder placed in the artifact, including native bindings, and
 * catches transitive modules that the collector may have omitted. A daemon that
 * exits before listening (for example with `Cannot find module 'setimmediate'`)
 * fails the build instead of producing a broken installer.
 */
export async function verifyLinuxPackagedDaemon(
  paths: { appBuilderOutputRoot: string },
): Promise<void> {
  const probe = resolveLinuxPackagedDaemonPaths(paths.appBuilderOutputRoot);
  if (!(await pathExists(probe.nodePath))) {
    throw new Error(`packaged daemon probe: bundled Node not found at ${probe.nodePath}`);
  }
  if (!(await pathExists(probe.daemonCliPath))) {
    throw new Error(`packaged daemon probe: daemon CLI not found at ${probe.daemonCliPath}`);
  }

  const probeRoot = join(paths.appBuilderOutputRoot, ".daemon-probe");
  const dataDir = join(probeRoot, "data");
  const homeDir = join(probeRoot, "home");
  await rm(probeRoot, { force: true, recursive: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });

  const port = await reserveEphemeralPort();
  let stdout = "";
  let stderr = "";
  let spawnError: Error | null = null;
  const child = spawn(
    probe.nodePath,
    [probe.daemonCliPath, "--port", String(port), "--host", "127.0.0.1", "--no-open"],
    {
      cwd: probe.appOutDir,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        HOME: homeDir,
        OD_DATA_DIR: dataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  const getSpawnError = (): Error | null => spawnError;

  const tail = (value: string): string => (value.length > 4000 ? value.slice(-4000) : value);
  const failure = (reason: string): Error =>
    new Error(
      `packaged daemon probe failed: ${reason}\n` +
        `--- daemon stdout ---\n${tail(stdout)}\n` +
        `--- daemon stderr ---\n${tail(stderr)}`,
    );

  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const currentSpawnError = getSpawnError();
      if (currentSpawnError != null) {
        throw failure(`could not start ${probe.nodePath}: ${currentSpawnError.message}`);
      }
      if (child.exitCode != null || child.signalCode != null) {
        throw failure(
          `daemon exited before becoming healthy (code=${child.exitCode ?? "null"}, signal=${child.signalCode ?? "null"})`,
        );
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          const body = (await response.json()) as { ok?: unknown };
          if (body.ok === true) {
            return;
          }
        }
      } catch {
        // The daemon is still starting (or the health endpoint is not bound
        // yet); keep polling until the deadline.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw failure(`daemon did not report healthy within 30s on port ${port}`);
  } finally {
    terminateProbeChild(child);
    await waitForChildExit(child, 5000);
    if (child.pid != null && child.exitCode == null && child.signalCode == null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      await waitForChildExit(child, 1000);
    }
    await rm(probeRoot, { force: true, recursive: true });
  }
}

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
    env: resolveLinuxElectronBuilderEnv(process.env),
  });
  try {
    await verifyLinuxPackagedDaemon(paths);
  } catch (error) {
    // Do not leave a broken installer next to a failed probe; the next build
    // would otherwise be able to hand off the same artifact by path.
    await rm(paths.appBuilderOutputRoot, { force: true, recursive: true });
    throw error;
  }
}

export function classifyLinuxBuilderArtifacts(
  entries: readonly string[],
  outputRoot: string,
): LinuxArtifacts {
  const find = (suffix: string): string | null => {
    const match = entries.find((entry) => entry.endsWith(suffix));
    return match == null ? null : join(outputRoot, match);
  };
  return {
    appImage: find(".AppImage"),
    deb: find(".deb"),
    rpm: find(".rpm"),
  };
}

async function findBuiltLinuxArtifacts(paths: LinuxPaths): Promise<LinuxArtifacts> {
  if (!(await pathExists(paths.appBuilderOutputRoot))) {
    return { appImage: null, deb: null, rpm: null };
  }
  return classifyLinuxBuilderArtifacts(
    await readdir(paths.appBuilderOutputRoot),
    paths.appBuilderOutputRoot,
  );
}

// --- Step 7: packLinux orchestrator + result type + stub for runBuildInContainer ---

export type LinuxPackResult = {
  appImagePath: string | null;
  artifacts: LinuxArtifacts;
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
    const artifacts = config.to === "dir"
      ? { appImage: null, deb: null, rpm: null }
      : await findBuiltLinuxArtifacts(paths);
    return {
      appImagePath: artifacts.appImage,
      artifacts,
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
  if (resolveLinuxElectronTargets(config.to).includes("AppImage")) {
    await writeLinuxAppImageAppRun(paths);
  }
  await writeLinuxBuilderConfig(config, paths);
  await runElectronBuilderLinux(config, paths);

  const artifacts = config.to === "dir"
    ? { appImage: null, deb: null, rpm: null }
    : await findBuiltLinuxArtifacts(paths);
  return {
    appImagePath: artifacts.appImage,
    artifacts,
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
  launcherPath: string;
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

async function requireBuiltAppImage(paths: LinuxPaths, action: string): Promise<string> {
  const artifacts = await findBuiltLinuxArtifacts(paths);
  if (artifacts.appImage != null) return artifacts.appImage;
  const nativePackage = artifacts.deb ?? artifacts.rpm;
  if (nativePackage != null) {
    throw new Error(
      `this build produced a native package, not an AppImage: ${nativePackage}. ` +
        `Install it with your distro package manager (\`sudo apt install ./<file>.deb\` or ` +
        `\`sudo dnf install ./<file>.rpm\`), or rebuild with \`--to appimage\` for the ` +
        `AppImage lifecycle (${action}).`,
    );
  }
  throw new Error(`no AppImage found in builder output; run \`tools-pack linux build\` first (${action})`);
}

export async function installPackedLinuxApp(config: ToolPackConfig): Promise<LinuxInstallResult> {
  const paths = resolveLinuxPaths(config);
  const builtAppImage = await requireBuiltAppImage(paths, "install");

  await mkdir(dirname(paths.installAppImagePath), { recursive: true });
  await mkdir(dirname(paths.installDesktopFilePath), { recursive: true });
  await mkdir(dirname(paths.installIconPath), { recursive: true });
  await mkdir(dirname(paths.installLauncherPath), { recursive: true });

  // Copy AppImage with executable bit.
  await cp(builtAppImage, paths.installAppImagePath);
  await chmod(paths.installAppImagePath, 0o755);

  // Copy icon.
  await cp(linuxResources.icon, paths.installIconPath);

  // The desktop entry must not point at the AppImage directly: the AppImage
  // runtime mounts its SquashFS before AppRun runs, so a host without
  // libfuse.so.2 fails before the cache fallback can help. The external
  // launcher chooses the cached/FUSE path when mounting works and falls back
  // to --appimage-extract-and-run when it does not.
  const launcherTemplate = await readFile(linuxResources.launcherTemplate, "utf8");
  const renderedLauncher = renderLinuxLauncher(launcherTemplate, {
    appImagePath: paths.installAppImagePath,
    namespace: sanitizeNamespace(config.namespace),
  });
  const tmpLauncherPath = `${paths.installLauncherPath}.tmp`;
  await writeFile(tmpLauncherPath, renderedLauncher, "utf8");
  await chmod(tmpLauncherPath, 0o755);
  await rename(tmpLauncherPath, paths.installLauncherPath);

  // Render and atomic-write the .desktop file.
  const template = await readFile(linuxResources.desktopTemplate, "utf8");
  const rendered = renderDesktopTemplate(template, {
    namespace: sanitizeNamespace(config.namespace),
    execPath: paths.installLauncherPath,
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
    launcherPath: paths.installLauncherPath,
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
  const built = !installed ? (await findBuiltLinuxArtifacts(paths)).appImage : null;
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

  const launch = (args: string[], extraEnv: NodeJS.ProcessEnv = {}) => convergeSidecarLaunch({
    args,
    command: appImagePath,
    cwd: dirname(appImagePath),
    env: { ...createLinuxDesktopLaunchEnv(config, stamp), ...extraEnv },
    logFd: null,
    resources: {
      dataRoot: join(config.roots.runtime.namespaceRoot, "data"),
      ownerPid: null,
      port: 0,
      runtimeRoot: join(config.roots.runtime.namespaceRoot, "runtime"),
    },
    stamp,
  }, { ownerStamps: launchStamps, timeoutMs: LINUX_APPIMAGE_LAUNCH_TIMEOUT_MS });

  // AppRun extracts the payload once into a user cache and re-execs the cached
  // copy on later launches, so the first start after a build or install pays
  // the extraction cost and the timeout below covers that first run.
  let convergence: Awaited<ReturnType<typeof launch>>;
  try {
    convergence = await launch([]);
  } catch (error) {
    // The AppImage runtime needs libfuse.so.2 to mount its SquashFS. Minimal
    // hosts and containers often lack it, so retry through the runtime's own
    // extract path, which needs no FUSE (and cannot use the AppRun cache).
    // NO_CLEANUP keeps that tree alive for the detached sidecars; otherwise the
    // runtime deletes it as soon as the launcher exits.
    if (!(error instanceof SidecarLaunchConvergenceError)) throw error;
    convergence = await launch(["--appimage-extract-and-run"], { NO_CLEANUP: "1" });
  }

  const active = await waitForLinuxStatus<DesktopStatusSnapshot>(
    launchStamps,
    LINUX_APPIMAGE_LAUNCH_TIMEOUT_MS,
  );
  if (active == null) {
    await stopSidecars(launchStamps.map((candidate) => ({ stamp: candidate }))).catch(() => undefined);
    throw new Error(
      `desktop sidecar did not become ready within ${LINUX_APPIMAGE_LAUNCH_TIMEOUT_MS / 1000}s for ${config.namespace}`,
    );
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
    launcher: "ok" | "already-removed";
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

  // Remove the desktop entry before the launcher and AppImage it references.
  const removedDesktop = await tryRemove(paths.installDesktopFilePath);
  const removedLauncher = await tryRemove(paths.installLauncherPath);
  const removedAppImage = await tryRemove(paths.installAppImagePath);
  const removedIcon = await tryRemove(paths.installIconPath);

  const desktopDatabase = await bestEffortRun("update-desktop-database", [
    join(homedir(), ".local", "share", "applications"),
  ]);
  const iconCache = await bestEffortRun("gtk-update-icon-cache", [
    join(homedir(), ".local", "share", "icons", "hicolor"),
  ]);

  return {
    namespace: config.namespace,
    removed: {
      appImage: removedAppImage,
      desktop: removedDesktop,
      icon: removedIcon,
      launcher: removedLauncher,
    },
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
