import { RELEASE_CHANNELS, type ReleaseChannel } from "@open-design/release";

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

export function resolveWindowsReleaseNamespaceToken(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export function resolveWindowsUninstallRegistryKey(namespace: string): string {
  const namespaceToken = resolveWindowsReleaseNamespaceToken(namespace);
  return `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${OPEN_DESIGN_PRODUCT_NAME}-${namespaceToken}`;
}

export const SIDECAR_MESSAGES = Object.freeze({
  CLICK: "click",
  CONSOLE: "console",
  EVAL: "eval",
  EXPORT_ARTIFACT: "export-artifact",
  EXPORT_PDF: "export-pdf",
  MINT_IMPORT_TOKEN: "mint-import-token",
  REGISTER_DESKTOP_AUTH: "register-desktop-auth",
  RENDER_SLIDES: "render-slides",
  SCREENSHOT: "screenshot",
  SHUTDOWN: "shutdown",
  SHOW: "show",
  STATUS: "status",
  UPDATE: "update",
} as const);

export const DESKTOP_UPDATE_ACTIONS = Object.freeze({
  CHECK: "check",
  DOWNLOAD: "download",
  INSTALL: "install",
  STATUS: "status",
} as const);

export type DesktopUpdateAction = (typeof DESKTOP_UPDATE_ACTIONS)[keyof typeof DESKTOP_UPDATE_ACTIONS];

export const DESKTOP_UPDATE_MODES = Object.freeze({
  JS_INCREMENTAL: "js-incremental",
  PACKAGE_LAUNCHER: "package-launcher",
} as const);

export type DesktopUpdateMode = (typeof DESKTOP_UPDATE_MODES)[keyof typeof DESKTOP_UPDATE_MODES];

export const DESKTOP_UPDATE_CHANNELS = Object.freeze({
  BETA: RELEASE_CHANNELS.BETA,
  BETAS: RELEASE_CHANNELS.BETAS,
  PRERELEASE: RELEASE_CHANNELS.PRERELEASE,
  PREVIEW: RELEASE_CHANNELS.PREVIEW,
  STABLE: RELEASE_CHANNELS.STABLE,
} as const);

export type DesktopUpdateChannel = ReleaseChannel;

export const DESKTOP_UPDATE_STATES = Object.freeze({
  AVAILABLE: "available",
  CHECKING: "checking",
  DOWNLOADED: "downloaded",
  DOWNLOADING: "downloading",
  ERROR: "error",
  IDLE: "idle",
  INSTALLING: "installing",
  NOT_AVAILABLE: "not-available",
  UNSUPPORTED: "unsupported",
} as const);

export type DesktopUpdateState = (typeof DESKTOP_UPDATE_STATES)[keyof typeof DESKTOP_UPDATE_STATES];

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
  trustedWebOriginPort?: number | null;
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
  update?: DesktopUpdateStatusSnapshot;
  updateStatusError?: string;
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

// Renders an HTML deck (every `<section class="slide">`) to one pixel-perfect
// PNG per slide using the desktop's Electron Chromium, so screenshot-based
// PPTX/PDF export reuses the already-bundled browser instead of shipping a
// second headless engine. `slides` are `data:image/png;base64,...` URLs in
// slide order; `width`/`height` are the captured pixel dimensions.
export type DesktopRenderSlidesInput = {
  baseHref?: string;
  html: string;
  // Explicit page-vs-deck signal from the caller (the web side knows whether the
  // artifact is a deck). `true` forces deck slide capture, `false` forces a
  // single full-page capture even if the page happens to contain `.slide`
  // elements (carousels, testimonials). When omitted, the renderer falls back to
  // the `.slide`-count heuristic.
  deck?: boolean;
  // When true, produce an editable .pptx (native PowerPoint shapes/text via the
  // vendored dom-to-pptx engine) instead of screenshot images. Writes one .pptx
  // into `outputDir` and returns `pptxFile`.
  editable?: boolean;
  // When set, render only the slide at this index (deck mode) — used by image
  // export to capture the single slide the user is viewing.
  index?: number;
  // Encoding for the full-document `page` mode: `jpeg` (small, for PDF) or `png`
  // (lossless source, for image export). Deck slides are always PNG. Default png.
  pageImageFormat?: "png" | "jpeg";
  // Deck only: render every slide and stitch them top-to-bottom into a single
  // tall image (used by image export of a deck). Ignored for ordinary pages.
  stitch?: boolean;
  // Page mode only: split an ordinary (non-deck) page into one image PER
  // VIEWPORT, top to bottom, instead of a single full-page capture — used by
  // the PDF path so a long scrolling page becomes a multi-page PDF (one screen
  // per page). Ignored in deck mode (decks already paginate per slide).
  paginate?: boolean;
  // Optional requested render viewport/stage size in CSS px. Omitted dimensions
  // fall back to renderer defaults.
  width?: number;
  height?: number;
  // When set, the renderer writes each rendered image to a file inside this
  // directory and returns the file paths in `slideFiles` instead of base64
  // data URLs in `slides`. The daemon (which owns the data root) creates and
  // owns this directory and reads/deletes the files afterwards — this avoids
  // pushing tens of MB of base64 through the JSON IPC channel for large images.
  // desktop only writes to the absolute path it is given; it never derives it.
  outputDir?: string;
};

// `mode` reports what the renderer found: `deck` = one PNG per 1920x1080 slide;
// `page` = a single full-document PNG at natural size (the artifact has no
// `.slide` sections, e.g. an ordinary website).
// When the request set `outputDir`, the images are returned as absolute file
// paths in `slideFiles` (binary on disk, no base64); otherwise as base64 data
// URLs in `slides`.
export type DesktopRenderSlidesErrorCode =
  | "NO_SLIDES"
  | "PAGE_TOO_TALL"
  | "RENDER_FAILED"
  | "SLIDE_INDEX_OUT_OF_RANGE";

export type DesktopRenderSlidesResult = {
  error?: string;
  errorCode?: DesktopRenderSlidesErrorCode;
  height?: number;
  mode?: "deck" | "page";
  ok: boolean;
  // Absolute path to the written editable .pptx (set when the request was
  // `editable` with an `outputDir`).
  pptxFile?: string;
  slideFiles?: string[];
  slides?: string[];
  width?: number;
};

export type DesktopExportArtifactFormat = "pdf" | "image";
// Electron's `nativeImage` (the off-screen renderer the programmatic exporter
// uses) can only encode PNG and JPEG. WebP is deliberately excluded so a caller
// asking for it gets a clear validation error instead of a silent PNG downgrade.
// (The in-app web Download menu encodes WebP client-side via canvas.toBlob and
// is unaffected by this list.)
export type DesktopExportArtifactImageFormat = "png" | "jpeg";

// Generic programmatic export (PDF / image). The desktop renderer writes
// the result to a temporary file and returns its path; the daemon streams those
// bytes to the HTTP caller (the `od export` CLI), then removes the temp file.
export type DesktopExportArtifactInput = {
  baseHref?: string;
  deck: boolean;
  format: DesktopExportArtifactFormat;
  html: string;
  imageFormat?: DesktopExportArtifactImageFormat;
  title: string;
  width?: number;
  height?: number;
};

export type DesktopExportArtifactResult = {
  bytes?: number;
  error?: string;
  mime?: string;
  ok: boolean;
  path?: string;
};

export type DesktopUpdateCapabilitySet = {
  canApplyInPlace: boolean;
  canDownload: boolean;
  canOpenInstaller: boolean;
  requiresManualInstall: boolean;
};

export type DesktopUpdatePathSnapshot = {
  downloadRoot?: string;
  manifestPath?: string;
};

export type DesktopUpdateChecksumSnapshot = {
  algorithm: "sha256" | "sha512";
  url?: string;
  value?: string;
};

export type DesktopUpdateArtifactSnapshot = {
  name?: string;
  platformKey?: string;
  size?: number;
  type?: string;
  url: string;
};

export type DesktopUpdateProgressSnapshot = {
  receivedBytes: number;
  totalBytes?: number;
};

export type DesktopUpdateErrorSnapshot = {
  code: string;
  details?: unknown;
  message: string;
};

export type DesktopUpdateInstallResult = {
  activeVersion?: string;
  artifactPath?: string;
  dryRun?: boolean;
  helperLogPath?: string;
  launcherRuntimePath?: string;
  launchPath?: string;
  openedAt: string;
  path: string;
};

export type DesktopUpdateReleaseSnapshot = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  checksum: DesktopUpdateChecksumSnapshot;
  channel: DesktopUpdateChannel;
  downloadedAt: string;
  key: string;
  metadata?: Record<string, unknown>;
  path: string;
  platformKey: string;
  version: string;
};

