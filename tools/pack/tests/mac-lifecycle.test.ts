import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopStatusSnapshot } from "@open-design/sidecar-proto";
import type { SidecarStopResult } from "@open-design/sidecar";

import type { ToolPackConfig } from "@/config/index.js";
import { resolveMacPaths } from "@/mac/paths.js";

const getSidecarStatus = vi.fn(async (
  _stamp: { source: string },
  _options?: { timeoutMs?: number },
): Promise<DesktopStatusSnapshot> => ({ state: "running" }));
const findSidecarProcesses = vi.fn(async (stamp: { source: string }) =>
  stamp.source === "tools-pack" ? [{ pid: 1234 }] : [],
);
const collectProcessTreePids = vi.fn(
  (_processes: unknown[], rootPids: Array<number | null>) =>
    rootPids.filter((pid): pid is number => typeof pid === "number"),
);
const listProcessSnapshots = vi.fn(async () => [] as Array<{ command: string; pid: number; ppid: number }>);
const matchesStampedProcess = vi.fn<typeof import("@open-design/platform").matchesStampedProcess>(() => false);
const stopProcesses = vi.fn(async (pids: number[]) => ({ remainingPids: [], stoppedPids: pids }));
const spawnLoggedProcess = vi.fn(async ({ env }: { env: NodeJS.ProcessEnv }) => {
  return Object.assign(new EventEmitter(), {
    env,
    pid: 1234,
    unref: vi.fn(),
  }) as unknown as ChildProcess & { env: NodeJS.ProcessEnv };
});
const defaultConvergeSidecarLaunch = async (request: { env: NodeJS.ProcessEnv; stamp: Record<string, string> }) => ({
  attempts: 1,
  description: { ready: true, resources: { pid: 1234 }, stamp: request.stamp },
  launcherProcess: await spawnLoggedProcess(request),
});
const convergeSidecarLaunch = vi.fn(defaultConvergeSidecarLaunch);
const defaultStopSidecar = async (
  stamp: { app: string; mode: string; source: string },
  _options?: Record<string, number>,
): Promise<SidecarStopResult> => ({
  alreadyStopped: stamp.source !== "packaged" || stamp.mode !== "headless",
  forcedPids: [],
  gracefulAccepted: stamp.source === "packaged" && stamp.mode === "headless",
  matchedPids: stamp.source === "packaged" && stamp.mode === "headless" ? [4242] : [],
  remainingPids: [],
  stoppedPids: stamp.source === "packaged" && stamp.mode === "headless" ? [4242] : [],
});
const stopSidecar = vi.fn(defaultStopSidecar);
const stopSidecars = vi.fn(async (requests: Array<{ options?: Record<string, number>; stamp: { app: string; mode: string; source: string } }>) => {
  const results = await Promise.all(requests.map(async ({ options, stamp }) => ({
    result: await stopSidecar(stamp, options ?? {}),
    stamp,
  })));
  const stopped = results.map(({ result }) => result);
  return {
    alreadyStopped: stopped.every(({ alreadyStopped }) => alreadyStopped),
    forcedPids: [...new Set(stopped.flatMap(({ forcedPids }) => forcedPids))],
    gracefulAccepted: stopped.some(({ gracefulAccepted }) => gracefulAccepted),
    matchedPids: [...new Set(stopped.flatMap(({ matchedPids }) => matchedPids))],
    remainingPids: [...new Set(stopped.flatMap(({ remainingPids }) => remainingPids))],
    results,
    stoppedPids: [...new Set(stopped.flatMap(({ stoppedPids }) => stoppedPids))],
  };
});

vi.mock("@open-design/sidecar", async () => ({
  ...(await vi.importActual<typeof import("@open-design/sidecar")>("@open-design/sidecar")),
  findSidecarProcesses,
  getSidecarStatus,
  convergeSidecarLaunch,
  stopSidecar,
  stopSidecars,
}));

vi.mock("@open-design/platform", () => ({
  collectProcessTreePids,
  createProcessStampArgs: vi.fn(() => []),
  isProcessAlive: vi.fn(() => true),
  listProcessSnapshots,
  matchesStampedProcess,
  readLogTail: vi.fn(async () => []),
  spawnLoggedProcess,
  stopProcesses,
}));

const { cleanupPackedMacNamespace, inspectPackedMacApp, startPackedMacApp, stopPackedMacApp } = await import("@/mac/lifecycle.js");

