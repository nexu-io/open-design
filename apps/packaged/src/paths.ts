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

// The packaged runtime contract requires OD_DATA_DIR to be absolute: a relative
// value would make namespaceBaseRoot/log/runtime/daemon-data paths cwd-relative,
// forking the runtime tree from the daemon's data dir. Both the Electron-packaged
// resolver and the WebUI launcher resolver MUST fail fast through this one guard
// so they reject relative paths identically. `expanded` is the home-expanded
// value; `rawValue` is the original env string, echoed in the error for the user.
function assertAbsoluteOdDataDir(expanded: string, rawValue: string): void {
  const isAbs = process.platform === "win32"
    ? win32.isAbsolute(expanded)
    : isAbsolute(expanded);
  if (isAbs) return;
  throw new PackagedPathAccessError(
    [
      "Open Design's packaged runtime requires OD_DATA_DIR to be an absolute path.",
      "",
      `Configured value: ${rawValue}`,
      "",
      "Set OD_DATA_DIR to an absolute path (for example, C:\\\\Users\\\\You\\\\OpenDesign on Windows or /Users/you/OpenDesign on macOS/Linux) and relaunch Open Design.",
    ].join("\n"),
    { title: "Open Design cannot start with this OD_DATA_DIR" },
  );
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
    assertAbsoluteOdDataDir(expanded, odDataDir);
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

// WebUI (no-Electron) launcher: derive the `namespaces/` parent directory from
// OD_DATA_DIR — or the XDG/home fallback when it is unset. This MUST follow the
// same scoped-vs-unscoped rule as resolvePackagedDataRoot(): a scoped
// OD_DATA_DIR already points *inside* the tree (`<base>/namespaces/<ns>/data`),
// so its `namespaces/` parent is two levels up; an unscoped base still needs the
// `namespaces` segment appended. Blindly appending `namespaces` to a scoped
// value forks the launcher's runtime/log tree away from the daemon's data dir,
// leaving the started instance pointing at a different path tree. Pure for tests.
export function resolveWebuiNamespacesRoot(input: {
  odDataDir?: string | null;
  xdgDataHome?: string | null;
  home: string;
}): string {
  const odDataDir = input.odDataDir?.trim();
  if (odDataDir) {
    const expanded = expandHomePrefix(odDataDir);
    // Same absolute-path contract as resolvePackagedDataRoot(): a relative
    // OD_DATA_DIR (or a relative dataDir the launcher copies into the env) must
    // fail fast here instead of producing a cwd-relative namespaces root.
    assertAbsoluteOdDataDir(expanded, odDataDir);
    if (getScopedPackagedDataRootNamespace(expanded) != null) {
      // `<base>/namespaces/<ns>/data` → `<base>/namespaces`
      return join(expanded, "..", "..");
    }
    return join(expanded, "namespaces");
  }
  // Per the XDG Base Directory spec a relative XDG_DATA_HOME is invalid and must
  // be ignored. Honoring it would build a cwd-relative namespaces/log/runtime
  // tree under whichever directory happened to invoke the launcher — the same
  // hazard the OD_DATA_DIR absolute-path guard above rejects. A relative (or
  // empty) value falls back to $HOME/.local/share, never to cwd.
  const xdg = input.xdgDataHome?.trim();
  const dataBase = xdg && xdg.length > 0 && isAbsolute(xdg) ? xdg : join(input.home, ".local", "share");
  return join(dataBase, "open-design", "namespaces");
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
