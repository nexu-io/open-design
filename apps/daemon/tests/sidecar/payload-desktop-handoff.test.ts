import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
} from "@open-design/launcher-proto";
import { SIDECAR_SOURCES } from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import {
  executeLegacyPayloadDesktopHandoff,
  prepareLegacyPayloadDesktopHandoff,
} from "../../src/sidecar/payload-desktop-handoff.js";
import { isParentMonitorExitHeld } from "../../src/sidecar/parent-monitor-gate.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-daemon-payload-handoff-"));
  const namespace = "release-beta";
  const version = "1.2.3-beta.5";
  const runtimeRoot = join(root, "namespaces", namespace, "runtime");
  const launcherPaths = resolveLauncherPaths({ channel: "beta", namespace, root });
  const versionPaths = resolveLauncherVersionPaths({ channel: "beta", namespace, root, version });
  const outerBundlePath = join(root, "installed", "Open Design Beta.local.app");
  const outerExecutablePath = join(outerBundlePath, "Contents", "MacOS", "Open Design Beta");
  const payloadExecutablePath = join(versionPaths.payloadRoot, "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta");
  await mkdir(join(outerExecutablePath, ".."), { recursive: true });
  await mkdir(join(payloadExecutablePath, ".."), { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(launcherPaths.stateRoot, { recursive: true });
  await writeFile(outerExecutablePath, "");
  await writeFile(payloadExecutablePath, "");
  await writeFile(versionPaths.manifestPath, JSON.stringify({
    channel: "beta",
    entry: { executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta" },
    namespace,
    platform: "darwin",
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    version,
  }));
  await writeFile(launcherPaths.runtimePath, JSON.stringify({
    active: { generation: 1, version },
    channel: "beta",
    lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  }));
  await writeFile(launcherPaths.attemptsPath, JSON.stringify({
    channel: "beta",
    generation: 1,
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    version,
  }));
  await writeFile(launcherPaths.installPath, JSON.stringify({
    channel: "beta",
    launchPath: outerBundlePath,
    namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
  }));
  return { launcherPaths, namespace, outerExecutablePath, payloadExecutablePath, root, runtimeRoot, version };
}

describe("legacy payload desktop handoff", () => {
  it("uses the explicit outer owner identity rather than inferring it from process ancestry", async () => {
    const value = await fixture();
    try {
      const prepared = await prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(value.root, "data"),
        env: { OD_APP_VERSION: value.version, OD_INSTALLATION_DIR: value.root },
        namespace: value.namespace,
        outerPid: 4321,
        platform: "darwin",
        randomId: () => "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
        requestDesktopStatus: async () => ({
          executablePath: value.outerExecutablePath,
          pid: 4321,
          state: "running",
        }),
        runtimeRoot: value.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });
      expect(prepared).toMatchObject({ kind: "prepared", descriptor: { state: "prepared" } });
      if (prepared.kind !== "prepared") throw new Error("expected prepared handoff");
      expect(prepared.descriptor.outer.pid).toBe(4321);
      expect(prepared.descriptor.outer.pid).not.toBe(process.ppid);

      await writeFile(value.launcherPaths.runtimePath, JSON.stringify({
        active: { generation: 1, version: value.version },
        channel: "beta",
        lastSuccessful: { generation: 1, version: value.version },
        namespace: value.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      }));
      await rm(value.launcherPaths.attemptsPath, { force: true });

      const lifecycleHoldObservations: boolean[] = [];
      const spawn = vi.fn(async () => {
        lifecycleHoldObservations.push(isParentMonitorExitHeld());
        return {
          process: { pid: 7654 },
          stamp: {} as never,
          stop: vi.fn(),
        };
      });
      const requestDesktop = vi.fn(async (message: "shutdown" | "status") =>
        message === "status"
          ? { executablePath: value.outerExecutablePath, pid: 4321, state: "running" }
          : (lifecycleHoldObservations.push(isParentMonitorExitHeld()), { accepted: true }));
      await expect(executeLegacyPayloadDesktopHandoff(prepared, {
        confirmTimeoutMs: 100,
        spawn: spawn as never,
        now: () => new Date("2026-07-15T02:00:00.000Z"),
        requestDesktop,
        sleep: async () => undefined,
        writeJsonFile: async (filePath, payload) => {
          lifecycleHoldObservations.push(isParentMonitorExitHeld());
          await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
        },
      })).resolves.toMatchObject({
        kind: "scheduled",
        target: { generation: 2, version: value.version },
      });

      expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
        command: value.payloadExecutablePath,
        resources: {
          dataRoot: join(value.root, "data"),
          ownerPid: null,
          port: 0,
          runtimeRoot: value.runtimeRoot,
        },
        stamp: {
          app: "desktop",
          channel: "beta",
          mode: "runtime",
          namespace: value.namespace,
          source: "packaged",
        },
      }));
      expect(requestDesktop).toHaveBeenLastCalledWith("shutdown");
      expect(lifecycleHoldObservations).toEqual([true, true, true, true, true]);
      expect(isParentMonitorExitHeld()).toBe(false);
      expect(JSON.parse(await readFile(value.launcherPaths.handoffPath, "utf8"))).toMatchObject({
        state: "armed",
        target: { generation: 2, version: value.version },
      });
    } finally {
      await rm(value.root, { force: true, recursive: true });
    }
  });

  it("retires the launched payload generation when the outer refuses shutdown", async () => {
    const value = await fixture();
    try {
      const prepared = await prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(value.root, "data"),
        env: { OD_APP_VERSION: value.version, OD_INSTALLATION_DIR: value.root },
        namespace: value.namespace,
        outerPid: 4321,
        platform: "darwin",
        requestDesktopStatus: async () => ({
          executablePath: value.outerExecutablePath,
          pid: 4321,
          state: "running",
        }),
        runtimeRoot: value.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });
      if (prepared.kind !== "prepared") throw new Error("expected prepared handoff");
      await writeFile(value.launcherPaths.runtimePath, JSON.stringify({
        active: { generation: 1, version: value.version },
        channel: "beta",
        lastSuccessful: { generation: 1, version: value.version },
        namespace: value.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      }));
      await rm(value.launcherPaths.attemptsPath, { force: true });

      const stop = vi.fn(async () => ({ remainingPids: [] }));
      await expect(executeLegacyPayloadDesktopHandoff(prepared, {
        confirmTimeoutMs: 100,
        requestDesktop: async (message) => {
          if (message === "shutdown") throw new Error("outer refused shutdown");
          return { executablePath: value.outerExecutablePath, pid: 4321, state: "running" };
        },
        sleep: async () => undefined,
        spawn: (async () => ({ process: { pid: 7654 }, stamp: {} as never, stop })) as never,
      })).resolves.toEqual({ kind: "aborted", reason: "shutdown-failed" });
      expect(stop).toHaveBeenCalledWith({ termGraceMs: 0 });
      expect(JSON.parse(await readFile(value.launcherPaths.handoffPath, "utf8"))).toMatchObject({ state: "prepared" });
    } finally {
      await rm(value.root, { force: true, recursive: true });
    }
  });

  it("does not prepare when the exact desktop endpoint reports the payload executable", async () => {
    const value = await fixture();
    try {
      await expect(prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(value.root, "data"),
        env: { OD_APP_VERSION: value.version, OD_INSTALLATION_DIR: value.root },
        namespace: value.namespace,
        outerPid: 4321,
        platform: "darwin",
        requestDesktopStatus: async () => ({
          executablePath: value.payloadExecutablePath,
          pid: 4321,
          state: "running",
        }),
        runtimeRoot: value.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      })).resolves.toEqual({ kind: "none", reason: "payload-desktop-active" });
    } finally {
      await rm(value.root, { force: true, recursive: true });
    }
  });

  it("recognizes the installed outer through a symlinked launcher root", async () => {
    const value = await fixture();
    try {
      const aliasRoot = join(value.root, "launcher-root-alias");
      await symlink(value.root, aliasRoot, "dir");
      await writeFile(value.launcherPaths.installPath, JSON.stringify({
        channel: "beta",
        launchPath: join(aliasRoot, "installed", "Open Design Beta.local.app"),
        namespace: value.namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      }));

      await expect(prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(value.root, "data"),
        env: { OD_APP_VERSION: value.version, OD_INSTALLATION_DIR: aliasRoot },
        namespace: value.namespace,
        outerPid: 4321,
        platform: "darwin",
        requestDesktopStatus: async () => ({
          executablePath: value.outerExecutablePath,
          pid: 4321,
          state: "running",
        }),
        runtimeRoot: value.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      })).resolves.toMatchObject({ kind: "prepared", descriptor: { state: "prepared" } });
    } finally {
      await rm(value.root, { force: true, recursive: true });
    }
  });

  it("does nothing outside the packaged desktop runtime", async () => {
    await expect(prepareLegacyPayloadDesktopHandoff({
      dataRoot: "/tmp/open-design/data",
      env: {},
      namespace: "default",
      outerPid: null,
      platform: "darwin",
      runtimeRoot: "/tmp/open-design/runtime",
      source: SIDECAR_SOURCES.TOOLS_DEV,
    })).resolves.toEqual({ kind: "none", reason: "not-packaged" });
  });

  it("quick-fails packaged handoff when the outer owner identity is absent", async () => {
    const value = await fixture();
    try {
      await expect(prepareLegacyPayloadDesktopHandoff({
        dataRoot: join(value.root, "data"),
        env: { OD_APP_VERSION: value.version, OD_INSTALLATION_DIR: value.root },
        namespace: value.namespace,
        outerPid: null,
        platform: "darwin",
        requestDesktopStatus: async () => ({
          executablePath: value.outerExecutablePath,
          pid: process.ppid,
          state: "running",
        }),
        runtimeRoot: value.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      })).resolves.toEqual({ kind: "none", reason: "invalid-install-anchor" });
    } finally {
      await rm(value.root, { force: true, recursive: true });
    }
  });
});
