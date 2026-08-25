import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ELECTRON_CLOSURE_ENDPOINTS,
  assertElectronClosureEndpoint,
  validateElectronShellManifest,
} from "@/boundary/index.js";

const hash = "a".repeat(64);

describe("Electron/Closure boundary", () => {
  it("is finite and rejects unknown endpoints", () => {
    expect(ELECTRON_CLOSURE_ENDPOINTS).toHaveLength(13);
    expect(assertElectronClosureEndpoint("lifecycle.awaitReady")).toBe("lifecycle.awaitReady");
    expect(() => assertElectronClosureEndpoint("closure.invokeAnything")).toThrow(/unknown Electron\/Closure endpoint/u);
  });

  it("requires Shell identity to match the manifest", () => {
    expect(validateElectronShellManifest({
      schemaVersion: 1,
      appId: "io.nexu.electron-foundation",
      productName: "Electron Foundation",
      executableName: "electron-foundation",
      version: "0.1.0",
      channel: "dev",
      namespace: "electron-foundation",
      protocol: "od",
      window: { width: 960, height: 640, title: "Electron Foundation" },
      shell: { type: "electron", version: "0.1.0", buildHash: hash, digest: hash },
    }).namespace).toBe("electron-foundation");
  });

  it("keeps generic Sidecar control free of product messages", async () => {
    const source = await Promise.all([
      readFile(new URL("../../src/sidecar/contracts.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/sidecar/control.ts", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n"));
    expect(source).toContain('@open-design/sidecar"');
    expect(source).not.toMatch(/sidecar-proto|SIDECAR_MESSAGES|apps\/web|apps\/daemon/u);
  });
});