export type DesktopUpdateIncomingSnapshot = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  channel: DesktopUpdateChannel;
  key?: string;
  metadata?: Record<string, unknown>;
  progress?: DesktopUpdateProgressSnapshot;
  startedAt: string;
  version: string;
};

export type DesktopUpdateCacheLifecycleTrigger = "cold-start" | "next-version-ready";

export type DesktopUpdateReleaseLifecycleState =
  | "cleanup-deferred"
  | "cleanup-removed"
  | "deprecated"
  | "retained"
  | "unknown";

export type DesktopUpdateCacheLifecycleSummary = {
  lastRunAt?: string;
  lastTrigger?: DesktopUpdateCacheLifecycleTrigger;
  platform: string;
  releases: {
    cleanupDeferred: number;
    cleanupRemoved: number;
    deprecated: number;
    errors: number;
    retained: number;
    total: number;
    unknown: number;
  };
};

export type DesktopUpdateCacheSnapshot = {
  lifecycle?: DesktopUpdateCacheLifecycleSummary;
};

export type DesktopUpdateStatusSnapshot = {
  active?: DesktopUpdateReleaseSnapshot;
  arch: string;
  artifact?: DesktopUpdateArtifactSnapshot;
  artifactUrl?: string;
  availableVersion?: string;
  cache?: DesktopUpdateCacheSnapshot;
  capabilities: DesktopUpdateCapabilitySet;
  channel: DesktopUpdateChannel;
  checksum?: DesktopUpdateChecksumSnapshot;
  currentVersion: string;
  downloadPath?: string;
  enabled: boolean;
  error?: DesktopUpdateErrorSnapshot;
  incoming?: DesktopUpdateIncomingSnapshot;
  installResult?: DesktopUpdateInstallResult;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
  mode: DesktopUpdateMode;
  paths?: DesktopUpdatePathSnapshot;
  platform: string;
  progress?: DesktopUpdateProgressSnapshot;
  state: DesktopUpdateState;
  supported: boolean;
};

