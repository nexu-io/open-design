import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");

function source(relativePath: string): string {
  return readFileSync(join(desktopRoot, relativePath), "utf8");
}

describe("desktop updater host boundary", () => {
  it("routes renderer updater calls through the canonical host IPC surface", () => {
    const runtime = source("src/main/runtime.ts");
    expect(runtime).toContain("od:update:status");
    expect(runtime).toContain("od:update:check");
    expect(runtime).toContain("od:update:download");
    expect(runtime).toContain("od:update:install");
    expect(runtime).toContain("od:update:quit");
    expect(runtime).toContain("UPDATER_STATUS_EVENT");
    expect(runtime).toContain("event.sender !== window.webContents");
  });

  it("does not turn automatic startup checks into native desktop dialogs", () => {
    const main = source("src/main/index.ts");
    const scheduleStart = main.indexOf("updateScheduler = createDesktopUpdaterScheduler");
    const nextSection = main.indexOf("attachParentMonitor", scheduleStart);
    expect(scheduleStart).toBeGreaterThanOrEqual(0);
    expect(nextSection).toBeGreaterThan(scheduleStart);
    const scheduleBody = main.slice(scheduleStart, nextSection);
    expect(scheduleBody).toContain("updateScheduler.start()");
    expect(scheduleBody).not.toContain("showUpdateResultDialog");
  });

  it("keeps installer launch separate from desktop process shutdown", () => {
    const runtime = source("src/main/runtime.ts");
    const installStart = runtime.indexOf('ipcMain.handle("od:update:install"');
    const installEnd = runtime.indexOf('ipcMain.handle("od:update:quit"');
    expect(installStart).toBeGreaterThanOrEqual(0);
    expect(installEnd).toBeGreaterThan(installStart);
    const installHandler = runtime.slice(installStart, installEnd);
    expect(installHandler).toContain("installUpdate()");
    expect(installHandler).not.toContain("quit");
    expect(installHandler).not.toContain("process.exit");
    expect(installHandler).not.toContain("shutdown");
  });

  it("exposes process quit only as an explicit post-installer-open action", () => {
    const runtime = source("src/main/runtime.ts");
    const quitStart = runtime.indexOf('ipcMain.handle("od:update:quit"');
    const quitEnd = runtime.indexOf('ipcMain.removeAllListeners("desktop-pet:set-visible"');
    expect(quitStart).toBeGreaterThanOrEqual(0);
    expect(quitEnd).toBeGreaterThan(quitStart);
    const quitHandler = runtime.slice(quitStart, quitEnd);
    expect(quitHandler).toContain("status.installResult == null");
    expect(quitHandler).toContain("requestQuit");
    expect(quitHandler).not.toContain("installUpdate()");
  });
});
