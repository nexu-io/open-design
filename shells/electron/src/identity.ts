import { dirname } from "node:path";

import { removeFile, writeJsonFile } from "@open-design/sidecar";
import type { SidecarStamp } from "@open-design/sidecar-proto";

import type { PackagedNamespacePaths } from "./paths.js";
import type { PackagedRuntimeIdentity } from "./closure-runtime.js";

export type PackagedDesktopRootIdentity = {
  appPath: string;
  executablePath: string;
  logPath: string;
  namespaceRoot: string;
  pid: number;
  ppid: number;
  runtime?: PackagedRuntimeIdentity;
  stamp: SidecarStamp;
  startedAt: string;
  updatedAt: string;
  version: 1;
};

export type PackagedWebRootIdentity = {
  namespace: string;
  pid: number;
  url: string;
  startedAt: string;
  version: 1;
};

export type PackagedDesktopIdentityHandle = {
  close(): Promise<void>;
  identity: PackagedDesktopRootIdentity;
  updateRuntimeIdentity(runtime: PackagedRuntimeIdentity): Promise<void>;
};

function resolveCurrentMacAppPath(executablePath: string): string {
  return dirname(dirname(dirname(executablePath)));
}

function createPackagedDesktopRootIdentity(options: {
  paths: PackagedNamespacePaths;
  runtimeIdentity?: PackagedRuntimeIdentity;
  stamp: SidecarStamp;
}): PackagedDesktopRootIdentity {
  const now = new Date().toISOString();
  const executablePath = process.execPath;

  return {
    appPath: resolveCurrentMacAppPath(executablePath),
    executablePath,
    logPath: options.paths.desktopLogPath,
    namespaceRoot: options.paths.namespaceRoot,
    pid: process.pid,
    ppid: process.ppid,
    ...(options.runtimeIdentity == null ? {} : { runtime: options.runtimeIdentity }),
    stamp: options.stamp,
    startedAt: now,
    updatedAt: now,
    version: 1,
  };
}

export async function writePackagedDesktopIdentity(options: {
  identityPath?: string;
  paths: PackagedNamespacePaths;
  runtimeIdentity?: PackagedRuntimeIdentity;
  stamp: SidecarStamp;
}): Promise<PackagedDesktopIdentityHandle> {
  const identity = createPackagedDesktopRootIdentity(options);
  const identityPath = options.identityPath ?? options.paths.desktopIdentityPath;

  const writeIdentity = async () => {
    identity.updatedAt = new Date().toISOString();
    await writeJsonFile(identityPath, identity);
  };

  await writeIdentity();
  const heartbeat = setInterval(() => {
    void writeIdentity().catch(() => undefined);
  }, 5000);
  heartbeat.unref();

  return {
    async close() {
      clearInterval(heartbeat);
      await removeFile(identityPath).catch(() => undefined);
    },
    identity,
    async updateRuntimeIdentity(runtime) {
      identity.runtime = runtime;
      await writeIdentity();
    },
  };
}

export async function writePackagedWebIdentity(options: {
  paths: PackagedNamespacePaths;
  pid: number;
  url: string;
}): Promise<void> {
  const identity: PackagedWebRootIdentity = {
    namespace: options.paths.namespaceRoot.split("/").pop() ?? "default",
    pid: options.pid,
    url: options.url,
    startedAt: new Date().toISOString(),
    version: 1,
  };
  await writeJsonFile(options.paths.webIdentityPath, identity);
}
