import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LAUNCHER_SCHEMA_VERSION,
  LauncherProtocolError,
  buildLauncherAfterQuitArgs,
  buildLauncherDelegatedArgs,
  buildLauncherHandoffResumeArgs,
  compareLauncherVersions,
  parseLauncherAfterQuitArgs,
  parseLauncherDelegatedArgs,
  parseLauncherHandoffResumeArgs,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  selectLauncherRuntimeTarget,
  validateLauncherCleanupDescriptor,
  validateLauncherDesktopHandoffDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherCleanupDescriptor,
  type LauncherDesktopHandoffDescriptor,
  type LauncherRuntimeDescriptor,
} from "../src/index.js";

const root = process.platform === "win32" ? "C:\\od-data" : "/tmp/od-data";

describe("launcher protocol paths", () => {
  it("resolves channel and namespace scoped launcher paths under the provided root", () => {
    const paths = resolveLauncherPaths({ channel: "beta", namespace: "release-beta", root });

    expect(paths.namespaceRoot).toBe(join(root, "launcher", "channels", "beta", "namespaces", "release-beta"));
    expect(paths.runtimePath).toBe(join(paths.namespaceRoot, "runtime.json"));
    expect(paths.installPath).toBe(join(paths.namespaceRoot, "install.json"));
    expect(paths.handoffPath).toBe(join(paths.namespaceRoot, "state", "desktop-handoff.json"));
    expect(paths.downloadsRoot).toBe(join(paths.namespaceRoot, "updates", "downloads"));
    expect(paths.stagingRoot).toBe(join(paths.namespaceRoot, "updates", "staging"));
    expect(paths.releasesRoot).toBe(join(paths.namespaceRoot, "updates", "releases"));
  });

  it("resolves the self-hosted betas launcher channel", () => {
    const paths = resolveLauncherPaths({ channel: "betas", namespace: "release-betas-win", root });

    expect(paths.namespaceRoot).toBe(join(root, "launcher", "channels", "betas", "namespaces", "release-betas-win"));
    expect(paths.runtimePath).toBe(join(paths.namespaceRoot, "runtime.json"));
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

describe("launcher handoff resume argv", () => {
  it("round-trips one opaque handoff id", () => {
    const args = buildLauncherHandoffResumeArgs({ handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c" });

    expect(parseLauncherHandoffResumeArgs(args)).toEqual({
      handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
    });
  });

  it("rejects missing or unsafe handoff ids", () => {
    expect(parseLauncherHandoffResumeArgs(["--other"])).toBeNull();
    expect(() => parseLauncherHandoffResumeArgs(["--od-launcher-resume-handoff"])).toThrow(LauncherProtocolError);
    expect(() => buildLauncherHandoffResumeArgs({ handoffId: "../handoff" })).toThrow(LauncherProtocolError);
  });
});

describe("launcher after-quit argv", () => {
  it("round-trips the target pid and timeout through stable launcher args", () => {
    const args = buildLauncherAfterQuitArgs({ targetPid: 1234, timeoutMs: 600000 });

    expect(parseLauncherAfterQuitArgs(args)).toEqual({ targetPid: 1234, timeoutMs: 600000 });
  });

  it("returns null when after-quit mode is absent", () => {
    expect(parseLauncherAfterQuitArgs(["--other"])).toBeNull();
  });

  it("rejects malformed after-quit values", () => {
    expect(() => parseLauncherAfterQuitArgs(["--od-launcher-after-quit"])).toThrow(LauncherProtocolError);
    expect(() => buildLauncherAfterQuitArgs({ targetPid: 0, timeoutMs: 1 })).toThrow(LauncherProtocolError);
    expect(() => buildLauncherAfterQuitArgs({ targetPid: 1, timeoutMs: -1 })).toThrow(LauncherProtocolError);
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

    expect(
      selectLauncherRuntimeTarget({
        attempted: {
          channel: "beta",
          generation: 2,
          namespace: "release-beta",
          schemaVersion: LAUNCHER_SCHEMA_VERSION,
          version: "0.8.1-beta.2",
        },
        resume: { generation: 2, version: "0.8.1-beta.2" },
        runtime,
      }),
    ).toEqual({
      pointer: { generation: 2, version: "0.8.1-beta.2" },
      reason: "active-resume",
      selected: true,
    });
  });

  it("treats a delegated pre-armed attempt as the launch in progress, not a failed launch", () => {
    // The delegating parent (outer or updater relaunch) arms attempt.json
    // BEFORE spawning the payload so a payload that dies before reaching its
    // own bookkeeping still leaves rollback evidence. The spawned payload
    // carries the delegated pointer and must not mistake that fresh attempt
    // for a previous failed launch.
    const attempted = {
      channel: "beta",
      generation: 2,
      namespace: "release-beta",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "0.8.1-beta.2",
    } as const;

    expect(
      selectLauncherRuntimeTarget({
        attempted,
        delegated: { generation: 2, version: "0.8.1-beta.2" },
        runtime,
      }),
    ).toEqual({
      pointer: { generation: 2, version: "0.8.1-beta.2" },
      reason: "active-delegated",
      selected: true,
    });

    // A stale delegated pointer from an older generation must not defeat the
    // rollback: only an exact active match is the launch in progress.
    expect(
      selectLauncherRuntimeTarget({
        attempted,
        delegated: { generation: 1, version: "0.8.1-beta.1" },
        runtime,
      }),
    ).toEqual({
      pointer: { generation: 1, version: "0.8.1-beta.1" },
      reason: "last-successful",
      selected: true,
    });

    // Without a matching attempt the delegated pointer is irrelevant.
    expect(
      selectLauncherRuntimeTarget({
        delegated: { generation: 2, version: "0.8.1-beta.2" },
        runtime,
      }),
    ).toEqual({
      pointer: { generation: 2, version: "0.8.1-beta.2" },
      reason: "active",
      selected: true,
    });
  });

  it("round-trips launcher delegated argv", () => {
    const args = buildLauncherDelegatedArgs({ generation: 2, version: "0.8.1-beta.2" });
    expect(parseLauncherDelegatedArgs(["node", "app", ...args])).toEqual({
      generation: 2,
      version: "0.8.1-beta.2",
    });
    expect(parseLauncherDelegatedArgs(["node", "app"])).toBeNull();
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

describe("launcher desktop handoff descriptors", () => {
  const prepared: LauncherDesktopHandoffDescriptor = {
    channel: "beta",
    createdAt: "2026-07-15T01:00:00.000Z",
    handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
    namespace: "release-beta",
    outer: {
      executablePath: process.platform === "win32" ? "C:\\Program Files\\Open Design Beta\\Open Design Beta.exe" : "/Applications/Open Design Beta.app/Contents/MacOS/Open Design Beta",
      pid: 4321,
    },
    payloadExecutablePath: process.platform === "win32" ? "C:\\od-data\\payload\\Open Design Beta.exe" : "/tmp/od-data/payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
    previous: { generation: 0, version: "0.8.1-beta.1" },
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    source: { generation: 1, version: "0.8.1-beta.2" },
    state: "prepared",
    updatedAt: "2026-07-15T01:00:00.000Z",
  };

  it("validates prepared, armed, and confirmed recovery state", () => {
    expect(validateLauncherDesktopHandoffDescriptor(prepared, {
      channel: "beta",
      namespace: "release-beta",
    })).toEqual(prepared);

    expect(validateLauncherDesktopHandoffDescriptor({
      ...prepared,
      state: "armed",
      target: { generation: 2, version: "0.8.1-beta.2" },
    }, {
      channel: "beta",
      namespace: "release-beta",
    })).toMatchObject({
      state: "armed",
      target: { generation: 2, version: "0.8.1-beta.2" },
    });

    expect(validateLauncherDesktopHandoffDescriptor({
      ...prepared,
      source: { generation: 2, version: "0.8.1-beta.2" },
      state: "confirmed",
      target: { generation: 2, version: "0.8.1-beta.2" },
    }, {
      channel: "beta",
      namespace: "release-beta",
    })).toMatchObject({
      source: { generation: 2, version: "0.8.1-beta.2" },
      state: "confirmed",
      target: { generation: 2, version: "0.8.1-beta.2" },
    });
  });

  it("rejects an armed handoff without a target and mismatched identity", () => {
    expect(() => validateLauncherDesktopHandoffDescriptor({
      ...prepared,
      state: "armed",
    }, {
      channel: "beta",
      namespace: "release-beta",
    })).toThrow(LauncherProtocolError);
    expect(() => validateLauncherDesktopHandoffDescriptor(prepared, {
      channel: "stable",
      namespace: "release-beta",
    })).toThrow(LauncherProtocolError);
  });
});

describe("launcher cleanup descriptors", () => {
  const cleanup: LauncherCleanupDescriptor = {
    channel: "beta",
    currentVersion: "0.8.1-beta.3",
    namespace: "release-beta",
    updatedAt: "2026-06-18T00:00:00.000Z",
    version: LAUNCHER_SCHEMA_VERSION,
    versions: [
      {
        generation: 2,
        reason: "older-than-bound-package",
        state: "deprecated",
        updatedAt: "2026-06-18T00:00:00.000Z",
        version: "0.8.1-beta.2",
      },
      {
        generation: 0,
        reason: "current-bound-package",
        state: "retained",
        updatedAt: "2026-06-18T00:00:00.000Z",
        version: "0.8.1-beta.3",
      },
    ],
  };

  it("validates channel, namespace, states, reasons, and version path segments", () => {
    expect(validateLauncherCleanupDescriptor(cleanup, { channel: "beta", namespace: "release-beta" })).toEqual(cleanup);
    expect(() => validateLauncherCleanupDescriptor(cleanup, { channel: "stable", namespace: "release-beta" })).toThrow(LauncherProtocolError);
    expect(() => validateLauncherCleanupDescriptor({
      ...cleanup,
      versions: [{ ...cleanup.versions[0]!, version: "../0.8.1-beta.2" }],
    }, { channel: "beta", namespace: "release-beta" })).toThrow(LauncherProtocolError);
  });
});

describe("launcher version comparison", () => {
  it("orders stable, prerelease, beta nightly, and dotted nightly versions", () => {
    expect(compareLauncherVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareLauncherVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareLauncherVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBe(1);
    expect(compareLauncherVersions("1.0.0-beta-nightly.2", "1.0.0-beta-nightly.1")).toBe(1);
    expect(compareLauncherVersions("1.0.0-nightly.10", "1.0.0-nightly.2")).toBe(1);
    expect(compareLauncherVersions("1.0.0.nightly.2", "1.0.0.nightly.1")).toBe(1);
    expect(compareLauncherVersions("1.0.0", "1.0.0-beta.9")).toBe(1);
    expect(compareLauncherVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
  });
});
