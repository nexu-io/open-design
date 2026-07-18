import { execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { appendFile, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { release } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { BrowserWindow, app, dialog, ipcMain, nativeImage, screen, session, shell } from "electron";
import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  type DesktopExportArtifactInput,
  type DesktopExportArtifactResult,
  type DesktopExportPdfInput,
  type DesktopExportPdfResult,
  type DesktopRenderSlidesInput,
  type DesktopRenderSlidesResult,
  type DesktopUpdateStatusSnapshot,
} from "@open-design/sidecar-proto";
import type { OpenDesignHostActionResult, OpenDesignHostCaptureResult, OpenDesignHostUpdaterActionOptions } from "@open-design/host";

import { renderDeckSlides } from "./deck-capture.js";
import { openValidatedDirectory } from "./open-path.js";
import { exportArtifact as exportArtifactFromHtml } from "./artifact-export.js";
import { createElectronPdfTarget, exportPdfFromHtml, savePrintReadyDocumentAsPdf } from "./pdf-export.js";
import { SPLASH_VIDEO_DATA_URL } from "./splash-video.js";
import { RendererCrashLoopBreaker } from "./renderer-crash-loop.js";
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

/**
 * An HTTP 5xx main-frame document is a failed load. Electron resolves
 * `loadURL` for any response that carries a body — `did-fail-load` fires
 * only for net::ERR_* failures — so an error document (e.g. the packaged
 * od:// proxy's synthetic 502) parks the renderer on a dead page the
 * recovery loop never sees. Route it into the same renderer-failed
 * reload path as a network failure. Electron reports non-HTTP
 * navigations with 0 / -1, which must never trip this.
 */
export function isRendererFailureHttpStatus(httpResponseCode: number): boolean {
  return httpResponseCode >= 500;
}

const PENDING_POLL_MS = 120;
const RUNNING_POLL_MS = 2000;
// Minimum time the light splash window stays on screen before we reveal the main
// window. It is sized to outlast the ~1.7s clip so the brand animation always
// plays through. The splash is shown immediately and in parallel with the
// daemon/web boot (see the packaged entry), so this time overlaps startup rather
// than adding to it; the <video> holds on its final frame (it does not loop)
// while the runtime finishes coming up. See `createSplashWindow`.
const MIN_SPLASH_MS = 2000;
// While the splash is up, the real web app loads in a hidden main window. We
// reveal it only once the web bundle reports it has actually mounted (it sets
// `data-od-app-mounted="1"` on first paint of the real UI), so the user never
// sees the web's own "Loading Open Design…" shell flash between the splash and
// the app. Poll cadence + a hard ceiling so a missing mount signal can never
// strand the user on the splash forever.
const WEB_MOUNT_POLL_MS = 80;
const WEB_MOUNT_REVEAL_TIMEOUT_MS = 15000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const summarizeExpression = (expression: string): Record<string, unknown> => ({
  expressionLength: expression.length,
  expressionPreview: expression.length > 120 ? `${expression.slice(0, 120)}...` : expression,
});
const MAX_CONSOLE_ENTRIES = 200;
const DESKTOP_PET_WINDOW_WIDTH = 360;
const DESKTOP_PET_WINDOW_HEIGHT = 300;
const DESKTOP_PET_WINDOW_MARGIN = 24;
const UPDATER_STATUS_EVENT = "od:update:status-changed";
const DESIGN_BROWSER_PARTITION = "persist:open-design-design-browser";
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

type DesktopBrowserStorageType =
  | "cachestorage"
  | "cookies"
  | "filesystem"
  | "indexdb"
  | "localstorage"
  | "serviceworkers"
  | "shadercache"
  | "websql";

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
  exportArtifact(input: DesktopExportArtifactInput): Promise<DesktopExportArtifactResult>;
  exportPdf(input: DesktopExportPdfInput): Promise<DesktopExportPdfResult>;
  renderSlides(input: DesktopRenderSlidesInput): Promise<DesktopRenderSlidesResult>;
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
   * User-visible app/window name. Packaged release channels pass their
   * channel-specific product name here so concurrent installs remain
   * distinguishable in the OS window switcher.
   */
  windowTitle?: string;
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
  /**
   * Optional pre-created splash window. The packaged entry creates the splash
   * BEFORE awaiting the daemon/web sidecars so the brand animation is on screen
   * in parallel with startup (no black no-window gap). When omitted (tools-dev,
   * tests) the runtime creates its own splash — dev boots fast enough that the
   * window-then-splash ordering is imperceptible. The runtime owns closing it
   * once the main window is revealed.
   */
  splashWindow?: BrowserWindow | null;
  /**
   * Wall-clock instant the pre-created `splashWindow` first appeared (from
   * {@link SplashWindowHandle.startedAt}). The minimum-hold timer is measured
   * from here, so when packaged creates the splash before the sidecars boot the
   * hold overlaps the boot instead of being added after it. Ignored when
   * `splashWindow` is omitted (the runtime stamps its own splash at creation).
   */
  splashStartedAt?: number;
  updater?: DesktopUpdater;
  /**
   * Fired once the main window is actually revealed (the web app mounted and
   * the window is shown) — the real "app is running" moment, distinct from
   * `createDesktopRuntime` returning (which starts async bootstrap via
   * `void tick()` and returns before the first load). Used to mark the session
   * as having reached running for abnormal-exit detection.
   */
  onRevealed?: () => void;
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

/**
 * Pure helper for the `dialog:pick-working-dir` IPC handler (the Home,
 * pre-create flow). Unlike `pickAndImportFolder` / `pickAndReplaceWorkingDir`,
 * there is no project yet, so we cannot POST to the daemon to discover a
 * `503 DESKTOP_AUTH_PENDING` and self-heal. The token we mint here is spent
 * LATER, by the renderer, on `POST /api/projects/:id/working-dir` once the
 * project exists.
 *
 * If the daemon missed its startup auth-registration window, that deferred
 * POST is guaranteed to be rejected with `DESKTOP_AUTH_PENDING` — and the
 * renderer's create flow surfaces that as a confusing late failure. To keep
 * the Home picker on par with the import/replace flows' self-healing, we
 * proactively run the desktop-auth handshake (`registerDesktopAuth`) BEFORE
 * minting and returning the token, so the daemon already knows the secret by
 * the time the renderer spends the token.
 *
 * Extracted from `createDesktopRuntime` so vitest can pin the
 * DESKTOP_AUTH_PENDING re-registration path without booting Electron.
 */
export type MintHomeWorkingDirTokenDeps = {
  baseDir: string;
  desktopAuthSecret: Buffer;
  /** Lazy desktop-auth handshake. Mirrors the import/replace flows. */
  registerDesktopAuth?: () => Promise<boolean>;
  /** Injected for tests; defaults to the production HMAC mint. */
  mintToken?: (secret: Buffer, baseDir: string) => string;
};

export type MintHomeWorkingDirTokenResult =
  | { baseDir: string; ok: true; token: string }
  | { ok: false; reason: string };

export async function mintHomeWorkingDirToken(
  deps: MintHomeWorkingDirTokenDeps,
): Promise<MintHomeWorkingDirTokenResult> {
  const mint = deps.mintToken ?? mintImportToken;
  const baseDir = deps.baseDir.trim();
  if (baseDir.length === 0) {
    return { ok: false, reason: "picker returned an empty path" };
  }
  // Ensure the daemon has the desktop-auth secret registered before we hand
  // the renderer a token bound to it. A failed handshake here means the
  // deferred working-dir POST would fail anyway, so report it now while the
  // user is still in the picker rather than as a silent late create failure.
  if (deps.registerDesktopAuth != null) {
    const registered = await deps.registerDesktopAuth();
    if (!registered) {
      return {
        ok: false,
        reason: "desktop auth handshake with the daemon failed; please retry",
      };
    }
  }
  return { baseDir, ok: true, token: mint(deps.desktopAuthSecret, baseDir) };
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
    --app-chrome-traffic-space: 96px !important;
    --app-chrome-traffic-margin: 12px !important;
    -webkit-app-region: drag;
  }
  .app-chrome-traffic-space {
    flex: 0 0 96px !important;
    width: 96px !important;
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
  .new-project-modal-backdrop,
  .new-project-modal-backdrop *,
  .automation-modal-backdrop,
  .automation-modal-backdrop *,
  .use-everywhere-modal-backdrop,
  .use-everywhere-modal-backdrop *,
  .plugin-details-modal-backdrop,
  .plugin-details-modal-backdrop *,
  .plugins-import-modal__backdrop,
  .plugins-import-modal__backdrop *,
  .ds-modal-backdrop,
  .ds-modal-backdrop *,
  .ds-modal,
  .ds-modal *,
  .prompt-template-modal-backdrop,
  .prompt-template-modal-backdrop *,
  .prompt-template-modal,
  .prompt-template-modal *,
  .prompt-template-lightbox-backdrop,
  .prompt-template-lightbox-backdrop *,
  .project-instructions-modal-backdrop,
  .project-instructions-modal-backdrop *,
  .home-hero-confirm__backdrop,
  .home-hero-confirm__backdrop *,
  .project-ds-picker-fullscreen,
  .project-ds-picker-fullscreen *,
  .staged-preview-modal,
  .staged-preview-modal *,
  .qs-overlay,
  .qs-overlay * {
    -webkit-app-region: no-drag;
  }
  .modal-backdrop::before,
  .new-project-modal-backdrop::before,
  .automation-modal-backdrop::before,
  .use-everywhere-modal-backdrop::before,
  .plugin-details-modal-backdrop::before,
  .plugins-import-modal__backdrop::before,
  .ds-modal-backdrop::before,
  .prompt-template-modal-backdrop::before,
  .prompt-template-lightbox-backdrop::before,
  .project-instructions-modal-backdrop::before,
  .home-hero-confirm__backdrop::before,
  .project-ds-picker-fullscreen::before,
  .staged-preview-modal::before,
  .qs-overlay::before {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 56px;
    pointer-events: auto;
    -webkit-app-region: drag !important;
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

// Light-background startup splash shown while the web runtime boots. It plays
// the brand intro clip once and then holds on its final settled logo frame until
// the main window is ready. The clip is embedded as a base64 data URL so it
// renders identically in dev and in packaged builds (see `splash-video.ts`).
function createPendingHtml(): string {
  const start = splashStagePayload("starting");
  const initialPct = Math.max(0, Math.min(100, Math.round((start.step / start.total) * 100)));
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Open Design</title>
    <style>
      html,
      body {
        background: #f2f4f5;
        height: 100%;
        margin: 0;
        overflow: hidden;
      }
      body {
        align-items: center;
        display: flex;
        justify-content: center;
      }
      video {
        background: #f2f4f5;
        height: auto;
        max-height: 100%;
        max-width: 100%;
        width: auto;
      }
      .boot-stage {
        bottom: 56px;
        color: #7a838a;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 13px;
        left: 0;
        letter-spacing: 0.02em;
        position: fixed;
        right: 0;
        text-align: center;
        transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
        user-select: none;
      }
      .boot-stage-swapping {
        opacity: 0;
        transition-duration: 140ms;
      }
      .boot-stage-step {
        color: #9aa2a8;
        font-variant-numeric: tabular-nums;
        margin-right: 7px;
      }
      .boot-progress {
        background: rgba(122, 131, 138, 0.18);
        border-radius: 999px;
        bottom: 84px;
        height: 3px;
        left: 50%;
        overflow: hidden;
        position: fixed;
        transform: translateX(-50%);
        width: 200px;
      }
      .boot-progress-fill {
        background: #7a838a;
        border-radius: 999px;
        height: 100%;
        transition: width 320ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      .boot-dots .dot {
        animation: boot-dot 1.4s cubic-bezier(0.23, 1, 0.32, 1) infinite;
        display: inline-block;
      }
      .boot-dots .dot:nth-child(2) { animation-delay: 0.2s; }
      .boot-dots .dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes boot-dot {
        0%, 60%, 100% { opacity: 0.25; }
        30% { opacity: 1; }
      }
    </style>
  </head>
  <body>
    <video
      id="splash"
      autoplay
      muted
      playsinline
      disablepictureinpicture
      src="${SPLASH_VIDEO_DATA_URL}"
    ></video>
    <div class="boot-progress" aria-hidden="true">
      <div class="boot-progress-fill" id="boot-progress-fill" data-pct="${initialPct}" style="width: ${initialPct}%;"></div>
    </div>
    <div class="boot-stage" id="boot-stage" aria-live="polite">
      <span class="boot-stage-step" id="boot-stage-step">${start.step}/${start.total}</span><span id="boot-stage-text">${start.label}</span><span class="boot-dots" aria-hidden="true"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>
    </div>
    <script>
      (function () {
        var video = document.getElementById("splash");
        if (!video) return;
        var play = function () {
          var attempt = video.play();
          if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
        };
        video.addEventListener("loadedmetadata", function () { video.currentTime = 0; });
        video.addEventListener("loadeddata", play);
        play();
      })();
      // Accepts the structured { step, total, label } payload (and tolerates a
      // bare label string for back-compat). The step counter + progress bar give
      // a slow cold boot a sense of how far along it is; the bar only ever grows
      // so a re-asserted earlier stage cannot make it lurch backwards.
      window.__odSplashSetStage = function (info) {
        var data = (typeof info === "string") ? { label: info } : (info || {});
        var wrap = document.getElementById("boot-stage");
        var text = document.getElementById("boot-stage-text");
        var stepEl = document.getElementById("boot-stage-step");
        var fill = document.getElementById("boot-progress-fill");
        if (!wrap || !text) return;
        var step = (typeof data.step === "number") ? data.step : null;
        var total = (typeof data.total === "number" && data.total > 0) ? data.total : null;
        if (fill && step != null && total != null) {
          var pct = Math.max(0, Math.min(100, Math.round((step / total) * 100)));
          var prev = parseFloat(fill.getAttribute("data-pct")) || 0;
          if (pct >= prev) {
            fill.style.width = pct + "%";
            fill.setAttribute("data-pct", String(pct));
          }
        }
        var label = (typeof data.label === "string") ? data.label : null;
        var stepText = (step != null && total != null) ? (step + "/" + total) : null;
        var labelSame = (label == null) || text.textContent === label;
        var stepSame = (stepText == null) || !stepEl || stepEl.textContent === stepText;
        if (labelSame && stepSame) return;
        wrap.classList.add("boot-stage-swapping");
        setTimeout(function () {
          if (label != null) text.textContent = label;
          if (stepEl && stepText != null) stepEl.textContent = stepText;
          wrap.classList.remove("boot-stage-swapping");
        }, 140);
      };
    </script>
  </body>
</html>`)}`;
}

/**
 * Last-resort error screen shown when the renderer crash-loop breaker opens.
 * A deterministic renderer crash reloads-and-crashes forever, leaving a blank
 * window; parking here gives the user a calm explanation instead. It is a
 * fully static, dependency-free page (no daemon, no preload, no network) so it
 * renders even when everything else is wedged, and the failing app bundle
 * cannot take it down. Recovery is automatic (the poll loop re-arms after a
 * quiet cooldown); reinstalling is the manual escape hatch.
 */
interface RendererCrashScreenContext {
  appVersion: string;
  platform: NodeJS.Platform;
  osVersion: string;
  reason: string;
  exitCode: number | null;
}

const CRASH_REPORT_ISSUES_URL = "https://github.com/nexu-io/open-design/issues/new";
const SUPPORT_EMAIL = "support@open-design.ai";

// Narrow allowlist for the crash screen's "Email us" action: only a mailto
// addressed to our own support address, carrying nothing but the crash-screen's
// own `subject`/`body`, opens. Validating just protocol+pathname is not enough —
// `mailto:support@open-design.ai?bcc=attacker@example.com` (or `?to=`/`?cc=`)
// keeps `pathname === "support@open-design.ai"` yet smuggles extra recipients
// and headers through to `shell.openExternal`. Because this predicate widens the
// renderer-exposed `shell:open-external` bridge past http, a compromised
// renderer could otherwise launch the mail client with arbitrary recipients, so
// reject any `to`/`cc`/`bcc`/unknown query key.
export function isSupportMailtoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "mailto:") return false;
    if (parsed.pathname.toLowerCase() !== SUPPORT_EMAIL) return false;
    for (const [key, value] of parsed.searchParams) {
      if (key !== "subject" && key !== "body") return false;
      // Reject a decoded CR/LF in the value: `subject=ok%0D%0ABcc:attacker@…`
      // would otherwise smuggle a header past the key allowlist and inject an
      // extra recipient once the mail client parses the mailto.
      if (/[\r\n]/.test(value)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function osLabelForReport(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  return platform;
}

function formatRendererExitCode(code: number | null): string {
  if (code == null) return "unknown";
  // Renderer exit codes are signed 32-bit; the unsigned hex form (e.g.
  // 0x80000003 = a V8/Chromium CHECK/breakpoint) is how they're recognizable,
  // so show both the raw number and the hex.
  return `${code} (0x${(code >>> 0).toString(16).toUpperCase()})`;
}

// Prefilled GitHub new-issue URL. The daemon is still alive on a renderer
// crash, so the "Save logs…" button can produce a diagnostics bundle; this
// report body asks the user to attach it (neither an issue URL nor mailto can
// carry a file attachment) and auto-fills the version/OS/exit-code that a
// triager always needs.
function buildCrashReportUrl(ctx: RendererCrashScreenContext): string {
  const title = `Desktop app keeps crashing (renderer ${ctx.reason})`;
  const body = [
    "**What happened**",
    "The Open Design desktop window crashed several times in a row and showed the recovery screen.",
    "",
    "**What I was doing when it started** (please add any detail):",
    "",
    "",
    "> Please attach the diagnostics file you saved with the “Save logs…” button on the recovery screen — it has the logs we need.",
    "",
    "---",
    "_Auto-filled:_",
    `- App version: ${ctx.appVersion}`,
    `- OS: ${osLabelForReport(ctx.platform)} ${ctx.osVersion}`,
    `- Renderer exit: ${ctx.reason}, code ${formatRendererExitCode(ctx.exitCode)}`,
  ].join("\n");
  return `${CRASH_REPORT_ISSUES_URL}?${new URLSearchParams({ title, body }).toString()}`;
}

// Prefilled mailto for the "Email us" action — same auto-filled diagnostics as
// the issue, for users who'd rather email than open a GitHub account.
function buildCrashMailtoUrl(ctx: RendererCrashScreenContext): string {
  const subject = `Open Design keeps crashing (renderer ${ctx.reason})`;
  const body = [
    "The Open Design desktop app crashed several times in a row on my device.",
    "",
    "(If possible, attach the diagnostics file you saved with the “Save logs…” button.)",
    "",
    `App version: ${ctx.appVersion}`,
    `OS: ${osLabelForReport(ctx.platform)} ${ctx.osVersion}`,
    `Renderer exit: ${ctx.reason}, code ${formatRendererExitCode(ctx.exitCode)}`,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?${new URLSearchParams({ subject, body }).toString()}`;
}

function createRendererCrashHtml(ctx: RendererCrashScreenContext): string {
  const issueUrl = buildCrashReportUrl(ctx);
  const mailtoUrl = buildCrashMailtoUrl(ctx);
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Open Design</title>
    <style>
      /* Palette mirrors the app's neutral design tokens (apps/web tokens.css):
         warm off-white + near-black, no accent color — matching the black/white
         onboarding rather than a stray blue. */
      :root { color-scheme: light dark; }
      html, body {
        background: #faf9f7;
        color: #1a1916;
        height: 100%;
        margin: 0;
        overflow: hidden;
      }
      body {
        align-items: center;
        display: flex;
        justify-content: center;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        -webkit-user-select: none;
        user-select: none;
      }
      .panel {
        max-width: 460px;
        padding: 32px;
        text-align: center;
      }
      .title {
        font-size: 17px;
        font-weight: 600;
        margin: 0 0 10px;
      }
      .body {
        color: #57534d;
        font-size: 14px;
        line-height: 1.55;
        margin: 0 0 6px;
      }
      .actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin: 22px 0 0;
      }
      button {
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        padding: 9px 16px;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background 200ms cubic-bezier(0.23, 1, 0.32, 1),
          border-color 200ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      button:disabled { cursor: default; opacity: 0.6; }
      /* Monochrome primary: near-black on the warm off-white. */
      .primary { background: #1a1916; color: #faf9f7; }
      .primary:hover { background: #0d0c0a; }
      .secondary { background: transparent; color: #1a1916; border-color: rgba(26, 25, 22, 0.2); }
      .secondary:hover { border-color: rgba(26, 25, 22, 0.36); }
      .status {
        color: #8f8b84;
        font-size: 12px;
        line-height: 1.5;
        margin: 12px 0 0;
        min-height: 16px;
      }
      .email {
        color: #8f8b84;
        font-size: 13px;
        line-height: 1.5;
        margin: 14px 0 0;
      }
      .email a { color: #1a1916; text-decoration: underline; text-underline-offset: 2px; }
      .hint {
        color: #8f8b84;
        font-size: 13px;
        line-height: 1.5;
        margin: 16px 0 0;
      }
      @media (prefers-color-scheme: dark) {
        html, body { background: #1a1917; color: #e8e4dc; }
        .body { color: #9a9690; }
        .hint, .status, .email { color: #6e6b65; }
        /* Dark inverts the monochrome pair — a near-black button would vanish
           against the dark bg, so use a light button with dark text. */
        .primary { background: #e8e4dc; color: #1a1917; }
        .primary:hover { background: #f2ede4; }
        .secondary { color: #e8e4dc; border-color: rgba(232, 228, 220, 0.28); }
        .secondary:hover { border-color: rgba(232, 228, 220, 0.5); }
        .email a { color: #e8e4dc; }
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <p class="title">Open Design keeps closing on this device</p>
      <p class="body">The app window crashed several times in a row, so it has paused to avoid getting stuck reloading.</p>
      <p class="body">It will try to recover on its own in a few minutes.</p>
      <div class="actions">
        <button id="report" class="primary">Report a problem</button>
        <button id="logs" class="secondary">Save logs…</button>
      </div>
      <p class="hint" id="diag-note">Saved logs include a crash memory snapshot so we can find the cause. Nothing is sent unless you choose to share it.</p>
      <p class="status" id="status" aria-live="polite"></p>
      <p class="email" id="email-line">Prefer email? <a href="#" id="email">Contact ${SUPPORT_EMAIL}</a></p>
      <p class="hint">If this keeps happening, quitting and reinstalling Open Design usually resolves it.</p>
    </div>
    <script>
      (function () {
        var issueUrl = ${JSON.stringify(issueUrl)};
        var mailtoUrl = ${JSON.stringify(mailtoUrl)};
        var host = window.__od__;
        var diag = window.openDesignDesktop;
        var report = document.getElementById("report");
        var logs = document.getElementById("logs");
        var emailLine = document.getElementById("email-line");
        var email = document.getElementById("email");
        var status = document.getElementById("status");
        function say(t) { if (status) status.textContent = t; }
        var canOpen = host && typeof host.openExternal === "function";
        // Actions reuse IPC the preload already exposes; if the bridge is
        // missing (preload failed to load) hide the dead control instead of a
        // no-op.
        if (report) {
          if (canOpen) {
            report.addEventListener("click", function () { host.openExternal(issueUrl); });
          } else { report.style.display = "none"; }
        }
        if (email) {
          if (canOpen) {
            email.addEventListener("click", function (e) { e.preventDefault(); host.openExternal(mailtoUrl); });
          } else if (emailLine) { emailLine.style.display = "none"; }
        }
        if (logs) {
          if (diag && typeof diag.exportDiagnostics === "function") {
            logs.addEventListener("click", function () {
              logs.disabled = true;
              say("Saving logs…");
              Promise.resolve(diag.exportDiagnostics()).then(function (r) {
                if (r && r.ok) say("Logs saved — please attach that file to your report.");
                else if (r && r.cancelled) say("");
                else say("Could not save logs.");
              }).catch(function () { say("Could not save logs."); }).then(function () { logs.disabled = false; });
            });
          } else { logs.style.display = "none"; }
        }
      })();
    </script>
  </body>
</html>`)}`;
}

/**
 * Boot phases surfaced as a muted status line under the splash logo. The cold
 * boot on a slow machine can hold the splash's settled final frame for many
 * seconds; the stage text, the step counter ("3/7"), the filling progress bar,
 * and the continuously pulsing dots are what tell the user the app is working,
 * not hung. Stage transitions follow the repo animation philosophy: 140ms
 * ease-out fade out, 200ms ease-out fade in.
 *
 * The set is intentionally fine-grained: a slow first run spends most of its
 * time in the two long native waits (daemon coming online, web server coming
 * online), so we mark BOTH the "starting X" edge and the "X ready" edge of each
 * so the counter visibly advances right after each long wait clears. More steps
 * = the wait reads as forward motion instead of one frozen label.
 */
export type SplashBootStage =
  | "starting"
  | "engine"
  | "engineReady"
  | "interface"
  | "interfaceReady"
  | "workspace"
  | "finishing";

/**
 * Canonical boot order. The index in this array drives the "N/total" step
 * counter and the progress-bar fill, so keep it in the real chronological order
 * the stages fire. `setSplashStage` clamps progress so a re-asserted earlier
 * stage (e.g. the idempotent "workspace" re-fire at the reveal gate) can never
 * make the bar jump backwards.
 */
const SPLASH_STAGE_SEQUENCE: readonly SplashBootStage[] = [
  "starting",
  "engine",
  "engineReady",
  "interface",
  "interfaceReady",
  "workspace",
  "finishing",
];

const SPLASH_STAGE_LABELS: Record<SplashBootStage, string> = {
  starting: "Starting Open Design",
  engine: "Starting the local engine",
  engineReady: "Local engine ready",
  interface: "Preparing the interface",
  interfaceReady: "Interface ready",
  workspace: "Opening your workspace",
  finishing: "Almost ready",
};

const SPLASH_STAGE_TOTAL = SPLASH_STAGE_SEQUENCE.length;

/** Step/label payload handed to the renderer's `__odSplashSetStage`. */
function splashStagePayload(stage: SplashBootStage): { step: number; total: number; label: string } {
  const index = SPLASH_STAGE_SEQUENCE.indexOf(stage);
  return {
    step: index < 0 ? 1 : index + 1,
    total: SPLASH_STAGE_TOTAL,
    label: SPLASH_STAGE_LABELS[stage],
  };
}

/**
 * Narrow view of the splash window that the stage updater needs. A real
 * `BrowserWindow` satisfies this structurally; tests pass a mock so the
 * load-ready/replay logic is exercisable without a live Electron renderer.
 */
export type SplashStageSurface = {
  isDestroyed(): boolean;
  webContents: {
    executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
    once(event: "did-finish-load", listener: () => void): void;
  };
};

type SplashStageState = { ready: boolean; pending: SplashBootStage | null };

// Per-splash readiness + the latest stage requested before the page finished
// loading. Keyed weakly so a closed splash is collected without bookkeeping.
const splashStageState = new WeakMap<SplashStageSurface, SplashStageState>();

function applySplashStage(splash: SplashStageSurface, stage: SplashBootStage): void {
  void splash.webContents
    .executeJavaScript(
      `window.__odSplashSetStage && window.__odSplashSetStage(${JSON.stringify(splashStagePayload(stage))});`,
      true,
    )
    .catch(() => undefined);
}

/**
 * Arm load-ready tracking for a freshly created splash. MUST be called before
 * `loadURL` so the `did-finish-load` listener cannot miss the event. Until the
 * splash data-URL has loaded (and defined `window.__odSplashSetStage`), stage
 * updates are stashed rather than executed against a renderer that has no
 * setter yet — otherwise the first update (the daemon phase, fired right after
 * window creation on a cold boot) is silently dropped. The latest stashed
 * stage is replayed once the page reports it has loaded.
 */
export function registerSplashStageTracking(splash: SplashStageSurface): void {
  const state: SplashStageState = { ready: false, pending: null };
  splashStageState.set(splash, state);
  splash.webContents.once("did-finish-load", () => {
    state.ready = true;
    if (state.pending != null) {
      const stage = state.pending;
      state.pending = null;
      applySplashStage(splash, stage);
    }
  });
}

/**
 * Update the splash status line. Safe to call with a destroyed/absent window
 * and idempotent for repeated stages, so callers can fire-and-forget at each
 * boot phase boundary (packaged sidecar spawns, runtime reveal gate). Stage
 * updates that arrive before the splash page has loaded are deferred and
 * replayed on load (see `registerSplashStageTracking`); a window with no
 * tracking registered (e.g. an unmanaged test surface) applies immediately.
 */
export function setSplashStage(splash: SplashStageSurface | null, stage: SplashBootStage): void {
  if (splash == null || splash.isDestroyed()) return;
  const state = splashStageState.get(splash);
  if (state == null || state.ready) {
    applySplashStage(splash, stage);
    return;
  }
  state.pending = stage;
}

export type SplashWindowHandle = {
  /**
   * Wall-clock instant the splash window was created. Carried alongside the
   * window so the minimum-hold calculation measures how long the splash has
   * ACTUALLY been on screen — in packaged builds the window is created before
   * the sidecars boot, so the hold overlaps the boot instead of being added on
   * top of it. (Originally this clock started inside `createDesktopRuntime`,
   * after the sidecars had already finished — re-adding the full delay.)
   */
  startedAt: number;
  window: BrowserWindow;
};

/**
 * Create and immediately show the light brand-splash window. The packaged entry
 * calls this BEFORE awaiting the daemon/web sidecars so the animation masks the
 * whole cold boot (no black no-window gap); the desktop runtime then adopts it
 * via `DesktopRuntimeOptions.splashWindow` + `splashStartedAt` and closes it
 * once the real app has mounted in the (initially hidden) main window. Frameless
 * + matching size so the reveal swap reads as a single window, never a flash.
 */
export function createSplashWindow(): SplashWindowHandle {
  // Stamp creation time at the instant the window appears (see SplashWindowHandle).
  const startedAt = Date.now();
  const splash = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#f2f4f5",
    frame: false,
    height: 900,
    resizable: false,
    show: true,
    title: "Open Design",
    width: 1280,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Arm stage tracking before loadURL so a stage update fired before the
  // page loads is deferred and replayed rather than dropped (see
  // `registerSplashStageTracking`).
  registerSplashStageTracking(splash);
  void splash.loadURL(createPendingHtml());
  return { startedAt, window: splash };
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

export function isAllowedEmbeddedBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Security boundary for the design-browser webview. Keep this to remote
    // references and project-served content only. `file:` is deliberately
    // excluded: the same surface can capture the webview region and persist
    // the PNG into the project, so allowing `file://` would let a compromised
    // renderer or a pasted address load and exfiltrate arbitrary local files
    // (e.g. `/etc/passwd`). The reference board only needs http(s) and
    // about:blank.
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
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

// Some image exports reach the renderer through a normal `<a download>` link.
// Without this hook Electron writes the bytes straight to the OS Downloads
// folder, so the user never gets to pick a destination. setSaveDialogOptions
// makes Electron show the native Save As panel before the download starts.
const IMAGE_SAVE_AS_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
// Every programmatic export that streams a download must prompt Save As, incl.
// the screenshot PDF (the default Export PDF flow) — otherwise it silently lands
// in the OS Downloads folder while PPTX/images prompt correctly.
const SAVE_AS_EXTENSIONS = new Set([".pptx", ".pdf", ...IMAGE_SAVE_AS_EXTENSIONS]);

interface SaveAsDialogOptions {
  title: string;
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
  properties: Array<"dontAddToRecent">;
}

// Pure: the Save As dialog options for a downloaded filename, or null when the
// extension isn't one we intercept. Exported for tests.
export function saveAsDialogOptionsForFilename(filename: string): SaveAsDialogOptions | null {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  if (!SAVE_AS_EXTENSIONS.has(ext)) return null;
  const filters = IMAGE_SAVE_AS_EXTENSIONS.has(ext)
    ? [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        { name: "All Files", extensions: ["*"] },
      ]
    : ext === ".pdf"
      ? [
          { name: "PDF Document", extensions: ["pdf"] },
          { name: "All Files", extensions: ["*"] },
        ]
      : [
          { name: "PowerPoint Presentation", extensions: ["pptx"] },
          { name: "All Files", extensions: ["*"] },
        ];
  return { title: "Save As", defaultPath: filename, filters, properties: ["dontAddToRecent"] };
}

function attachDownloadSaveAsDialog(window: BrowserWindow): void {
  window.webContents.session.on("will-download", (_event, item) => {
    const options = saveAsDialogOptionsForFilename(item.getFilename());
    if (!options) return;
    item.setSaveDialogOptions(options);
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

// Parses the optional renderer-supplied capture clip into an Electron
// Rectangle. Returns undefined (capture the full page) when the payload is
// missing, not an object, or carries an invalid clip; valid clips are
// rounded and clamped so x/y stay >= 0 and width/height stay >= 1.
function parseCaptureClip(value: unknown): Electron.Rectangle | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const clip = (value as { clip?: unknown }).clip;
  if (clip == null || typeof clip !== "object" || Array.isArray(clip)) return undefined;
  const { x, y, width, height } = clip as {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  };
  if (
    typeof x !== "number" || !Number.isFinite(x) ||
    typeof y !== "number" || !Number.isFinite(y) ||
    typeof width !== "number" || !Number.isFinite(width) ||
    typeof height !== "number" || !Number.isFinite(height)
  ) {
    return undefined;
  }
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
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
  properties: {
    reason: string;
    exit_code: number | null;
    loop_tripped?: boolean;
    // Set on the bounded "recovery-attempt" signal (reason === "recovery-attempt"):
    // the Nth time the breaker re-armed and tried to actively recover this
    // session. Lets triage see chronic loopers (index keeps climbing) apart from
    // devices that recovered (no further recovery-attempt events).
    recovery_attempt?: number;
  },
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
          // Marks the single crash that tripped the loop breaker, so a crash
          // loop is one flagged event instead of thousands of anonymous ones.
          loop_tripped: properties.loop_tripped ?? false,
          // Present on the bounded recovery-attempt signal; null on real crashes.
          recovery_attempt: properties.recovery_attempt ?? null,
        },
      }),
    });
  } catch {
    // Best-effort. The user is already in a degraded state — failing to
    // report the crash must not cascade into another failure path.
  }
}

/**
 * Native directory picker, parented to the renderer window that initiated
 * the IPC call. Parenting makes the dialog window-modal and hands it
 * keyboard focus (most visibly on Windows): without a parent the focus
 * stays on the Electron window, so pressing Esc falls through to the web
 * app and closes the in-app modal *behind* the still-open native picker.
 * With a parent the picker owns Esc and cancels itself.
 */
async function showDirectoryPickerForSender(
  sender: Electron.WebContents,
): Promise<Electron.OpenDialogReturnValue> {
  const parent =
    BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getFocusedWindow();
  const pickerOptions: Electron.OpenDialogOptions = {
    // `dontAddToRecent` avoids shell recent-items / jump-list writes against
    // the browsed folder. Combined with not seeding a cloud-backed default
    // location, this trims the shell work that stalls the native picker on
    // OneDrive-backed folders (see AppHangB1 note in diagnostics.ts).
    properties: ["openDirectory", "createDirectory", "dontAddToRecent"],
  };
  return parent
    ? dialog.showOpenDialog(parent, pickerOptions)
    : dialog.showOpenDialog(pickerOptions);
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
  ipcMain.removeHandler("dialog:pick-working-dir");
  ipcMain.removeHandler("shell:open-external");
  ipcMain.removeHandler("shell:open-path");
  ipcMain.removeHandler("browser:clear-data");
  for (const channel of UPDATER_IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
  }
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    // http(s) as before, plus a mailto strictly to our support address (the
    // crash screen's "Email us"); no other scheme opens.
    if (!isHttpUrl(url) && !isSupportMailtoUrl(url)) return false;
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
    async (event, init?: { name?: string; skillId?: string | null; designSystemId?: string | null }) => {
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
      const result = await showDirectoryPickerForSender(event.sender);
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
    async (event, init?: { projectId?: string }) => {
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
      const result = await showDirectoryPickerForSender(event.sender);
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
  // Home-flow counterpart: the project does not exist yet, so we only show
  // the native picker and mint a token bound to the chosen folder. The
  // renderer threads { baseDir, token } back through project creation and
  // spends the token on POST /api/projects/:id/working-dir once the project
  // exists. Main remains the single source of filesystem paths crossing into
  // the daemon (same trust boundary as dialog:pick-and-replace-working-dir).
  ipcMain.handle("dialog:pick-working-dir", async (event) => {
    if (options.desktopAuthSecret == null) {
      return { ok: false, reason: "desktop auth secret not registered" };
    }
    const result = await showDirectoryPickerForSender(event.sender);
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    return await mintHomeWorkingDirToken({
      baseDir: result.filePaths[0],
      desktopAuthSecret: options.desktopAuthSecret,
      registerDesktopAuth: options.registerDesktopAuthWithDaemon,
    });
  });
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

  let currentUrl: string | null = null;
  let currentPetUrl: string | null = null;
  let pendingUrl: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  // Set when the main-frame load fails or the renderer process is gone. The
  // poll loop reloads the current URL to recover instead of leaving a blank app.
  let rendererFailed = false;
  // True while a `tick()` is mid-flight, so load failures do not schedule two
  // independent polling loops.
  let ticking = false;
  // Bounds the reload loop when the renderer crashes deterministically (a
  // GPU/V8 CHECK, a corrupt profile): without it a wedged device reloads →
  // crashes → reloads forever, staying blank and flooding telemetry (one
  // 0.14.0 machine logged 26k renderer-crash events in a day). When it opens we
  // park on a recoverable error screen and re-arm after a quiet cooldown.
  const rendererCrashLoop = new RendererCrashLoopBreaker();
  // Monotonic per session: how many times the breaker re-armed and tried to
  // recover (a passive reload). Not reset on a successful load, so a chronic
  // looper's index keeps climbing while a recovered device simply stops
  // emitting recovery-attempt events.
  let rendererRecoveryAttempts = 0;

  const consoleEntries: DesktopConsoleEntry[] = [];
  const petWindow = createDesktopPetWindow(preloadPath, options.osLocale);
  const windowTitle = options.windowTitle ?? "Open Design";
  const window = new BrowserWindow({
    height: 900,
    icon: resolveDesktopIconPath(),
    // Below this size the project page's left/right split (chat
    // composer + designs panel + preview pane) overlaps and the top
    // navigation clips, so prevent Electron from honoring user drags
    // that would shrink the window past the usable breakpoint.
    minHeight: 600,
    minWidth: 900,
    // Starts hidden: the splash window is what the user sees while the real web
    // app loads in here. We reveal this window only once the app has actually
    // mounted (see `revealWhenReady` below), so there is never a flash of the
    // web's own "Loading Open Design…" shell.
    show: false,
    title: windowTitle,
    autoHideMenuBar: true,
    ...MAC_WINDOW_CHROME,
    webPreferences: {
      additionalArguments: osLocaleAdditionalArguments(options.osLocale),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webviewTag: true,
    },
    width: 1280,
  });
  installWindowChromeCssHook(window);
  showWindowButtons(window);
  attachDownloadSaveAsDialog(window);
  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(windowTitle);
  });
  window.webContents.on("did-start-loading", () => {
    console.info("[open-design desktop] main window did-start-loading", {
      pendingUrl,
      url: window.webContents.getURL(),
    });
  });
  window.webContents.on("dom-ready", () => {
    console.info("[open-design desktop] main window dom-ready", {
      title: window.getTitle(),
      url: window.webContents.getURL(),
    });
  });
  window.webContents.on("did-finish-load", () => {
    console.info("[open-design desktop] main window did-finish-load", {
      title: window.getTitle(),
      url: window.webContents.getURL(),
    });
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error("[open-design desktop] main window did-fail-load", {
      errorCode,
      errorDescription,
      isMainFrame,
      pendingUrl,
      validatedURL,
      url: window.webContents.getURL(),
    });
  });
  window.on("unresponsive", () => {
    console.error("[open-design desktop] main window unresponsive", {
      pendingUrl,
      url: window.webContents.getURL(),
    });
  });
  window.on("responsive", () => {
    console.info("[open-design desktop] main window responsive", {
      pendingUrl,
      url: window.webContents.getURL(),
    });
  });

  // Renderer-process crashes are completely invisible to the web bundle's
  // own analytics surface (the renderer is dead — no JS can run, no
  // window.error fires). The main process is the last layer that can
  // observe them, so we forward the event to the daemon's safety-event
  // bridge (`POST /api/observability/event`), which posts directly to
  // PostHog with `device_id = installationId`. Best-effort: a failure to
  // reach the daemon must not block the crash recovery flow.
  window.webContents.on("render-process-gone", (_event, details) => {
    // During app quit / teardown the renderer goes away and the window (and its
    // webContents) can already be destroyed when this fires. Reading getURL()
    // then throws "Object has been destroyed" as a fatal uncaught exception, so
    // guard the same way `sendUpdaterStatus` does below and skip crash-report /
    // recovery work once the window is already on its way out.
    const gone = window.isDestroyed() || window.webContents.isDestroyed();
    console.error("[open-design desktop] main window render-process-gone", {
      exitCode: details.exitCode,
      reason: details.reason,
      url: gone ? null : window.webContents.getURL(),
    });
    // During app quit / teardown the window is already destroyed; skip all
    // crash-loop bookkeeping, telemetry, and recovery (mirrors the getURL guard
    // above — a clean teardown must not look like a crash).
    if (gone) return;
    // A clean-exit is intentional teardown; only a crash / OOM / OS kill feeds
    // the crash-loop breaker and triggers recovery.
    const isCrash = details.reason !== "clean-exit";
    const outcome = isCrash
      ? rendererCrashLoop.recordCrash(Date.now())
      : { tripped: false, suppressTelemetry: rendererCrashLoop.isOpen(), justOpened: false };
    // Report every crash up to and including the one that trips the breaker so
    // the loop is visible in analytics, then go quiet — one wedged device must
    // not emit tens of thousands of identical events.
    if (!outcome.suppressTelemetry) {
      void reportRendererCrash(options, {
        reason: details.reason,
        exit_code: typeof details.exitCode === "number" ? details.exitCode : null,
        loop_tripped: outcome.tripped,
      });
    }
    if (!isCrash) return;
    if (outcome.tripped) {
      // Breaker open: stop the poll loop from cycling a deterministic crash.
      // Show the recoverable error screen once (on the opening crash) instead
      // of reloading into another blank window; the loop re-arms and attempts
      // one passive recovery reload after a quiet cooldown.
      if (outcome.justOpened) {
        console.warn(
          "[open-design desktop] renderer crash-loop breaker OPEN — parking; will attempt recovery after cooldown",
          { reason: details.reason, exitCode: details.exitCode },
        );
        showRendererCrashScreen({
          reason: details.reason,
          exitCode: typeof details.exitCode === "number" ? details.exitCode : null,
        });
      }
      return;
    }
    // A crash / OOM / OS kill of a backgrounded renderer leaves the window
    // blank, so flag it for the poll loop to reload the app.
    markRendererFailed();
  });
  // A failed main-frame navigation parks the renderer on chrome-error:// (blank
  // white) with no auto-retry. errorCode -3 (ABORTED) is a normal navigation
  // cancel (a new load started), so ignore it and sub-frame failures; anything
  // else means the load to the web server failed and needs a retry.
  window.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) markRendererFailed();
  });
  // `did-fail-load` never fires for an HTTP error *document* — a 5xx response
  // with a body is a successful load to Electron — so a 502 page (e.g. the
  // packaged od:// proxy's exhaustion fallback) would otherwise sit on screen
  // until a manual reload. `did-navigate` is main-frame-only and carries the
  // HTTP status (-1 for non-HTTP navigations); in-page SPA routing emits
  // `did-navigate-in-page` instead, so app navigation never trips this.
  window.webContents.on("did-navigate", (_event, url, httpResponseCode) => {
    if (!isRendererFailureHttpStatus(httpResponseCode)) return;
    console.error("[open-design desktop] main window loaded an HTTP error document", {
      httpResponseCode,
      url,
    });
    markRendererFailed();
  });

  const sendUpdaterStatus = (status = options.updater?.snapshot() ?? unavailableUpdaterStatus()) => {
    if (window.isDestroyed()) return;
    window.webContents.send(UPDATER_STATUS_EVENT, status);
  };
  const unsubscribeUpdater = options.updater?.subscribe(() => sendUpdaterStatus()) ?? (() => undefined);
  const requireMainWindowSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents) {
      throw new Error("host IPC is only available to the main Open Design window");
    }
  };
  window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    const src = typeof params.src === "string" ? params.src : "";
    const partition = typeof params.partition === "string" ? params.partition : "";
    if (!isAllowedEmbeddedBrowserUrl(src) || partition !== DESIGN_BROWSER_PARTITION) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.sandbox = true;
  });
  // `will-attach-webview` only vets the initial `src`. The design-browser panel
  // navigates an already-attached guest with `<webview>.loadURL(...)`, which does
  // not re-trigger attach, so the same allowlist has to gate every guest
  // navigation too — otherwise a compromised renderer or pasted address could
  // `loadURL("file:///etc/passwd")` after the first http(s) load and exfiltrate
  // its pixels through the host capture bridge.
  window.webContents.on("did-attach-webview", (_event, guestWebContents) => {
    const blockDisallowed = (navEvent: Electron.Event, url: string): void => {
      if (!isAllowedEmbeddedBrowserUrl(url)) {
        navEvent.preventDefault();
      }
    };
    guestWebContents.on("will-navigate", blockDisallowed);
    guestWebContents.on("will-redirect", blockDisallowed);
    guestWebContents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
  ipcMain.handle("browser:clear-data", async (event, rawOptions: unknown): Promise<OpenDesignHostActionResult> => {
    requireMainWindowSender(event);
    const optionsRecord = rawOptions != null && typeof rawOptions === "object"
      ? rawOptions as { cookies?: unknown; storage?: unknown }
      : {};
    const clearCookies = optionsRecord.cookies !== false;
    const clearStorage = optionsRecord.storage !== false;
    const storages: DesktopBrowserStorageType[] = [];
    if (clearCookies) storages.push("cookies");
    if (clearStorage) {
      storages.push(
        "cachestorage",
        "filesystem",
        "indexdb",
        "localstorage",
        "shadercache",
        "websql",
        "serviceworkers",
      );
    }
    try {
      if (storages.length > 0) {
        await session.fromPartition(DESIGN_BROWSER_PARTITION).clearStorageData({ storages });
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });
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

  ipcMain.removeHandler('od:capture-page');
  ipcMain.handle('od:capture-page', async (event, rawOptions: unknown): Promise<OpenDesignHostCaptureResult> => {
    if (event.sender !== window.webContents) {
      return { ok: false, reason: 'capture sender not allowed' };
    }
    try {
      const clip = parseCaptureClip(rawOptions);
      const image = clip
        ? await window.webContents.capturePage(clip)
        : await window.webContents.capturePage();
      const size = image.getSize();
      return { ok: true, dataUrl: image.toDataURL(), w: size.width, h: size.height };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  });

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

  // The splash window carries the light brand animation. In packaged builds the
  // entry hands us one it created BEFORE the sidecars booted (so it overlaps the
  // whole cold start); otherwise we create our own. The main window above stays
  // hidden behind it until the real app has mounted.
  // When the caller (packaged) hands us a pre-created splash, honour the
  // creation time it captured so the minimum hold is measured from when the
  // animation actually appeared — before the sidecar boot — not from now (which
  // in packaged is already post-boot). When we create our own splash (tools-dev)
  // its handle carries a fresh, correct timestamp.
  let splash: BrowserWindow | null = options.splashWindow ?? null;
  let splashStartedAt = options.splashStartedAt ?? Date.now();
  if (splash == null) {
    const created = createSplashWindow();
    splash = created.window;
    splashStartedAt = created.startedAt;
  }

  let revealed = false;
  let revealing = false;

  const revealMainWindow = (): void => {
    if (revealed || window.isDestroyed()) return;
    revealed = true;
    showWindowButtons(window);
    window.show();
    window.focus();
    ensureWindowVisible(window);
    if (splash != null && !splash.isDestroyed()) splash.close();
    // The app is now truly up (mounted + shown). Fire once — revealed guards
    // re-entry — so callers can mark "reached running".
    try {
      options.onRevealed?.();
    } catch {
      // A callback fault must not break reveal.
    }
  };

  // Hold the splash until BOTH (a) the web bundle reports it has mounted — it
  // sets `data-od-app-mounted="1"` on first paint of the real UI — so we never
  // reveal the web's own dark "Loading Open Design…" shell, and (b) the splash
  // has been up at least MIN_SPLASH_MS so the brand clip plays through. A hard
  // ceiling guarantees the user is never stranded on the splash if the mount
  // signal never arrives.
  const revealWhenReady = async (): Promise<void> => {
    if (revealing || revealed) return;
    revealing = true;
    // The web bundle is loading in the hidden main window from here on; let
    // the splash status line reflect that final phase while we poll for mount.
    setSplashStage(splash, "workspace");
    const deadline = Date.now() + WEB_MOUNT_REVEAL_TIMEOUT_MS;
    while (!stopped && !window.isDestroyed() && Date.now() < deadline) {
      const mounted = await window.webContents
        .executeJavaScript(`document.documentElement.getAttribute("data-od-app-mounted") === "1"`, true)
        .catch(() => false);
      if (mounted === true) break;
      await delay(WEB_MOUNT_POLL_MS);
    }
    // The real UI has mounted behind the splash; the only thing left is the
    // minimum-hold so the brand clip plays through. Advance the counter to its
    // final step so the user sees the boot reach completion, not stall at
    // "Opening your workspace".
    setSplashStage(splash, "finishing");
    const remaining = MIN_SPLASH_MS - (Date.now() - splashStartedAt);
    if (remaining > 0) await delay(remaining);
    revealMainWindow();
  };

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };

  // Flag the renderer as needing a reload and poll again promptly, rather than
  // waiting up to RUNNING_POLL_MS. The next `tick` re-loads the current URL (see
  // the `rendererFailed` branch) and clears the flag once the load succeeds. If
  // the web server is still unreachable, discovery returns null and the loop
  // naturally backs off to RUNNING_POLL_MS until it returns.
  // Park the wedged window on a static, self-contained error page (trivial HTML
  // that the failing app renderer cannot take down) instead of an endless blank
  // reload. The page tells the user recovery is automatic, and offers two
  // actions wired to IPC the preload already exposes — "Report a problem" opens
  // a prefilled GitHub issue, "Save logs…" exports the diagnostics bundle (the
  // daemon is still alive on a renderer crash, so the bundle is available).
  const showRendererCrashScreen = (crash: { reason: string; exitCode: number | null }) => {
    if (stopped || window.isDestroyed()) return;
    // Loading the crash screen resets currentUrl so the next successful reload
    // (after re-arm) is treated as a fresh navigation.
    currentUrl = null;
    pendingUrl = null;
    void window
      .loadURL(
        createRendererCrashHtml({
          appVersion: app.getVersion(),
          platform: process.platform,
          osVersion: release(),
          reason: crash.reason,
          exitCode: crash.exitCode,
        }),
      )
      .catch(() => undefined);
    // Make the crash screen the revealed, active window and tear down the
    // splash. Without this, a crash loop that trips DURING startup (before
    // revealWhenReady() set revealed=true) would leave the splash open, and the
    // runtime's show() keeps focusing the splash while !revealed — so a user
    // re-focusing the app during a startup crash loop is sent back to the boot
    // splash instead of this recovery screen. revealMainWindow() no-ops when the
    // app already revealed normally (the common crash-after-boot case).
    revealMainWindow();
  };

  const markRendererFailed = () => {
    if (stopped || window.isDestroyed()) return;
    // Breaker open: stay parked on the crash screen; the tick's cooldown re-arm
    // is the only path back to reloading.
    if (rendererCrashLoop.isOpen()) return;
    rendererFailed = true;
    // Mid-tick failures (a rejecting loadURL) are rescheduled by the tick's own
    // catch/success path; scheduling here too would spawn a second poll loop.
    if (ticking) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    schedule(PENDING_POLL_MS);
  };

  const tick = async () => {
    if (stopped || window.isDestroyed()) return;

    ticking = true;
    try {
      // Crash-loop breaker open: park on the crash screen instead of reloading a
      // deterministically-crashing renderer. Re-arm once the cooldown has
      // elapsed with no further crash, then fall through for one reload attempt.
      // The retry is intentionally PASSIVE: mutating a wedged device's state
      // (clearing caches/storage) on every cooldown risked amplifying the churn
      // without helping a GPU/V8-CHECK crash, so we only stop the loop and let a
      // transient fault clear on its own. The attempt is still logged + counted
      // so the recovery is observable.
      if (rendererCrashLoop.isOpen()) {
        if (rendererCrashLoop.rearmIfCooledDown(Date.now())) {
          rendererRecoveryAttempts += 1;
          console.info(
            "[open-design desktop] renderer crash-loop cooldown elapsed — attempting recovery reload",
            { attempt: rendererRecoveryAttempts },
          );
          void reportRendererCrash(options, {
            reason: "recovery-attempt",
            exit_code: null,
            recovery_attempt: rendererRecoveryAttempts,
          });
          rendererFailed = true;
        } else {
          schedule(RUNNING_POLL_MS);
          return;
        }
      }
      const url = await options.discoverUrl();
      // Reload when the discovered URL changes, OR when the renderer is in a
      // failed/blank state (URL unchanged but the page died), so a window
      // restored from the background recovers instead of staying blank.
      if (url != null && (url !== currentUrl || rendererFailed)) {
        pendingUrl = url;
        // Clear the failure flag BEFORE the load: `did-navigate` (which
        // re-flags an HTTP 5xx error document) fires before `loadURL`'s
        // promise resolves, so clearing afterwards would clobber a failure
        // detected mid-load. A rejecting `loadURL` re-flags via
        // `did-fail-load`, so net-error behavior is unchanged.
        rendererFailed = false;
        // Load the web app into the still-hidden main window as soon as it is
        // discovered; it mounts behind the splash so the swap is instant.
        console.info("[open-design desktop] main window loadURL start", { currentUrl, url });
        await window.loadURL(url);
        console.info("[open-design desktop] main window loadURL success", { url });
        currentUrl = url;
        pendingUrl = null;
        const nextPetUrl = desktopPetUrl(url);
        if (!petWindow.isDestroyed() && nextPetUrl !== currentPetUrl) {
          await petWindow.loadURL(nextPetUrl);
          currentPetUrl = nextPetUrl;
        }
        if (!revealed) {
          void revealWhenReady();
        } else {
          showWindowButtons(window);
        }
      } else if (url == null) {
        pendingUrl = null;
      }
      // A renderer still flagged failed (e.g. the document that just "loaded"
      // was an HTTP 5xx error page) re-polls at the same prompt cadence as the
      // connection-refused recovery path.
      schedule(currentUrl == null || rendererFailed ? PENDING_POLL_MS : RUNNING_POLL_MS);
    } catch (error) {
      pendingUrl = null;
      console.error("desktop web discovery failed", error);
      schedule(PENDING_POLL_MS);
    } finally {
      ticking = false;
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
      ipcMain.removeHandler("browser:clear-data");
      if (splash != null && !splash.isDestroyed()) splash.close();
      if (!petWindow.isDestroyed()) petWindow.close();
      if (!window.isDestroyed()) window.close();
    },
    console() {
      return { entries: [...consoleEntries] };
    },
    async eval(input) {
      if (window.isDestroyed()) return { error: "desktop window is destroyed", ok: false };
      const startedAt = Date.now();
      console.info("[open-design desktop] eval executeJavaScript start", {
        ...summarizeExpression(input.expression),
        statusUrl: resolveDesktopStatusUrl(currentUrl, pendingUrl),
        webContentsUrl: window.webContents.getURL(),
      });
      try {
        const value = await window.webContents.executeJavaScript(input.expression, true);
        console.info("[open-design desktop] eval executeJavaScript success", {
          durationMs: Date.now() - startedAt,
          statusUrl: resolveDesktopStatusUrl(currentUrl, pendingUrl),
          valueType: typeof value,
          webContentsUrl: window.webContents.getURL(),
        });
        return { ok: true, value };
      } catch (error) {
        console.error("[open-design desktop] eval executeJavaScript failed", {
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          statusUrl: resolveDesktopStatusUrl(currentUrl, pendingUrl),
          webContentsUrl: window.webContents.getURL(),
        });
        return { error: error instanceof Error ? error.message : String(error), ok: false };
      }
    },
    exportArtifact(input) {
      return exportArtifactFromHtml(input);
    },
    exportPdf(input) {
      return exportPdfFromHtml(input);
    },
    renderSlides(input) {
      return renderDeckSlides(input);
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
      if (window.isDestroyed()) return;
      // Before the splash reveal gate has fired (revealWhenReady), the main
      // window is still hidden and surfacing it here would show the half-loaded
      // web shell and bypass the gate — reintroducing the startup flash this is
      // meant to remove (e.g. a packaged second-instance focus arriving mid
      // boot). Bring the splash forward instead; the main window is revealed on
      // its own once the app has mounted.
      if (!revealed) {
        if (splash != null && !splash.isDestroyed()) {
          splash.show();
          splash.focus();
        }
        return;
      }
      window.show();
      window.focus();
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
