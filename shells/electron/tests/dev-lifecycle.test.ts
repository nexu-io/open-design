import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { parseElectronDevLifecycleRequest } from "../scripts/dev-lifecycle.ts";

const controlRuntimeRoot = join(tmpdir(), "electron-dev-control");

describe("Electron dev lifecycle adapter", () => {
  it("accepts the finite start request without raw process authority", () => {
    expect(parseElectronDevLifecycleRequest({
      schemaVersion: 1,
      operation: "electron.dev.start",
      channel: "dev",
      namespace: "isolated-electron",
      controlRuntimeRoot,
      bootstrapUrl: "http://127.0.0.1:3000/dev/bootstrap.json",
      installationRoot: join(controlRuntimeRoot, "installation"),
      ownerPid: 42,
    })).toMatchObject({ operation: "electron.dev.start", namespace: "isolated-electron", ownerPid: 42 });
  });

  it("accepts status and stop without acquisition inputs", () => {
    for (const operation of ["electron.dev.inspect", "electron.dev.status", "electron.dev.stop"] as const) {
      expect(parseElectronDevLifecycleRequest({ schemaVersion: 1, operation, channel: "dev", namespace: "isolated-electron", controlRuntimeRoot })).toMatchObject({ operation });
    }
  });

  it("rejects legacy desktop identity and raw argv passthrough", () => {
    expect(() => parseElectronDevLifecycleRequest({ schemaVersion: 1, operation: "desktop.start", channel: "dev", namespace: "isolated-electron", controlRuntimeRoot })).toThrow();
    expect(() => parseElectronDevLifecycleRequest({ schemaVersion: 1, operation: "electron.dev.status", channel: "dev", namespace: "isolated-electron", controlRuntimeRoot, argv: ["--unsafe"] })).toThrow();
  });
});
