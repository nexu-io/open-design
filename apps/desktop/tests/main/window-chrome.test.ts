import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

/**
 * runtime.ts constructs three BrowserWindows — the brand splash
 * (`createSplashWindow`), the desktop pet, and the main app window — and the
 * splash, declared FIRST, shares the `title: "Open Design"` / `width: 1280`
 * markers with the main window while intentionally omitting
 * `backgroundThrottling: false`. A loose `new BrowserWindow({` anchor therefore
 * locks onto the splash block. Anchor instead on the `const window =`
 * declaration that is unique to the main app window, and assert exactly one
 * match so a rename or a second such declaration fails loudly here rather than
 * silently inspecting the wrong window.
 */
function mainAppWindowOptions(): string {
  const blocks = runtimeSource
    .split("const window = new BrowserWindow({")
    .slice(1)
    .map((block) => block.slice(0, block.indexOf("});")));
  expect(blocks).toHaveLength(1);
  return blocks[0] ?? "";
}

describe("desktop BrowserWindow chrome options", () => {
  test("hides Electron's native menu bar in the Windows/Linux app window", () => {
    expect(mainAppWindowOptions()).toContain("autoHideMenuBar: true");
  });

  test("keeps macOS traffic-light controls clear of the web tab strip", () => {
    expect(runtimeSource).toContain("--app-chrome-traffic-space: 96px !important;");
    expect(runtimeSource).toContain("--app-chrome-traffic-margin: 12px !important;");
    expect(runtimeSource).toContain("flex: 0 0 96px !important;");
    expect(runtimeSource).toContain("width: 96px !important;");
  });

  test("keeps the visible renderer responsive when Chromium misclassifies visibility", () => {
    expect(mainAppWindowOptions()).toContain("backgroundThrottling: false");
  });

  test("keeps packaged update status wired into the runtime instead of falling back to 0.0.0", () => {
    expect(runtimeSource).toContain("currentVersion: \"0.0.0\"");
    expect(runtimeSource).toContain("options.updater?.snapshot() ?? unavailableUpdaterStatus()");
    expect(runtimeSource).toContain("options.updater?.status() ?? unavailableUpdaterStatus()");
    expect(runtimeSource).toContain("sendUpdaterStatus()");
  });
});