export type DesktopUpdateInput = {
  action: DesktopUpdateAction;
};

export type DesktopUpdateResult = DesktopUpdateStatusSnapshot;

export type SidecarStatusMessage = { type: typeof SIDECAR_MESSAGES.STATUS };
export type SidecarShutdownMessage = { type: typeof SIDECAR_MESSAGES.SHUTDOWN };
export type DesktopEvalMessage = { input: DesktopEvalInput; type: typeof SIDECAR_MESSAGES.EVAL };
export type DesktopScreenshotMessage = { input: DesktopScreenshotInput; type: typeof SIDECAR_MESSAGES.SCREENSHOT };
export type DesktopConsoleMessage = { type: typeof SIDECAR_MESSAGES.CONSOLE };
export type DesktopShowMessage = { type: typeof SIDECAR_MESSAGES.SHOW };
export type DesktopClickMessage = { input: DesktopClickInput; type: typeof SIDECAR_MESSAGES.CLICK };
export type DesktopExportPdfMessage = { input: DesktopExportPdfInput; type: typeof SIDECAR_MESSAGES.EXPORT_PDF };
export type DesktopRenderSlidesMessage = { input: DesktopRenderSlidesInput; type: typeof SIDECAR_MESSAGES.RENDER_SLIDES };
export type DesktopExportArtifactMessage = { input: DesktopExportArtifactInput; type: typeof SIDECAR_MESSAGES.EXPORT_ARTIFACT };
export type DesktopUpdateMessage = { input: DesktopUpdateInput; type: typeof SIDECAR_MESSAGES.UPDATE };

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

