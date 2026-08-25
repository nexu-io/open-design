import { describe, expect, it, vi } from "vitest";

import { focusElectronWindow, resolveElectronPresentationMode } from "@/runtime/presentation.js";

function windowTarget(input: Readonly<{ destroyed?: boolean; minimized?: boolean }> = {}) {
  return {
    isDestroyed: vi.fn(() => input.destroyed === true),
    isMinimized: vi.fn(() => input.minimized === true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe("Electron presentation policy", () => {
  it("supports explicit, command-line, current-env, and POC-compatible headless launch", () => {
    expect(resolveElectronPresentationMode({ explicitHeadless: true, argv: [], env: {} })).toBe("headless");
    expect(resolveElectronPresentationMode({ explicitHeadless: false, argv: ["--headless"], env: { ELECTRON_KIT_HEADLESS: "1" } })).toBe("interactive");
    expect(resolveElectronPresentationMode({ argv: ["--headless"], env: {} })).toBe("headless");
    expect(resolveElectronPresentationMode({ argv: [], env: { ELECTRON_KIT_HEADLESS: "1" } })).toBe("headless");
    expect(resolveElectronPresentationMode({ argv: [], env: { OD_PACKAGED_E2E_HEADLESS: "1" } })).toBe("headless");
  });

  it("never reveals or focuses a headless window", () => {
    const window = windowTarget({ minimized: true });
    expect(focusElectronWindow(window, "headless", "deep-link")).toBe(false);
    expect(window.restore).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
  });

  it("restores before focusing an interactive window for an enumerated reason", () => {
    const window = windowTarget({ minimized: true });
    expect(focusElectronWindow(window, "interactive", "second-instance")).toBe(true);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });
});
