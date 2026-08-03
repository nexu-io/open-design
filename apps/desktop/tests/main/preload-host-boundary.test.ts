import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("desktop preload host boundary", () => {
  it("exposes the canonical Open Design host global and diagnostics bridge", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../../src/main/preload.cts"), "utf8");
    const exposedGlobals = Array.from(source.matchAll(/contextBridge\.exposeInMainWorld\(([^,\n]+)/g))
      .map((match) => match[1]?.trim());
    const runtimeRequires = Array.from(source.matchAll(/require\((['"][^'"]+['"])\)/g))
      .map((match) => match[1]);

    expect(exposedGlobals).toEqual(["OPEN_DESIGN_HOST_GLOBAL", "'openDesignDesktop'"]);
    expect(runtimeRequires).toEqual(["'electron'"]);
    expect(source).toContain("OPEN_DESIGN_HOST_GLOBAL");
    expect(source).toContain("exportDiagnostics");
    expect(source).toContain("satisfies OpenDesignHostBridge");
    expect(source).toContain("browser");
    expect(source).toContain("browser:clear-data");
    expect(source).toContain("updater");
    // OS locale forwarded from main via webPreferences.additionalArguments
    // is mirrored onto __od__.client.osLocale. Pin the literal prefix
    // here so it can't drift away from `applyOsLocaleSwitch`/runtime's
    // additionalArguments without the test going red.
    expect(source).toContain("'--od-os-locale='");
    expect(source).toContain("osLocale");
    expect(source).toContain("invokeUpdater('install'");
    expect(source).toContain("invokeUpdater('clear-cache'");
    expect(source).toContain("od:update:quit");
    expect(source).toContain("od:update:status-changed");
    expect(source).toContain("od:update:open-dialog");
    expect(source).toContain("od:update:set-menu-labels");
    expect(source).toContain("subscribeOpenDialog");
    expect(source).toContain("od:app-config-changed");
    expect(source).toContain("open-design:app-config-changed");
    expect(source).toContain("window.dispatchEvent(new CustomEvent(APP_CONFIG_CHANGED_EVENT))");
    expect(source).not.toContain("@open-design/contracts");
    expect(source).not.toContain("exposeInMainWorld('electronAPI'");
    expect(source).not.toContain('exposeInMainWorld("__odDesktop"');
    expect(source).not.toContain("exposeInMainWorld('__odDesktop'");
  });

  it("mirrors the host import contract by accepting a null entryFile", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "../../src/main/preload.cts"), "utf8");

    expect(source).toContain("response.entryFile === null");
    expect(source).toContain("entryFile === undefined");
  });
});
