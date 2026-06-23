import type { ReleaseChannel } from "@open-design/release";

export const OPEN_DESIGN_HOST_GLOBAL = "__od__";
export const OPEN_DESIGN_HOST_VERSION = 2;

export const OPEN_DESIGN_HOST_CLIENT_TYPES = Object.freeze({
  DESKTOP: "desktop",
} as const);

export type OpenDesignHostClientType =
  (typeof OPEN_DESIGN_HOST_CLIENT_TYPES)[keyof typeof OPEN_DESIGN_HOST_CLIENT_TYPES];

export type OpenDesignHostClient = {
  // BCP-47 locale string (e.g. "zh-CN", "pt-BR") the host process read from
  // the OS at startup. The renderer uses this so the packaged desktop app
  // can follow the OS language even when Chromium's built-in
  // `navigator.language` would have defaulted to en-US.
  osLocale?: string;
  platform?: string;
  type: OpenDesignHostClientType;
};

export type OpenDesignHostFailure = {
  details?: unknown;
  ok: false;
  reason: string;
};

export type OpenDesignHostActionResult =
  | { ok: true }
  | OpenDesignHostFailure;

export type OpenDesignHostProjectImportInit = {
  designSystemId?: string | null;
  name?: string;
  skillId?: string | null;
};

export type OpenDesignHostProjectImportSuccess = {
  conversationId: string;
  entryFile: string | null;
  ok: true;
  projectId: string;
};

export type OpenDesignHostProjectImportResult =
  | OpenDesignHostProjectImportSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostProjectReplaceWorkingDirSuccess = {
  baseDir: string;
  entryFile: string | null;
  ok: true;
};

export type OpenDesignHostProjectReplaceWorkingDirResult =
  | OpenDesignHostProjectReplaceWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostPickWorkingDirSuccess = {
  baseDir: string;
  ok: true;
  // Single-use HMAC token (minted by the host main process for `baseDir`)
  // that the renderer threads into POST /api/projects/:id/working-dir once
  // the project exists. Lets the Home flow pick a folder before the project
  // is created without exposing the daemon's desktop-auth gate.
  token: string;
};

export type OpenDesignHostPickWorkingDirResult =
  | OpenDesignHostPickWorkingDirSuccess
  | {
      canceled: true;
      ok: false;
    }
  | OpenDesignHostFailure;

export type OpenDesignHostPdfPrintOptions = {
  deck?: boolean;
};

export type OpenDesignHostCaptureClip = { x: number; y: number; width: number; height: number };
export type OpenDesignHostCaptureOptions = { clip?: OpenDesignHostCaptureClip };
export type OpenDesignHostCaptureSuccess = { dataUrl: string; h: number; ok: true; w: number };
export type OpenDesignHostCaptureResult = OpenDesignHostCaptureSuccess | OpenDesignHostFailure;

export type OpenDesignHostBrowserClearDataOptions = {
  cookies?: boolean;
  storage?: boolean;
};

export const OPEN_DESIGN_HOST_UPDATER_ACTIONS = Object.freeze({
  CHECK: "check",
  DOWNLOAD: "download",
  INSTALL: "install",
  QUIT: "quit",
  STATUS: "status",
} as const);

export type OpenDesignHostUpdaterAction =
  (typeof OPEN_DESIGN_HOST_UPDATER_ACTIONS)[keyof typeof OPEN_DESIGN_HOST_UPDATER_ACTIONS];
type OpenDesignHostUpdaterStatusAction = Exclude<
  OpenDesignHostUpdaterAction,
  typeof OPEN_DESIGN_HOST_UPDATER_ACTIONS.QUIT
>;