function makeConfig(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  return {
    containerized: false,
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "local-test",
    platform: "mac",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", "local-test", "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "mac", "namespaces", "local-test"),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "mac"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "mac", "namespaces", "local-test"),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    silent: true,
    signed: false,
    to: "app",
    webOutputMode: "standalone",
    workspaceRoot: root,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  getSidecarStatus.mockResolvedValue({ state: "running" });
  findSidecarProcesses.mockImplementation(async (stamp: { source: string }) =>
    stamp.source === "tools-pack" ? [{ pid: 1234 }] : [],
  );
  listProcessSnapshots.mockResolvedValue([]);
  matchesStampedProcess.mockReturnValue(false);
  collectProcessTreePids.mockImplementation(
    (_processes: unknown[], rootPids: Array<number | null>) =>
      rootPids.filter((pid): pid is number => typeof pid === "number"),
  );
  stopProcesses.mockImplementation(async (pids: number[]) => ({ remainingPids: [], stoppedPids: pids }));
  stopSidecar.mockImplementation(defaultStopSidecar);
  stopSidecars.mockClear();
  convergeSidecarLaunch.mockImplementation(defaultConvergeSidecarLaunch);
});

describe("startPackedMacApp", () => {
  it("accepts a clean launcher exit when the delegated desktop becomes healthy", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Open Design");
      const delegatedPid = 5678;

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      getSidecarStatus.mockImplementation(async (stamp: { source: string }) => {
        if (stamp.source === "packaged") return { pid: delegatedPid, state: "running" };
        throw new Error("tools-pack desktop endpoint is gone after delegation");
      });
      findSidecarProcesses.mockResolvedValue([]);
      convergeSidecarLaunch.mockImplementationOnce(async (request) => ({
        attempts: 1,
        description: { ready: true, resources: { pid: delegatedPid }, stamp: request.stamp },
        launcherProcess: await spawnLoggedProcess(request),
      }));
      spawnLoggedProcess.mockImplementationOnce(async ({ env }: { env: NodeJS.ProcessEnv }) => {
        const child = Object.assign(new EventEmitter(), {
          env,
          pid: 1234,
          unref: vi.fn(),
        }) as unknown as ChildProcess & { env: NodeJS.ProcessEnv };
        setTimeout(() => child.emit("exit", 0, null), 10);
        return child;
      });

      const result = await startPackedMacApp(config);

      expect(result.pid).toBe(delegatedPid);
      expect(result.status).toEqual({ pid: delegatedPid, state: "running" });
      expect(getSidecarStatus).toHaveBeenCalledWith(
        expect.objectContaining({ source: "packaged" }),
        { timeoutMs: 1000 },
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a non-zero launcher exit before desktop handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Open Design");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 1\n", "utf8");
      await chmod(executablePath, 0o755);
      convergeSidecarLaunch.mockRejectedValueOnce(
        new Error("sidecar launcher exited before convergence code=1 signal=null"),
      );

      await expect(startPackedMacApp(config)).rejects.toThrow(
        "sidecar launcher exited before convergence code=1 signal=null",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("writes a launch override when the bundled config is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Open Design");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);

      const result = await startPackedMacApp(config);
      const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "open-design-config.json");
      const launchEnv = spawnLoggedProcess.mock.calls[0]?.[0]?.env as NodeJS.ProcessEnv | undefined;

      expect(result.source).toBe("installed");
      expect(result.status?.state).toBe("running");
      expect(launchEnv?.OD_PACKAGED_CONFIG_PATH).toBe(launchConfigPath);
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain(
        `"namespaceBaseRoot": ${JSON.stringify(config.roots.runtime.namespaceBaseRoot)}`,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("passes a launch override config path for portable mac starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Open Design");
      const bundledConfigPath = join(paths.installedAppPath, "Contents", "Resources", "open-design-config.json");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await mkdir(join(paths.installedAppPath, "Contents", "Resources"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      await writeFile(
        bundledConfigPath,
        `${JSON.stringify({
          appVersion: "1.2.3",
          daemonCliEntryRelative: "open-design/bin/od",
          namespace: config.namespace,
          nodeCommandRelative: "open-design/bin/node",
        }, null, 2)}\n`,
        "utf8",
      );

      const result = await startPackedMacApp(config);
      const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "open-design-config.json");
      const launchEnv = spawnLoggedProcess.mock.calls[0]?.[0]?.env as NodeJS.ProcessEnv | undefined;

      expect(result.source).toBe("installed");
      expect(result.status?.state).toBe("running");
      expect(launchEnv?.OD_PACKAGED_CONFIG_PATH).toBe(launchConfigPath);
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain(
        `"namespaceBaseRoot": ${JSON.stringify(config.roots.runtime.namespaceBaseRoot)}`,
      );
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain('"appVersion": "1.2.3"');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("uses the preview executable name for preview release namespaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root, { namespace: "release-preview" });
      const paths = resolveMacPaths(config);
      const executablePath = join(paths.installedAppPath, "Contents", "MacOS", "Open Design Preview");

      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);

      const result = await startPackedMacApp(config);

      expect(result.source).toBe("installed");
      expect(result.executablePath).toBe(executablePath);
      expect(result.status?.state).toBe("running");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("stopPackedMacApp", () => {
  it("waits for a packaged-source payload desktop to exit after graceful shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    const config = makeConfig(root);
    const payloadDesktop = { command: "payload-desktop", pid: 4242, ppid: 1 };

    try {
      stopSidecar.mockClear();

      await expect(stopPackedMacApp(config)).resolves.toMatchObject({
        gracefulRequested: true,
        namespace: config.namespace,
        remainingPids: [],
        status: "stopped",
        stoppedPids: [payloadDesktop.pid],
      });
      expect(stopSidecar).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: config.namespace, source: "packaged" }),
        expect.any(Object),
      );
      expect(stopSidecar).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "headless", source: "packaged" }),
        expect.any(Object),
      );
      expect(stopSidecar).toHaveBeenCalledWith(
        expect.objectContaining({ app: "web", mode: "runtime", source: "packaged" }),
        { gracefulRequestTimeoutMs: 500, killGraceMs: 750, termGraceMs: 750 },
      );
      expect(stopSidecar).toHaveBeenCalledWith(
        expect.objectContaining({ app: "daemon", mode: "runtime", source: "packaged" }),
        expect.any(Object),
      );
      expect(stopProcesses).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("keeps output and runtime roots when a packaged generation survives cleanup", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    const config = makeConfig(root);
    const outputMarker = join(config.roots.output.namespaceRoot, "artifact.txt");
    const runtimeMarker = join(config.roots.runtime.namespaceRoot, "runtime.txt");

    try {
      await mkdir(config.roots.output.namespaceRoot, { recursive: true });
      await mkdir(config.roots.runtime.namespaceRoot, { recursive: true });
      await writeFile(outputMarker, "artifact", "utf8");
      await writeFile(runtimeMarker, "runtime", "utf8");
      stopSidecar.mockImplementation(async (stamp: { app: string; mode: string; source: string }) => ({
        alreadyStopped: stamp.app !== "web" || stamp.source !== "packaged",
        forcedPids: [],
        gracefulAccepted: false,
        matchedPids: stamp.app === "web" && stamp.source === "packaged" ? [5252] : [],
        remainingPids: stamp.app === "web" && stamp.source === "packaged" ? [5252] : [],
        stoppedPids: [],
      }));

      await expect(cleanupPackedMacNamespace(config)).rejects.toThrow(
        "cannot cleanup packaged namespace while sidecar processes remain: 5252",
      );
      await expect(readFile(outputMarker, "utf8")).resolves.toBe("artifact");
      await expect(readFile(runtimeMarker, "utf8")).resolves.toBe("runtime");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("inspectPackedMacApp", () => {
  it("targets the reachable packaged sidecar when a tools-pack process marker is stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      findSidecarProcesses.mockImplementation(async (stamp: { source: string }) =>
        stamp.source === "tools-pack" ? [{ pid: 1234 }] : [],
      );
      getSidecarStatus.mockImplementation(async (stamp: { source: string }) => {
        if (stamp.source === "packaged") return { pid: 5678, state: "running" };
        throw new Error("stale tools-pack endpoint");
      });

      const result = await inspectPackedMacApp(makeConfig(root), {});

      expect(result.status).toEqual({ pid: 5678, state: "running" });
      expect(getSidecarStatus).toHaveBeenCalledWith(
        expect.objectContaining({ source: "packaged" }),
        { timeoutMs: 2000 },
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
