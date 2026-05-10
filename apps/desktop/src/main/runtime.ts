import { createHmac, randomBytes } from "node:crypto";
import { mkdir, writeFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { DesktopExportPdfInput, DesktopExportPdfResult } from "@open-design/sidecar-proto";

import { exportPdfFromHtml, waitForPrintReadyHandshake } from "./pdf-export.js";

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
   * Round-5 (lefarcen P1, mrcfps): lazy re-handshake hook. The runtime
   * calls this when the daemon answers `503 DESKTOP_AUTH_PENDING` so a
   * daemon-restart-mid-session, or a missed startup-window race, no
   * longer permanently breaks folder import. Returns `true` when
   * registration succeeded so the runtime can mint a fresh token and
   * retry once. Optional so test runtimes and web-only deployments can
   * skip it (the lazy retry then collapses into a single attempt).
   */
  registerDesktopAuthWithDaemon?: () => Promise<boolean>;
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
    const token = mint(deps.desktopAuthSecret, deps.baseDir);
    try {
      return await fetchImpl(importUrl, {
        body: requestBody,
        headers: {
          "Content-Type": "application/json",
          [DESKTOP_IMPORT_TOKEN_HEADER]: token,
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

const MAC_WINDOW_CHROME =
  process.platform === "darwin"
    ? ({
        titleBarStyle: "hiddenInset" as const,
        trafficLightPosition: { x: 14, y: 12 },
      })
    : {};

const MAC_WINDOW_CHROME_CSS = `
  .app-chrome-header {
    --app-chrome-traffic-space: 56px !important;
    -webkit-app-region: drag;
  }
  .app-chrome-traffic-space {
    flex: 0 0 56px !important;
    width: 56px !important;
  }
  .app-chrome-header button,
  .app-chrome-header [role="button"],
  .app-chrome-header [contenteditable],
  .app-chrome-actions,
  .app-chrome-actions *,
  .avatar-popover,
  .avatar-popover * {
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
  .entry-brand,
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
  .avatar-popover,
  .avatar-popover * {
    -webkit-app-region: no-drag;
  }
`;

function createPendingHtml(): string {
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
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 24px;
        padding: 32px;
      }
      p { color: #aeb7d5; margin: 12px 0 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Open Design</h1>
      <p>Waiting for the web runtime URL…</p>
    </main>
  </body>
</html>`)}`;
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

// PPTX is rendered by the agent into the project folder and reaches the
// renderer through a normal `<a download>` link to /api/projects/:id/raw/*.
// Without this hook Electron writes the bytes straight to the OS Downloads
// folder, so the user never gets to pick a destination. setSaveDialogOptions
// makes Electron show the native Save As panel before the download starts.
const SAVE_AS_EXTENSIONS = new Set([".pptx"]);

function attachDownloadSaveAsDialog(window: BrowserWindow): void {
  window.webContents.session.on("will-download", (_event, item) => {
    const filename = item.getFilename();
    const dot = filename.lastIndexOf(".");
    const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
    if (!SAVE_AS_EXTENSIONS.has(ext)) return;
    item.setSaveDialogOptions({
      title: "Save As",
      defaultPath: filename,
      filters: [
        { name: "PowerPoint Presentation", extensions: ["pptx"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
  });
}

export async function createDesktopRuntime(options: DesktopRuntimeOptions): Promise<DesktopRuntime> {
  const preloadPath = join(dirname(fileURLToPath(import.meta.url)), "preload.cjs");

  // ipcMain.handle() registers a handler in an internal map that is *not*
  // surfaced via eventNames(); the previous `!eventNames().includes(...)`
  // check was therefore always true and would throw "Attempted to register
  // a second handler" on the second createDesktopRuntime() call (e.g. dev
  // hot-reload). removeHandler is a no-op when nothing is registered.
  ipcMain.removeHandler("dialog:pick-folder");
  ipcMain.removeHandler("dialog:pick-and-import");
  ipcMain.removeHandler("shell:open-external");
  ipcMain.removeHandler("shell:open-path");
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
      return await shell.openPath(validated.resolved);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  });

  const consoleEntries: DesktopConsoleEntry[] = [];
  const window = new BrowserWindow({
    height: 900,
    show: true,
    title: "Open Design",
    ...MAC_WINDOW_CHROME,
    webPreferences: {
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

  ipcMain.removeHandler('od:print-pdf');
  ipcMain.handle('od:print-pdf', async (_event, html: unknown, nonce: unknown): Promise<void> => {
    if (typeof html !== 'string') {
      throw new Error('Invalid print payload: expected HTML string');
    }
    const printNonce = typeof nonce === 'string' ? nonce : '';

    const printWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    printWindow.webContents.on('will-navigate', (e) => e.preventDefault());

    try {
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await waitForPrintReadyHandshake(printWindow.webContents, printNonce);
      printWindow.show();

      await new Promise<void>((resolve, reject) => {
        printWindow.webContents.print({ printBackground: true }, (success: boolean, failureReason?: string) => {
          if (success) resolve();
          else if (failureReason === 'Print job canceled') resolve();
          else reject(new Error(failureReason ?? 'Print failed'));
        });
      });
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
    }
  });

  let currentUrl: string | null = null;
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
    window.on("close", (event) => {
      if (!stopped) {
        event.preventDefault();
        window.hide();
      }
    });
  }

  (window.webContents as any).on("console-message", (event: { level?: number | string; message?: string }) => {
    const level = typeof event.level === "number" ? mapConsoleLevel(event.level) : (event.level ?? "log");
    consoleEntries.push({
      level,
      text: event.message ?? "",
      timestamp: new Date().toISOString(),
    });
    if (consoleEntries.length > MAX_CONSOLE_ENTRIES) {
      consoleEntries.splice(0, consoleEntries.length - MAX_CONSOLE_ENTRIES);
    }
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
