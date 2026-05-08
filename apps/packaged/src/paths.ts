import { join } from "node:path";

import { APP_KEYS } from "@open-design/sidecar-proto";

import type { PackagedConfig } from "./config.js";

export type PackagedNamespacePaths = {
  cacheRoot: string;
  desktopIdentityPath: string;
  desktopLogPath: string;
  dataRoot: string;
  desktopLogsRoot: string;
  electronSessionDataRoot: string;
  electronUserDataRoot: string;
  logsRoot: string;
  namespaceRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
  webIdentityPath: string;
};

export function resolvePackagedNamespacePaths(
  config: PackagedConfig,
  namespace = config.namespace,
): PackagedNamespacePaths {
  const namespaceRoot = join(config.namespaceBaseRoot, namespace);

  return {
    cacheRoot: join(namespaceRoot, "cache"),
    desktopIdentityPath: join(namespaceRoot, "runtime", "desktop-root.json"),
    desktopLogPath: join(namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log"),
    dataRoot: join(namespaceRoot, "data"),
    desktopLogsRoot: join(namespaceRoot, "logs", APP_KEYS.DESKTOP),
    electronSessionDataRoot: join(namespaceRoot, "user-data", "session"),
    electronUserDataRoot: join(namespaceRoot, "user-data"),
    logsRoot: join(namespaceRoot, "logs"),
    namespaceRoot,
    resourceRoot: config.resourceRoot,
    runtimeRoot: join(namespaceRoot, "runtime"),
    webIdentityPath: join(namespaceRoot, "runtime", "web-root.json"),
  };
}
