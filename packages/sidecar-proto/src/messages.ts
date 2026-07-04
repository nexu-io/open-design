import { SIDECAR_ERROR_CODES, SidecarContractError } from "./errors.js";
import { assertObject, assertKnownKeys, normalizeNonEmptyString } from "./validation.js";
import {
  normalizeDesktopEvalInput,
  normalizeDesktopScreenshotInput,
  normalizeDesktopClickInput,
  normalizeDesktopExportPdfInput,
  normalizeDesktopRenderSlidesInput,
  normalizeDesktopExportArtifactInput,
  type DesktopEvalInput,
  type DesktopScreenshotInput,
  type DesktopClickInput,
  type DesktopExportPdfInput,
  type DesktopRenderSlidesInput,
  type DesktopExportArtifactInput,
} from "./desktop-control.js";
import { normalizeDesktopUpdateInput, type DesktopUpdateInput } from "./desktop-update.js";

/**
 * @module messages
 *
 * Sidecar message envelopes and their per-target normalizers. Defines the
 * SIDECAR_MESSAGES registry, the daemon/web/desktop message unions, the
 * desktop-auth handshake payloads, and the `normalize*SidecarMessage`
 * validators that reject malformed or unknown inbound messages.
 */

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

/** @internal Validate a register-desktop-auth payload (base64 secret). */
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

/** @internal Validate a mint-import-token payload. */
function normalizeMintImportTokenInput(input: unknown): MintImportTokenInput {
  const value = assertObject(input, "mint-import-token input");
  assertKnownKeys(value, ["baseDir"], "mint-import-token input");
  return { baseDir: normalizeNonEmptyString(value.baseDir, "mint-import-token baseDir") };
}

/** @internal Assert an inbound message carries a non-empty string `type`. */
function normalizeMessageType(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SidecarContractError(SIDECAR_ERROR_CODES.INVALID_MESSAGE, `${label} type must be a non-empty string`);
  }
  return value;
}

/**
 * Validate an inbound daemon-target sidecar message (status / shutdown /
 * register-desktop-auth / mint-import-token).
 * @throws SidecarContractError on invalid or unknown messages
 */
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

/**
 * Validate an inbound web-target sidecar message (status / shutdown only).
 * @throws SidecarContractError on invalid or unknown messages
 */
export function normalizeWebSidecarMessage(input: unknown): WebSidecarMessage {
  const value = assertObject(input, "web sidecar message");
  const type = normalizeMessageType(value.type, "web sidecar message");
  if (type === SIDECAR_MESSAGES.STATUS || type === SIDECAR_MESSAGES.SHUTDOWN) {
    assertKnownKeys(value, ["type"], "web sidecar message");
    return { type };
  }
  throw new SidecarContractError(SIDECAR_ERROR_CODES.UNKNOWN_MESSAGE, `unknown web sidecar message: ${type}`);
}

/**
 * Validate an inbound desktop-target sidecar message across the full desktop
 * control/update surface.
 * @throws SidecarContractError on invalid or unknown messages
 */
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
