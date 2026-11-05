import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");

function source(relativePath: string): string {
  return readFileSync(join(desktopRoot, relativePath), "utf8").replace(/\r\n?/g, "\n");
}

// P0-24 N11: clicking a system notification must bring the window back even
// when it is minimized or hidden by the close button, which the renderer's own
// `window.focus()` cannot do. The renderer asks the main process instead.
describe("desktop window show host boundary", () => {
  it("exposes window.show to the renderer over od:window:show", () => {
    const preload = source("src/main/preload.cts");
    expect(preload).toContain("show: (): void => ipcRenderer.send('od:window:show')");
  });

  it("answers od:window:show only for the main window, through the canonical show", () => {
    const runtime = source("src/main/runtime.ts");
    const start = runtime.indexOf('ipcMain.on("od:window:show"');
    expect(start).toBeGreaterThan(-1);
    const handler = runtime.slice(start, runtime.indexOf("});", start));
    expect(handler).toContain("event.sender !== window.webContents");
    expect(handler).toContain("showMainWindow()");
    // The deeplink / second-instance `show()` and the notification click share
    // one bring-to-front, so the splash gate and minimized restore hold for both.
    expect(runtime).toMatch(/show\(\) \{\n\s+showMainWindow\(\);\n\s+\},/);
  });

  it("removes the od:window:show listener on teardown", () => {
    const runtime = source("src/main/runtime.ts");
    expect(runtime.match(/ipcMain\.removeAllListeners\("od:window:show"\)/g)).toHaveLength(2);
  });
});
