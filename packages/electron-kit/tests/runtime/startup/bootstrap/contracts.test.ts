import { describe, expect, it } from "vitest";

import { ELECTRON_BOOTSTRAP_SCHEMA_VERSION, validateElectronBootstrapResult } from "@/runtime/startup/bootstrap/index.js";

const request = {
  schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
  correlationId: "bootstrap-test",
  scope: { channel: "dev", namespace: "electron" },
  shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64), digest: "b".repeat(64) },
  releaseVersion: "0.1.0",
} as const;

const result = {
  schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
  correlationId: request.correlationId,
  readinessTimeoutMs: 15_000,
  generation: {
    schemaVersion: 4 as const,
    id: "c".repeat(64),
    channel: request.scope.channel,
    releaseVersion: request.releaseVersion,
    standaloneVersion: "0.1.0",
    sourceCommit: "d".repeat(40),
    minimumShellVersions: { electron: request.shell.version },
    launcher: {
      protocol: "standalone-launcher-v1" as const,
      resourceId: "standalone-launcher",
      blobSha256: "e".repeat(64),
      entrypoint: "launcher.mjs",
      path: "/installed/launcher.mjs",
    },
    resources: {},
  },
};

describe("Electron bootstrap contract", () => {
  it("accepts one correlated, scoped generation descriptor", () => {
    expect(validateElectronBootstrapResult(request, result)).toMatchObject({
      correlationId: request.correlationId,
      generation: { channel: "dev", releaseVersion: "0.1.0" },
    });
  });

  it("rejects a stale correlation", () => {
    expect(() => validateElectronBootstrapResult(request, { ...result, correlationId: "stale" })).toThrow(/correlation/u);
  });
});
