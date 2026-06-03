import { execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { release } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { BrowserWindow, app, dialog, ipcMain, nativeImage, screen, shell } from "electron";
import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  type DesktopExportPdfInput,
  type DesktopExportPdfResult,
  type DesktopUpdateStatusSnapshot,
} from "@open-design/sidecar-proto";
import type { OpenDesignHostActionResult, OpenDesignHostUpdaterActionOptions } from "@open-design/host";

import { openValidatedDirectory } from "./open-path.js";
import { createElectronPdfTarget, exportPdfFromHtml, savePrintReadyDocumentAsPdf } from "./pdf-export.js";
import type { PrintReadyPdfOptions } from "./pdf-export.js";
import type { DesktopUpdater } from "./updater.js";

const execFileAsync = promisify(execFile);

/**
 * Result of validating a candidate path before exposing it to a
 * privileged shell operation.
 */
export type PathValidationResult =
  | { ok: true; resolved: string }
  | { ok: false; reason: string };

/**
 * Validates that a path points at an existing absolute directory
 * that is *not* a macOS application bundle. Returns the
 * realpath-resolved canonical path on success so symlink games can't
 * be used to escape into another location.
 *
 * The `.app` rejection is load-bearing on macOS: `.app` bundles are
 * directories, so a plain "isDirectory" check would let the path
 * gate forward `/Applications/Safari.app` (or any other installed
 * app) into `shell.openPath`, which would *launch* the application
 * rather than reveal it in Finder. Since the only legitimate use of
 * the openPath bridge is "show the project folder," rejecting `.app`
 * keeps the bridge limited to the actual feature surface.
 */
export async function validateExistingDirectory(p: string): Promise<PathValidationResult> {
  if (typeof p !== "string" || p.length === 0) {
    return { ok: false, reason: "path must be a non-empty string" };
  }
  if (!isAbsolute(p)) {
    return { ok: false, reason: "path must be absolute" };
  }
  let resolvedReal: string;
  try {
    resolvedReal = await realpath(p);
  } catch {
    return { ok: false, reason: "path does not exist" };
  }
  let st;
  try {
    st = await stat(resolvedReal);
  } catch {
    return { ok: false, reason: "path could not be stat'd" };
  }
  if (!st.isDirectory()) {
    return { ok: false, reason: "path is not a directory" };
  }
  // macOS app bundles are directories; treat them as opaque files
  // because shell.openPath on a `.app` *launches* the application.
  if (resolvedReal.toLowerCase().endsWith(".app")) {
    return { ok: false, reason: "application bundles are not project directories" };
  }
  return { ok: true, resolved: resolvedReal };
}

/**
 * Shape returned to the desktop's `shell:open-path` handler. The handler
 * needs both the canonical resolved directory (to forward into
 * `shell.openPath`) and a couple of metadata signals so it can enforce
 * mrcfps's PR #974 follow-up requirement: only allow `openPath(projectId)`
 * for projects whose `resolvedDir` came from the trusted picker flow.
 *
 * `hasBaseDir` distinguishes folder-imported projects (where the
 * resolvedDir is a user-controlled location) from native projects (where
 * the resolvedDir is daemon-owned `<projectsRoot>/<id>` and is therefore
 * always safe to open). Folder-imported projects must additionally
 * carry `fromTrustedPicker: true` from the HMAC-gated import flow.
 */
export type ResolvedProjectDirContext = {
  fromTrustedPicker: boolean;
  hasBaseDir: boolean;
  resolvedDir: string;
};

/**
 * Decide whether `shell.openPath` may forward this project's
 * `resolvedDir` to the OS file manager. PR #974 mrcfps follow-up:
 * folder-imported projects (`hasBaseDir: true`) must additionally
 * carry `fromTrustedPicker: true`, the marker stamped by the daemon's
 * HMAC-gated import flow. Native projects (no `baseDir`,
 * `resolvedDir` lives under the daemon-owned projects root) are
 * always safe to open. Returned as a structured result so the IPC
 * handler can prefix the rejection reason with "open-path: " to
 * match the rest of its error envelope shape.
 */
export function isOpenPathAllowedForProject(
  context: ResolvedProjectDirContext,
): { ok: true } | { ok: false; reason: string } {
  if (context.hasBaseDir && !context.fromTrustedPicker) {
    return { ok: false, reason: "project did not come from the trusted picker flow" };
  }
  return { ok: true };
}

/**
 * Resolves a project ID to its canonical working directory by asking
 * the daemon. The web sidecar proxies `/api/*` to the daemon, so the
 * desktop main process can reach the daemon's project-detail endpoint
 * via the web URL we already discover for the BrowserWindow load.
 *
 * Used as the trust boundary for the `shell:open-path` IPC handler:
 * the renderer hands the main process a project ID (something it knows
 * the daemon registered), and the main process derives the path itself
 * from the daemon's authoritative response. A compromised renderer
 * cannot synthesize an arbitrary path because it never gets to name
 * the path — it only names the project. The handler additionally
 * inspects `metadata.baseDir` and `metadata.fromTrustedPicker` so it
 * can refuse folder-imported projects that did not come through the
 * desktop HMAC-gated import flow (PR #974).
 */
