import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

/**
 * runtime.ts constructs three BrowserWindows — the brand splash
 * (`createSplashWindow`), the desktop pet, and the main app window — and the
 * splash, declared FIRST, shares the `title: "OpenDesign"` / `width: 1280`
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
    // Windowed: home pill 4px after the lights (12px inset + 52px span).
    expect(runtimeSource).toContain("--app-chrome-traffic-space: 64px !important;");
    expect(runtimeSource).toContain("--app-chrome-traffic-margin: 4px !important;");
    // Fullscreen: lights hidden; the pill left-aligns with the nav-rail card.
    expect(runtimeSource).toContain("html.is-window-fullscreen .app-chrome-header");
    expect(runtimeSource).toContain("--app-chrome-traffic-space: 10px !important;");
    expect(runtimeSource).toContain("flex: 0 0 var(--app-chrome-traffic-space) !important;");
    expect(runtimeSource).toContain("width: var(--app-chrome-traffic-space) !important;");
  });

  test("centers the macOS traffic lights on the 44px top chrome (OPEND-3111)", () => {
    // The chrome row is 44px tall (routines.css `.workspace-shell
    // .workspace-tabs-chrome.app-chrome-header`), so its midline is 22 and the
    // 12px traffic-light circles start at 22 - 6 = 16. Keep this in step with
    // the CSS: apps/web/tests/styles/top-chrome-height.test.ts pins the 44.
    // The offset lives in MAC_WINDOW_CHROME, spread into the main window.
    expect(runtimeSource).toContain("const MAC_TRAFFIC_LIGHT_POSITION = { x: 12, y: 16 };");
    expect(mainAppWindowOptions()).toContain("...MAC_WINDOW_CHROME");
  });

  test("gives the boot splash the main window's traffic lights and a drag strip", () => {
    // The splash can sit on screen for a whole cold boot, so it must be
    // movable and closable. Same light position as the main window keeps the
    // reveal swap still; the reveal adopts the splash bounds so a dragged
    // splash does not snap back.
    const splashChrome = runtimeSource.slice(
      runtimeSource.indexOf("const SPLASH_WINDOW_CHROME ="),
      runtimeSource.indexOf("const MAC_WINDOW_CHROME_CSS ="),
    );
    expect(splashChrome).toContain('titleBarStyle: "hiddenInset"');
    expect(splashChrome).toContain("trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION");
    expect(splashChrome).toContain("fullscreenable: false");
    expect(runtimeSource).toContain("...SPLASH_WINDOW_CHROME,");
    expect(runtimeSource).toContain('<div class="splash-drag" aria-hidden="true"></div>');
    expect(runtimeSource).toContain("-webkit-app-region: drag;\n      }\n${SPLASH_PIXEL_SCAN_STYLE}");
    expect(runtimeSource).toContain("window.setBounds(splash.getBounds())");
    expect(runtimeSource).toContain("attachSplashCloseShutdown(splash, {");
  });

  test("boots on the inlined pixel-scan wordmark instead of a one-shot clip (OPEND-3202)", () => {
    // The splash is up before any HTTP origin exists, so the wordmark ships
    // inlined from splash-pixel-scan.ts; the old <video> clip played once and
    // froze for the rest of a cold boot.
    expect(runtimeSource).toContain('from "./splash-pixel-scan.js"');
    expect(runtimeSource).toContain("${SPLASH_PIXEL_SCAN_STYLE}");
    expect(runtimeSource).toContain("${SPLASH_PIXEL_SCAN_MARKUP}");
    expect(runtimeSource).toContain("${splashPixelScanScript()}");
    expect(runtimeSource).not.toContain("splash-video");
    expect(runtimeSource).not.toContain("<video");
  });

  test("mirrors macOS fullscreen state onto the renderer for chrome CSS", () => {
    expect(runtimeSource).toContain('window.on("enter-full-screen", () => void syncWindowFullscreenClass(window));');
    expect(runtimeSource).toContain('window.on("leave-full-screen", () => void syncWindowFullscreenClass(window));');
    expect(runtimeSource).toContain("is-window-fullscreen");
  });

  test("keeps the visible renderer responsive when Chromium misclassifies visibility", () => {
    expect(mainAppWindowOptions()).toContain("backgroundThrottling: false");
  });

  test("keeps channel-specific window titles from being overwritten by the renderer page title", () => {
    expect(runtimeSource).toContain('window.on("page-title-updated", (event) => {');
    expect(runtimeSource).toContain("event.preventDefault();");
    expect(runtimeSource).toContain("window.setTitle(windowTitle);");
  });

  test("keeps packaged update status wired into the runtime instead of falling back to 0.0.0", () => {
    expect(runtimeSource).toContain("currentVersion: \"0.0.0\"");
    expect(runtimeSource).toContain("options.updater?.snapshot() ?? unavailableUpdaterStatus()");
    expect(runtimeSource).toContain("options.updater?.status() ?? unavailableUpdaterStatus()");
    expect(runtimeSource).toContain("sendUpdaterStatus()");
  });
});
