import { homedir } from "node:os";
import { isAbsolute, join, win32 } from "node:path";

import { APP_KEYS, normalizeNamespace } from "@open-design/sidecar-proto";

import type { PackagedConfig } from "./config.js";
import { PackagedPathAccessError } from "./errors.js";

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

const HOME_BARE_TOKENS = new Set(["~", "$HOME", "${HOME}"]);
const HOME_PREFIX_RE = /^(~|\$\{HOME\}|\$HOME)[/\\](.*)$/;

function expandHomePrefix(raw: string): string {
  if (HOME_BARE_TOKENS.has(raw)) return homedir();
  const match = HOME_PREFIX_RE.exec(raw);
  if (match) return join(homedir(), match[2] ?? "");
  return raw;
}

function getScopedPackagedDataRootNamespace(raw: string): string | null {
  const parts = raw.replace(/[\\/]+$/g, "").split(/[\\/]+/);
  const last = parts.length - 1;
  if (last < 2) return null;
  if (parts[last - 2] !== "namespaces" || parts[last] !== "data") return null;
  return parts[last - 1] ?? null;
}

function resolvePackagedDataRoot(
  config: Pick<PackagedConfig, "namespaceBaseRoot">,
  namespace: string,
  env: NodeJS.ProcessEnv = {},
): string {
  const odDataDir = env.OD_DATA_DIR?.trim();
  if (odDataDir) {
    const expanded = expandHomePrefix(odDataDir);
    const isAbs = process.platform === "win32"
      ? win32.isAbsolute(expanded)
      : isAbsolute(expanded);
    if (!isAbs) {
      throw new PackagedPathAccessError(
        [
          "Open Design's packaged runtime requires OD_DATA_DIR to be an absolute path.",
          "",
          `Configured value: ${odDataDir}`,
          "",
          "Set OD_DATA_DIR to an absolute path (for example, C:\\\\Users\\\\You\\\\OpenDesign on Windows or /Users/you/OpenDesign on macOS/Linux) and relaunch Open Design.",
        ].join("\n"),
        { title: "Open Design cannot start with this OD_DATA_DIR" },
      );
    }
    const scopedNamespace = getScopedPackagedDataRootNamespace(expanded);
    if (scopedNamespace) {
      if (scopedNamespace !== namespace) {
        throw new PackagedPathAccessError(
          [
            "Open Design's packaged runtime requires OD_DATA_DIR to target the active namespace.",
            "",
            `Configured value: ${odDataDir}`,
            `Configured namespace: ${scopedNamespace}`,
            `Active namespace: ${namespace}`,
            "",
            "Use an unscoped absolute base path or relaunch the matching packaged namespace.",
          ].join("\n"),
          { title: "Open Design cannot start with this OD_DATA_DIR" },
        );
      }
      return expanded;
    }
    return join(expanded, "namespaces", namespace, "data");
  }

  return join(config.namespaceBaseRoot, namespace, "data");
}

export function resolvePackagedNamespacePaths(
  config: PackagedConfig,
  namespace = config.namespace,
  env: NodeJS.ProcessEnv = {},
): PackagedNamespacePaths {
  const normalizedNamespace = normalizeNamespace(namespace);
  const namespaceRoot = join(config.namespaceBaseRoot, normalizedNamespace);
  const dataRoot = resolvePackagedDataRoot(config, normalizedNamespace, env);
  // Channel root = parent of the `namespaces/` directory. With the default
  // packaged layout this resolves to `<electronApp.userData>` — e.g.
  // `~/Library/Application Support/Open Design Prerelease/` on mac. Custom
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
