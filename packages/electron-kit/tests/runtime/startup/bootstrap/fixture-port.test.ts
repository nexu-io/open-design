import { describe, expect, it } from "vitest";

import { ELECTRON_BOOTSTRAP_SCHEMA_VERSION, ElectronFixtureBootstrapPort, validateElectronBootstrapResult } from "@/runtime/startup/bootstrap/index.js";

const request = {
  schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
  correlationId: "bootstrap-test",
  scope: { channel: "dev", namespace: "electron" },
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
  releaseVersion: "0.1.0",
} as const;

describe("Electron fixture bootstrap", () => {
  it("returns one correlated, scoped generation descriptor", async () => {
    const result = await new ElectronFixtureBootstrapPort().resolve(request);
    expect(result).toMatchObject({ correlationId: request.correlationId, generation: { channel: "dev", releaseVersion: "0.1.0" } });
  });

  it("rejects a stale correlation", async () => {
    const result = await new ElectronFixtureBootstrapPort().resolve(request);
    expect(() => validateElectronBootstrapResult(request, { ...result, correlationId: "stale" })).toThrow(/correlation/u);
  });
});
