import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

describe("desktop BrowserWindow chrome options", () => {
  test("hides Electron's native menu bar in the Windows/Linux app window", () => {
    const browserWindowBlock = /new BrowserWindow\(\{([\s\S]*?)title: "Open Design",([\s\S]*?)webPreferences:/.exec(runtimeSource)?.[0] ?? "";

    expect(browserWindowBlock).toContain("autoHideMenuBar: true");
  });

  test("keeps macOS traffic-light controls clear of the web tab strip", () => {
    expect(runtimeSource).toContain("--app-chrome-traffic-space: 96px !important;");
    expect(runtimeSource).toContain("--app-chrome-traffic-margin: 12px !important;");
    expect(runtimeSource).toContain("flex: 0 0 96px !important;");
    expect(runtimeSource).toContain("width: 96px !important;");
  });

  test("keeps the visible renderer responsive when Chromium misclassifies visibility", () => {
    const browserWindowBlock = /new BrowserWindow\(\{([\s\S]*?)title: "Open Design",([\s\S]*?)width: 1280,/.exec(runtimeSource)?.[0] ?? "";

    expect(browserWindowBlock).toContain("backgroundThrottling: false");
  });
});
