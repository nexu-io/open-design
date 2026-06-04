import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

describe("desktop BrowserWindow chrome options", () => {
  test("hides Electron's native menu bar in the Windows/Linux app window", () => {
    const browserWindowBlock = /new BrowserWindow\(\{([\s\S]*?)title: "Open Design",([\s\S]*?)webPreferences:/.exec(runtimeSource)?.[0] ?? "";

    expect(browserWindowBlock).toContain("autoHideMenuBar: true");
  });

  test("keeps macOS traffic-light controls clear of the web tab strip", () => {
    expect(runtimeSource).toContain("--app-chrome-traffic-space: 78px !important;");
    expect(runtimeSource).toContain("--app-chrome-traffic-margin: 8px !important;");
    expect(runtimeSource).toContain("flex: 0 0 78px !important;");
    expect(runtimeSource).toContain("width: 78px !important;");
  });
});
