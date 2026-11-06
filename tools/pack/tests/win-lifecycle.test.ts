import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "@/config/index.js";

const requestSidecar = vi.hoisted(() => vi.fn());
const findSidecarProcesses = vi.hoisted(() => vi.fn(async (stamp: { source: string }) =>
  stamp.source === "tools-pack" ? [{ pid: 1234 }] : [],
));
const listProcessSnapshots = vi.hoisted(() =>
  vi.fn<typeof import("@open-design/platform").listProcessSnapshots>(async () => []),
);
const matchesStampedProcess = vi.hoisted(() =>
  vi.fn<typeof import("@open-design/platform").matchesStampedProcess>(() => false),
);
const spawnBackgroundProcess = vi.hoisted(() => vi.fn(async () => ({ pid: 12345 })));
const convergeSidecarLaunch = vi.hoisted(() => vi.fn(async (
  request: { stamp: Record<string, string> },
  _options?: { ownerStamps?: Array<Record<string, string>>; timeoutMs?: number },
) => {
  const spawned = await spawnBackgroundProcess();
  return {
    attempts: 1,
    description: { ready: true, resources: { pid: spawned.pid }, stamp: request.stamp },
    launcherProcess: { pid: spawned.pid },
  };
}));
const stopSidecar = vi.hoisted(() => vi.fn(async (stamp: { mode: string; source: string }) => ({
  alreadyStopped: stamp.source !== "packaged" || stamp.mode !== "headless",
  forcedPids: [] as number[],
  gracefulAccepted: stamp.source === "packaged" && stamp.mode === "headless",
  matchedPids: stamp.source === "packaged" && stamp.mode === "headless" ? [4242] : [],
  remainingPids: [] as number[],
  stoppedPids: stamp.source === "packaged" && stamp.mode === "headless" ? [4242] : [],
})));
const stopSidecars = vi.hoisted(() => vi.fn(async (requests: Array<{ stamp: { mode: string; source: string } }>) => {
  const results = await Promise.all(requests.map(async ({ stamp }) => ({ result: await stopSidecar(stamp), stamp })));
  const stopped = results.map(({ result }) => result);
  return {
    alreadyStopped: stopped.every(({ alreadyStopped }) => alreadyStopped),
    forcedPids: [] as number[],
    gracefulAccepted: stopped.some(({ gracefulAccepted }) => gracefulAccepted),
    matchedPids: [...new Set(stopped.flatMap(({ matchedPids }) => matchedPids))],
    remainingPids: [...new Set(stopped.flatMap(({ remainingPids }) => remainingPids))],
    results,
    stoppedPids: [...new Set(stopped.flatMap(({ stoppedPids }) => stoppedPids))],
  };
}));
const stopProcesses = vi.hoisted(() => vi.fn(async () => undefined));
const invokeNsis = vi.hoisted(() => vi.fn<typeof import("@/win/nsis.js").invokeNsis>());
const queryWinRegistryEntries = vi.hoisted(() =>
  vi.fn<typeof import("@/win/registry.js").queryWinRegistryEntries>(async () => []),
);
const resolveWinRegisteredPaths = vi.hoisted(() =>
  vi.fn<typeof import("@/win/registry.js").resolveWinRegisteredPaths>(async (_config, paths) => paths),
);

vi.mock("@open-design/sidecar", async () => {
  const actual = await vi.importActual<typeof import("@open-design/sidecar")>("@open-design/sidecar");
  return {
    ...actual,
    convergeSidecarLaunch,
    findSidecarProcesses,
    getSidecarStatus: async (stamp: { app: string; source: string }) => await requestSidecar(stamp.app, { type: SIDECAR_MESSAGES.STATUS }, stamp.source),
    invokeSidecar: async (stamp: { app: string; source: string }, action: string, input: unknown) => await requestSidecar(stamp.app, { input, type: action }, stamp.source),
    launchSidecar: spawnBackgroundProcess,
    stopSidecar,
    stopSidecars,
  };
});

vi.mock("@open-design/platform", async () => {
  const actual = await vi.importActual<typeof import("@open-design/platform")>("@open-design/platform");
  return {
    ...actual,
    listProcessSnapshots,
    matchesStampedProcess,
    spawnBackgroundProcess,
    stopProcesses,
  };
});

vi.mock("@/win/nsis.js", async () => {
  const actual = await vi.importActual<typeof import("@/win/nsis.js")>("@/win/nsis.js");
  return {
    ...actual,
    invokeNsis,
  };
});

