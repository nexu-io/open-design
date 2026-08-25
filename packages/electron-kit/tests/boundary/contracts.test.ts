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
});
