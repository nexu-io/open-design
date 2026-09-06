import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../config/shell.json" with { type: "json" };

import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { createElectronPackManifest, parseElectronPackRequest } from "../scripts/pack-lifecycle.js";
import {
  assertElectronDistributionBinding,
  createElectronReleaseManifest,
  createElectronSceneManifest,
  type ElectronReleaseIdentityRegistry,
} from "../src/composition/release-identity.js";

import releaseIdentities from "../config/release-identities.json" with { type: "json" };

describe("Electron pack adapter contract", () => {
  it("keeps the reusable scene product-neutral while binding its source build", () => {
    const staged = createElectronSceneManifest(manifest as ElectronShellManifest, "c".repeat(64));
    expect(staged).toMatchObject({
      appId: manifest.appId,
      channel: manifest.channel,
      executableName: manifest.executableName,
      namespace: manifest.namespace,
      productName: manifest.productName,
      version: manifest.version,
      shell: { buildHash: "c".repeat(64), version: manifest.shell.version },
    });
    expect(staged.shell.digest).not.toBe(manifest.shell.digest);
  });

  it("binds release identity and accepted content to one reusable scene", () => {
    const scene = createElectronSceneManifest(manifest as ElectronShellManifest, "c".repeat(64));
    const release = createElectronReleaseManifest(scene, releaseIdentities as ElectronReleaseIdentityRegistry, {
      channel: "betahyx",
      releaseVersion: "0.21.1-betahyx.7",
    });
    const content = { channel: release.channel, releaseVersion: release.version };

    expect(() => assertElectronDistributionBinding(scene, release, content)).not.toThrow();
    expect(() => assertElectronDistributionBinding(scene, { ...release, shell: { ...release.shell, buildHash: "d".repeat(64) } }, content)).toThrow(/scene Shell binding/u);
    expect(() => assertElectronDistributionBinding(scene, { ...release, shell: { ...release.shell, version: "9.9.9" } }, content)).toThrow(/scene Shell binding/u);
    expect(() => assertElectronDistributionBinding(scene, release, { ...content, channel: "prerelease" })).toThrow(/content differs/u);
    expect(() => assertElectronDistributionBinding(scene, release, { ...content, releaseVersion: "0.21.1-betahyx.8" })).toThrow(/content differs/u);
    expect(release).toMatchObject({
      appId: "io.open-design.betahyx",
      executableName: "open-design-betahyx",
      shell: scene.shell,
    });
    expect(release.appId).not.toBe(scene.appId);
  });

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
    expect(staged.appId).toBe("io.open-design.betahyx");
    expect(staged.executableName).toBe("open-design-betahyx");
  });

  it("fails closed instead of deriving an undeclared channel identity", () => {
    const request = parseElectronPackRequest({
      schemaVersion: 1,
      operation: "electron.pack.build",
      bootstrapUrl: "https://releases.example/unknown/bootstrap.json",
      channel: "unknown",
      installationRoot: resolve(".tmp/installation"),
      namespace: "release-unknown",
      outputDirectory: resolve(".tmp/output"),
      releaseVersion: "0.21.1-unknown.1",
    });
    expect(() => createElectronPackManifest(manifest as ElectronShellManifest, request)).toThrow("release identity declaration is invalid");
  });
});
