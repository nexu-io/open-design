import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../config/shell.json" with { type: "json" };

import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { createElectronPackManifest, parseElectronPackRequest } from "../scripts/pack-lifecycle.js";

describe("Electron pack adapter contract", () => {
  it("accepts one finite Shell-owned build request", () => {
    expect(parseElectronPackRequest({
      schemaVersion: 1,
      operation: "electron.pack.build",
      bootstrapUrl: "http://127.0.0.1:43123/bootstrap.json",
      channel: "betahyx",
      installationRoot: resolve(".tmp/installation"),
      namespace: "release-betahyx",
      outputDirectory: resolve(".tmp/output"),
      releaseVersion: "0.21.1-betahyx.7",
    })).toMatchObject({ channel: "betahyx", namespace: "release-betahyx", releaseVersion: "0.21.1-betahyx.7" });
  });

  it("rejects extra fields instead of growing an implicit tools contract", () => {
    expect(() => parseElectronPackRequest({
      schemaVersion: 1,
      operation: "electron.pack.build",
      bootstrapUrl: "http://127.0.0.1/bootstrap.json",
      channel: "betahyx",
      installationRoot: resolve(".tmp/installation"),
      namespace: "release-betahyx",
      outputDirectory: resolve(".tmp/output"),
      releaseVersion: "0.21.1-betahyx.7",
      electronKit: true,
    })).toThrow("fields are invalid");
  });

  it("uses the channel release version without changing Shell compatibility", () => {
    const request = parseElectronPackRequest({
      schemaVersion: 1,
      operation: "electron.pack.build",
      bootstrapUrl: "https://releases.example/betahyx/bootstrap.json",
      channel: "betahyx",
      installationRoot: resolve(".tmp/installation"),
      namespace: "release-betahyx",
      outputDirectory: resolve(".tmp/output"),
      releaseVersion: "0.21.1-betahyx.7",
    });
    const staged = createElectronPackManifest(manifest as ElectronShellManifest, request);
    expect(staged.version).toBe("0.21.1-betahyx.7");
    expect(staged.shell.version).toBe("0.1.0");
    expect(staged.productName).toBe("Open Design Betahyx");
  });
});
