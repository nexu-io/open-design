import { describe, expect, it, vi } from "vitest";

import type { BrowserWindow } from "electron";

import { focusDesktopForDeeplink } from "../../src/main/deeplink-focus.js";
import { ensureWindowVisible } from "../../src/main/runtime.js";

describe("focusDesktopForDeeplink", () => {
  // The runtime creates the desktop-pet window (hidden, `focusable: false`)
  // before the main window and packaged cold start puts the splash ahead of
  // both, so any bring-to-front that selects a window itself lands on the wrong
  // one and silently does nothing. Routing through the runtime's `show()` is
  // what makes the `workspace/open` hand-off actually surface the app.
  it("brings the client to the front through the runtime's own show()", () => {
    const show = vi.fn();

    focusDesktopForDeeplink({ show });

    expect(show).toHaveBeenCalledTimes(1);
  });

  it("no-ops when the desktop runtime is absent", () => {
    expect(() => focusDesktopForDeeplink(null)).not.toThrow();
    expect(() => focusDesktopForDeeplink(undefined)).not.toThrow();
  });
});

describe("ensureWindowVisible", () => {
  function mockWindow(state: { minimized?: boolean; visible?: boolean; destroyed?: boolean }) {
    return {
      isDestroyed: vi.fn(() => state.destroyed ?? false),
      isMinimized: vi.fn(() => state.minimized ?? false),
      isVisible: vi.fn(() => state.visible ?? true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    };
  }

  // The revealed path of `DesktopRuntime.show()` routes through this helper:
  // `focus()` alone leaves a minimized window in the Dock, which would turn the
  // deeplink hand-off (whose entire payload is the bring-to-front) into a no-op.
  it("restores a minimized window before focusing it", () => {
    const window = mockWindow({ minimized: true, visible: true });

    ensureWindowVisible(window as unknown as BrowserWindow);

    expect(window.restore).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it("shows a hidden window and focuses a normal one without disturbing its state", () => {
    const hidden = mockWindow({ visible: false });
    ensureWindowVisible(hidden as unknown as BrowserWindow);
    expect(hidden.show).toHaveBeenCalledTimes(1);
    expect(hidden.restore).not.toHaveBeenCalled();

    const normal = mockWindow({});
    ensureWindowVisible(normal as unknown as BrowserWindow);
    expect(normal.restore).not.toHaveBeenCalled();
    expect(normal.show).not.toHaveBeenCalled();
    expect(normal.focus).toHaveBeenCalledTimes(1);

    const destroyed = mockWindow({ destroyed: true });
    ensureWindowVisible(destroyed as unknown as BrowserWindow);
    expect(destroyed.focus).not.toHaveBeenCalled();
  });
});
