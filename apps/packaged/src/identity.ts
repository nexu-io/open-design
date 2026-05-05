import { dirname } from "node:path";

import { removeFile, writeJsonFile } from "@open-design/sidecar";
import type { SidecarStamp } from "@open-design/sidecar-proto";

import type { PackagedNamespacePaths } from "./paths.js";

export type PackagedDesktopRootIdentity = {
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

export type PackagedDesktopIdentityHandle = {
  close(): Promise<void>;
  identity: PackagedDesktopRootIdentity;
};

function resolveCurrentMacAppPath(executablePath: string): string {
  return dirname(dirname(dirname(executablePath)));
}

function createPackagedDesktopRootIdentity(options: {
  paths: PackagedNamespacePaths;
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
    stamp: options.stamp,
    startedAt: now,
    updatedAt: now,
    version: 1,
  };
}

export async function writePackagedDesktopIdentity(options: {
  paths: PackagedNamespacePaths;
  stamp: SidecarStamp;
}): Promise<PackagedDesktopIdentityHandle> {
  const identity = createPackagedDesktopRootIdentity(options);

  const writeIdentity = async () => {
    identity.updatedAt = new Date().toISOString();
    await writeJsonFile(options.paths.desktopIdentityPath, identity);
  };

  await writeIdentity();
  const heartbeat = setInterval(() => {
    void writeIdentity().catch(() => undefined);
  }, 5000);
  heartbeat.unref();

  return {
    async close() {
      clearInterval(heartbeat);
      await removeFile(options.paths.desktopIdentityPath).catch(() => undefined);
    },
    identity,
  };
}