export async function fetchResolvedProjectDir(
  apiBaseUrl: string,
  projectId: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ ok: true; context: ResolvedProjectDirContext } | { ok: false; reason: string }> {
  if (typeof projectId !== "string" || projectId.length === 0) {
    return { ok: false, reason: "project id must be a non-empty string" };
  }
  // Reject obviously malformed ids before sending — the daemon enforces
  // its own isSafeId check, but the floor here keeps URL construction
  // honest and short-circuits trivial malicious input. The regex mirrors
  // `apps/daemon/src/projects.ts#isSafeId` and `POST /api/projects`'s
  // `[A-Za-z0-9._-]{1,128}` shape (round-4 mrcfps): legitimate dotted
  // ids like `my-project.v2` would otherwise be rejected here even
  // though the backend accepted them at create time, regressing
  // Continue in CLI / Finalize on those projects.
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(projectId)) {
    return { ok: false, reason: "project id contains disallowed characters" };
  }
  let resp: Response;
  try {
    resp = await fetchImpl(`${apiBaseUrl.replace(/\/+$/, "")}/api/projects/${encodeURIComponent(projectId)}`);
  } catch (err) {
    return { ok: false, reason: `daemon fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!resp.ok) {
    return { ok: false, reason: `daemon returned HTTP ${resp.status}` };
  }
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return { ok: false, reason: "daemon response was not JSON" };
  }
  const resolvedDir =
    body && typeof body === "object" && "resolvedDir" in body
      ? (body as { resolvedDir: unknown }).resolvedDir
      : undefined;
  if (typeof resolvedDir !== "string" || resolvedDir.length === 0) {
    return { ok: false, reason: "daemon response did not include resolvedDir" };
  }
  const project =
    body && typeof body === "object" && "project" in body
      ? (body as { project: unknown }).project
      : undefined;
  const metadata =
    project && typeof project === "object" && "metadata" in project
      ? (project as { metadata: unknown }).metadata
      : undefined;
  const hasBaseDir =
    metadata != null &&
    typeof metadata === "object" &&
    typeof (metadata as { baseDir?: unknown }).baseDir === "string" &&
    ((metadata as { baseDir: string }).baseDir.length > 0);
  const fromTrustedPicker =
    metadata != null &&
    typeof metadata === "object" &&
    (metadata as { fromTrustedPicker?: unknown }).fromTrustedPicker === true;
  return { ok: true, context: { fromTrustedPicker, hasBaseDir, resolvedDir } };
}

// Mirror of the daemon's token field separator. We avoid `.` because
// ISO 8601 expiry strings already contain dots (`...:00.000Z`). `~`
// appears in neither base64url nor ISO 8601, so the three fields are
// unambiguous when the daemon splits them. Drift between the two
// constants would silently invalidate every minted token, so the
// packaged workspace's vitest pins the produced shape.
const DESKTOP_IMPORT_TOKEN_FIELD_SEP = "~";

/**
 * Pure-function HMAC mint for the `X-OD-Desktop-Import-Token` header.
 * Mirrors `signDesktopImportToken` on the daemon side (PR #974). Kept in
 * a small exported helper so the packaged workspace's vitest suite can
 * pin token-shape contract drift without booting Electron.
 */
export function signDesktopImportToken(
  secret: Buffer,
  baseDir: string,
  options: { nonce: string; exp: string },
): string {
  const signature = createHmac("sha256", secret)
    .update(`${baseDir}\n${options.nonce}\n${options.exp}`)
    .digest("base64url");
  return [options.nonce, options.exp, signature].join(DESKTOP_IMPORT_TOKEN_FIELD_SEP);
}

const PENDING_POLL_MS = 120;
const RUNNING_POLL_MS = 2000;
const MAX_CONSOLE_ENTRIES = 200;
const DESKTOP_PET_WINDOW_WIDTH = 360;
const DESKTOP_PET_WINDOW_HEIGHT = 300;
const DESKTOP_PET_WINDOW_MARGIN = 24;
const UPDATER_STATUS_EVENT = "od:update:status-changed";
const UPDATER_IPC_CHANNELS = [
  "od:update:status",
  "od:update:check",
  "od:update:download",
  "od:update:install",
  "od:update:quit",
] as const;

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

export type DesktopStatusSnapshot = {
  pid?: number;
  state: "idle" | "running" | "unknown";
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

export type DesktopRuntime = {
  close(): Promise<void>;
  click(input: DesktopClickInput): Promise<DesktopClickResult>;
  console(): DesktopConsoleResult;
  eval(input: DesktopEvalInput): Promise<DesktopEvalResult>;
  exportPdf(input: DesktopExportPdfInput): Promise<DesktopExportPdfResult>;
  screenshot(input: DesktopScreenshotInput): Promise<DesktopScreenshotResult>;
  show(): void;
  status(): DesktopStatusSnapshot;
};

export type DesktopRuntimeOptions = {
  // Per-process secret shared with the daemon at startup (over its
  // sidecar IPC) so the main process can mint HMAC tokens for the
  // `dialog:pick-and-import` flow. The secret stays in main-process
  // memory for the runtime lifetime even if the initial registration
  // missed its window — round-5 (lefarcen P1, mrcfps) added a lazy
  // re-registration path on `DESKTOP_AUTH_PENDING` that needs the same
  // secret to mint a fresh token after re-handshaking with the daemon.
  desktopAuthSecret?: Buffer | null;
  discoverUrl(): Promise<string | null>;
  /**
   * Round-7 (lefarcen P2 @ runtime.ts:336): packaged desktop loads the
   * renderer from `od://app/`, which only resolves through Electron's
   * registered protocol handler in the renderer context. Main-process
   * `globalThis.fetch` (Node/undici) ignores that handler, so any
   * `fetch(webUrl + '/api/...')` from main fails in packaged builds.
   * `discoverDaemonUrl` returns the real `http://127.0.0.1:<port>` URL
   * the sidecar daemon reported over STATUS IPC, so main-process API
   * calls bypass the protocol handler entirely. Optional so tools-dev
   * (where webUrl IS an http:// URL Node fetch can hit) can omit it
   * and the runtime falls back to `discoverUrl` for API calls too.
  */
  discoverDaemonUrl?: () => Promise<string | null>;
  /**
   * BCP-47 locale string read from the OS by main process, forwarded
   * to the preload via `webPreferences.additionalArguments` so the
   * renderer can mirror it onto `__od__.client.osLocale`. Optional;
   * when omitted the renderer falls back to navigator/localStorage.
   */
  osLocale?: string;
  preloadPath?: string;
  /**
   * Round-5 (lefarcen P1, mrcfps): lazy re-handshake hook. The runtime
   * calls this when the daemon answers `503 DESKTOP_AUTH_PENDING` so a
   * daemon-restart-mid-session, or a missed startup-window race, no
   * longer permanently breaks folder import. Returns `true` when
   * registration succeeded so the runtime can mint a fresh token and
   * retry once. Optional so test runtimes and web-only deployments can
   * skip it (the lazy retry then collapses into a single attempt).
   */
  registerDesktopAuthWithDaemon?: () => Promise<boolean>;
  /**
   * Optional file path to append renderer-process error/warning console
   * messages to. Lets the diagnostics export pick up UI errors that would
   * otherwise only live in DevTools.
   */
  rendererLogPath?: string | null;
  requestQuit?: () => void;
  updater?: DesktopUpdater;
};

const DESKTOP_IMPORT_TOKEN_HEADER = "X-OD-Desktop-Import-Token";
const DESKTOP_IMPORT_TOKEN_TTL_MS = 60_000;

export function mintImportToken(secret: Buffer, baseDir: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const exp = new Date(Date.now() + DESKTOP_IMPORT_TOKEN_TTL_MS).toISOString();
  return signDesktopImportToken(secret, baseDir, { nonce, exp });
}

/**
 * Pure helper for the `dialog:pick-and-import` IPC handler. Extracted
 * from `createDesktopRuntime` so vitest can pin the round-5 lazy-retry
 * branch (lefarcen P1, mrcfps) without booting Electron. Mirrors the
 * pattern of `fetchResolvedProjectDir` next door — the IPC wrapper
 * stays a thin adapter that supplies the picker output and forwards
 * the structured result to the renderer.
 *
 * Round-5 contract:
 *   - Always pass `desktopAuthSecret` (no early-return on null secret).
 *     A startup registration that missed its window keeps the secret in
 *     memory; the first user-initiated import triggers the lazy retry.
 *   - On `503 DESKTOP_AUTH_PENDING` from the daemon, call the injected
 *     `registerDesktopAuth()` once. If it succeeds, mint a FRESH token
 *     (new nonce, new exp — replay protection still works) and POST
 *     once more. Single retry only, no infinite loop.
 *   - On any other failure (4xx, network error, second 503), return the
 *     structured failure to the renderer. The Toast surfaces the reason.
 */
export type PickAndImportFolderDeps = {
  /**
   * Round-7 (lefarcen P2 @ runtime.ts:336): the helper now POSTs to the
   * sidecar daemon's real `http://127.0.0.1:<port>` URL rather than the
   * renderer-only `od://app/` webUrl. Renamed from `webUrl` to make the
   * boundary explicit — main-process Node fetch must hit a real http
   * URL, never a custom Electron protocol scheme. tools-dev callers
   * pass the same value they used to pass for `webUrl` (its web URL is
   * already http://127.0.0.1:...).
   */
  apiBaseUrl: string;
  baseDir: string;
  desktopAuthSecret: Buffer;
  fetchImpl?: typeof globalThis.fetch;
  init?: { name?: string; skillId?: string | null; designSystemId?: string | null };
  /** Round-5: lazy re-registration hook. Called once on 503. */
  registerDesktopAuth?: () => Promise<boolean>;
  /** Injected for tests; defaults to the production HMAC mint. */
  mintToken?: (secret: Buffer, baseDir: string) => string;
};

export type PickAndImportFolderResult =
  | { ok: true; response: unknown }
  | { ok: false; canceled?: boolean; details?: unknown; reason?: string };

export async function pickAndImportFolder(
  deps: PickAndImportFolderDeps,
): Promise<PickAndImportFolderResult> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const mint = deps.mintToken ?? mintImportToken;
  const importUrl = `${deps.apiBaseUrl.replace(/\/+$/, "")}/api/import/folder`;
  const requestBody = JSON.stringify({
    baseDir: deps.baseDir,
    ...(deps.init?.name == null ? {} : { name: deps.init.name }),
    ...(deps.init?.skillId === undefined ? {} : { skillId: deps.init.skillId }),
    ...(deps.init?.designSystemId === undefined ? {} : { designSystemId: deps.init.designSystemId }),
  });

  async function postOnce(): Promise<Response | { ok: false; reason: string }> {
    const headerValue = mint(deps.desktopAuthSecret, deps.baseDir);
    try {
      return await fetchImpl(importUrl, {
        body: requestBody,
        headers: {
          "Content-Type": "application/json",
          [DESKTOP_IMPORT_TOKEN_HEADER]: headerValue,
        },
        method: "POST",
      });
    } catch (err) {
      return { ok: false, reason: `daemon fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  let resp = await postOnce();
  if ("reason" in resp) {
    return { ok: false, reason: resp.reason };
  }

  // Round-5 (lefarcen P1, mrcfps): lazy retry on DESKTOP_AUTH_PENDING.
  // Daemon body shape from server.ts sendApiError: `{ error: { code,
  // message, details, retryable } }`. The daemon-import-token-gate test
  // pins `body.error?.code === 'DESKTOP_AUTH_PENDING'` (line 215-216),
  // so we read the same path here — no new wire shape.
  if (resp.status === 503 && deps.registerDesktopAuth != null) {
    let body: unknown;
    try {
      body = await resp.clone().json();
    } catch {
      body = null;
    }
    const code =
      body != null && typeof body === "object" && "error" in body && body.error != null && typeof body.error === "object" && "code" in body.error
        ? (body.error as { code?: unknown }).code
        : undefined;
    if (code === "DESKTOP_AUTH_PENDING") {
      const reregistered = await deps.registerDesktopAuth();
      if (reregistered) {
        const retry = await postOnce();
        if ("reason" in retry) {
          return { ok: false, reason: retry.reason };
        }
        resp = retry;
      }
    }
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }
  if (!resp.ok) {
    return {
      ok: false,
      reason: `daemon returned HTTP ${resp.status}`,
      ...(body == null ? {} : { details: body }),
    };
  }
  return { ok: true, response: body };
}

/**
 * Pure helper for the `dialog:pick-and-replace-working-dir` IPC handler.
 * Mirrors `pickAndImportFolder` but targets the endpoint that re-points
 * an existing project at a new local folder.
 */
export type PickAndReplaceWorkingDirDeps = {
  apiBaseUrl: string;
  baseDir: string;
  desktopAuthSecret: Buffer;
  fetchImpl?: typeof globalThis.fetch;
  /** Injected for tests; defaults to the production HMAC mint. */
  mintToken?: (secret: Buffer, baseDir: string) => string;
  projectId: string;
  registerDesktopAuth?: () => Promise<boolean>;
};

export type PickAndReplaceWorkingDirResult =
  | { ok: true; response: unknown }
  | { ok: false; canceled?: boolean; details?: unknown; reason?: string };

export async function pickAndReplaceWorkingDir(
  deps: PickAndReplaceWorkingDirDeps,
): Promise<PickAndReplaceWorkingDirResult> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const mint = deps.mintToken ?? mintImportToken;
  if (typeof deps.projectId !== "string" || deps.projectId.length === 0) {
    return { ok: false, reason: "project id must be a non-empty string" };
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(deps.projectId)) {
    return { ok: false, reason: "project id contains disallowed characters" };
  }
  const workingDirUrl = `${deps.apiBaseUrl.replace(/\/+$/, "")}/api/projects/${encodeURIComponent(deps.projectId)}/working-dir`;
  const requestBody = JSON.stringify({ baseDir: deps.baseDir });

  async function postOnce(): Promise<Response | { ok: false; reason: string }> {
    const headerValue = mint(deps.desktopAuthSecret, deps.baseDir);
    try {
      return await fetchImpl(workingDirUrl, {
        body: requestBody,
        headers: {
          "Content-Type": "application/json",
          [DESKTOP_IMPORT_TOKEN_HEADER]: headerValue,
        },
        method: "POST",
      });
    } catch (err) {
      return { ok: false, reason: `daemon fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  let resp = await postOnce();
  if ("reason" in resp) {
    return { ok: false, reason: resp.reason };
  }

  if (resp.status === 503 && deps.registerDesktopAuth != null) {
    let body: unknown;
    try {
      body = await resp.clone().json();
    } catch {
      body = null;
    }
    const code =
      body != null && typeof body === "object" && "error" in body && body.error != null && typeof body.error === "object" && "code" in body.error
        ? (body.error as { code?: unknown }).code
        : undefined;
    if (code === "DESKTOP_AUTH_PENDING") {
      const reregistered = await deps.registerDesktopAuth();
      if (reregistered) {
        const retry = await postOnce();
        if ("reason" in retry) {
          return { ok: false, reason: retry.reason };
        }
        resp = retry;
      }
    }
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }
  if (!resp.ok) {
    return {
      ok: false,
      reason: `daemon returned HTTP ${resp.status}`,
      ...(body == null ? {} : { details: body }),
    };
  }
  return { ok: true, response: body };
}

const MAC_WINDOW_CHROME =
  process.platform === "darwin"
    ? ({
        titleBarStyle: "hiddenInset" as const,
        trafficLightPosition: { x: 12, y: 10 },
      })
    : {};

const MAC_WINDOW_CHROME_CSS = `
  .app-chrome-header {
    --app-chrome-traffic-space: 64px !important;
    --app-chrome-traffic-margin: 4px !important;
    -webkit-app-region: drag;
  }
  .app-chrome-traffic-space {
    flex: 0 0 64px !important;
    width: 64px !important;
  }
  .app-chrome-header button,
  .app-chrome-header a,
  .app-chrome-header [role="button"],
  .app-chrome-header [contenteditable],
  .app-chrome-actions,
  .app-chrome-actions *,
  .avatar-popover,
  .avatar-popover *,
  .inline-switcher__popover,
  .inline-switcher__popover *,
  .workspace-tabs-popover,
  .workspace-tabs-popover * {
    -webkit-app-region: no-drag;
  }
  .app-chrome-drag {
    -webkit-app-region: drag;
  }
  .modal-backdrop,
  .modal-backdrop *,
  .modal,
  .modal *,
  .ds-modal-backdrop,
  .ds-modal-backdrop *,
  .ds-modal,
  .ds-modal *,
  .prompt-template-modal-backdrop,
  .prompt-template-modal-backdrop *,
  .prompt-template-modal,
  .prompt-template-modal *,
  .prompt-template-lightbox-backdrop,
  .prompt-template-lightbox-backdrop * {
    -webkit-app-region: no-drag;
  }
  .entry-brand {
    -webkit-app-region: drag;
    padding-top: 32px !important;
  }
  .entry-header {
    -webkit-app-region: drag;
  }
  .entry-brand button,
  .entry-brand [role="button"],
  .entry-header button,
  .entry-header [role="button"],
  .entry-tabs,
  .entry-tabs *,
  .viewer-toolbar,
  .viewer-toolbar *,
  .deck-nav,
  .deck-nav *,
  .share-menu-popover,
  .share-menu-popover *,
  .entry-side-resizer,
  .inline-switcher__popover,
  .inline-switcher__popover *,
  .avatar-popover,
  .avatar-popover *,
  .workspace-tabs-popover,
  .workspace-tabs-popover * {
    -webkit-app-region: no-drag;
  }
`;

function createPendingHtml(): string {
  const logoDataUrl = getDesktopIconDataUrl();
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <title>Open Design</title>
    <style>
      body {
        align-items: center;
        background: #05070d;
        color: #f7f7fb;
        display: flex;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        height: 100vh;
        justify-content: center;
        margin: 0;
      }
      main {
        align-items: center;
        display: flex;
        flex-direction: column;
        text-align: center;
      }
      img {
        border-radius: 34%;
        display: block;
        height: 72px;
        object-fit: cover;
        width: 72px;
      }
      h1 { margin: 18px 0 0; }
      p { color: #aeb7d5; margin: 12px 0 0; }
    </style>
  </head>
  <body>
    <main>
      ${logoDataUrl ? `<img src="${logoDataUrl}" alt="" />` : ""}
      <h1>Open Design</h1>
      <p>Waiting for the web runtime URL…</p>
    </main>
  </body>
</html>`)}`;
}

function resolveDesktopIconPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/public/app-icon.png");
}

function applyDockIcon(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const icon = nativeImage.createFromPath(resolveDesktopIconPath());
  if (icon.isEmpty()) return;
  app.dock.setIcon(icon);
}

function getDesktopIconDataUrl(): string | null {
  try {
    return `data:image/png;base64,${readFileSync(resolveDesktopIconPath()).toString("base64")}`;
  } catch {
    return null;
  }
}

function normalizeScreenshotPath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

function mapConsoleLevel(level: number): string {
  switch (level) {
    case 0:
      return "debug";
    case 1:
      return "info";
    case 2:
      return "warn";
    case 3:
      return "error";
    default:
      return "log";
  }
}

async function applyWindowChromeCss(window: BrowserWindow): Promise<void> {
  if (process.platform !== "darwin" || window.isDestroyed()) return;
  await window.webContents.insertCSS(MAC_WINDOW_CHROME_CSS, { cssOrigin: "user" });
}

// Exported for unit tests in `apps/packaged/tests/desktop-url-allowlist.test.ts`
// — these are pure URL-policy helpers and `apps/desktop` itself has no
// vitest setup, so the packaged workspace hosts the coverage. Keep them
// pure and side-effect-free.
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isAllowedChildWindowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // `blob:` covers in-renderer generated downloads / object URLs.
    // `od:` is the packaged Electron entry's privileged scheme
    // registered by `apps/packaged/src/protocol.ts` and proxied to the
    // local web sidecar. Without this branch, any in-app
    // `<a target="_blank" href="/api/...">` resolves to `od://app/...`
    // in packaged builds, falls through `setWindowOpenHandler` to
    // `{ action: "deny" }`, and the click is silently dropped — that
    // was the Orbit "Open artifact" no-op reported in #911. Allowing
    // `od:` here lets Electron open the link in a child BrowserWindow
    // that inherits the same protocol registration + preload, so the
    // live artifact preview renders normally. Dev mode is unaffected:
    // its links resolve to `http://127.0.0.1:.../...`, which is gated
    // by the separate `isHttpUrl` branch and continues to open in the
    // user's external browser via `shell.openExternal`.
    // `about:blank` is used by the renderer's PDF export fallback path:
    // `window.open('', '_blank')` opens a blank window that is then
    // navigated to a Blob URL. Without this, the empty URL is denied
    // and the user sees a "Popup blocked" alert.
    return (
      parsed.protocol === "blob:" ||
      parsed.protocol === "od:" ||
      (parsed.protocol === "about:" && parsed.pathname === "blank")
    );
  } catch {
    return false;
  }
}

export function resolveDesktopStatusUrl(currentUrl: string | null, pendingUrl: string | null): string | null {
  return pendingUrl ?? currentUrl;
}

function installWindowChromeCssHook(window: BrowserWindow): void {
  window.webContents.on("did-finish-load", () => {
    void applyWindowChromeCss(window).catch((error: unknown) => {
      console.error("desktop window chrome CSS injection failed", error);
    });
  });
}

function desktopPetUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/desktop-pet";
  url.search = "";
  url.hash = "";
  return url.toString();
}

// Encode the OS locale before stuffing it into a Chromium argv value
// — BCP-47 region tags shouldn't contain `;` or `=`, but the renderer's
// `process.argv` parser is happier if we never have to worry about it.
function osLocaleAdditionalArguments(osLocale: string | undefined): string[] | undefined {
  return osLocale ? [`--od-os-locale=${encodeURIComponent(osLocale)}`] : undefined;
}

function createDesktopPetWindow(preloadPath: string, osLocale: string | undefined): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const petWindow = new BrowserWindow({
    width: DESKTOP_PET_WINDOW_WIDTH,
    height: DESKTOP_PET_WINDOW_HEIGHT,
    x: workArea.x + workArea.width - DESKTOP_PET_WINDOW_WIDTH - DESKTOP_PET_WINDOW_MARGIN,
    y: workArea.y + workArea.height - DESKTOP_PET_WINDOW_HEIGHT - DESKTOP_PET_WINDOW_MARGIN,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      additionalArguments: osLocaleAdditionalArguments(osLocale),
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
    },
  });
  petWindow.setAlwaysOnTop(true, "floating");
  // `skipTransformProcessType: true` is load-bearing, not an
  // optimization. By default Electron's macOS `setVisibleOnAllWorkspaces`
  // transforms the whole *process* type between `UIElementApplication`
  // and `ForegroundApplication` to apply the all-Spaces behavior — the
  // Electron docs note this "will hide the window and dock for a short
  // time". That round-trip races during the launch burst (the pet
  // window is created alongside the main window) and on Electron 41 /
  // macOS 26 the process can stay stuck as an accessory app: no Dock
  // icon, no menu bar, even though the windows render fine (issue
  // #2394). The desktop pet is a cosmetic companion window; it must
  // never decide the app's Dock identity — the main window does.
  // Skipping the transform keeps the app a regular Dock app; the pet
  // still floats on every Space via its `alwaysOnTop` floating level.
  petWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  petWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  petWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.includes("/desktop-pet")) event.preventDefault();
  });
  return petWindow;
}

