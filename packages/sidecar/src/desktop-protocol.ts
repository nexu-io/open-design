import { RELEASE_CHANNELS, type ReleaseChannel } from "@open-design/release";

type StandaloneRuntimeStatusSnapshot = Readonly<{
  state: "failed" | "running" | "stopped";
  [field: string]: unknown;
}>;

export const SIDECAR_MESSAGES = Object.freeze({
  CLICK: "click",
  CONSOLE: "console",
  EVAL: "eval",
  EXPORT_ARTIFACT: "export-artifact",
  EXPORT_PDF: "export-pdf",
  MINT_IMPORT_TOKEN: "mint-import-token",
  REGISTER_DESKTOP_AUTH: "register-desktop-auth",
  REGISTER_WEB_URL: "register-web-url",
  RENDER_SLIDES: "render-slides",
  SCREENSHOT: "screenshot",
  SHUTDOWN: "shutdown",
  SHOW: "show",
  STATUS: "status",
  UPDATE: "update",
} as const);

export const DESKTOP_UPDATE_ACTIONS = Object.freeze({
  CHECK: "check",
  CLEAR_CACHE: "clear-cache",
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
export type DesktopRuntimeState = "idle" | "running" | "unknown";

export type DesktopStatusSnapshot = {
  pid?: number | null;
  standalone?: StandaloneRuntimeStatusSnapshot;
  standaloneStatusError?: string;
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

export type DesktopUpdateCacheLifecycleTrigger = "cold-start" | "manual" | "next-version-ready";

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

export const DESKTOP_UPDATE_REINSTALL_REASONS = Object.freeze({
  LAUNCHER_SCHEMA: "launcher-schema",
  OUTER_BELOW_MIN: "outer-below-min",
  OUTER_VERSION_UNREADABLE: "outer-version-unreadable",
} as const);

export type DesktopUpdateReinstallReason =
  (typeof DESKTOP_UPDATE_REINSTALL_REASONS)[keyof typeof DESKTOP_UPDATE_REINSTALL_REASONS];

/**
 * Present on a status snapshot when the release feed requires a full installer
 * reinstall instead of an in-place payload update. `installedVersion` is the
 * physically installed outer package version (not the running payload version);
 * it is omitted when the outer bundle config could not be read. `url` is an
 * optional operator-supplied explanation link from
 * `control.shell.installation.version.url`.
 */
export type DesktopUpdateReinstallSnapshot = {
  installedVersion?: string;
  minVersion?: string;
  reason: DesktopUpdateReinstallReason;
  url?: string;
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
  reinstall?: DesktopUpdateReinstallSnapshot;
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
export type DesktopShowInput = {
  deeplinkUrl?: string;
};
export type DesktopShowMessage = { input?: DesktopShowInput; type: typeof SIDECAR_MESSAGES.SHOW };
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

/**
 * Registers the browser-facing URL after a packaged web sidecar has bound its
 * dynamic port. The message travels over the namespace-scoped daemon IPC, so
 * it cannot accidentally update another packaged runtime.
 */
export type RegisterWebUrlInput = {
  url: string;
};

export type RegisterWebUrlMessage = {
  input: RegisterWebUrlInput;
  type: typeof SIDECAR_MESSAGES.REGISTER_WEB_URL;
};

export type RegisterWebUrlResult = {
  accepted: true;
};

export type DaemonSidecarMessage =
  | SidecarStatusMessage
  | SidecarShutdownMessage
  | RegisterDesktopAuthMessage
  | MintImportTokenMessage
  | RegisterWebUrlMessage;
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
