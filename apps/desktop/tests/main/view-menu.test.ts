import { describe, expect, it } from "vitest";

import {
  WINDOWS_ZOOM_OUT_ACCELERATOR,
  deriveViewZoomMenuItems,
} from "../../src/main/view-menu.js";

/**
 * Contract for the View submenu's zoom section.
 *
 * Electron binds the `zoomOut` role to `CommandOrControl+-`, whose `-` token
 * resolves to the bare Minus keycode with no Shift in the chord. On a US layout
 * `-` and `+` share a key, so users reach for `Ctrl+Shift+-` by symmetry with
 * `Ctrl+Shift++` — and that chord matches nothing. Zoom-in was never affected
 * because `CommandOrControl+Plus` resolves to the keycode you get *with* Shift
 * already held.
 *
 * The fix must therefore add a `Ctrl+Shift+-` binding without removing the
 * `Ctrl+-` binding that already works.
 */
describe("View menu zoom accelerators", () => {
  it("exposes Ctrl+Shift+- on Windows so zoom-out is reachable by symmetry with zoom-in", () => {
    const items = deriveViewZoomMenuItems({ platform: "win32" });

    expect(items).toContainEqual({
      role: "zoomOut",
      accelerator: WINDOWS_ZOOM_OUT_ACCELERATOR,
      visible: false,
    });
    expect(WINDOWS_ZOOM_OUT_ACCELERATOR).toBe("CommandOrControl+Shift+-");
  });

  it("keeps the existing Ctrl+- zoom-out binding on Windows", () => {
    // Electron's own default for `role: "zoomOut"` is `CommandOrControl+-`.
    // Dropping this row would silently break users who already zoom out with it.
    expect(deriveViewZoomMenuItems({ platform: "win32" })).toContainEqual({ role: "zoomOut" });
  });

  it("hides the added binding so the menu does not show a duplicate Zoom Out row", () => {
    // Electron registers accelerators of hidden menu items on Windows
    // (`acceleratorWorksWhenHidden` is a macOS-only switch), so a hidden item
    // keeps its binding.
    const hiddenBindings = deriveViewZoomMenuItems({ platform: "win32" }).filter(
      (item) => item.visible === false,
    );

    expect(hiddenBindings).toHaveLength(1);
    expect(deriveViewZoomMenuItems({ platform: "win32" }).filter((item) => item.visible !== false)).toHaveLength(3);
  });

  it.each(["darwin", "linux"] as const)("does not change the %s zoom block", (platform) => {
    // macOS already binds `Command+-` correctly, and no other platform reported
    // the bug. Leave them exactly as they are today.
    expect(deriveViewZoomMenuItems({ platform })).toEqual([
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
    ]);
  });
});