export type MintImportTokenInput = {
  baseDir: string;
};

export type MintImportTokenMessage = {
  input: MintImportTokenInput;
  type: typeof SIDECAR_MESSAGES.MINT_IMPORT_TOKEN;
};

export type MintImportTokenResult =
  | { ok: true; expiresAt: string; token: string }
  | { ok: false; code: "DESKTOP_AUTH_INACTIVE"; message: string; retryable: false }
  | { ok: false; code: "DESKTOP_AUTH_PENDING"; message: string; retryable: true };

export type DaemonSidecarMessage =
  | SidecarStatusMessage
  | SidecarShutdownMessage
  | RegisterDesktopAuthMessage
  | MintImportTokenMessage;
export type WebSidecarMessage = SidecarStatusMessage | SidecarShutdownMessage;
export type DesktopSidecarMessage =
  | SidecarStatusMessage
  | SidecarShutdownMessage
  | DesktopEvalMessage
  | DesktopScreenshotMessage
  | DesktopConsoleMessage
  | DesktopShowMessage
  | DesktopClickMessage
  | DesktopExportPdfMessage
  | DesktopRenderSlidesMessage
  | DesktopExportArtifactMessage
  | DesktopUpdateMessage;

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
  updateActions: typeof DESKTOP_UPDATE_ACTIONS;
  updateChannels: typeof DESKTOP_UPDATE_CHANNELS;
  updateModes: typeof DESKTOP_UPDATE_MODES;
  updateStates: typeof DESKTOP_UPDATE_STATES;
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

