import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseElectronRuntimeLifecycleRequest } from "../scripts/runtime-lifecycle.js";

describe("Electron runtime adapter contract", () => {
  it("keeps native Electron arguments explicit", () => {
    expect(parseElectronRuntimeLifecycleRequest({
      schemaVersion: 1,
      operation: "electron.runtime.start",
      appPath: resolve(".tmp/open-design.app"),
      argv: ["--remote-debugging-port=0"],
      channel: "dev",
      controlRuntimeRoot: resolve(".tmp/control"),
      executablePath: resolve(".tmp/open-design.app/Contents/MacOS/open-design"),
      logPath: resolve(".tmp/logs/electron.log"),
      namespace: "electron-runtime-test",
      runtimeRoot: resolve(".tmp/runtime"),
    })).toMatchObject({
      operation: "electron.runtime.start",
      argv: ["--remote-debugging-port=0"],
    });
  });

  it("accepts finite status and stop requests", () => {
    for (const operation of ["electron.runtime.inspect", "electron.runtime.status", "electron.runtime.stop"] as const) {
      expect(parseElectronRuntimeLifecycleRequest({
        schemaVersion: 1,
        operation,
        channel: "betahyx",
        controlRuntimeRoot: resolve(".tmp/control"),
        namespace: "release-betahyx-mac",
      })).toEqual({ schemaVersion: 1, operation, channel: "betahyx", namespace: "release-betahyx-mac", controlRuntimeRoot: resolve(".tmp/control") });
    }
  });

  it("rejects implicit tools-owned launch controls", () => {
    expect(() => parseElectronRuntimeLifecycleRequest({
      schemaVersion: 1,
      operation: "electron.runtime.status",
      channel: "dev",
      namespace: "electron-runtime-test",
      electronKit: true,
    })).toThrow("fields are invalid");
  });
});
