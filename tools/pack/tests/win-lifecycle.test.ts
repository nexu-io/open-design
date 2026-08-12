import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const isProcessAlive = vi.hoisted(() =>
  vi.fn<typeof import("@open-design/platform").isProcessAlive>(() => true),
);
const spawnBackgroundProcess = vi.hoisted(() =>
  vi.fn<typeof import("@open-design/platform").spawnBackgroundProcess>(async () => ({ pid: 12345 })),
);
const stopProcesses = vi.hoisted(() => vi.fn(async () => undefined));
const invokeNsis = vi.hoisted(() => vi.fn<typeof import("../src/win/nsis.js").invokeNsis>());
const queryWinRegistryEntries = vi.hoisted(() =>
  vi.fn<typeof import("../src/win/registry.js").queryWinRegistryEntries>(async () => []),
);
const queryPreferredWinRegistryEntries = vi.hoisted(() =>
  vi.fn<typeof import("../src/win/registry.js").queryPreferredWinRegistryEntries>(async () => []),
);
const queryWinNamespaceRegistryEntry = vi.hoisted(() =>
  vi.fn<typeof import("../src/win/registry.js").queryWinNamespaceRegistryEntry>(async () => null),
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
    isProcessAlive,
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
    queryPreferredWinRegistryEntries,
    queryWinNamespaceRegistryEntry,
    queryWinRegistryEntries,
    resolveWinRegisteredPaths,
  };
});

const {
  diagnosePackedWinIpc,
  inspectPackedWinApp,
  installPackedWinApp,
  startPackedWinApp,
  stopPackedWinApp,
  uninstallPackedWinApp,
  waitForHealthyPackedWinApp,
} = await import(
  "../src/win/lifecycle.js"
);
const { resolveWinPaths } = await import("../src/win/paths.js");

