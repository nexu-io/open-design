// Focus target for the `opendesign://` deeplink hand-off. Kept out of
// `invite-deeplink.ts` so it stays electron-free and unit testable.

/** Minimal view of the desktop runtime the hand-off needs. */
export type DeeplinkFocusTarget = {
  /** The runtime's canonical bring-to-front. */
  show(): void;
};

/**
 * Bring the desktop client to the foreground for an incoming deeplink.
 *
 * Must route through the runtime's own `show()` rather than reaching for
 * `BrowserWindow.getAllWindows()[0]`: the runtime creates the desktop-pet
 * window (hidden, `focusable: false`, `skipTaskbar: true`) before the main
 * window, and a packaged cold start puts the splash ahead of both, so window 0
 * is never the main window in a running app — focusing it is a silent no-op.
 * `show()` also honours the splash reveal gate, surfacing the splash instead of
 * a half-loaded web shell when the deeplink lands mid boot.
 *
 * No-ops when the runtime is absent (not yet constructed, or torn down), so a
 * deeplink cannot throw into the OS url handler.
 */
export function focusDesktopForDeeplink(runtime: DeeplinkFocusTarget | null | undefined): void {
  runtime?.show();
}
