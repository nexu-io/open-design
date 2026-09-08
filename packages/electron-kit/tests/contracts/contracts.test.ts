import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  validateElectronShellManifest,
  validateElectronShellAppearance,
} from "@/contracts/index.js";

const hash = "a".repeat(64);

describe("Electron integration boundary", () => {
  it("keeps channel release identity independent from Shell compatibility", () => {
    const manifest = validateElectronShellManifest({
      schemaVersion: 2,
      appId: "io.nexu.electron-foundation",
      productName: "Electron Foundation",
      publisher: "Example Company",
      executableName: "electron-foundation",
      version: "0.1.0-dev.7",
      channel: "dev",
      namespace: "electron-foundation",
      protocol: "od",
      shell: { type: "electron", version: "0.1.0", buildHash: hash, digest: hash },
    });
    expect(manifest).toMatchObject({ namespace: "electron-foundation", version: "0.1.0-dev.7", shell: { version: "0.1.0" } });
    expect(() => validateElectronShellManifest({ ...manifest, schemaVersion: 1 } as never)).toThrow("schema");
    expect(() => validateElectronShellManifest({ ...manifest, splash: {} } as never)).toThrow("physical Shell manifest");
    for (const iconDataUrl of ["https://example.test/icon.png", "file:///icon.png", "data:image/svg+xml,<svg/>", "data:image/png;base64,bad"]) {
      expect(() => validateElectronShellManifest({ ...manifest, iconDataUrl })).toThrow("expected an embedded PNG");
    }
  });

  it("validates Capsule appearance separately from immutable OS identity", () => {
    const appearance = validateElectronShellAppearance({ schemaVersion: 1,
      window: { width: 960, height: 640, title: "Electron Foundation" },
      splash: { width: 520, height: 320, minimumVisibleMs: 350, backgroundColor: "#151515", foregroundColor: "#ffffff", mutedColor: "#aaaaaa", initialLabel: "Preparing", readyLabel: "Ready" },
    });
    expect(validateElectronShellAppearance({ ...appearance, splash: { ...appearance.splash, initialLabel: "Updated loading" } }).splash.initialLabel).toBe("Updated loading");
    for (const value of [{ ...appearance, appId: "cannot-replace-identity" }, { ...appearance, schemaVersion: 2 },
      { ...appearance, window: { ...appearance.window, width: 10 } },
      { ...appearance, splash: { ...appearance.splash, minimumVisibleMs: -1 } },
      { ...appearance, splash: { ...appearance.splash, initialLabel: "" } },
      { ...appearance, splash: { ...appearance.splash, backgroundColor: "red" } }]) {
      expect(() => validateElectronShellAppearance(value as never)).toThrow();
    }
  });

  it("does not publish or implement the upstream Sidecar transport", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as {
      dependencies: Record<string, string>;
      exports: Record<string, unknown>;
    };
    const sourceRoot = new URL("../../src/", import.meta.url);
    const sourceNames = (await readdir(sourceRoot, { recursive: true }))
      .filter((name) => name.endsWith(".ts"));
    const sources = await Promise.all(sourceNames.map((name) => readFile(new URL(name, sourceRoot), "utf8")));
    expect(packageJson.dependencies).not.toHaveProperty("@open-design/sidecar");
    expect(packageJson.exports).not.toHaveProperty("./sidecar");
    for (const source of sources) {
      expect(source).not.toMatch(/from ["'](?:@open-design\/sidecar(?:-proto)?|[^"']*apps\/closure|[^"']*tools-)/u);
    }
  });
});
