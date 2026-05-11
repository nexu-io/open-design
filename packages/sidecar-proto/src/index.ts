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

export const SIDECAR_MESSAGES = Object.freeze({
  CLICK: "click",
  CONSOLE: "console",
  EVAL: "eval",
  EXPORT_PDF: "export-pdf",
  REGISTER_DESKTOP_AUTH: "register-desktop-auth",
  SCREENSHOT: "screenshot",
  SHUTDOWN: "shutdown",
  STATUS: "status",
} as const);

export const SIDECAR_ERROR_CODES = Object.freeze({
  INVALID_MESSAGE: "SIDECAR_INVALID_MESSAGE",
  UNKNOWN_MESSAGE: "SIDECAR_UNKNOWN_MESSAGE",
} as const);

export type SidecarErrorCode = (typeof SIDECAR_ERROR_CODES)[keyof typeof SIDECAR_ERROR_CODES];

export class SidecarContractError extends Error {
  readonly code: SidecarErrorCode;

  constructor(code: SidecarErrorCode, message: string) {
    super(message);
    this.name = "SidecarContractError";
    this.code = code;
  }
}

export type ServiceRuntimeState = "idle" | "running" | "starting" | "stopped" | "unknown";

export type DaemonStatusSnapshot = {
  pid?: number | null;
  state: ServiceRuntimeState;
  updatedAt?: string;
  url: string | null;
  /**
   * PR #974 round 6 (mrcfps): true when the daemon's
   * `/api/import/folder` route refuses tokenless requests. Surfaced
   * over IPC so `tools-dev start desktop` can detect a daemon that
   * was spawned without `OD_REQUIRE_DESKTOP_AUTH=1` (the split-start
   * dev flow `start daemon` -> `start desktop`) and restart it
   * before launching desktop main, instead of letting a renderer
   * race the registration handshake. Mirrors
   * `apps/daemon/src/server.ts#isDesktopAuthGateActive()` at the
   * moment the STATUS request was answered.
   */
  desktopAuthGateActive: boolean;
};

export type WebStatusSnapshot = {
  pid?: number | null;
  state: ServiceRuntimeState;
  updatedAt?: string;
  url: string | null;
};

export type DesktopRuntimeState = "idle" | "running" | "unknown";

