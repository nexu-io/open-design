import { SIDECAR_MESSAGES, type DesktopStatusSnapshot } from "@open-design/sidecar-proto";

import type { PackagedHeadlessRequest } from "./headless-runtime.js";
import type { PackagedLauncherRuntime } from "./launcher-runtime.js";

// A managed outer is one that owns the headless lifecycle end to end: it hands
// headless launches to the active payload, and the payload keeps a windowless
// desktop runtime that restores its window in place when the user opens the
// app. Outers that predate this contract never set the signal below, so a
// payload they start keeps today's behavior.

/** Set by an outer immediately before it delegates a launch to a payload. */
export const PACKAGED_MANAGED_OUTER_ENV = "OD_LAUNCHER_MANAGED_OUTER";

type LauncherRuntimeShape = Pick<PackagedLauncherRuntime, "payloadDesktopProcess" | "source">;

/** True when this process is an outer about to delegate to the active payload. */
export function isPackagedPayloadDelegation(runtime: LauncherRuntimeShape): boolean {
  return runtime.source === "payload" && !runtime.payloadDesktopProcess;
}

export function markPackagedManagedOuter(env: NodeJS.ProcessEnv = process.env): void {
  env[PACKAGED_MANAGED_OUTER_ENV] = "1";
}

/**
 * True when the process that launched this runtime is a managed outer: either a
 * managed outer delegated to this payload, or this process is itself the
 * installed package (the current code is the outer's code). Only macOS has a
 * managed outer so far; other platforms keep today's MCP registration.
 */
export function isPackagedManagedLaunch(
  runtime: LauncherRuntimeShape,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== "darwin") return false;
  return env[PACKAGED_MANAGED_OUTER_ENV] === "1" || runtime.source === "current-package";
}

/**
 * macOS routes Dock/Finder/`open -a` to an already running instance of the
 * same app instead of starting a launcher, so a windowless headless runtime
 * must be able to become the desktop itself. Other platforms start a new
 * launcher, which already replaces a headless owner, and keep the legacy path.
 */
export function supportsDeferredHeadlessDesktop(
  request: PackagedHeadlessRequest,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "darwin" && request.headless && request.mcpInstallAgent == null;
}

type DesktopIntentEvent = "activate" | "did-become-active" | "open-url";

export type DesktopIntentSource = "activate" | "open-url";

export type DesktopIntentEmitter = {
  on(event: DesktopIntentEvent, listener: (...args: unknown[]) => void): unknown;
};

/** How close `did-become-active` and the reopen/URL event must be to count as one user action. */
export const DESKTOP_INTENT_PAIRING_WINDOW_MS = 1_500;

/**
 * Calls `onIntent` when the user asks for the app's window. A user open makes
 * the app active; a background reopen (for example the MCP bootstrap's
 * `open -g`) delivers `activate` without ever activating the app. macOS does
 * not guarantee which of the two events arrives first, so either order pairs.
 */
export function watchUserDesktopIntent(
  app: DesktopIntentEmitter,
  onIntent: (source: DesktopIntentSource) => void,
  options: { now?: () => number; pairingWindowMs?: number } = {},
): void {
  const now = options.now ?? Date.now;
  const windowMs = options.pairingWindowMs ?? DESKTOP_INTENT_PAIRING_WINDOW_MS;
  let lastBecameActiveAt = Number.NEGATIVE_INFINITY;
  let pending: { at: number; source: DesktopIntentSource } | null = null;

  const request = (source: DesktopIntentSource): void => {
    const at = now();
    if (at - lastBecameActiveAt <= windowMs) {
      pending = null;
      onIntent(source);
      return;
    }
    pending = { at, source };
  };

  app.on("did-become-active", () => {
    lastBecameActiveAt = now();
    if (pending != null && lastBecameActiveAt - pending.at <= windowMs) {
      const { source } = pending;
      pending = null;
      onIntent(source);
    }
  });
  app.on("activate", () => request("activate"));
  app.on("open-url", () => request("open-url"));
}

type DesktopHandleShape = {
  invoke(action: string, input: unknown): Promise<unknown>;
  status(): Promise<DesktopStatusSnapshot>;
  stop(): Promise<void>;
};

export type DeferredDesktopController<THandle extends DesktopHandleShape> = DesktopHandleShape & {
  /** The restored desktop, or null while still windowless. */
  current(): THandle | null;
  /** Starts the desktop once; concurrent and repeated calls share the same start. */
  restore(): Promise<THandle>;
};

/**
 * A desktop sidecar handle that stays windowless until restored. Until then it
 * reports a restorable, windowless status and treats SHOW as the request to
 * restore; afterwards every call goes to the real desktop handle.
 */
export function createDeferredDesktopController<THandle extends DesktopHandleShape>(options: {
  headlessStatus(): Omit<DesktopStatusSnapshot, "restorable" | "windowVisible">;
  launch(): Promise<THandle>;
  onRestoreFailed?(error: unknown): void;
  stopHeadless(): Promise<void>;
}): DeferredDesktopController<THandle> {
  let current: THandle | null = null;
  let restoring: Promise<THandle> | null = null;

  const restore = (): Promise<THandle> => {
    if (current != null) return Promise.resolve(current);
    restoring ??= options.launch().then(
      (handle) => {
        current = handle;
        return handle;
      },
      (error: unknown) => {
        restoring = null;
        options.onRestoreFailed?.(error);
        throw error;
      },
    );
    return restoring;
  };

  return {
    current: () => current,
    restore,
    async invoke(action, input) {
      if (current != null) return await current.invoke(action, input);
      if (action === SIDECAR_MESSAGES.SHOW) {
        // Answer the launcher immediately; the restored desktop then handles
        // the same SHOW so a forwarded deeplink is dispatched and focused.
        void restore().then((handle) => handle.invoke(action, input)).catch(() => undefined);
        return { accepted: true };
      }
      throw new Error("packaged desktop sidecar is not running");
    },
    async status() {
      if (current != null) return await current.status();
      return { ...options.headlessStatus(), restorable: true, windowVisible: false };
    },
    async stop() {
      // A restore in flight owns the sidecars once it finishes; stop through it.
      if (current == null && restoring != null) await restoring.catch(() => null);
      if (current != null) {
        await current.stop();
        return;
      }
      await options.stopHeadless();
    },
  };
}
