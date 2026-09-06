import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  validateElectronShellManifest,
} from "@/contracts/index.js";

const hash = "a".repeat(64);

describe("Electron integration boundary", () => {
  it("keeps channel release identity independent from Shell compatibility", () => {
    const manifest = validateElectronShellManifest({
      schemaVersion: 1,
      appId: "io.nexu.electron-foundation",
      productName: "Electron Foundation",
      publisher: "Example Company",
      executableName: "electron-foundation",
      version: "0.1.0-dev.7",
      channel: "dev",
      namespace: "electron-foundation",
      protocol: "od",
      window: { width: 960, height: 640, title: "Electron Foundation" },
      splash: { width: 520, height: 320, minimumVisibleMs: 350, backgroundColor: "#151515", foregroundColor: "#ffffff", mutedColor: "#aaaaaa", initialLabel: "Preparing", readyLabel: "Ready" },
      shell: { type: "electron", version: "0.1.0", buildHash: hash, digest: hash },
    });
    expect(manifest).toMatchObject({ namespace: "electron-foundation", version: "0.1.0-dev.7", shell: { version: "0.1.0" } });
    for (const iconDataUrl of ["https://example.test/icon.png", "file:///icon.png", "data:image/svg+xml,<svg/>", "data:image/png;base64,bad"]) {
      expect(() => validateElectronShellManifest({ ...manifest, iconDataUrl })).toThrow("expected an embedded PNG");
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
