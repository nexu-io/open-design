import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LAUNCHER_SCHEMA_VERSION,
  LauncherProtocolError,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  selectLauncherRuntimeTarget,
  validateLauncherRuntimeDescriptor,
  type LauncherRuntimeDescriptor,
} from "../src/index.js";

const root = process.platform === "win32" ? "C:\\od-data" : "/tmp/od-data";

describe("launcher protocol paths", () => {
  it("resolves channel and namespace scoped launcher paths under the provided root", () => {
    const paths = resolveLauncherPaths({ channel: "beta", namespace: "release-beta", root });

    expect(paths.namespaceRoot).toBe(join(root, "launcher", "channels", "beta", "namespaces", "release-beta"));
    expect(paths.runtimePath).toBe(join(paths.namespaceRoot, "runtime.json"));
    expect(paths.installPath).toBe(join(paths.namespaceRoot, "install.json"));
    expect(paths.downloadsRoot).toBe(join(paths.namespaceRoot, "updates", "downloads"));
    expect(paths.stagingRoot).toBe(join(paths.namespaceRoot, "updates", "staging"));
    expect(paths.releasesRoot).toBe(join(paths.namespaceRoot, "updates", "releases"));
  });

  it("resolves payload version paths without allowing path traversal", () => {
    const paths = resolveLauncherVersionPaths({
      channel: "beta",
      namespace: "release-beta",
      root,
      version: "0.8.1-beta.2",
    });

    expect(paths.versionRoot).toBe(join(root, "launcher", "channels", "beta", "namespaces", "release-beta", "versions", "0.8.1-beta.2"));
    expect(paths.payloadRoot).toBe(join(paths.versionRoot, "payload"));
    expect(paths.manifestPath).toBe(join(paths.versionRoot, "manifest.json"));
  });

  it("rejects unsafe roots, namespaces, channels, and version path segments", () => {
    expect(() => resolveLauncherPaths({ channel: "beta", namespace: "../escape", root })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherPaths({ channel: "canary", namespace: "release-beta", root })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherPaths({ channel: "beta", namespace: "release-beta", root: "relative" })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherVersionPaths({ channel: "beta", namespace: "release-beta", root, version: "../0.8.1" })).toThrow(LauncherProtocolError);
    expect(() => resolveLauncherVersionPaths({ channel: "beta", namespace: "release-beta", root, version: "0.8..1" })).toThrow(LauncherProtocolError);
  });
});

describe("launcher runtime descriptors", () => {
  const runtime: LauncherRuntimeDescriptor = {
    active: { generation: 2, version: "0.8.1-beta.2" },
    channel: "beta",
    lastSuccessful: { generation: 1, version: "0.8.1-beta.1" },
    namespace: "release-beta",
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  };

  it("validates channel and namespace before a runtime descriptor is trusted", () => {
    expect(validateLauncherRuntimeDescriptor(runtime, { channel: "beta", namespace: "release-beta" })).toEqual(runtime);
    expect(() => validateLauncherRuntimeDescriptor(runtime, { channel: "stable", namespace: "release-beta" })).toThrow(LauncherProtocolError);
    expect(() => validateLauncherRuntimeDescriptor(runtime, { channel: "beta", namespace: "release-preview" })).toThrow(LauncherProtocolError);
  });

  it("selects active unless the active generation already has an unconfirmed attempt", () => {
    expect(selectLauncherRuntimeTarget({ runtime })).toEqual({
      pointer: { generation: 2, version: "0.8.1-beta.2" },
      reason: "active",
      selected: true,
    });

    expect(
      selectLauncherRuntimeTarget({
        attempted: {
          channel: "beta",
          generation: 2,
          namespace: "release-beta",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "0.8.1-beta.2",
        },
        runtime,
      }),
    ).toEqual({
      pointer: { generation: 1, version: "0.8.1-beta.1" },
      reason: "last-successful",
      selected: true,
    });
  });

  it("falls back cleanly when no active runtime target exists", () => {
    expect(selectLauncherRuntimeTarget({
      runtime: {
        ...runtime,
        active: null,
      },
    })).toEqual({
      pointer: { generation: 1, version: "0.8.1-beta.1" },
      reason: "last-successful",
      selected: true,
    });

    expect(selectLauncherRuntimeTarget({
      runtime: {
        ...runtime,
        active: null,
        lastSuccessful: null,
      },
    })).toEqual({ reason: "no-runtime-target", selected: false });
  });
});
