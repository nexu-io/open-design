import { join } from "node:path";

import { APP_KEYS, normalizeNamespace } from "@open-design/sidecar-proto";

import type { PackagedConfig } from "./config.js";

export type PackagedNamespacePaths = {
  cacheRoot: string;
  desktopIdentityPath: string;
  desktopLogPath: string;
  dataRoot: string;
  desktopLogsRoot: string;
  electronSessionDataRoot: string;
  electronUserDataRoot: string;
  headlessIdentityPath: string;
  /**
   * Channel-root directory — one level above the `namespaces/` parent. The
   * daemon writes `installation.json` here so installationId survives any
   * reset of the namespace-scoped data subtree (namespace churn between
   * packaged versions, future per-namespace data wipes, etc.). See
   * `apps/daemon/src/installation.ts`.
   */
  installationRoot: string;
  installerObservationRoot: string;
  logsRoot: string;
  namespaceRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
  updateRoot: string;
  webIdentityPath: string;
};

export function resolvePackagedNamespacePaths(
  config: PackagedConfig,
  namespace = config.namespace,
): PackagedNamespacePaths {
  const normalizedNamespace = normalizeNamespace(namespace);
  const namespaceRoot = join(config.namespaceBaseRoot, normalizedNamespace);
  const dataRoot = join(namespaceRoot, "data");
  // Channel root = parent of the `namespaces/` directory. With the default
  // packaged layout this resolves to `<electronApp.userData>` — e.g.
  // `~/Library/Application Support/Open Design Nightly/` on mac. Custom
  // `namespaceBaseRoot` overrides (tests, multi-namespace deployments)
  // still get a usable parent here.
  const installationRoot = join(config.namespaceBaseRoot, "..");

  return {
    cacheRoot: join(namespaceRoot, "cache"),
    desktopIdentityPath: join(namespaceRoot, "runtime", "desktop-root.json"),
    desktopLogPath: join(namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log"),
    dataRoot,
    desktopLogsRoot: join(namespaceRoot, "logs", APP_KEYS.DESKTOP),
    electronSessionDataRoot: join(namespaceRoot, "user-data", "session"),
    electronUserDataRoot: join(namespaceRoot, "user-data"),
    headlessIdentityPath: join(namespaceRoot, "runtime", "headless-root.json"),
    installationRoot,
    installerObservationRoot: join(dataRoot, "observations", "installer"),
    logsRoot: join(namespaceRoot, "logs"),
    namespaceRoot,
    resourceRoot: config.resourceRoot,
    runtimeRoot: join(namespaceRoot, "runtime"),
    updateRoot: join(namespaceRoot, "updates"),
    webIdentityPath: join(namespaceRoot, "runtime", "web-root.json"),
  };
}