export type DesktopStatusSnapshot = {
  pid?: number | null;
  state: DesktopRuntimeState;
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

export type DesktopEvalInput = {
  expression: string;
};

export type DesktopEvalResult = {
  error?: string;
  ok: boolean;
  value?: unknown;
};

export type DesktopScreenshotInput = {
  path: string;
};

export type DesktopScreenshotResult = {
  path: string;
};

export type DesktopConsoleEntry = {
  level: string;
  text: string;
  timestamp: string;
};

export type DesktopConsoleResult = {
  entries: DesktopConsoleEntry[];
};

export type DesktopClickInput = {
  selector: string;
};

export type DesktopClickResult = {
  clicked: boolean;
  found: boolean;
};

export type DesktopExportPdfInput = {
  baseHref?: string;
  deck: boolean;
  defaultFilename: string;
  html: string;
  title: string;
};

export type DesktopExportPdfResult = {
  canceled?: boolean;
  error?: string;
  ok: boolean;
  path?: string;
};

export type SidecarStatusMessage = { type: typeof SIDECAR_MESSAGES.STATUS };
export type SidecarShutdownMessage = { type: typeof SIDECAR_MESSAGES.SHUTDOWN };
export type DesktopEvalMessage = { input: DesktopEvalInput; type: typeof SIDECAR_MESSAGES.EVAL };
export type DesktopScreenshotMessage = { input: DesktopScreenshotInput; type: typeof SIDECAR_MESSAGES.SCREENSHOT };
export type DesktopConsoleMessage = { type: typeof SIDECAR_MESSAGES.CONSOLE };
export type DesktopClickMessage = { input: DesktopClickInput; type: typeof SIDECAR_MESSAGES.CLICK };
export type DesktopExportPdfMessage = { input: DesktopExportPdfInput; type: typeof SIDECAR_MESSAGES.EXPORT_PDF };

// Sent by the desktop main process to the daemon over its sidecar IPC at
// startup, before the BrowserWindow is created. The base64 string is a
// freshly generated 32-byte secret that both processes will share for the
// lifetime of the daemon. The daemon uses this secret to verify HMAC tokens
// minted by the desktop main process for `POST /api/import/folder` calls
// (PR #974: closes the renderer→arbitrary-baseDir→openPath bypass chain).
// When the secret is registered, daemon's import-folder route requires a
// valid per-path token; when it isn't (web-only deployments), the route
// behaves as before.
export type RegisterDesktopAuthInput = {
  secret: string;
};

export type RegisterDesktopAuthMessage = {
  input: RegisterDesktopAuthInput;
  type: typeof SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH;
};

export type RegisterDesktopAuthResult = {
  accepted: true;
};

export type DaemonSidecarMessage =
  | SidecarStatusMessage
  | SidecarShutdownMessage
  | RegisterDesktopAuthMessage;
export type WebSidecarMessage = SidecarStatusMessage | SidecarShutdownMessage;
export type DesktopSidecarMessage =
  | SidecarStatusMessage
  | SidecarShutdownMessage
  | DesktopEvalMessage
  | DesktopScreenshotMessage
  | DesktopConsoleMessage
  | DesktopClickMessage
  | DesktopExportPdfMessage;

export type ShutdownResult = {
  accepted: true;
};

export type SidecarStamp = {
  app: AppKey;
  ipc: string;
  mode: SidecarMode;
  namespace: string;
  source: SidecarSource;
};

export type SidecarStampInput = Partial<Record<(typeof SIDECAR_STAMP_FIELDS)[number], unknown>>;
export type SidecarStampCriteria = Partial<SidecarStamp>;

export type OpenDesignSidecarContract = {
  appKeys: typeof APP_KEYS;
  defaults: typeof SIDECAR_DEFAULTS;
  env: typeof SIDECAR_RUNTIME_ENV;
  errorCodes: typeof SIDECAR_ERROR_CODES;
  messages: typeof SIDECAR_MESSAGES;
  modes: typeof SIDECAR_MODES;
  normalizeApp: typeof normalizeAppKey;
  normalizeNamespace: typeof normalizeNamespace;
  normalizeSource: typeof normalizeSidecarSource;
  normalizeStamp: typeof normalizeSidecarStamp;
  normalizeStampCriteria: typeof normalizeSidecarStampCriteria;
  sources: typeof SIDECAR_SOURCES;
  stampFields: typeof SIDECAR_STAMP_FIELDS;
  stampFlags: typeof SIDECAR_STAMP_FLAGS;
};

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set<string>(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unexpected.join(", ")}`);
  }
}

function normalizeNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  if (value.length === 0) throw new Error(`${label} must not be empty`);
  return value;
}

export function normalizeNamespace(namespace: unknown): string {
  if (typeof namespace !== "string") throw new Error("namespace must be a string");
  const value = namespace.trim();
  if (value.length === 0) throw new Error("namespace must not be empty");
  if (value !== namespace) throw new Error("namespace must not contain leading or trailing whitespace");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`namespace contains unsupported characters: ${value}`);
  }
  if (/[\\/]/.test(value)) throw new Error(`namespace must not contain path separators: ${value}`);
  return value;
}

export function isSidecarMode(value: unknown): value is SidecarMode {
  return Object.values(SIDECAR_MODES).includes(value as SidecarMode);
}

export function normalizeSidecarMode(mode: unknown): SidecarMode {
  if (!isSidecarMode(mode)) {
    throw new Error("sidecar mode must be dev or runtime");
  }
  return mode;
}

export function isAppKey(value: unknown): value is AppKey {
  return Object.values(APP_KEYS).includes(value as AppKey);
}

export function normalizeAppKey(app: unknown): AppKey {
  if (!isAppKey(app)) throw new Error(`unsupported sidecar app: ${String(app)}`);
  return app;
}

export function isSidecarSource(value: unknown): value is SidecarSource {
  return Object.values(SIDECAR_SOURCES).includes(value as SidecarSource);
}

export function normalizeSidecarSource(source: unknown): SidecarSource {
  if (!isSidecarSource(source)) {
    throw new Error(`unsupported sidecar source: ${String(source)}`);
  }
  return source;
}

export function isWindowsNamedPipePath(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("\\\\.\\pipe\\");
}

export function normalizeIpcPath(ipc: unknown): string {
  if (typeof ipc !== "string") throw new Error("sidecar ipc path must be a string");
  if (ipc.length === 0) throw new Error("sidecar ipc path must not be empty");
  if (ipc.trim() !== ipc) throw new Error("sidecar ipc path must not contain leading or trailing whitespace");
  if (ipc.includes("\0")) throw new Error("sidecar ipc path must not contain null bytes");
  if (isWindowsNamedPipePath(ipc)) return ipc;
  if (!ipc.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(ipc)) {
    throw new Error(`sidecar ipc path must be absolute: ${ipc}`);
  }
  return ipc;
}

function assertKnownStampKeys(value: Record<string, unknown>, label: string): void {
  assertKnownKeys(value, SIDECAR_STAMP_FIELDS, label);
}

export function normalizeSidecarStamp(input: unknown): SidecarStamp {
  const value = assertObject(input, "sidecar stamp");
  assertKnownStampKeys(value, "sidecar stamp");
  return {
    app: normalizeAppKey(value.app),
    ipc: normalizeIpcPath(value.ipc),
    mode: normalizeSidecarMode(value.mode),
    namespace: normalizeNamespace(value.namespace),
    source: normalizeSidecarSource(value.source),
  };
}

export function normalizeSidecarStampCriteria(input: unknown = {}): SidecarStampCriteria {
  const value = assertObject(input, "sidecar stamp criteria");
  assertKnownStampKeys(value, "sidecar stamp criteria");
  return {
    ...(value.app == null ? {} : { app: normalizeAppKey(value.app) }),
    ...(value.ipc == null ? {} : { ipc: normalizeIpcPath(value.ipc) }),
    ...(value.mode == null ? {} : { mode: normalizeSidecarMode(value.mode) }),
    ...(value.namespace == null ? {} : { namespace: normalizeNamespace(value.namespace) }),
    ...(value.source == null ? {} : { source: normalizeSidecarSource(value.source) }),
  };
}

export function assertSidecarStamp(input: unknown): asserts input is SidecarStamp {
  normalizeSidecarStamp(input);
}

function normalizeDesktopEvalInput(input: unknown): DesktopEvalInput {
  const value = assertObject(input, "desktop eval input");
  assertKnownKeys(value, ["expression"], "desktop eval input");
  return { expression: normalizeNonEmptyString(value.expression, "desktop eval expression") };
}

function normalizeDesktopScreenshotInput(input: unknown): DesktopScreenshotInput {
  const value = assertObject(input, "desktop screenshot input");
  assertKnownKeys(value, ["path"], "desktop screenshot input");
  return { path: normalizeNonEmptyString(value.path, "desktop screenshot path") };
}

function normalizeDesktopClickInput(input: unknown): DesktopClickInput {
  const value = assertObject(input, "desktop click input");
  assertKnownKeys(value, ["selector"], "desktop click input");
  return { selector: normalizeNonEmptyString(value.selector, "desktop click selector") };
}

function normalizeRegisterDesktopAuthInput(input: unknown): RegisterDesktopAuthInput {
  const value = assertObject(input, "register-desktop-auth input");
  assertKnownKeys(value, ["secret"], "register-desktop-auth input");
  const secret = normalizeNonEmptyString(value.secret, "register-desktop-auth secret");
  // Reject anything that isn't base64-shaped — the wire format is a
  // base64-encoded random buffer minted by the desktop main process. The
  // daemon decodes it back to bytes for HMAC. Loose validation here, not
  // length-pinned, so the encoding (base64 vs base64url) stays caller-driven.
  if (!/^[A-Za-z0-9+/_=-]+$/.test(secret)) {
    throw new Error("register-desktop-auth secret must be base64-encoded");
  }
  return { secret };
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function normalizeDesktopExportPdfInput(input: unknown): DesktopExportPdfInput {
  const value = assertObject(input, "desktop PDF export input");
  assertKnownKeys(value, ["baseHref", "deck", "defaultFilename", "html", "title"], "desktop PDF export input");
  return {
    ...(value.baseHref == null ? {} : { baseHref: normalizeNonEmptyString(value.baseHref, "desktop PDF export baseHref") }),
    deck: normalizeBoolean(value.deck, "desktop PDF export deck"),
    defaultFilename: normalizeNonEmptyString(value.defaultFilename, "desktop PDF export defaultFilename"),
    html: normalizeNonEmptyString(value.html, "desktop PDF export html"),
    title: normalizeNonEmptyString(value.title, "desktop PDF export title"),
  };
}

function normalizeMessageType(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SidecarContractError(SIDECAR_ERROR_CODES.INVALID_MESSAGE, `${label} type must be a non-empty string`);
  }
  return value;
}

export function normalizeDaemonSidecarMessage(input: unknown): DaemonSidecarMessage {
  const value = assertObject(input, "daemon sidecar message");
  const type = normalizeMessageType(value.type, "daemon sidecar message");
  if (type === SIDECAR_MESSAGES.STATUS || type === SIDECAR_MESSAGES.SHUTDOWN) {
    assertKnownKeys(value, ["type"], "daemon sidecar message");
    return { type };
  }
  if (type === SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH) {
    assertKnownKeys(value, ["input", "type"], "daemon sidecar message");
    return { input: normalizeRegisterDesktopAuthInput(value.input), type };
  }
  throw new SidecarContractError(SIDECAR_ERROR_CODES.UNKNOWN_MESSAGE, `unknown daemon sidecar message: ${type}`);
}

export function normalizeWebSidecarMessage(input: unknown): WebSidecarMessage {
  const value = assertObject(input, "web sidecar message");
  const type = normalizeMessageType(value.type, "web sidecar message");
  if (type === SIDECAR_MESSAGES.STATUS || type === SIDECAR_MESSAGES.SHUTDOWN) {
    assertKnownKeys(value, ["type"], "web sidecar message");
    return { type };
  }
  throw new SidecarContractError(SIDECAR_ERROR_CODES.UNKNOWN_MESSAGE, `unknown web sidecar message: ${type}`);
}

export function normalizeDesktopSidecarMessage(input: unknown): DesktopSidecarMessage {
  const value = assertObject(input, "desktop sidecar message");
  const type = normalizeMessageType(value.type, "desktop sidecar message");
  switch (type) {
    case SIDECAR_MESSAGES.STATUS:
    case SIDECAR_MESSAGES.SHUTDOWN:
    case SIDECAR_MESSAGES.CONSOLE:
      assertKnownKeys(value, ["type"], "desktop sidecar message");
      return { type };
    case SIDECAR_MESSAGES.EVAL:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopEvalInput(value.input), type };
    case SIDECAR_MESSAGES.SCREENSHOT:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopScreenshotInput(value.input), type };
    case SIDECAR_MESSAGES.CLICK:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopClickInput(value.input), type };
    case SIDECAR_MESSAGES.EXPORT_PDF:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopExportPdfInput(value.input), type };
    default:
      throw new SidecarContractError(SIDECAR_ERROR_CODES.UNKNOWN_MESSAGE, `unknown desktop sidecar message: ${type}`);
  }
}

export const OPEN_DESIGN_SIDECAR_CONTRACT = Object.freeze({
  appKeys: APP_KEYS,
  defaults: SIDECAR_DEFAULTS,
  env: SIDECAR_RUNTIME_ENV,
  errorCodes: SIDECAR_ERROR_CODES,
  messages: SIDECAR_MESSAGES,
  modes: SIDECAR_MODES,
  normalizeApp: normalizeAppKey,
  normalizeNamespace,
  normalizeSource: normalizeSidecarSource,
  normalizeStamp: normalizeSidecarStamp,
  normalizeStampCriteria: normalizeSidecarStampCriteria,
  sources: SIDECAR_SOURCES,
  stampFields: SIDECAR_STAMP_FIELDS,
  stampFlags: SIDECAR_STAMP_FLAGS,
} as const satisfies OpenDesignSidecarContract);
