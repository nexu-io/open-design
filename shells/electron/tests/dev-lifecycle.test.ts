import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { parseElectronDevLifecycleRequest } from "@/adapters/tools/lifecycle/dev-tool.js";

const controlRuntimeRoot = join(tmpdir(), "electron-dev-control");

describe("Electron dev lifecycle adapter", () => {
  it("accepts the finite start request without raw process authority", () => {
    expect(parseElectronDevLifecycleRequest({
      schemaVersion: 2,
      operation: "electron.dev.start",
      channel: "dev",
      namespace: "isolated-electron",
      controlRuntimeRoot,
      installationInput: { channel: "dev", releaseVersion: "0.1.0-dev.1", channelHeadUrl: "http://127.0.0.1/latest/channel-head.json", contentFile: join(controlRuntimeRoot, "content.json"), trustFile: join(controlRuntimeRoot, "trust.json"), seedFiles: [join(controlRuntimeRoot, "seed.mjs")], capsule: { manifestFile: join(controlRuntimeRoot, "capsule.json"), archiveFile: join(controlRuntimeRoot, "capsule.zip") } },
      installationRoot: join(controlRuntimeRoot, "installation"),
      ownerPid: 42,
    })).toMatchObject({ operation: "electron.dev.start", namespace: "isolated-electron", ownerPid: 42 });
  });

  it("accepts status and stop without acquisition inputs", () => {
    for (const operation of ["electron.dev.inspect", "electron.dev.status", "electron.dev.stop"] as const) {
      expect(parseElectronDevLifecycleRequest({ schemaVersion: 2, operation, channel: "dev", namespace: "isolated-electron", controlRuntimeRoot })).toMatchObject({ operation });
    }
  });

  it("rejects legacy desktop identity and raw argv passthrough", () => {
    expect(() => parseElectronDevLifecycleRequest({ schemaVersion: 2, operation: "desktop.start", channel: "dev", namespace: "isolated-electron", controlRuntimeRoot })).toThrow();
    expect(() => parseElectronDevLifecycleRequest({ schemaVersion: 2, operation: "electron.dev.status", channel: "dev", namespace: "isolated-electron", controlRuntimeRoot, argv: ["--unsafe"] })).toThrow();
  });
});