function createConfig(root: string): ToolPackConfig {
  return {
    releaseVersion: "0.10.0-beta.1",
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
    shell: "electron",
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

  it("pins a requested runtime root for native public-acceptance launches", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = { ...createConfig(root), portable: true };
    const paths = resolveWinPaths(config);
    const runtimeBaseRoot = join(root, "native-product", "namespaces");
    const installedConfigPath = join(paths.installDir, "resources", "open-design-config.json");

    try {
      await mkdir(dirname(paths.setupPath), { recursive: true });
      await writeFile(paths.setupPath, "", "utf8");
      invokeNsis.mockReset();
      invokeNsis.mockImplementation(async () => {
        await mkdir(dirname(installedConfigPath), { recursive: true });
        await writeFile(paths.installedExePath, "", "utf8");
        await writeFile(installedConfigPath, "{}\n", "utf8");
      });

      await installPackedWinApp(config, { runtimeBaseRoot });
      expect(JSON.parse(await readFile(installedConfigPath, "utf8"))).toMatchObject({
        namespace: config.namespace,
        namespaceBaseRoot: runtimeBaseRoot,
      });
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
      queryPreferredWinRegistryEntries.mockReset();
      queryPreferredWinRegistryEntries.mockResolvedValue([]);
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
      expect(queryPreferredWinRegistryEntries).toHaveBeenCalledOnce();
      expect(invokeNsis).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("uninstallPackedWinApp", () => {
  it("waits for the NSIS self-copy to finish deleting shortcuts", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const paths = resolveWinPaths(config);

    try {
      await Promise.all([
        mkdir(dirname(paths.uninstallerPath), { recursive: true }),
        mkdir(dirname(paths.startMenuShortcutPath), { recursive: true }),
        mkdir(dirname(paths.userDesktopShortcutPath), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(paths.uninstallerPath, "", "utf8"),
        writeFile(paths.startMenuShortcutPath, "", "utf8"),
        writeFile(paths.userDesktopShortcutPath, "", "utf8"),
      ]);
      requestJsonIpc.mockReset();
      requestJsonIpc.mockRejectedValue(new Error("not running"));
      listProcessSnapshots.mockReset();
      listProcessSnapshots.mockResolvedValue([]);
      queryWinRegistryEntries.mockReset();
      queryWinRegistryEntries.mockResolvedValue([]);
      queryWinNamespaceRegistryEntry.mockReset();
      queryWinNamespaceRegistryEntry.mockResolvedValue(null);
      invokeNsis.mockReset();
      invokeNsis.mockImplementation(async () => {
        setTimeout(() => {
          void Promise.all([
            rm(paths.startMenuShortcutPath, { force: true }),
            rm(paths.userDesktopShortcutPath, { force: true }),
          ]);
        }, 25);
      });

      const result = await uninstallPackedWinApp(config);

      expect(result.lifecycleTimings.map(({ step }) => step)).toContain("wait for native uninstall settlement");
      expect(result.residueObservation.startMenuShortcutExists).toBe(false);
      expect(result.residueObservation.userDesktopShortcutExists).toBe(false);
      expect(queryWinNamespaceRegistryEntry).toHaveBeenCalled();
      expect(invokeNsis).toHaveBeenCalledOnce();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("startPackedWinApp", () => {
  it("overrides only the installed runtime root while keeping the existing install target", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const paths = resolveWinPaths(config);
    const runtimeBaseRoot = join(root, "native-product", "namespaces");

    try {
      await mkdir(join(dirname(paths.installedExePath), "resources"), { recursive: true });
      await writeFile(paths.installedExePath, "", "utf8");
      await writeFile(join(dirname(paths.installedExePath), "resources", "open-design-config.json"), "{}\n", "utf8");
      requestJsonIpc.mockReset();
      requestJsonIpc.mockResolvedValue({ state: "running", url: "od://app/" });
      spawnBackgroundProcess.mockClear();

      const result = await startPackedWinApp(config, { runtimeBaseRoot });

      expect(result.executablePath).toBe(paths.installedExePath);
      const request = spawnBackgroundProcess.mock.calls[0]?.[0];
      const launchConfigPath = request?.env?.OD_PACKAGED_CONFIG_PATH;
      expect(launchConfigPath).toBe(join(runtimeBaseRoot, config.namespace, "runtime", "launch-open-design-config.json"));
      expect(JSON.parse(await readFile(String(launchConfigPath), "utf8"))).toMatchObject({
        namespaceBaseRoot: runtimeBaseRoot,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("returns as soon as the spawned desktop exits before publishing status", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);

    try {
      await writeFakeUnpackedExe(config);
      requestJsonIpc.mockReset();
      requestJsonIpc.mockRejectedValue(new Error("not running"));
      isProcessAlive.mockReset();
      isProcessAlive.mockReturnValue(false);
      spawnBackgroundProcess.mockClear();

      const result = await startPackedWinApp(config);

      expect(result.status).toBeNull();
      expect(result.processExitedBeforeStatus).toBe(true);
      expect(result.statusPollCount).toBe(1);
      expect(result.statusWaitDurationMs).toBeLessThan(1000);
      expect(spawnBackgroundProcess).toHaveBeenCalledOnce();
    } finally {
      isProcessAlive.mockReset();
      isProcessAlive.mockReturnValue(true);
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

  it("waits for a healthy desktop in one tools-pack process", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));

    try {
      requestJsonIpc.mockReset();
      requestJsonIpc.mockImplementation(async (ipc: string, payload: { type?: string }) => {
        if (payload.type === SIDECAR_MESSAGES.STATUS) {
          if (ipc.includes("daemon")) return { state: "running", url: "http://127.0.0.1:1234" };
          if (ipc.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
          return { pid: 12345, state: "running", url: "od://app/" };
        }
        if (payload.type === SIDECAR_MESSAGES.EVAL) {
          return {
            ok: true,
            value: {
              health: { ok: true, version: "0.10.0-beta.1" },
              href: "od://app/",
              status: 200,
              title: "Open Design Beta",
            },
          };
        }
        throw new Error(`unexpected IPC message: ${String(payload.type)}`);
      });

      const result = await waitForHealthyPackedWinApp(createConfig(root), {
        statusPollIntervalMs: 1,
        timeoutMs: 1000,
      });

      expect(result.status).toEqual({ pid: 12345, state: "running", url: "od://app/" });
      expect(result.eval?.ok).toBe(true);
      expect(result.wait.attempts).toBe(1);
      expect(result.wait.intervalMs).toBe(1);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("accepts a healthy daemon projection when native Desktop IPC is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const runtimeBaseRoot = join(root, "native-product", "namespaces");

    try {
      requestJsonIpc.mockReset();
      requestJsonIpc.mockImplementation(async (ipc: string, payload: { type?: string }) => {
        if (payload.type !== SIDECAR_MESSAGES.STATUS) {
          throw new Error(`unexpected IPC message: ${String(payload.type)}`);
        }
        if (ipc.includes("daemon")) return { pid: 23456, state: "running", url: "http://127.0.0.1:1234" };
        if (ipc.includes("web")) return { state: "running", url: "http://127.0.0.1:5678" };
        throw new Error("IPC request timed out: native-desktop");
      });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        version: "0.10.0-beta.1",
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })));

      const result = await waitForHealthyPackedWinApp(createConfig(root), {
        allowDaemonFallback: true,
        runtimeBaseRoot,
        statusPollIntervalMs: 1,
        timeoutMs: 1000,
      });

      expect(result.desktopIpcUnavailable).toBe(true);
      expect(result.status).toMatchObject({ pid: 23456, state: "running", url: "http://127.0.0.1:5678" });
      expect(result.eval?.value).toMatchObject({ health: { ok: true, version: "0.10.0-beta.1" }, status: 200 });
      expect(result.launcher.root).toBe(join(root, "native-product"));
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reports namespace-owned processes only when explicitly requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-win-lifecycle-"));
    const config = createConfig(root);
    const payloadDesktop = { command: "payload-desktop --od-namespace=test", pid: 4242, ppid: 1 };

    try {
      requestJsonIpc.mockReset();
      requestJsonIpc.mockRejectedValue(new Error("not running"));
      listProcessSnapshots.mockReset();
      listProcessSnapshots.mockResolvedValue([payloadDesktop]);
      matchesStampedProcess.mockReset();
      matchesStampedProcess.mockImplementation((processInfo, criteria) => (
        processInfo.command === payloadDesktop.command
        && (criteria as { namespace?: string }).namespace === config.namespace
      ));

      const result = await inspectPackedWinApp(config, { includeManagedProcesses: true });

      expect(result.managedProcessPids).toEqual([payloadDesktop.pid]);
      expect(listProcessSnapshots).toHaveBeenCalledOnce();
    } finally {
      listProcessSnapshots.mockReset();
      listProcessSnapshots.mockResolvedValue([]);
      matchesStampedProcess.mockReset();
      matchesStampedProcess.mockReturnValue(false);
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
