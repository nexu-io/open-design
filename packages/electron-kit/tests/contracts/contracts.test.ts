import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ELECTRON_FIXTURE_ENDPOINTS,
  assertElectronFixtureEndpoint,
  validateElectronShellManifest,
} from "@/contracts/index.js";

const hash = "a".repeat(64);

describe("Electron integration boundary", () => {
  it("labels the phase-one fixture surface and rejects unknown endpoints", () => {
    expect(ELECTRON_FIXTURE_ENDPOINTS).toHaveLength(13);
    expect(assertElectronFixtureEndpoint("lifecycle.awaitReady")).toBe("lifecycle.awaitReady");
    expect(() => assertElectronFixtureEndpoint("closure.invokeAnything")).toThrow(/unknown Electron fixture endpoint/u);
  });

  it("requires Shell identity to match the manifest", () => {
    expect(validateElectronShellManifest({
      schemaVersion: 1,
      appId: "io.nexu.electron-foundation",
      productName: "Electron Foundation",
      publisher: "Example Company",
      executableName: "electron-foundation",
      version: "0.1.0",
      channel: "dev",
      namespace: "electron-foundation",
      protocol: "od",
      window: { width: 960, height: 640, title: "Electron Foundation" },
      shell: { type: "electron", version: "0.1.0", buildHash: hash, digest: hash },
    }).namespace).toBe("electron-foundation");
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
