import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopStatusSnapshot } from "@open-design/sidecar-proto";
import {
  createStandaloneHandoffEnvelope,
  type StandaloneRuntimeStatus,
} from "@open-design/standalone-proto";

import type { ToolPackConfig } from "../src/config.js";
import { resolveMacPaths } from "../src/mac/paths.js";

const requestJsonIpc = vi.fn(async (_ipc?: string, _payload?: unknown): Promise<DesktopStatusSnapshot> => ({ state: "running" }));
const resolveAppIpcPath = vi.fn(({ app }: { app: string }) => `/tmp/open-design/ipc/test/${app}.sock`);
const createSidecarLaunchEnv = vi.fn(({ extraEnv }: { extraEnv: NodeJS.ProcessEnv }) => extraEnv);
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

vi.mock("@open-design/sidecar", () => ({
  createSidecarLaunchEnv,
  requestJsonIpc,
  resolveAppIpcPath,
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

const { inspectPackedMacApp, startPackedMacApp, stopPackedMacApp } = await import("../src/mac/lifecycle.js");

function makeConfig(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  return {
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
    shell: "electron",
    to: "app",
    webOutputMode: "standalone",
    workspaceRoot: root,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  requestJsonIpc.mockResolvedValue({ state: "running" });
  listProcessSnapshots.mockResolvedValue([]);
  matchesStampedProcess.mockReturnValue(false);
  collectProcessTreePids.mockImplementation(
    (_processes: unknown[], rootPids: Array<number | null>) =>
      rootPids.filter((pid): pid is number => typeof pid === "number"),
  );
  stopProcesses.mockImplementation(async (pids: number[]) => ({ remainingPids: [], stoppedPids: pids }));
});

describe("startPackedMacApp", () => {
  it("prefers the current built app over an older installed app", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executableName = "Open Design";
      const builtExecutablePath = join(paths.appPath, "Contents", "MacOS", executableName);
      const installedExecutablePath = join(paths.installedAppPath, "Contents", "MacOS", executableName);

      await mkdir(join(paths.appPath, "Contents", "MacOS"), { recursive: true });
      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(builtExecutablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await writeFile(installedExecutablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(builtExecutablePath, 0o755);
      await chmod(installedExecutablePath, 0o755);

      const result = await startPackedMacApp(config);

      expect(result.source).toBe("built");
      expect(result.executablePath).toBe(builtExecutablePath);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("starts the DMG-installed app when installed source is explicitly required", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveMacPaths(config);
      const executableName = "Open Design";
      const builtExecutablePath = join(paths.appPath, "Contents", "MacOS", executableName);
      const installedExecutablePath = join(paths.installedAppPath, "Contents", "MacOS", executableName);

      await mkdir(join(paths.appPath, "Contents", "MacOS"), { recursive: true });
      await mkdir(join(paths.installedAppPath, "Contents", "MacOS"), { recursive: true });
      await writeFile(builtExecutablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await writeFile(installedExecutablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(builtExecutablePath, 0o755);
      await chmod(installedExecutablePath, 0o755);

      const result = await startPackedMacApp(config, { source: "installed" });

      expect(result.source).toBe("installed");
      expect(result.executablePath).toBe(installedExecutablePath);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

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
      requestJsonIpc.mockResolvedValue({ pid: delegatedPid, state: "running" });
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
      spawnLoggedProcess.mockImplementationOnce(async ({ env }: { env: NodeJS.ProcessEnv }) => {
        const child = Object.assign(new EventEmitter(), {
          env,
          pid: 1234,
          unref: vi.fn(),
        }) as unknown as ChildProcess & { env: NodeJS.ProcessEnv };
        setTimeout(() => child.emit("exit", 1, null), 10);
        return child;
      });

      await expect(startPackedMacApp(config)).rejects.toThrow("process exited early code=1 signal=null");
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
          shellVersion: "1.2.3",
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
      await expect(readFile(launchConfigPath, "utf8")).resolves.toContain('"shellVersion": "1.2.3"');
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

describe("inspectPackedMacApp", () => {
  it("reports and polls the shell-owned Standalone status projection", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-mac-inspect-"));
    try {
      const digest = `sha256:${"a".repeat(64)}` as const;
      const standalone = {
        daemonUrl: "http://127.0.0.1:4100",
        handoff: createStandaloneHandoffEnvelope({
          descriptor: {
            release: { version: "0.16.2" },
            standalone: { digest, protocolVersion: 1, version: "0.16.2" },
          },
          scope: { channel: "stable", generation: 0, namespace: "local-test" },
        }),
        pid: 101,
        schemaVersion: 1,
        state: "running",
        webUrl: "http://127.0.0.1:4200",
      } satisfies StandaloneRuntimeStatus;
      requestJsonIpc.mockImplementation(async (ipc?: string, payload?: unknown) => {
        const messageType = typeof payload === "object" && payload != null && "type" in payload
          ? String((payload as { type?: unknown }).type)
          : undefined;
        if (messageType !== "status") throw new Error(`unexpected IPC message: ${String(messageType)}`);
        if (ipc?.endsWith("/desktop.sock")) return { pid: 101, standalone, state: "running", url: "od://app/" };
        throw new Error(`unexpected IPC path: ${ipc}`);
      });

      const result = await inspectPackedMacApp(makeConfig(root), {
        statusPollCount: 2,
        statusPollIntervalMs: 1,
      });

      expect(result.status).toMatchObject({ pid: 101, state: "running" });
      expect(result.status?.standalone).toMatchObject({
        daemonUrl: "http://127.0.0.1:4100",
        state: "running",
        webUrl: "http://127.0.0.1:4200",
      });
      expect(result.statusPoll).toMatchObject({ count: 2, intervalMs: 1 });
      expect(result.statusPoll?.samples.map((sample) => sample.attempt)).toEqual([1, 2]);
      expect(result.statusPoll?.samples.every((sample) => sample.status?.standalone?.state === "running")).toBe(true);
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
      requestJsonIpc.mockResolvedValue({ state: "running" });
      listProcessSnapshots
        .mockResolvedValueOnce([payloadDesktop])
        .mockResolvedValueOnce([payloadDesktop])
        .mockResolvedValueOnce([]);
      matchesStampedProcess.mockImplementation((processInfo, criteria) => {
        const sidecarCriteria = criteria as { namespace?: string; source?: string };
        return (
          processInfo.command === payloadDesktop.command &&
          sidecarCriteria.namespace === config.namespace &&
          sidecarCriteria.source === "packaged"
        );
      });

      await expect(stopPackedMacApp(config)).resolves.toMatchObject({
        gracefulRequested: true,
        namespace: config.namespace,
        remainingPids: [],
        status: "stopped",
        stoppedPids: [payloadDesktop.pid],
      });
      expect(listProcessSnapshots).toHaveBeenCalledTimes(3);
      expect(matchesStampedProcess).toHaveBeenCalledWith(
        payloadDesktop,
        expect.objectContaining({ namespace: config.namespace, source: "packaged" }),
        expect.anything(),
      );
      expect(stopProcesses).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