export const OPEN_DESIGN_HOST_UPDATER_STATES = Object.freeze({
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

export type OpenDesignHostUpdaterState =
  (typeof OPEN_DESIGN_HOST_UPDATER_STATES)[keyof typeof OPEN_DESIGN_HOST_UPDATER_STATES];

export type OpenDesignHostUpdaterMode = "js-incremental" | "package-launcher";
export type OpenDesignHostUpdaterChannel = ReleaseChannel;

export type OpenDesignHostUpdaterActionOptions = {
  payload?: Record<string, unknown>;
};

export type OpenDesignHostUpdaterCapabilitySet = {
  canApplyInPlace: boolean;
  canDownload: boolean;
  canOpenInstaller: boolean;
  requiresManualInstall: boolean;
};

export type OpenDesignHostUpdaterPathSnapshot = {
  downloadRoot?: string;
  manifestPath?: string;
};

export type OpenDesignHostUpdaterChecksumSnapshot = {
  algorithm: "sha256" | "sha512";
  url?: string;
  value?: string;
};

export type OpenDesignHostUpdaterArtifactSnapshot = {
  name?: string;
  platformKey?: string;
  size?: number;
  type?: string;
  url: string;
};

export type OpenDesignHostUpdaterProgressSnapshot = {
  receivedBytes: number;
  totalBytes?: number;
};

export type OpenDesignHostUpdaterErrorSnapshot = {
  code: string;
  details?: unknown;
  message: string;
};

export type OpenDesignHostUpdaterInstallResult = {
  activeVersion?: string;
  artifactPath?: string;
  dryRun?: boolean;
  helperLogPath?: string;
  launcherRuntimePath?: string;
  launchPath?: string;
  openedAt: string;
  path: string;
};

export type OpenDesignHostUpdaterReleaseSnapshot = {
  arch: string;
  artifact: OpenDesignHostUpdaterArtifactSnapshot;
  checksum: OpenDesignHostUpdaterChecksumSnapshot;
  channel: OpenDesignHostUpdaterChannel;
  downloadedAt: string;
  key: string;
  metadata?: Record<string, unknown>;
  path: string;
  platformKey: string;
  version: string;
};

export type OpenDesignHostUpdaterIncomingSnapshot = {
  arch: string;
  artifact: OpenDesignHostUpdaterArtifactSnapshot;
  channel: OpenDesignHostUpdaterChannel;
  key?: string;
  metadata?: Record<string, unknown>;
  progress?: OpenDesignHostUpdaterProgressSnapshot;
  startedAt: string;
  version: string;
};

export type OpenDesignHostUpdaterCacheLifecycleTrigger = "cold-start" | "next-version-ready";

export type OpenDesignHostUpdaterReleaseLifecycleState =
  | "cleanup-deferred"
  | "cleanup-removed"
  | "deprecated"
  | "retained"
  | "unknown";

export type OpenDesignHostUpdaterCacheLifecycleSummary = {
  lastRunAt?: string;
  lastTrigger?: OpenDesignHostUpdaterCacheLifecycleTrigger;
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

export type OpenDesignHostUpdaterCacheSnapshot = {
  lifecycle?: OpenDesignHostUpdaterCacheLifecycleSummary;
};

export type OpenDesignHostUpdaterStatusSnapshot = {
  active?: OpenDesignHostUpdaterReleaseSnapshot;
  arch: string;
  artifact?: OpenDesignHostUpdaterArtifactSnapshot;
  artifactUrl?: string;
  availableVersion?: string;
  cache?: OpenDesignHostUpdaterCacheSnapshot;
  capabilities: OpenDesignHostUpdaterCapabilitySet;
  channel: OpenDesignHostUpdaterChannel;
  checksum?: OpenDesignHostUpdaterChecksumSnapshot;
  currentVersion: string;
  downloadPath?: string;
  enabled: boolean;
  error?: OpenDesignHostUpdaterErrorSnapshot;
  incoming?: OpenDesignHostUpdaterIncomingSnapshot;
  installResult?: OpenDesignHostUpdaterInstallResult;
  lastCheckedAt?: string;
  metadata?: Record<string, unknown>;
  mode: OpenDesignHostUpdaterMode;
  paths?: OpenDesignHostUpdaterPathSnapshot;
  platform: string;
  progress?: OpenDesignHostUpdaterProgressSnapshot;
  state: OpenDesignHostUpdaterState;
  supported: boolean;
};

export type OpenDesignHostUpdaterResult =
  | { ok: true; status: OpenDesignHostUpdaterStatusSnapshot }
  | OpenDesignHostFailure;

export type OpenDesignHostUpdaterStatusListener = (status: OpenDesignHostUpdaterStatusSnapshot) => void;

export type OpenDesignHostBridge = {
  browser: {
    clearData(options?: OpenDesignHostBrowserClearDataOptions): Promise<OpenDesignHostActionResult>;
  };
  capture: {
    page(options?: OpenDesignHostCaptureOptions): Promise<OpenDesignHostCaptureResult>;
  };
  client: OpenDesignHostClient;
  pdf: {
    print(html: string, nonce?: string, options?: OpenDesignHostPdfPrintOptions): Promise<OpenDesignHostActionResult>;
  };
  pet: {
    setVisible(visible: boolean): void;
  };
  project: {
    pickAndImport(init?: OpenDesignHostProjectImportInit): Promise<OpenDesignHostProjectImportResult>;
    pickAndReplaceWorkingDir(projectId: string): Promise<OpenDesignHostProjectReplaceWorkingDirResult>;
    // Optional so older host builds still satisfy the bridge shape; callers
    // must feature-detect before invoking.
    pickWorkingDir?(): Promise<OpenDesignHostPickWorkingDirResult>;
  };
  shell: {
    openExternal(url: string): Promise<OpenDesignHostActionResult>;
    openPath(projectId: string): Promise<OpenDesignHostActionResult>;
  };
  updater: {
    check(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    download(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    install(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    quit(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostActionResult>;
    status(options?: OpenDesignHostUpdaterActionOptions): Promise<OpenDesignHostUpdaterStatusSnapshot>;
    subscribe(listener: OpenDesignHostUpdaterStatusListener): () => void;
  };
  version: typeof OPEN_DESIGN_HOST_VERSION;
};

export type OpenDesignHostGlobalScope = Record<string, unknown> & {
  window?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function failure(reason: string, details?: unknown): OpenDesignHostFailure {
  return {
    ...(details === undefined ? {} : { details }),
    ok: false,
    reason,
  };
}

function hasFunction(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "function";
}

export function isOpenDesignHostBridge(value: unknown): value is OpenDesignHostBridge {
  if (!isRecord(value)) return false;
  if (value.version !== OPEN_DESIGN_HOST_VERSION) return false;
  const client = value.client;
  if (!isRecord(client) || client.type !== OPEN_DESIGN_HOST_CLIENT_TYPES.DESKTOP) return false;
  if (client.platform != null && typeof client.platform !== "string") return false;
  if (client.osLocale != null && typeof client.osLocale !== "string") return false;

  const shell = value.shell;
  if (!isRecord(shell) || !hasFunction(shell, "openExternal") || !hasFunction(shell, "openPath")) return false;

  const browser = value.browser;
  if (!isRecord(browser) || !hasFunction(browser, "clearData")) return false;

  const capture = value.capture;
  if (!isRecord(capture) || !hasFunction(capture, "page")) return false;

  const project = value.project;
  if (
    !isRecord(project) ||
    !hasFunction(project, "pickAndImport") ||
    !hasFunction(project, "pickAndReplaceWorkingDir")
  ) {
    return false;
  }

  const pdf = value.pdf;
  if (!isRecord(pdf) || !hasFunction(pdf, "print")) return false;

  const pet = value.pet;
  if (!isRecord(pet) || !hasFunction(pet, "setVisible")) return false;

  const updater = value.updater;
  if (
    !isRecord(updater) ||
    !hasFunction(updater, "status") ||
    !hasFunction(updater, "check") ||
    !hasFunction(updater, "download") ||
    !hasFunction(updater, "install") ||
    !hasFunction(updater, "quit") ||
    !hasFunction(updater, "subscribe")
  ) {
    return false;
  }

  return true;
}

/**
 * Converts a privileged host adapter's raw project-import result into the
 * host-owned renderer contract. The adapter may internally call daemon APIs,
 * but only project identifiers cross the host bridge.
 */
export function normalizeOpenDesignHostProjectImportResult(input: unknown): OpenDesignHostProjectImportResult {
  if (!isRecord(input)) {
    return failure("desktop import returned an invalid response", input);
  }
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    const reason = typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : "unknown failure";
    return failure(reason, input.details);
  }

  const response = input.response;
  if (!isRecord(response)) {
    return failure("daemon import response was not an object", response);
  }
  const project = response.project;
  const rawProjectId = isRecord(project) ? project.id : null;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : null;
  const conversationId = typeof response.conversationId === "string" ? response.conversationId : null;
  const entryFile =
    typeof response.entryFile === "string" || response.entryFile === null
      ? response.entryFile
      : undefined;
  if (projectId == null || conversationId == null || entryFile === undefined) {
    return failure("daemon import response did not include host project identifiers", response);
  }

  return {
    conversationId,
    entryFile,
    ok: true,
    projectId,
  };
}

export function normalizeOpenDesignHostProjectReplaceWorkingDirResult(
  input: unknown,
): OpenDesignHostProjectReplaceWorkingDirResult {
  if (!isRecord(input)) {
    return failure("desktop working-dir replace returned an invalid response", input);
  }
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    const reason = typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : "unknown failure";
    return failure(reason, input.details);
  }

  const response = input.response;
  if (!isRecord(response)) {
    return failure("daemon working-dir response was not an object", response);
  }
  const baseDir = typeof response.baseDir === "string" ? response.baseDir : null;
  const entryFile = typeof response.entryFile === "string" ? response.entryFile : null;
  if (baseDir == null) {
    return failure("daemon working-dir response did not include baseDir", response);
  }

  return { baseDir, entryFile, ok: true };
}

export function normalizeOpenDesignHostPickWorkingDirResult(
  input: unknown,
): OpenDesignHostPickWorkingDirResult {
  if (!isRecord(input)) {
    return failure("desktop working-dir pick returned an invalid response", input);
  }
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    const reason = typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : "unknown failure";
    return failure(reason, input.details);
  }
  const baseDir = typeof input.baseDir === "string" ? input.baseDir : null;
  const token = typeof input.token === "string" ? input.token : null;
  if (baseDir == null || token == null) {
    return failure("desktop working-dir pick did not include baseDir and token", input);
  }
  return { baseDir, ok: true, token };
}

function candidateFromScope(scope: OpenDesignHostGlobalScope): unknown {
  if (OPEN_DESIGN_HOST_GLOBAL in scope) return scope[OPEN_DESIGN_HOST_GLOBAL];
  const windowValue = scope.window;
  if (isRecord(windowValue) && OPEN_DESIGN_HOST_GLOBAL in windowValue) {
    return windowValue[OPEN_DESIGN_HOST_GLOBAL];
  }
  return undefined;
}

export function getOpenDesignHost(scope: OpenDesignHostGlobalScope = globalThis): OpenDesignHostBridge | null {
  const candidate = candidateFromScope(scope);
  return isOpenDesignHostBridge(candidate) ? candidate : null;
}

export function isOpenDesignHostAvailable(scope: OpenDesignHostGlobalScope = globalThis): boolean {
  return getOpenDesignHost(scope) != null;
}

export function detectOpenDesignHostClientType(scope: OpenDesignHostGlobalScope = globalThis): OpenDesignHostClientType | "web" {
  return getOpenDesignHost(scope)?.client.type ?? "web";
}

function unavailable(reason: string): OpenDesignHostFailure {
  return failure(reason);
}

export async function openHostExternalUrl(url: string, scope: OpenDesignHostGlobalScope = globalThis): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.shell.openExternal(url);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function openHostProjectPath(projectId: string, scope: OpenDesignHostGlobalScope = globalThis): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.shell.openPath(projectId);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function clearHostBrowserData(
  options?: OpenDesignHostBrowserClearDataOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.browser.clearData(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function captureHostPage(
  options?: OpenDesignHostCaptureOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostCaptureResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.capture.page(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function pickAndImportHostProject(
  init?: OpenDesignHostProjectImportInit,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostProjectImportResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.project.pickAndImport(init);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function pickAndReplaceHostProjectWorkingDir(
  projectId: string,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostProjectReplaceWorkingDirResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.project.pickAndReplaceWorkingDir(projectId);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

// Picks a folder via the host's native dialog and returns the chosen path
// plus a single-use token, WITHOUT touching any project. The Home flow uses
// this to let the user choose a working directory before the project exists;
// the token is later spent on POST /api/projects/:id/working-dir.
export async function pickHostWorkingDir(
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostPickWorkingDirResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  if (typeof host.project.pickWorkingDir !== "function") {
    return unavailable("host build does not support pickWorkingDir");
  }
  try {
    return await host.project.pickWorkingDir();
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function printHostPdf(
  html: string,
  nonce?: string,
  options?: OpenDesignHostPdfPrintOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.pdf.print(html, nonce, options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export function setHostPetVisible(visible: boolean, scope: OpenDesignHostGlobalScope = globalThis): OpenDesignHostActionResult {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    host.pet.setVisible(visible);
    return { ok: true };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

async function runHostUpdaterAction(
  action: OpenDesignHostUpdaterStatusAction,
  options?: OpenDesignHostUpdaterActionOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostUpdaterResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return {
      ok: true,
      status: await host.updater[action](options),
    };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export async function getHostUpdaterStatus(
  options?: OpenDesignHostUpdaterActionOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostUpdaterResult> {
  return await runHostUpdaterAction(OPEN_DESIGN_HOST_UPDATER_ACTIONS.STATUS, options, scope);
}

export async function checkHostUpdater(
  options?: OpenDesignHostUpdaterActionOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostUpdaterResult> {
  return await runHostUpdaterAction(OPEN_DESIGN_HOST_UPDATER_ACTIONS.CHECK, options, scope);
}

export async function downloadHostUpdater(
  options?: OpenDesignHostUpdaterActionOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostUpdaterResult> {
  return await runHostUpdaterAction(OPEN_DESIGN_HOST_UPDATER_ACTIONS.DOWNLOAD, options, scope);
}

export async function installHostUpdater(
  options?: OpenDesignHostUpdaterActionOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostUpdaterResult> {
  return await runHostUpdaterAction(OPEN_DESIGN_HOST_UPDATER_ACTIONS.INSTALL, options, scope);
}

export async function quitHostAfterUpdaterInstallerOpen(
  options?: OpenDesignHostUpdaterActionOptions,
  scope: OpenDesignHostGlobalScope = globalThis,
): Promise<OpenDesignHostActionResult> {
  const host = getOpenDesignHost(scope);
  if (host == null) return unavailable("Open Design host is not available");
  try {
    return await host.updater.quit(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

export function subscribeHostUpdater(
  listener: OpenDesignHostUpdaterStatusListener,
  scope: OpenDesignHostGlobalScope = globalThis,
): () => void {
  const host = getOpenDesignHost(scope);
  if (host == null) return () => undefined;
  try {
    return host.updater.subscribe(listener);
  } catch {
    return () => undefined;
  }
}