function showWindowButtons(window: BrowserWindow): void {
  if (process.platform !== "darwin" || window.isDestroyed()) return;
  window.setWindowButtonVisibility(true);
}

// Windows focus-stealing prevention can leave a detached-spawned GUI
// window minimized or hidden even when constructed with show:true,
// leaving users unable to locate the window. Cross-platform safe: only
// acts when the window is actually minimized or hidden, preserving any
// user-adjusted window state.
function ensureWindowVisible(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

/**
 * Surface of {@link BrowserWindow} consumed by
 * {@link hideWindowExitingFullscreen} — declared structurally so the
 * helper can be exercised with a plain mock in unit tests without
 * standing up an actual Electron window.
 *
 * `isEnteringFullscreen` covers the Electron-asynchronous gap between
 * the renderer asking for fullscreen and the OS confirming via
 * 'enter-full-screen': the caller is expected to track this from the
 * window's enter/leave listeners (see the close handler in
 * {@link configureWindow}) and surface it here.
 */
export type WindowFullscreenSurface = {
  hide: () => void;
  isFullScreen: () => boolean;
  isSimpleFullScreen: () => boolean;
  isEnteringFullscreen: () => boolean;
  setFullScreen: (flag: boolean) => void;
  setSimpleFullScreen: (flag: boolean) => void;
  once: (event: 'enter-full-screen' | 'leave-full-screen', listener: () => void) => unknown;
};

export type MainWindowCloseSurface = {
  on: (event: 'closed', listener: () => void) => unknown;
};

export function attachNonDarwinMainWindowCloseShutdown(
  window: MainWindowCloseSurface,
  options: {
    isStopped: () => boolean;
    requestQuit?: () => void;
  },
): void {
  window.on("closed", () => {
    if (options.isStopped()) return;
    options.requestQuit?.();
  });
}

/**
 * Hide the window, first leaving any active fullscreen so macOS doesn't
 * orphan the fullscreen Space as a black screen. The hide is deferred
 * until 'leave-full-screen' fires; if the Space transition is still
 * flipping in (`isEnteringFullscreen`), defer further until
 * 'enter-full-screen' settles before starting the exit. Plain hides
 * race the OS Space teardown and leave the user staring at a black
 * desktop until they switch Spaces by hand.
 */
export function hideWindowExitingFullscreen(window: WindowFullscreenSurface): void {
  if (window.isSimpleFullScreen()) {
    window.once('leave-full-screen', () => window.hide());
    window.setSimpleFullScreen(false);
    return;
  }
  if (window.isFullScreen()) {
    window.once('leave-full-screen', () => window.hide());
    window.setFullScreen(false);
    return;
  }
  if (window.isEnteringFullscreen()) {
    window.once('enter-full-screen', () => {
      window.once('leave-full-screen', () => window.hide());
      window.setFullScreen(false);
    });
    return;
  }
  window.hide();
}

// Some exports reach the renderer through a normal `<a download>` link
// (server-written PPTX, browser-generated image blobs). Without this hook
// Electron writes the bytes straight to the OS Downloads folder, so the user
// never gets to pick a destination. setSaveDialogOptions makes Electron show
// the native Save As panel before the download starts.
const IMAGE_SAVE_AS_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const SAVE_AS_EXTENSIONS = new Set([".pptx", ...IMAGE_SAVE_AS_EXTENSIONS]);

function attachDownloadSaveAsDialog(window: BrowserWindow): void {
  window.webContents.session.on("will-download", (_event, item) => {
    const filename = item.getFilename();
    const dot = filename.lastIndexOf(".");
    const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
    if (!SAVE_AS_EXTENSIONS.has(ext)) return;
    item.setSaveDialogOptions({
      title: "Save As",
      defaultPath: filename,
      filters: IMAGE_SAVE_AS_EXTENSIONS.has(ext)
        ? [
            { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
            { name: "All Files", extensions: ["*"] },
          ]
        : [
            { name: "PowerPoint Presentation", extensions: ["pptx"] },
            { name: "All Files", extensions: ["*"] },
          ],
    });
  });
}

function parsePrintReadyPdfOptions(value: unknown): PrintReadyPdfOptions {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid print payload: expected options object");
  }
  const deck = (value as { deck?: unknown }).deck;
  if (deck !== undefined && typeof deck !== "boolean") {
    throw new Error("Invalid print payload: expected deck option to be boolean");
  }
  return deck === true ? { deck: true } : {};
}

function unavailableUpdaterStatus(): DesktopUpdateStatusSnapshot {
  return {
    arch: process.arch,
    capabilities: {
      canApplyInPlace: false,
      canDownload: false,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: DESKTOP_UPDATE_CHANNELS.BETA,
    currentVersion: "0.0.0",
    enabled: false,
    error: {
      code: "updater-unavailable",
      message: "Desktop updater is not available.",
    },
    mode: DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER,
    platform: process.platform,
    state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
    supported: false,
  };
}

function checkOptionsFromHost(options: unknown): { autoDownload?: boolean } | undefined {
  const input = options as OpenDesignHostUpdaterActionOptions | null | undefined;
  const payload = input?.payload;
  if (payload == null || typeof payload.autoDownload !== "boolean") return undefined;
  return { autoDownload: payload.autoDownload };
}

async function reportRendererCrash(
  options: DesktopRuntimeOptions,
  properties: { reason: string; exit_code: number | null },
): Promise<void> {
  try {
    // discoverDaemonUrl returns the real http://127.0.0.1:<port> URL the
    // sidecar daemon listens on. In tools-dev callers omit it and fall back
    // to discoverUrl (which is also http in dev). In packaged builds it's
    // mandatory because the renderer-only `od://app/` scheme isn't
    // reachable from main-process Node fetch.
    const baseUrl = (await (options.discoverDaemonUrl?.() ?? options.discoverUrl())) ?? null;
    if (!baseUrl) return;
    const url = new URL("/api/observability/event", baseUrl).toString();
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "desktop_renderer_crash",
        properties: {
          reason: properties.reason,
          exit_code: properties.exit_code,
        },
      }),
    });
  } catch {
    // Best-effort. The user is already in a degraded state — failing to
    // report the crash must not cascade into another failure path.
  }
}

