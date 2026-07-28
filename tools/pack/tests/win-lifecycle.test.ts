import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "../src/config.js";

const requestJsonIpc = vi.hoisted(() => vi.fn());
const listProcessSnapshots = vi.hoisted(() =>
  vi.fn<typeof import("@open-design/platform").listProcessSnapshots>(async () => []),
);
const matchesStampedProcess = vi.hoisted(() =>
  vi.fn<typeof import("@open-design/platform").matchesStampedProcess>(() => false),
);
const spawnBackgroundProcess = vi.hoisted(() => vi.fn(async () => ({ pid: 12345 })));
const stopProcesses = vi.hoisted(() => vi.fn(async () => undefined));
const invokeNsis = vi.hoisted(() => vi.fn<typeof import("../src/win/nsis.js").invokeNsis>());
const queryWinRegistryEntries = vi.hoisted(() =>
  vi.fn<typeof import("../src/win/registry.js").queryWinRegistryEntries>(async () => []),
);
const resolveWinRegisteredPaths = vi.hoisted(() =>
  vi.fn<typeof import("../src/win/registry.js").resolveWinRegisteredPaths>(async (_config, paths) => paths),
);

vi.mock("@open-design/sidecar", async () => {
  const actual = await vi.importActual<typeof import("@open-design/sidecar")>("@open-design/sidecar");
  return {
    ...actual,
    requestJsonIpc,
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

vi.mock("../src/win/nsis.js", async () => {
  const actual = await vi.importActual<typeof import("../src/win/nsis.js")>("../src/win/nsis.js");
  return {
    ...actual,
    invokeNsis,
  };
});

vi.mock("../src/win/registry.js", async () => {
  const actual = await vi.importActual<typeof import("../src/win/registry.js")>("../src/win/registry.js");
  return {
    ...actual,
    queryWinRegistryEntries,
    resolveWinRegisteredPaths,
  };
});

const { diagnosePackedWinIpc, inspectPackedWinApp, installPackedWinApp, stopPackedWinApp } = await import(
  "../src/win/lifecycle.js"
);
const { resolveWinPaths } = await import("../src/win/paths.js");

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
        await writeFile(paths.installedExePath, "", "utf8");
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
  it("returns status and diagnostics when eval IPC times out", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));

    try {
      requestJsonIpc.mockReset();
      requestJsonIpc.mockImplementation(async (ipc: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (ipc.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (ipc.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
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
      requestJsonIpc.mockReset();
      requestJsonIpc.mockImplementation(async (ipc: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (ipc.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (ipc.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
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
      requestJsonIpc.mockReset();
      requestJsonIpc.mockImplementation(async (ipc: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (ipc.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (ipc.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
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
      requestJsonIpc.mockReset();
      spawnBackgroundProcess.mockClear();
      stopProcesses.mockClear();
      listProcessSnapshots.mockClear();
      process.env.OD_JSON_IPC_TRACE = "already-on";
      requestJsonIpc.mockImplementation(async (ipc: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (ipc.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (ipc.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
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

describe("stopPackedWinApp", () => {
  it("waits for a packaged-source payload desktop to exit after graceful shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const payloadDesktop = { command: "payload-desktop", pid: 4242, ppid: 1 };

    try {
      requestJsonIpc.mockReset();
      requestJsonIpc.mockResolvedValue({ accepted: true });
      listProcessSnapshots.mockReset();
      listProcessSnapshots
        .mockResolvedValueOnce([payloadDesktop])
        .mockResolvedValueOnce([payloadDesktop])
        .mockResolvedValueOnce([]);
      matchesStampedProcess.mockReset();
      matchesStampedProcess.mockImplementation((processInfo, criteria) => {
        const sidecarCriteria = criteria as { namespace?: string; source?: string };
        return (
          processInfo.command === payloadDesktop.command &&
          sidecarCriteria.namespace === config.namespace &&
          sidecarCriteria.source === "packaged"
        );
      });
      stopProcesses.mockClear();

      await expect(stopPackedWinApp(config)).resolves.toEqual({
        gracefulRequested: true,
        namespace: config.namespace,
        remainingPids: [],
        status: "stopped",
        stoppedPids: [payloadDesktop.pid],
      });
      expect(listProcessSnapshots).toHaveBeenCalledTimes(3);
      expect(stopProcesses).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
