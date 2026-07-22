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

  it("starts desktop IPC before creating the BrowserWindow runtime", () => {
    const main = source("src/main/index.ts");
    const ipcStart = main.indexOf("ipcServer = await createJsonIpcServer");
    const runtimeStart = main.indexOf("desktop = await createDesktopRuntime");
    expect(ipcStart).toBeGreaterThanOrEqual(0);
    expect(runtimeStart).toBeGreaterThan(ipcStart);
    const startupIpcBody = main.slice(ipcStart, runtimeStart);
    expect(main).toContain('state: "idle"');
    expect(startupIpcBody).toContain("desktopStatusSnapshot(activeDesktop)");
    expect(startupIpcBody).toContain("desktop runtime is not initialized");
  });

  it("keeps obsolete installed-outer policy outside generic desktop while exposing the SHOW hook", () => {
    const main = source("src/main/index.ts");
    const showStart = main.indexOf("case SIDECAR_MESSAGES.SHOW:");
    const clickStart = main.indexOf("case SIDECAR_MESSAGES.CLICK:", showStart);
    expect(showStart).toBeGreaterThanOrEqual(0);
    expect(clickStart).toBeGreaterThan(showStart);
    const showHandler = main.slice(showStart, clickStart);
    expect(showHandler).toContain("activeDesktop.show()");
    expect(showHandler).toContain("notifyDesktopExternalShow(options.onExternalShow)");
    expect(showHandler.indexOf("activeDesktop.show()"))
      .toBeLessThan(showHandler.indexOf("notifyDesktopExternalShow(options.onExternalShow)"));
    expect(main).not.toContain("listProcessSnapshots");
    expect(main).not.toContain("stopProcesses");
  });

  it("keeps desktop STATUS responsive when updater status is slow", () => {
    const main = source("src/main/index.ts");
    expect(main).toContain("async function snapshotUpdateForStatus()");
    expect(main).toContain("desktop updater status timed out after ${timeoutMs}ms");
    expect(main).toContain("update: updater.snapshot()");
    expect(main).toContain("return await desktopStatusSnapshot(activeDesktop)");
    expect(main).not.toContain("return await updater.status()");
  });

  it("adds updater access to the macOS app menu without changing the Windows File menu", () => {
    const main = source("src/main/index.ts");
    expect(main).toContain("deriveDesktopUpdateMenuItem");
    expect(main).toContain("DEFAULT_DESKTOP_UPDATE_MENU_LABELS");
    expect(main).toContain('source: "mac-app-menu"');
    expect(main).toContain("updateMenuItem.visible");
    const fileMenuStart = main.indexOf('label: "File"');
    const editMenuStart = main.indexOf('label: "Edit"', fileMenuStart);
    expect(fileMenuStart).toBeGreaterThanOrEqual(0);
    expect(editMenuStart).toBeGreaterThan(fileMenuStart);
    const fileMenu = main.slice(fileMenuStart, editMenuStart);
    expect(fileMenu).not.toContain("updateMenuItem");
    expect(main).not.toContain("showUpdateResultDialog");
    const runtime = source("src/main/runtime.ts");
    expect(runtime).toContain("pendingUpdateDialogRequest");
    expect(runtime).toContain("if (!revealed)");
  });

  it("keeps installer launch separate from desktop process shutdown", () => {
    const runtime = source("src/main/runtime.ts");
    const installStart = runtime.indexOf('ipcMain.handle("od:update:install"');
    const installEnd = runtime.indexOf('ipcMain.handle("od:update:quit"');
    expect(installStart).toBeGreaterThanOrEqual(0);
    expect(installEnd).toBeGreaterThan(installStart);
    const installHandler = runtime.slice(installStart, installEnd);
    expect(installHandler).toContain("guardedUpdaterStatus(updaterOptions)");
    expect(installHandler).toContain("installUpdate()");
    expect(installHandler).not.toContain("quit");
    expect(installHandler).not.toContain("relaunch");
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
    expect(quitHandler).toContain("guardedUpdaterStatus(updaterOptions)");
    expect(quitHandler).toContain("status.installResult == null");
    expect(quitHandler).toContain("requestQuit");
    expect(quitHandler).not.toContain("app.relaunch()");
    expect(quitHandler).not.toContain("installUpdate()");
  });
});