function normalizeMintImportTokenInput(input: unknown): MintImportTokenInput {
  const value = assertObject(input, "mint-import-token input");
  assertKnownKeys(value, ["baseDir"], "mint-import-token input");
  return { baseDir: normalizeNonEmptyString(value.baseDir, "mint-import-token baseDir") };
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

function normalizeDesktopRenderSlidesInput(input: unknown): DesktopRenderSlidesInput {
  const value = assertObject(input, "desktop render slides input");
  assertKnownKeys(value, ["baseHref", "deck", "editable", "height", "html", "index", "outputDir", "pageImageFormat", "stitch", "paginate", "width"], "desktop render slides input");
  if (value.deck != null && typeof value.deck !== "boolean") {
    throw new Error("desktop render slides deck must be a boolean");
  }
  if (value.editable != null && typeof value.editable !== "boolean") {
    throw new Error("desktop render slides editable must be a boolean");
  }
  if (value.index != null && (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0)) {
    throw new Error("desktop render slides index must be a non-negative integer");
  }
  if (value.pageImageFormat != null && value.pageImageFormat !== "png" && value.pageImageFormat !== "jpeg") {
    throw new Error("desktop render slides pageImageFormat must be 'png' or 'jpeg'");
  }
  if (value.stitch != null && typeof value.stitch !== "boolean") {
    throw new Error("desktop render slides stitch must be a boolean");
  }
  if (value.paginate != null && typeof value.paginate !== "boolean") {
    throw new Error("desktop render slides paginate must be a boolean");
  }
  if (value.outputDir != null) {
    const dir = normalizeNonEmptyString(value.outputDir, "desktop render slides outputDir");
    // outputDir is a daemon-owned absolute scratch path; reject relative values
    // so a malformed request can't make desktop main write outside it. Accepts
    // POSIX (`/…`), Windows drive (`C:\…` / `C:/…`), and UNC (`\\…`) absolutes.
    if (!/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(dir)) {
      throw new Error("desktop render slides outputDir must be an absolute path");
    }
  }
  return {
    ...(value.baseHref == null ? {} : { baseHref: normalizeNonEmptyString(value.baseHref, "desktop render slides baseHref") }),
    ...(value.deck == null ? {} : { deck: value.deck }),
    ...(value.editable == null ? {} : { editable: value.editable }),
    html: normalizeNonEmptyString(value.html, "desktop render slides html"),
    ...(value.index == null ? {} : { index: value.index }),
    ...(value.outputDir == null ? {} : { outputDir: normalizeNonEmptyString(value.outputDir, "desktop render slides outputDir") }),
    ...(value.pageImageFormat == null ? {} : { pageImageFormat: value.pageImageFormat }),
    ...(value.stitch == null ? {} : { stitch: value.stitch }),
    ...(value.paginate == null ? {} : { paginate: value.paginate }),
    ...(value.width == null ? {} : { width: normalizeOptionalPositiveNumber(value.width, "desktop render slides width") }),
    ...(value.height == null ? {} : { height: normalizeOptionalPositiveNumber(value.height, "desktop render slides height") }),
  };
}

function normalizeOptionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

const DESKTOP_EXPORT_ARTIFACT_FORMATS: readonly DesktopExportArtifactFormat[] = ["pdf", "image"];
const DESKTOP_EXPORT_ARTIFACT_IMAGE_FORMATS: readonly DesktopExportArtifactImageFormat[] = ["png", "jpeg"];

function normalizeDesktopExportArtifactInput(input: unknown): DesktopExportArtifactInput {
  const value = assertObject(input, "desktop artifact export input");
  assertKnownKeys(value, ["baseHref", "deck", "format", "html", "imageFormat", "title", "width", "height"], "desktop artifact export input");
  if (!DESKTOP_EXPORT_ARTIFACT_FORMATS.includes(value.format as DesktopExportArtifactFormat)) {
    throw new Error(`unsupported artifact export format: ${String(value.format)}`);
  }
  if (value.imageFormat != null && !DESKTOP_EXPORT_ARTIFACT_IMAGE_FORMATS.includes(value.imageFormat as DesktopExportArtifactImageFormat)) {
    throw new Error(`unsupported artifact export image format: ${String(value.imageFormat)}`);
  }
  return {
    ...(value.baseHref == null ? {} : { baseHref: normalizeNonEmptyString(value.baseHref, "desktop artifact export baseHref") }),
    deck: normalizeBoolean(value.deck, "desktop artifact export deck"),
    format: value.format as DesktopExportArtifactFormat,
    html: normalizeNonEmptyString(value.html, "desktop artifact export html"),
    ...(value.imageFormat == null ? {} : { imageFormat: value.imageFormat as DesktopExportArtifactImageFormat }),
    title: normalizeNonEmptyString(value.title, "desktop artifact export title"),
    ...(value.width == null ? {} : { width: normalizeOptionalPositiveNumber(value.width, "desktop artifact export width")! }),
    ...(value.height == null ? {} : { height: normalizeOptionalPositiveNumber(value.height, "desktop artifact export height")! }),
  };
}

function isDesktopUpdateAction(value: unknown): value is DesktopUpdateAction {
  return Object.values(DESKTOP_UPDATE_ACTIONS).includes(value as DesktopUpdateAction);
}

function normalizeDesktopUpdateInput(input: unknown): DesktopUpdateInput {
  const value = assertObject(input, "desktop update input");
  assertKnownKeys(value, ["action"], "desktop update input");
  if (!isDesktopUpdateAction(value.action)) {
    throw new Error(`unsupported desktop update action: ${String(value.action)}`);
  }
  return { action: value.action };
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
  if (type === SIDECAR_MESSAGES.MINT_IMPORT_TOKEN) {
    assertKnownKeys(value, ["input", "type"], "daemon sidecar message");
    return { input: normalizeMintImportTokenInput(value.input), type };
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
    case SIDECAR_MESSAGES.SHOW:
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
    case SIDECAR_MESSAGES.RENDER_SLIDES:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopRenderSlidesInput(value.input), type };
    case SIDECAR_MESSAGES.EXPORT_ARTIFACT:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopExportArtifactInput(value.input), type };
    case SIDECAR_MESSAGES.UPDATE:
      assertKnownKeys(value, ["input", "type"], "desktop sidecar message");
      return { input: normalizeDesktopUpdateInput(value.input), type };
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
  updateActions: DESKTOP_UPDATE_ACTIONS,
  updateChannels: DESKTOP_UPDATE_CHANNELS,
  updateModes: DESKTOP_UPDATE_MODES,
  updateStates: DESKTOP_UPDATE_STATES,
} as const satisfies OpenDesignSidecarContract);
