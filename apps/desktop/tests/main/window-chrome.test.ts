import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

describe("desktop BrowserWindow chrome options", () => {
  test("hides Electron's native menu bar in the Windows/Linux app window", () => {
    const browserWindowBlock = /new BrowserWindow\(\{([\s\S]*?)title: "Open Design",([\s\S]*?)webPreferences:/.exec(runtimeSource)?.[0] ?? "";

    expect(browserWindowBlock).toContain("autoHideMenuBar: true");
  });
});