export async function createDesktopRuntime(options: DesktopRuntimeOptions): Promise<DesktopRuntime> {
  const preloadPath = options.preloadPath ?? join(dirname(fileURLToPath(import.meta.url)), "preload.cjs");
  applyDockIcon();

  // ipcMain.handle() registers a handler in an internal map that is *not*
  // surfaced via eventNames(); the previous `!eventNames().includes(...)`
  // check was therefore always true and would throw "Attempted to register
  // a second handler" on the second createDesktopRuntime() call (e.g. dev
  // hot-reload). removeHandler is a no-op when nothing is registered.
  ipcMain.removeHandler("dialog:pick-folder");
  ipcMain.removeHandler("dialog:pick-and-import");
  ipcMain.removeHandler("dialog:pick-and-replace-working-dir");
  ipcMain.removeHandler("shell:open-external");
  ipcMain.removeHandler("shell:open-path");
  for (const channel of UPDATER_IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    if (!isHttpUrl(url)) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });
  // PR #974: the renderer no longer receives a raw filesystem path from
  // the main process. The previous `dialog:pick-folder` IPC returned the
  // chosen path string, the renderer then POSTed `/api/import/folder`
  // itself, and a compromised renderer could substitute an arbitrary
  // baseDir at the second step (or skip the picker entirely and call
  // `/api/import/folder` directly via fetch). The new
  // `dialog:pick-and-import` IPC binds the picker and the import into
  // a single main-process transaction: we show the dialog, mint an
  // HMAC token for the chosen path, POST `/api/import/folder` with that
  // token, and hand the renderer back only the daemon's response shape.
  // The daemon's HTTP handler verifies the token and rejects any
  // import request without one whenever a desktop secret has been
  // registered, closing the renderer→arbitrary-baseDir bypass at the
  // import boundary while leaving web-only deployments untouched.
  ipcMain.handle(
    "dialog:pick-and-import",
    async (_event, init?: { name?: string; skillId?: string | null; designSystemId?: string | null }) => {
      // Defensive failsafe for non-production runtimes (test harnesses
      // that construct createDesktopRuntime without a secret). Round-5
      // production wiring in runDesktopMain ALWAYS passes the per-process
      // secret regardless of whether the startup handshake succeeded —
      // the lazy retry inside pickAndImportFolder is the recovery
      // mechanism for the "startup registration missed its window"
      // case (lefarcen P1, mrcfps), not this branch.
      if (options.desktopAuthSecret == null) {
        return { ok: false, reason: "desktop auth secret not registered" };
      }
      // Round-7 (lefarcen P2): packaged builds report the renderer URL
      // (`od://app/`) over `discoverUrl`, but Node-side fetch can't
      // resolve a custom Electron protocol scheme. Prefer the daemon
      // sidecar's real http URL when packaged exposes it; tools-dev
      // omits `discoverDaemonUrl` and we fall back to the web URL
      // (which is itself an http://127.0.0.1 URL in dev).
      const apiBaseUrl =
        (options.discoverDaemonUrl ? await options.discoverDaemonUrl() : null) ??
        (await options.discoverUrl());
      if (!apiBaseUrl) {
        return { ok: false, reason: "daemon API URL not available" };
      }
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      // PR #974 round-5 (lefarcen P3): trim ONCE on the desktop side so the
      // HMAC and the request body bind to the exact same string the daemon
      // realpath()s. The daemon used to verify raw `baseDir` and then trim
      // before resolution — a `/tmp/foo ` selection could authorize an
      // import of `/tmp/foo`. Doing the trim here keeps desktop as the
      // source of truth for the canonical path it picked, signs that, and
      // sends that — daemon then verifies and imports the same string.
      const baseDir = result.filePaths[0].trim();
      if (baseDir.length === 0) {
        return { ok: false, reason: "picker returned an empty path" };
      }
      return await pickAndImportFolder({
        apiBaseUrl,
        baseDir,
        desktopAuthSecret: options.desktopAuthSecret,
        init,
        registerDesktopAuth: options.registerDesktopAuthWithDaemon,
      });
    },
  );
  // Atomic counterpart to dialog:pick-and-import for replacing a
  // project's working directory. The picker, HMAC mint, and daemon
  // POST are a single main-process transaction.
  ipcMain.handle(
    "dialog:pick-and-replace-working-dir",
    async (_event, init?: { projectId?: string }) => {
      if (options.desktopAuthSecret == null) {
        return { ok: false, reason: "desktop auth secret not registered" };
      }
      const projectId = typeof init?.projectId === "string" ? init.projectId : "";
      if (projectId.length === 0) {
        return { ok: false, reason: "project id is required" };
      }
      const apiBaseUrl =
        (options.discoverDaemonUrl ? await options.discoverDaemonUrl() : null) ??
        (await options.discoverUrl());
      if (!apiBaseUrl) {
        return { ok: false, reason: "daemon API URL not available" };
      }
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, canceled: true };
      }
      const baseDir = result.filePaths[0].trim();
      if (baseDir.length === 0) {
        return { ok: false, reason: "picker returned an empty path" };
      }
      return await pickAndReplaceWorkingDir({
        apiBaseUrl,
        baseDir,
        desktopAuthSecret: options.desktopAuthSecret,
        projectId,
        registerDesktopAuth: options.registerDesktopAuthWithDaemon,
      });
    },
  );
  // shell.openPath opens an absolute filesystem path in the OS file
  // manager (Finder / Explorer / Files). It resolves to '' on success
  // and to a non-empty error string on failure (per Electron's
  // contract). The web caller uses that empty/non-empty distinction
  // to decide between the success toast and the manual fallback toast.
  //
  // The renderer hands us a *project ID*, not a path. The main
  // process then asks the daemon (via the web sidecar proxy) for the
  // canonical resolvedDir, then validates it (absolute, exists,
  // is-directory, not an .app bundle) before forwarding to
  // shell.openPath. This makes the path allowlist daemon-controlled:
  // a compromised renderer cannot synthesize an arbitrary path
  // because it never names the path, only the project ID. The daemon
  // is the single source of truth for what counts as a project root.
  //
  // PR #974 defense in depth: when the project is folder-imported
  // (resolvedDir comes from a user-controlled `metadata.baseDir`), we
  // additionally require `metadata.fromTrustedPicker === true`, the
  // marker stamped by the daemon's HMAC-gated import handler. Native
  // projects (no `metadata.baseDir`, resolvedDir under the daemon's
  // own projects root) are always safe to open. This is the literal
  // interpretation of mrcfps's round-3 review: "only allowing
  // openPath(projectId) for projects whose resolvedDir came from that
  // trusted flow."
  ipcMain.handle("shell:open-path", async (_event, projectId: string) => {
    // Round-7 (lefarcen P2): same packaged od:// → daemon URL pivot as
    // the dialog:pick-and-import handler above.
    const apiBaseUrl =
      (options.discoverDaemonUrl ? await options.discoverDaemonUrl() : null) ??
      (await options.discoverUrl());
    if (!apiBaseUrl) {
      return "open-path: daemon API URL not available";
    }
    const resolved = await fetchResolvedProjectDir(apiBaseUrl, projectId);
    if (!resolved.ok) return `open-path: ${resolved.reason}`;
    const allowed = isOpenPathAllowedForProject(resolved.context);
    if (!allowed.ok) return `open-path: ${allowed.reason}`;
    const validated = await validateExistingDirectory(resolved.context.resolvedDir);
    if (!validated.ok) return `open-path: ${validated.reason}`;
    try {
      return await openValidatedDirectory(validated.resolved, {
        release,
        execFile: async (cmd, args) => {
          const { stdout } = await execFileAsync(cmd, [...args]);
          return { stdout };
        },
        openPath: (p) => shell.openPath(p),
      });
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  });

  const consoleEntries: DesktopConsoleEntry[] = [];
  const petWindow = createDesktopPetWindow(preloadPath, options.osLocale);
  const window = new BrowserWindow({
    height: 900,
    icon: resolveDesktopIconPath(),
    // Below this size the project page's left/right split (chat
    // composer + designs panel + preview pane) overlaps and the top
    // navigation clips, so prevent Electron from honoring user drags
    // that would shrink the window past the usable breakpoint.
    minHeight: 600,
    minWidth: 900,
    show: true,
    title: "Open Design",
    autoHideMenuBar: true,
    ...MAC_WINDOW_CHROME,
    webPreferences: {
      additionalArguments: osLocaleAdditionalArguments(options.osLocale),
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
    },
    width: 1280,
  });
  installWindowChromeCssHook(window);
  showWindowButtons(window);
  attachDownloadSaveAsDialog(window);

  // Renderer-process crashes are completely invisible to the web bundle's
  // own analytics surface (the renderer is dead — no JS can run, no
  // window.error fires). The main process is the last layer that can
  // observe them, so we forward the event to the daemon's safety-event
  // bridge (`POST /api/observability/event`), which posts directly to
  // PostHog with `device_id = installationId`. Best-effort: a failure to
  // reach the daemon must not block the crash recovery flow.
  window.webContents.on("render-process-gone", (_event, details) => {
    void reportRendererCrash(options, {
      reason: details.reason,
      exit_code: typeof details.exitCode === "number" ? details.exitCode : null,
    });
  });

  const sendUpdaterStatus = (status = options.updater?.snapshot() ?? unavailableUpdaterStatus()) => {
    if (window.isDestroyed()) return;
    window.webContents.send(UPDATER_STATUS_EVENT, status);
  };
  const unsubscribeUpdater = options.updater?.subscribe(() => sendUpdaterStatus()) ?? (() => undefined);
  const requireMainWindowSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents) {
      throw new Error("updater IPC is only available to the main Open Design window");
    }
  };
  ipcMain.handle("od:update:status", async (event) => {
    requireMainWindowSender(event);
    const status = await (options.updater?.status() ?? unavailableUpdaterStatus());
    sendUpdaterStatus(status);
    return status;
  });
  ipcMain.handle("od:update:check", async (event, updaterOptions: unknown) => {
    requireMainWindowSender(event);
    const status = await (options.updater?.checkForUpdates(checkOptionsFromHost(updaterOptions)) ?? unavailableUpdaterStatus());
    sendUpdaterStatus(status);
    return status;
  });
  ipcMain.handle("od:update:download", async (event) => {
    requireMainWindowSender(event);
    const status = await (options.updater?.downloadUpdate() ?? unavailableUpdaterStatus());
    sendUpdaterStatus(status);
    return status;
  });
  ipcMain.handle("od:update:install", async (event) => {
    requireMainWindowSender(event);
    const status = await (options.updater?.installUpdate() ?? unavailableUpdaterStatus());
    sendUpdaterStatus(status);
    return status;
  });
  ipcMain.handle("od:update:quit", async (event): Promise<OpenDesignHostActionResult> => {
    requireMainWindowSender(event);
    const status = await (options.updater?.status() ?? unavailableUpdaterStatus());
    if (status.installResult == null) {
      return { ok: false, reason: "installer has not been opened" };
    }
    if (options.requestQuit == null) {
      return { ok: false, reason: "desktop quit is not available" };
    }
    setTimeout(() => options.requestQuit?.(), 0);
    return { ok: true };
  });

  ipcMain.removeAllListeners("desktop-pet:set-visible");
  ipcMain.on("desktop-pet:set-visible", (event, visible: unknown) => {
    if (petWindow.isDestroyed() || event.sender !== petWindow.webContents) return;
    if (visible) petWindow.showInactive();
    else petWindow.hide();
  });

  ipcMain.removeHandler('od:print-pdf');
  ipcMain.handle('od:print-pdf', async (_event, html: unknown, nonce: unknown, options: unknown): Promise<void> => {
    if (typeof html !== 'string') {
      throw new Error('Invalid print payload: expected HTML string');
    }
    const printNonce = typeof nonce === 'string' ? nonce : '';
    const printOptions = parsePrintReadyPdfOptions(options);
    // Issue #1774: the renderer's `printPdf()` bridge runs the direct
    // Save-as-PDF flow (showSaveDialog -> printToPDF -> write), never
    // `webContents.print()` — the printer-first OS dialog. The renderer
    // (apps/web/src/runtime/exports.ts#exportAsPdf) only reacts to a
    // rejection: it shows a "Print failed" alert. A resolved call —
    // including a user-canceled Save dialog — is silent, matching the
    // pre-#1774 behavior where canceling the OS dialog was a no-op.
    const result = await savePrintReadyDocumentAsPdf(
      html,
      printNonce,
      createElectronPdfTarget(),
      printOptions,
    );
    if (!result.ok) {
      throw new Error(result.error ?? 'PDF export failed');
    }
  });

  let currentUrl: string | null = null;
  let currentPetUrl: string | null = null;
  let pendingUrl: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  window.on("focus", () => showWindowButtons(window));
  window.on("blur", () => showWindowButtons(window));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedChildWindowUrl(url)) return { action: "allow" };
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isHttpUrl(url) || url === currentUrl) return;
    const currentOrigin = currentUrl ? new URL(currentUrl).origin : null;
    const nextOrigin = new URL(url).origin;
    if (currentOrigin === nextOrigin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  if (process.platform === "darwin") {
    // Track the in-flight fullscreen-enter window so the close handler can
    // tell mid-transition apart from "definitely not fullscreen". HTML
    // requestFullscreen() emits enter-html-full-screen on webContents
    // before the OS Space transition completes; the BrowserWindow
    // enter-full-screen event fires once the OS confirms.
    let enteringFullscreen = false;
    window.webContents.on("enter-html-full-screen", () => {
      enteringFullscreen = true;
    });
    window.webContents.on("leave-html-full-screen", () => {
      enteringFullscreen = false;
    });
    window.on("enter-full-screen", () => {
      enteringFullscreen = false;
    });
    window.on("leave-full-screen", () => {
      enteringFullscreen = false;
    });
    window.on("close", (event) => {
      if (stopped) return;
      event.preventDefault();
      hideWindowExitingFullscreen({
        hide: () => window.hide(),
        isFullScreen: () => window.isFullScreen(),
        isSimpleFullScreen: () => window.isSimpleFullScreen(),
        isEnteringFullscreen: () => enteringFullscreen,
        setFullScreen: (flag) => window.setFullScreen(flag),
        setSimpleFullScreen: (flag) => window.setSimpleFullScreen(flag),
        // BrowserWindow.once is heavily overloaded; both event names are
        // valid (BrowserWindow emits enter-full-screen and
        // leave-full-screen on macOS) but TypeScript can't pick a single
        // overload for the union, so narrow at the call site.
        once: (event, listener) =>
          event === 'enter-full-screen'
            ? window.once('enter-full-screen', listener)
            : window.once('leave-full-screen', listener),
      });
    });
  } else {
    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => stopped,
      requestQuit: options.requestQuit,
    });
  }

  const rendererLogPath = options.rendererLogPath ?? null;
  let rendererLogReady: Promise<void> | null = null;
  const ensureRendererLogDir = async (): Promise<void> => {
    if (rendererLogPath == null) return;
    if (rendererLogReady == null) {
      rendererLogReady = mkdir(dirname(rendererLogPath), { recursive: true }).then(() => undefined);
    }
    await rendererLogReady;
  };
  const persistRendererEntry = async (entry: DesktopConsoleEntry): Promise<void> => {
    if (rendererLogPath == null) return;
    if (entry.level !== "error" && entry.level !== "warn") return;
    try {
      await ensureRendererLogDir();
      const line = `${JSON.stringify({ timestamp: entry.timestamp, level: entry.level, text: entry.text })}\n`;
      await appendFile(rendererLogPath, line, "utf8");
    } catch (error) {
      console.error("desktop renderer log append failed", error);
    }
  };

  (window.webContents as any).on("console-message", (event: { level?: number | string; message?: string }) => {
    const level = typeof event.level === "number" ? mapConsoleLevel(event.level) : (event.level ?? "log");
    const entry: DesktopConsoleEntry = {
      level,
      text: event.message ?? "",
      timestamp: new Date().toISOString(),
    };
    consoleEntries.push(entry);
    if (consoleEntries.length > MAX_CONSOLE_ENTRIES) {
      consoleEntries.splice(0, consoleEntries.length - MAX_CONSOLE_ENTRIES);
    }
    void persistRendererEntry(entry);
  });

  await window.loadURL(createPendingHtml());
  showWindowButtons(window);
  ensureWindowVisible(window);

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };

  const tick = async () => {
    if (stopped || window.isDestroyed()) return;

    try {
      const url = await options.discoverUrl();
      if (url != null && url !== currentUrl) {
        pendingUrl = url;
        await window.loadURL(url);
        currentUrl = url;
        pendingUrl = null;
        showWindowButtons(window);
        const nextPetUrl = desktopPetUrl(url);
        if (!petWindow.isDestroyed() && nextPetUrl !== currentPetUrl) {
          await petWindow.loadURL(nextPetUrl);
          currentPetUrl = nextPetUrl;
        }
      } else if (url == null) {
        pendingUrl = null;
      }
      schedule(url == null ? PENDING_POLL_MS : RUNNING_POLL_MS);
    } catch (error) {
      pendingUrl = null;
      console.error("desktop web discovery failed", error);
      schedule(PENDING_POLL_MS);
    }
  };

  void tick();

  return {
    async click(input) {
      if (window.isDestroyed()) return { clicked: false, found: false };
      const selector = JSON.stringify(input.selector);
      return await window.webContents.executeJavaScript(
        `(() => {
          const element = document.querySelector(${selector});
          if (!element) return { found: false, clicked: false };
          if (typeof element.click === "function") element.click();
          return { found: true, clicked: true };
        })()`,
        true,
      );
    },
    async close() {
      stopped = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribeUpdater();
      ipcMain.removeAllListeners("desktop-pet:set-visible");
      for (const channel of UPDATER_IPC_CHANNELS) {
        ipcMain.removeHandler(channel);
      }
      if (!petWindow.isDestroyed()) petWindow.close();
      if (!window.isDestroyed()) window.close();
    },
    console() {
      return { entries: [...consoleEntries] };
    },
    async eval(input) {
      if (window.isDestroyed()) return { error: "desktop window is destroyed", ok: false };
      try {
        const value = await window.webContents.executeJavaScript(input.expression, true);
        return { ok: true, value };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), ok: false };
      }
    },
    exportPdf(input) {
      return exportPdfFromHtml(input);
    },
    async screenshot(input) {
      if (window.isDestroyed()) throw new Error("desktop window is destroyed");
      const outputPath = normalizeScreenshotPath(input.path);
      const image = await window.webContents.capturePage();
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, image.toPNG());
      return { path: outputPath };
    },
    show() {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    },
    status() {
      return {
        pid: process.pid,
        state: window.isDestroyed() ? "unknown" : "running",
        title: window.isDestroyed() ? null : window.getTitle(),
        updatedAt: new Date().toISOString(),
        url: resolveDesktopStatusUrl(currentUrl, pendingUrl),
        windowVisible: !window.isDestroyed() && window.isVisible(),
      };
    },
  };
}
