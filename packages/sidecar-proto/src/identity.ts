/**
 * @module identity
 *
 * Sidecar process identity, runtime environment, and stamp constants — the
 * "who am I / where do I run" layer: app keys, dev/runtime modes, launch
 * sources, env-var names, CLI stamp flags/fields, filesystem/namespace
 * defaults, and the Windows release-namespace helpers. Depends on nothing
 * else in the package.
 */

export const APP_KEYS = Object.freeze({
  DAEMON: "daemon",
  DESKTOP: "desktop",
  WEB: "web",
} as const);

export type AppKey = (typeof APP_KEYS)[keyof typeof APP_KEYS];

export const SIDECAR_MODES = Object.freeze({
  DEV: "dev",
  RUNTIME: "runtime",
} as const);

export type SidecarMode = (typeof SIDECAR_MODES)[keyof typeof SIDECAR_MODES];

export const SIDECAR_SOURCES = Object.freeze({
  PACKAGED: "packaged",
  TOOLS_DEV: "tools-dev",
  TOOLS_PACK: "tools-pack",
} as const);

export type SidecarSource = (typeof SIDECAR_SOURCES)[keyof typeof SIDECAR_SOURCES];

export const SIDECAR_ENV = Object.freeze({
  BASE: "OD_SIDECAR_BASE",
  DAEMON_CLI_PATH: "OD_DAEMON_CLI_PATH",
  DAEMON_PORT: "OD_PORT",
  IPC_BASE: "OD_SIDECAR_IPC_BASE",
  IPC_PATH: "OD_SIDECAR_IPC_PATH",
  NAMESPACE: "OD_SIDECAR_NAMESPACE",
  SOURCE: "OD_SIDECAR_SOURCE",
  TOOLS_DEV_PARENT_PID: "OD_TOOLS_DEV_PARENT_PID",
  WEB_DIST_DIR: "OD_WEB_DIST_DIR",
  WEB_PORT: "OD_WEB_PORT",
  WEB_TSCONFIG_PATH: "OD_WEB_TSCONFIG_PATH",
} as const);

export const SIDECAR_RUNTIME_ENV = Object.freeze({
  base: SIDECAR_ENV.BASE,
  ipcBase: SIDECAR_ENV.IPC_BASE,
  ipcPath: SIDECAR_ENV.IPC_PATH,
  namespace: SIDECAR_ENV.NAMESPACE,
  source: SIDECAR_ENV.SOURCE,
} as const);

export const SIDECAR_STAMP_FLAGS = Object.freeze({
  app: "--od-stamp-app",
  ipc: "--od-stamp-ipc",
  mode: "--od-stamp-mode",
  namespace: "--od-stamp-namespace",
  source: "--od-stamp-source",
} as const);

export const STAMP_APP_FLAG = SIDECAR_STAMP_FLAGS.app;
export const STAMP_IPC_FLAG = SIDECAR_STAMP_FLAGS.ipc;
export const STAMP_MODE_FLAG = SIDECAR_STAMP_FLAGS.mode;
export const STAMP_NAMESPACE_FLAG = SIDECAR_STAMP_FLAGS.namespace;
export const STAMP_SOURCE_FLAG = SIDECAR_STAMP_FLAGS.source;

export const SIDECAR_STAMP_FIELDS = ["app", "mode", "namespace", "ipc", "source"] as const;

export const SIDECAR_DEFAULTS = Object.freeze({
  host: "127.0.0.1",
  ipcBase: "/tmp/open-design/ipc",
  namespace: "default",
  projectTmpDirName: ".tmp",
  windowsPipePrefix: "open-design",
} as const);

export const OPEN_DESIGN_PRODUCT_NAME = "Open Design";

/**
 * Sanitize a namespace into a Windows-safe token by replacing every run of
 * characters outside `[A-Za-z0-9._-]` with a single dash.
 * @param value - raw namespace
 * @returns the sanitized token
 */
export function resolveWindowsReleaseNamespaceToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

/**
 * Build the per-namespace Windows uninstall registry key for the Open Design
 * product so channel/namespace-distinct installs get distinct uninstall
 * entries.
 * @param namespace - the release namespace
 * @returns the full uninstall registry key path
 */
export function resolveWindowsUninstallRegistryKey(namespace: string): string {
  const namespaceToken = resolveWindowsReleaseNamespaceToken(namespace);
  return `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${OPEN_DESIGN_PRODUCT_NAME}-${namespaceToken}`;
}
