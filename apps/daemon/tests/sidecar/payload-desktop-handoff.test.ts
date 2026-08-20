import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  parseLauncherAfterQuitArgs,
  parseLauncherHandoffResumeArgs,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
} from "@open-design/launcher-proto";
import { readProcessStamp } from "@open-design/platform";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import {
  executeLegacyPayloadDesktopHandoff,
  prepareLegacyPayloadDesktopHandoff,
} from "../../src/sidecar/payload-desktop-handoff.js";

describe("legacy payload desktop handoff", () => {
  it("captures the real previous pointer before old outer confirm, then arms and launches payload desktop", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-daemon-payload-handoff-"));
    try {
      const namespace = "release-beta";
      const runtimeRoot = join(root, "namespaces", namespace, "runtime");
      const launcherPaths = resolveLauncherPaths({ channel: "beta", namespace, root });
      const versionPaths = resolveLauncherVersionPaths({
        channel: "beta",
        namespace,
        root,
        version: "1.2.3-beta.5",
      });
      const outerExecutablePath = join(root, "installed", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta");
      const payloadExecutablePath = join(
        versionPaths.payloadRoot,
        "Open Design Beta.app",
        "Contents",
        "MacOS",
        "Open Design Beta",
      );
      await mkdir(join(payloadExecutablePath, ".."), { recursive: true });
      await mkdir(join(outerExecutablePath, ".."), { recursive: true });
      await mkdir(runtimeRoot, { recursive: true });
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(payloadExecutablePath, "");
      await writeFile(outerExecutablePath, "");
      await writeFile(versionPaths.manifestPath, `${JSON.stringify({
        channel: "beta",
        entry: {
          cwd: "payload/Open Design Beta.app",
          executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
        },
        namespace,
        payloadRoot: "payload",
        platform: "darwin",
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version: "1.2.3-beta.5",
      })}\n`);
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 1, version: "1.2.3-beta.5" },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      await writeFile(launcherPaths.attemptsPath, `${JSON.stringify({
        channel: "beta",
        generation: 1,
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version: "1.2.3-beta.5",
      })}\n`);
      await writeFile(launcherPaths.installPath, `${JSON.stringify({
        channel: "beta",
        launchPath: join(root, "installed", "Open Design Beta.app"),
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);

      const prepared = await prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: "1.2.3-beta.5",
          OD_INSTALLATION_DIR: root,
        },
        namespace,
        parentPid: 4321,
        platform: "darwin",
        randomId: () => "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
        runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(prepared.kind).toBe("prepared");
      expect(JSON.parse(await readFile(launcherPaths.handoffPath, "utf8"))).toMatchObject({
        previous: { generation: 0, version: "1.2.3-beta.4" },
        source: { generation: 1, version: "1.2.3-beta.5" },
        state: "prepared",
      });

      await writeFile(join(runtimeRoot, "desktop-root.json"), `${JSON.stringify({
        executablePath: outerExecutablePath,
        pid: 4321,
        stamp: {
          app: APP_KEYS.DESKTOP,
          ipc: "/tmp/open-design/ipc/release-beta/desktop.sock",
          mode: "runtime",
          namespace,
          source: SIDECAR_SOURCES.PACKAGED,
        },
        version: 1,
      })}\n`);

      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 1, version: "1.2.3-beta.5" },
        channel: "beta",
        lastSuccessful: { generation: 1, version: "1.2.3-beta.5" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      await rm(launcherPaths.attemptsPath, { force: true });

      const child = {
        once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "spawn") queueMicrotask(callback);
          return child;
        }),
        unref: vi.fn(),
      };
      let launchedArgs: string[] = [];
      let launchedEnv: NodeJS.ProcessEnv | undefined;
      const spawn = vi.fn((_command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
        launchedArgs = args;
        launchedEnv = options.env;
        return child;
      });
      const requestDesktop = vi.fn(async (message: "shutdown" | "status") => (
        message === "status"
          ? { pid: 4321, state: "running" }
          : { accepted: true }
      ));
      if (prepared.kind !== "prepared") throw new Error("expected prepared handoff");
      const result = await executeLegacyPayloadDesktopHandoff(prepared, {
        confirmTimeoutMs: 100,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          OD_SIDECAR_BASE: runtimeRoot,
          PATH: "/usr/bin",
        },
        now: () => new Date("2026-07-15T02:00:00.000Z"),
        requestDesktop,
        sleep: async () => undefined,
        spawn: spawn as never,
      });

      expect(result).toMatchObject({
        kind: "scheduled",
        target: { generation: 2, version: "1.2.3-beta.5" },
      });
      expect(JSON.parse(await readFile(launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 2, version: "1.2.3-beta.5" },
        lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
      });
      expect(JSON.parse(await readFile(launcherPaths.attemptsPath, "utf8"))).toMatchObject({
        generation: 2,
        version: "1.2.3-beta.5",
      });
      expect(JSON.parse(await readFile(launcherPaths.handoffPath, "utf8"))).toMatchObject({
        state: "armed",
        target: { generation: 2, version: "1.2.3-beta.5" },
      });
      expect(spawn).toHaveBeenCalledOnce();
      expect(launchedEnv).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
      expect(launchedEnv).not.toHaveProperty("OD_SIDECAR_BASE");
      expect(launchedEnv).toMatchObject({
        OD_PACKAGED_NAMESPACE_BASE_ROOT: join(root, "namespaces"),
        PATH: "/usr/bin",
      });
      expect(parseLauncherAfterQuitArgs(launchedArgs)).toEqual({ targetPid: 4321, timeoutMs: 60_000 });
      expect(parseLauncherHandoffResumeArgs(launchedArgs)).toEqual({
        handoffId: "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
      });
      expect(readProcessStamp(launchedArgs, OPEN_DESIGN_SIDECAR_CONTRACT)).toMatchObject({
        app: APP_KEYS.DESKTOP,
        namespace,
        source: SIDECAR_SOURCES.PACKAGED,
      });
      expect(requestDesktop).toHaveBeenLastCalledWith("shutdown");

      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 2, version: "1.2.3-beta.5" },
        channel: "beta",
        lastSuccessful: { generation: 2, version: "1.2.3-beta.5" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      await rm(launcherPaths.attemptsPath, { force: true });
      await writeFile(launcherPaths.handoffPath, `${JSON.stringify({
        ...JSON.parse(await readFile(launcherPaths.handoffPath, "utf8")),
        source: { generation: 2, version: "1.2.3-beta.5" },
        state: "confirmed",
        target: { generation: 2, version: "1.2.3-beta.5" },
      })}\n`);
      await writeFile(join(runtimeRoot, "desktop-root.json"), `${JSON.stringify({
        executablePath: outerExecutablePath,
        pid: 4321,
        stamp: {
          app: APP_KEYS.DESKTOP,
          ipc: "/tmp/open-design/ipc/release-beta/desktop.sock",
          mode: "runtime",
          namespace,
          source: SIDECAR_SOURCES.TOOLS_PACK,
        },
        version: 1,
      })}\n`);

      const coldStart = await prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: "1.2.3-beta.5",
          OD_INSTALLATION_DIR: root,
        },
        namespace,
        now: () => new Date("2026-07-15T03:00:00.000Z"),
        parentPid: 4321,
        platform: "darwin",
        randomId: () => "e7e48cc4-7334-4d99-ab8e-830b2360dff0",
        runtimeRoot,
        source: SIDECAR_SOURCES.TOOLS_PACK,
      });

      expect(coldStart).toMatchObject({
        descriptor: {
          handoffId: "e7e48cc4-7334-4d99-ab8e-830b2360dff0",
          previous: { generation: 0, version: "1.2.3-beta.4" },
          source: { generation: 2, version: "1.2.3-beta.5" },
          state: "prepared",
        },
        kind: "prepared",
      });
      if (coldStart.kind !== "prepared") throw new Error("expected cold-start handoff");
      expect(coldStart.descriptor).not.toHaveProperty("target");
      spawn.mockClear();
      await expect(executeLegacyPayloadDesktopHandoff(coldStart, {
        confirmTimeoutMs: 100,
        env: { PATH: "/usr/bin" },
        now: () => new Date("2026-07-15T03:00:01.000Z"),
        requestDesktop,
        sleep: async () => undefined,
        spawn: spawn as never,
      })).resolves.toMatchObject({
        kind: "scheduled",
        target: { generation: 3, version: "1.2.3-beta.5" },
      });
      expect(spawn).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  async function armedHandoffFixture(): Promise<{
    launcherPaths: ReturnType<typeof resolveLauncherPaths>;
    prepared: Extract<
      Awaited<ReturnType<typeof prepareLegacyPayloadDesktopHandoff>>,
      { kind: "prepared" }
    >;
    root: string;
  }> {
    const root = await mkdtemp(join(tmpdir(), "od-daemon-payload-handoff-fail-"));
    const namespace = "release-beta";
    const runtimeRoot = join(root, "namespaces", namespace, "runtime");
    const launcherPaths = resolveLauncherPaths({ channel: "beta", namespace, root });
    const versionPaths = resolveLauncherVersionPaths({
      channel: "beta",
      namespace,
      root,
      version: "1.2.3-beta.5",
    });
    const outerExecutablePath = join(root, "installed", "Open Design Beta.app", "Contents", "MacOS", "Open Design Beta");
    const payloadExecutablePath = join(
      versionPaths.payloadRoot,
      "Open Design Beta.app",
      "Contents",
      "MacOS",
      "Open Design Beta",
    );
    await mkdir(join(payloadExecutablePath, ".."), { recursive: true });
    await mkdir(join(outerExecutablePath, ".."), { recursive: true });
    await mkdir(runtimeRoot, { recursive: true });
    await mkdir(launcherPaths.stateRoot, { recursive: true });
    await writeFile(payloadExecutablePath, "");
    await writeFile(outerExecutablePath, "");
    await writeFile(versionPaths.manifestPath, `${JSON.stringify({
      channel: "beta",
      entry: {
        cwd: "payload/Open Design Beta.app",
        executable: "payload/Open Design Beta.app/Contents/MacOS/Open Design Beta",
      },
      namespace,
      payloadRoot: "payload",
      platform: "darwin",
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "1.2.3-beta.5",
    })}\n`);
    await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
      active: { generation: 1, version: "1.2.3-beta.5" },
      channel: "beta",
      lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
      namespace,
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    })}\n`);
    await writeFile(launcherPaths.attemptsPath, `${JSON.stringify({
      channel: "beta",
      generation: 1,
      namespace,
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
      version: "1.2.3-beta.5",
    })}\n`);
    await writeFile(launcherPaths.installPath, `${JSON.stringify({
      channel: "beta",
      launchPath: join(root, "installed", "Open Design Beta.app"),
      namespace,
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    })}\n`);

    const prepared = await prepareLegacyPayloadDesktopHandoff({
      env: {
        OD_APP_VERSION: "1.2.3-beta.5",
        OD_INSTALLATION_DIR: root,
      },
      namespace,
      parentPid: 4321,
      platform: "darwin",
      randomId: () => "f5d4a712-8ba9-4c28-bcad-6dbed5db2d7c",
      runtimeRoot,
      source: SIDECAR_SOURCES.PACKAGED,
    });
    if (prepared.kind !== "prepared") throw new Error("expected prepared handoff");

    // Simulate the old outer confirming: the launcher promoted lastSuccessful to
    // the payload source and cleared the pending attempt.
    await writeFile(join(runtimeRoot, "desktop-root.json"), `${JSON.stringify({
      executablePath: outerExecutablePath,
      pid: 4321,
      stamp: {
        app: APP_KEYS.DESKTOP,
        ipc: "/tmp/open-design/ipc/release-beta/desktop.sock",
        mode: "runtime",
        namespace,
        source: SIDECAR_SOURCES.PACKAGED,
      },
      version: 1,
    })}\n`);
    await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
      active: { generation: 1, version: "1.2.3-beta.5" },
      channel: "beta",
      lastSuccessful: { generation: 1, version: "1.2.3-beta.5" },
      namespace,
      schemaVersion: LAUNCHER_SCHEMA_VERSION,
    })}\n`);
    await rm(launcherPaths.attemptsPath, { force: true });

    return { launcherPaths, prepared, root };
  }

  it("does not strand launcher state when the payload desktop spawn fails", async () => {
    const { launcherPaths, prepared, root } = await armedHandoffFixture();
    try {
      const spawn = vi.fn(() => {
        throw new Error("spawn ENOENT");
      });
      const requestDesktop = vi.fn(async (message: "shutdown" | "status") => (
        message === "status"
          ? { pid: 4321, state: "running" }
          : { accepted: true }
      ));

      const result = await executeLegacyPayloadDesktopHandoff(prepared, {
        confirmTimeoutMs: 100,
        env: { PATH: "/usr/bin" },
        now: () => new Date("2026-07-15T02:00:00.000Z"),
        requestDesktop,
        sleep: async () => undefined,
        spawn: spawn as never,
      });

      expect(result).toEqual({ kind: "aborted", reason: "spawn-failed" });
      // The shutdown must not have been requested, and no armed journal / runtime
      // rewrite may remain on disk to block the next cold-start retry.
      expect(requestDesktop).not.toHaveBeenCalledWith("shutdown");
      expect(JSON.parse(await readFile(launcherPaths.handoffPath, "utf8"))).toMatchObject({
        state: "prepared",
      });
      expect(JSON.parse(await readFile(launcherPaths.handoffPath, "utf8"))).not.toHaveProperty("target");
      expect(JSON.parse(await readFile(launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 1, version: "1.2.3-beta.5" },
      });
      await expect(readFile(launcherPaths.attemptsPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not strand launcher state when the old desktop shutdown fails", async () => {
    const { launcherPaths, prepared, root } = await armedHandoffFixture();
    try {
      const child = {
        once: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === "spawn") queueMicrotask(callback);
          return child;
        }),
        unref: vi.fn(),
      };
      const spawn = vi.fn(() => child);
      const requestDesktop = vi.fn(async (message: "shutdown" | "status") => {
        if (message === "shutdown") throw new Error("desktop ipc gone");
        return { pid: 4321, state: "running" };
      });

      const result = await executeLegacyPayloadDesktopHandoff(prepared, {
        confirmTimeoutMs: 100,
        env: { PATH: "/usr/bin" },
        now: () => new Date("2026-07-15T02:00:00.000Z"),
        requestDesktop,
        sleep: async () => undefined,
        spawn: spawn as never,
      });

      expect(result).toEqual({ kind: "aborted", reason: "shutdown-failed" });
      expect(spawn).toHaveBeenCalledOnce();
      // Even though the payload child already spawned, the failed shutdown must
      // leave the journal at "prepared" so a later cold start can retry instead
      // of bailing on "already-armed".
      expect(JSON.parse(await readFile(launcherPaths.handoffPath, "utf8"))).toMatchObject({
        state: "prepared",
      });
      expect(JSON.parse(await readFile(launcherPaths.handoffPath, "utf8"))).not.toHaveProperty("target");
      expect(JSON.parse(await readFile(launcherPaths.runtimePath, "utf8"))).toMatchObject({
        active: { generation: 1, version: "1.2.3-beta.5" },
      });
      await expect(readFile(launcherPaths.attemptsPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      // A subsequent cold start resumes the prepared handoff rather than reporting
      // "already-armed".
      const retry = await prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: "1.2.3-beta.5",
          OD_INSTALLATION_DIR: root,
        },
        namespace: prepared.descriptor.namespace,
        parentPid: 4321,
        platform: "darwin",
        runtimeRoot: prepared.runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });
      expect(retry.kind).toBe("prepared");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does nothing outside the packaged desktop runtime", async () => {
    await expect(prepareLegacyPayloadDesktopHandoff({
      env: {},
      namespace: "default",
      platform: "darwin",
      runtimeRoot: "/tmp/open-design/runtime",
      source: SIDECAR_SOURCES.TOOLS_DEV,
    })).resolves.toEqual({ kind: "none", reason: "not-packaged" });
  });

  it("resolves the installed outer and payload executable for the real Windows beta namespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-daemon-win-payload-handoff-"));
    try {
      const namespace = "release-beta-win";
      const version = "1.2.3-beta.5";
      const runtimeRoot = join(root, "namespaces", namespace, "runtime");
      const launcherPaths = resolveLauncherPaths({ channel: "beta", namespace, root });
      const versionPaths = resolveLauncherVersionPaths({
        channel: "beta",
        namespace,
        root,
        version,
      });
      const outerExecutablePath = join(root, "installed", "Open Design Beta.exe");
      const payloadExecutablePath = join(versionPaths.payloadRoot, "Open Design Beta.exe");
      await mkdir(join(root, "installed"), { recursive: true });
      await mkdir(versionPaths.payloadRoot, { recursive: true });
      await mkdir(runtimeRoot, { recursive: true });
      await mkdir(launcherPaths.stateRoot, { recursive: true });
      await writeFile(outerExecutablePath, "");
      await writeFile(payloadExecutablePath, "");
      await writeFile(versionPaths.manifestPath, `${JSON.stringify({
        channel: "beta",
        entry: {
          cwd: "payload",
          executable: "payload/Open Design Beta.exe",
        },
        namespace,
        payloadRoot: "payload",
        platform: "win32",
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version,
      })}\n`);
      await writeFile(launcherPaths.runtimePath, `${JSON.stringify({
        active: { generation: 1, version },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "1.2.3-beta.4" },
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);
      await writeFile(launcherPaths.attemptsPath, `${JSON.stringify({
        channel: "beta",
        generation: 1,
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        version,
      })}\n`);
      await writeFile(launcherPaths.installPath, `${JSON.stringify({
        channel: "beta",
        launchPath: outerExecutablePath,
        namespace,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
      })}\n`);

      const prepared = await prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: version,
          OD_INSTALLATION_DIR: root,
        },
        namespace,
        parentPid: 9876,
        platform: "win32",
        randomId: () => "4c5ca585-c7a1-4b9a-b725-495d72a5f97b",
        runtimeRoot,
        source: SIDECAR_SOURCES.PACKAGED,
      });

      expect(prepared).toMatchObject({
        descriptor: {
          outer: { executablePath: outerExecutablePath, pid: 9876 },
          payloadExecutablePath,
          previous: { generation: 0, version: "1.2.3-beta.4" },
          source: { generation: 1, version },
          state: "prepared",
        },
        kind: "prepared",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("uses the stable channel for an unlabelled version and custom namespace", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-daemon-stable-handoff-"));
    try {
      await expect(prepareLegacyPayloadDesktopHandoff({
        env: {
          OD_APP_VERSION: "1.2.3",
          OD_INSTALLATION_DIR: root,
        },
        namespace: "custom-stable-namespace",
        parentPid: 4321,
        platform: "darwin",
        runtimeRoot: join(root, "runtime"),
        source: SIDECAR_SOURCES.PACKAGED,
      })).resolves.toEqual({ kind: "none", reason: "invalid-runtime" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
