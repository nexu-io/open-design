import type { MenuItemConstructorOptions } from "electron";

/**
 * Windows zoom-out accelerator.
 *
 * Electron binds the `zoomOut` role to `CommandOrControl+-`
 * (`lib/browser/api/menu-item-roles.ts`). That `-` token resolves to the bare
 * Minus keycode with no Shift in the chord. On a US layout `-` and `+` share a
 * key, so users reach for `Ctrl+Shift+-` by symmetry with `Ctrl+Shift++` — and
 * that chord carries an extra Shift modifier, so it matches nothing.
 *
 * Zoom-in was never affected because `CommandOrControl+Plus` resolves to the
 * keycode you get *with* Shift already held, which is exactly what
 * `Ctrl+Shift++` produces.
 */
export const WINDOWS_ZOOM_OUT_ACCELERATOR = "CommandOrControl+Shift+-";

/**
 * Zoom section of the View submenu.
 *
 * On Windows this adds a `Ctrl+Shift+-` binding alongside the plain
 * `{ role: "zoomOut" }` row, which keeps Electron's `Ctrl+-` default working.
 * The added item is `visible: false` so it does not render a second "Zoom Out"
 * row next to the existing one. Electron still registers accelerators of hidden
 * menu items on Windows; only macOS gates this, via `acceleratorWorksWhenHidden`.
 *
 * An explicit `accelerator` overrides the role default — Electron only fills in
 * `accelerator` from the role when none was supplied.
 *
 * Every other platform already binds zoom-out correctly and is left untouched.
 */
export function deriveViewZoomMenuItems(input: {
  platform: NodeJS.Platform;
}): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
  ];
  if (input.platform === "win32") {
    items.push({
      role: "zoomOut",
      accelerator: WINDOWS_ZOOM_OUT_ACCELERATOR,
      visible: false,
    });
  }
  return items;
}