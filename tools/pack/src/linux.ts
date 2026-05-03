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
