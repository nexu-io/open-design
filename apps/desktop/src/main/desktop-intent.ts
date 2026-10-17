type DesktopIntentEvent = "activate" | "did-become-active" | "did-resign-active" | "open-url";

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
 * A reopen while the app is already active (a Dock click on a minimized
 * window) needs no pairing.
 */
export function watchUserDesktopIntent(
  app: DesktopIntentEmitter,
  onIntent: (source: DesktopIntentSource) => void,
  options: { now?: () => number; pairingWindowMs?: number } = {},
): void {
  const now = options.now ?? Date.now;
  const windowMs = options.pairingWindowMs ?? DESKTOP_INTENT_PAIRING_WINDOW_MS;
  let active = false;
  let pending: { at: number; source: DesktopIntentSource } | null = null;

  const request = (source: DesktopIntentSource): void => {
    if (active) {
      onIntent(source);
      return;
    }
    pending = { at: now(), source };
  };

  app.on("did-become-active", () => {
    const at = now();
    active = true;
    if (pending != null) {
      const { at: pendingAt, source } = pending;
      pending = null;
      if (at - pendingAt <= windowMs) onIntent(source);
    }
  });
  app.on("did-resign-active", () => {
    active = false;
  });
  app.on("activate", () => request("activate"));
  app.on("open-url", () => request("open-url"));
}