vi.mock("@/win/registry.js", async () => {
  const actual = await vi.importActual<typeof import("@/win/registry.js")>("@/win/registry.js");
  return {
    ...actual,
    queryWinRegistryEntries,
    resolveWinRegisteredPaths,
  };
});

const { cleanupPackedWinNamespace, diagnosePackedWinIpc, inspectPackedWinApp, installPackedWinApp, startPackedWinApp, stopPackedWinApp } = await import(
  "@/win/lifecycle.js"
);
const { resolveWinPaths } = await import("@/win/paths.js");

function createConfig(root: string): ToolPackConfig {
  return {
    appVersion: "0.10.0-beta.1",
    containerized: false,
    electronBuilderCliPath: "electron-builder",
    electronDistPath: "electron-dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "test",
    platform: "win",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    requireVelaCli: false,
    roots: {
      cacheRoot: join(root, ".cache"),
      output: {
        appBuilderRoot: join(root, "out", "builder"),
        namespaceRoot: join(root, "out", "win", "namespaces", "test"),
        platformRoot: join(root, "out", "win"),
        root: join(root, "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, "runtime", "win", "namespaces"),
        namespaceRoot: join(root, "runtime", "win", "namespaces", "test"),
      },
      toolPackRoot: join(root, "tools-pack"),
    },
    signed: false,
    silent: true,
    to: "dir",
    webOutputMode: "standalone",
    workspaceRoot: root,
  };
}

async function writeFakeUnpackedExe(config: ToolPackConfig): Promise<void> {
  const paths = resolveWinPaths(config);
  await mkdir(dirname(paths.unpackedExePath), { recursive: true });
  await writeFile(paths.unpackedExePath, "", "utf8");
}

describe("installPackedWinApp", () => {
  it("pins the installed portable config to the tools-pack namespace for bare protocol launches", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = { ...createConfig(root), portable: true };
    const paths = resolveWinPaths(config);
    const installedConfigPath = join(paths.installDir, "resources", "open-design-config.json");

    try {
      await mkdir(dirname(paths.setupPath), { recursive: true });
      await writeFile(paths.setupPath, "", "utf8");
      invokeNsis.mockReset();
      invokeNsis.mockImplementation(async () => {
        await mkdir(dirname(installedConfigPath), { recursive: true });
        await writeFile(paths.installedExePath, "", "utf8");
        await writeFile(
          installedConfigPath,
          `${JSON.stringify({ channel: "prerelease", namespace: "baked-default" }, null, 2)}\n`,
          "utf8",
        );
      });

      const result = await installPackedWinApp(config);
      const installedConfig = JSON.parse(await readFile(installedConfigPath, "utf8")) as Record<string, unknown>;

      expect(installedConfig).toMatchObject({
        channel: "prerelease",
        namespace: config.namespace,
        namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot,
      });
      expect(result.lifecycleTimings.map(({ step }) => step)).toContain("pin installed packaged namespace");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("creates the exact fresh install directory before invoking transactional NSIS", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const paths = resolveWinPaths(config);

    try {
      await mkdir(dirname(paths.setupPath), { recursive: true });
      await writeFile(paths.setupPath, "", "utf8");
      invokeNsis.mockReset();
      invokeNsis.mockImplementation(async () => {
        await expect(access(paths.installDir)).resolves.toBeUndefined();
        const installedConfigPath = join(paths.installDir, "resources", "open-design-config.json");
        await mkdir(dirname(installedConfigPath), { recursive: true });
        await writeFile(paths.installedExePath, "", "utf8");
        await writeFile(installedConfigPath, "{}\n", "utf8");
      });

      const result = await installPackedWinApp(config);

      expect(result.installDir).toBe(paths.installDir);
      expect(result.lifecycleTimings.map(({ step }) => step)).toContain("ensure install directory");
      expect(invokeNsis).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("inspectPackedWinApp", () => {
  it("targets reachable packaged peers when a tools-pack process marker is stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));

    try {
      findSidecarProcesses.mockImplementation(async (stamp: { source: string }) =>
        stamp.source === "tools-pack" ? [{ pid: 1234 }] : [],
      );
      requestSidecar.mockReset();
      requestSidecar.mockImplementation(async (_app: string, payload: { type?: string }, source: string) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS && source === "tools-pack") {
          throw new Error("stale tools-pack endpoint");
        }
        return { state: "running" };
      });

      await inspectPackedWinApp(createConfig(root), {});

      expect(requestSidecar).toHaveBeenCalledWith(
        expect.any(String),
        { type: SIDECAR_MESSAGES.STATUS },
        "packaged",
      );
      expect(requestSidecar.mock.calls.filter((call) => call[1]?.type === SIDECAR_MESSAGES.STATUS))
        .toHaveLength(4);
    } finally {
      await rm(root, { force: true, recursive: true });
      findSidecarProcesses.mockImplementation(async (stamp: { source: string }) =>
        stamp.source === "tools-pack" ? [{ pid: 1234 }] : [],
      );
    }
  });

  it("returns status and diagnostics when eval IPC times out", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));

    try {
      requestSidecar.mockReset();
      requestSidecar.mockImplementation(async (app: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (app.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (app.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
          return { state: "running", url: "od://app/" };
        }
        if (payload.type === SIDECAR_MESSAGES.EVAL) {
          throw new Error("IPC request timed out: test-pipe");
        }
        throw new Error(`unexpected IPC message: ${String(payload.type)}`);
      });

      const result = await inspectPackedWinApp(createConfig(root), { expr: "document.title" });

      expect(result.status).toEqual({ state: "running", url: "od://app/" });
      expect(result.daemonStatus).toEqual({ state: "running", url: "http://127.0.0.1:1234" });
      expect(result.webStatus).toEqual({ state: "running", url: "http://127.0.0.1:5678" });
      expect(result.eval).toEqual({
        error: "IPC request timed out: test-pipe",
        ok: false,
      });
      expect(result.launcher.exists).toBe(false);
      expect(result.updateCache.releaseCount).toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("returns status errors with launcher diagnostics when status IPC fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));

    try {
      requestSidecar.mockReset();
      requestSidecar.mockImplementation(async (app: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (app.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (app.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
          throw new Error("IPC request timed out: test-pipe");
        }
        throw new Error(`unexpected IPC message: ${String(payload.type)}`);
      });

      const result = await inspectPackedWinApp(createConfig(root), {});

      expect(result.status).toBeNull();
      expect(result.statusError).toBe("IPC request timed out: test-pipe");
      expect(result.daemonStatus).toEqual({ state: "running", url: "http://127.0.0.1:1234" });
      expect(result.webStatus).toEqual({ state: "running", url: "http://127.0.0.1:5678" });
      expect(result.launcher.exists).toBe(false);
      expect(result.updateCache.releaseCount).toBe(0);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("polls status diagnostics when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));

    try {
      requestSidecar.mockReset();
      requestSidecar.mockImplementation(async (app: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (app.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (app.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
          throw new Error("IPC request timed out: test-pipe");
        }
        throw new Error(`unexpected IPC message: ${String(payload.type)}`);
      });

      const result = await inspectPackedWinApp(createConfig(root), {
        statusPollCount: 2,
        statusPollIntervalMs: 1,
      });

      expect(result.statusPoll?.count).toBe(2);
      expect(result.statusPoll?.intervalMs).toBe(1);
      expect(result.statusPoll?.samples).toHaveLength(2);
      expect(result.statusPoll?.samples.map((sample) => sample.attempt)).toEqual([1, 2]);
      expect(result.statusPoll?.samples[0]?.status).toBeNull();
      expect(result.statusPoll?.samples[0]?.statusError).toBe("IPC request timed out: test-pipe");
      expect(result.statusPoll?.samples[0]?.daemonStatus).toEqual({ state: "running", url: "http://127.0.0.1:1234" });
      expect(result.statusPoll?.samples[0]?.webStatus).toEqual({ state: "running", url: "http://127.0.0.1:5678" });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("diagnoses Windows IPC by polling status during repeated fresh starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const previousTrace = process.env.OD_JSON_IPC_TRACE;

    try {
      await writeFakeUnpackedExe(config);
      requestSidecar.mockReset();
      spawnBackgroundProcess.mockClear();
      stopProcesses.mockClear();
      listProcessSnapshots.mockClear();
      process.env.OD_JSON_IPC_TRACE = "already-on";
      requestSidecar.mockImplementation(async (app: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (app.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (app.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
          return { state: "running", url: "od://app/" };
        }
        if (payload.type === SIDECAR_MESSAGES.SHUTDOWN) return { accepted: true };
        throw new Error(`unexpected IPC message: ${String(payload.type)}`);
      });

      const result = await diagnosePackedWinIpc(config, {
        diagnoseAttempts: 2,
        statusPollCount: 2,
        statusPollIntervalMs: 1,
      });

      expect(result.namespace).toBe("test");
      expect(result.traceEnabled).toBe(true);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]?.start.status).toBeNull();
      expect(result.attempts[0]?.statusPoll.samples).toHaveLength(2);
      expect(result.attempts[0]?.statusPoll.samples[0]?.status).toEqual({ state: "running", url: "od://app/" });
      expect(spawnBackgroundProcess).toHaveBeenCalledTimes(2);
      expect(process.env.OD_JSON_IPC_TRACE).toBe("already-on");
    } finally {
      if (previousTrace == null) {
        delete process.env.OD_JSON_IPC_TRACE;
      } else {
        process.env.OD_JSON_IPC_TRACE = previousTrace;
      }
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("startPackedWinApp", () => {
  it("uses an extended convergence budget for packaged Windows cold starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);

    try {
      await writeFakeUnpackedExe(config);
      convergeSidecarLaunch.mockClear();

      await expect(startPackedWinApp(config, { waitForStatus: false })).resolves.toMatchObject({
        pid: 12345,
        status: null,
      });
      expect(convergeSidecarLaunch).toHaveBeenCalledWith(expect.any(Object), {
        ownerStamps: [
          expect.objectContaining({ app: "desktop", source: "tools-pack" }),
          expect.objectContaining({ app: "desktop", source: "packaged" }),
        ],
        timeoutMs: 90_000,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("stopPackedWinApp", () => {
  it.runIf(process.platform === "win32")("lets a start invoked during an in-flight stop launch after that stop completes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    let releaseStop!: () => void;
    let markStopEntered!: () => void;
    const stopEntered = new Promise<void>((resolve) => { markStopEntered = resolve; });
    const stopRelease = new Promise<void>((resolve) => { releaseStop = resolve; });

    try {
      await writeFakeUnpackedExe(config);
      convergeSidecarLaunch.mockClear();
      stopSidecars.mockImplementationOnce(async (requests) => {
        markStopEntered();
        await stopRelease;
        const results = await Promise.all(requests.map(async ({ stamp }) => ({ result: await stopSidecar(stamp), stamp })));
        const stopped = results.map(({ result }) => result);
        return {
          alreadyStopped: stopped.every(({ alreadyStopped }) => alreadyStopped),
          forcedPids: [],
          gracefulAccepted: stopped.some(({ gracefulAccepted }) => gracefulAccepted),
          matchedPids: [...new Set(stopped.flatMap(({ matchedPids }) => matchedPids))],
          remainingPids: [],
          results,
          stoppedPids: [...new Set(stopped.flatMap(({ stoppedPids }) => stoppedPids))],
        };
      });

      const stopping = stopPackedWinApp(config);
      await stopEntered;
      const starting = startPackedWinApp(config, { waitForStatus: false });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(convergeSidecarLaunch).not.toHaveBeenCalled();

      releaseStop();
      await expect(stopping).resolves.toMatchObject({ status: "stopped" });
      await expect(starting).resolves.toMatchObject({ pid: 12345, status: null });
      expect(convergeSidecarLaunch).toHaveBeenCalledOnce();
    } finally {
      releaseStop();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("waits for a packaged-source payload desktop to exit after graceful shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const payloadDesktop = { command: "payload-desktop", pid: 4242, ppid: 1 };

    try {
      requestSidecar.mockReset();
      requestSidecar.mockResolvedValue({ accepted: true });
      stopProcesses.mockClear();

      await expect(stopPackedWinApp(config)).resolves.toEqual({
        gracefulRequested: true,
        namespace: config.namespace,
        remainingPids: [],
        status: "stopped",
        stoppedPids: [payloadDesktop.pid],
      });
      expect(stopProcesses).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("does not delete namespace roots when a packaged generation survives", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const outputMarker = join(config.roots.output.namespaceRoot, "artifact.txt");
    const runtimeMarker = join(config.roots.runtime.namespaceRoot, "runtime.txt");

    try {
      invokeNsis.mockClear();
      await mkdir(dirname(outputMarker), { recursive: true });
      await mkdir(dirname(runtimeMarker), { recursive: true });
      await writeFile(outputMarker, "artifact", "utf8");
      await writeFile(runtimeMarker, "runtime", "utf8");
      stopSidecars.mockResolvedValueOnce({
        alreadyStopped: false,
        forcedPids: [5252],
        gracefulAccepted: false,
        matchedPids: [5252],
        remainingPids: [5252],
        results: [],
        stoppedPids: [],
      });

      await expect(cleanupPackedWinNamespace(config)).rejects.toThrow(
        "cannot cleanup packaged namespace while sidecar processes remain: 5252",
      );
      await expect(readFile(outputMarker, "utf8")).resolves.toBe("artifact");
      await expect(readFile(runtimeMarker, "utf8")).resolves.toBe("runtime");
      expect(invokeNsis).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
