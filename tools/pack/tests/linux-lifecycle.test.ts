import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "../src/config.js";

const mockState = vi.hoisted(() => ({ markerPath: "", webIdentityPath: "" }));

const requestJsonIpc = vi.fn(async (): Promise<unknown> => ({
  state: "running",
  url: "http://127.0.0.1:17456",
}));
const resolveAppIpcPath = vi.fn(() => "/tmp/open-design/ipc/linux-tauri/desktop.sock");
const createSidecarLaunchEnv = vi.fn(({ extraEnv }: { extraEnv: NodeJS.ProcessEnv }) => extraEnv);
const spawnBackgroundProcess = vi.fn(async (_options: { args: string[]; command: string; env: NodeJS.ProcessEnv }) => {
  await mkdir(join(mockState.markerPath, ".."), { recursive: true });
  const pid = 1234;
  await writeFile(mockState.markerPath, "{}", "utf8");
  if (mockState.webIdentityPath.length > 0) {
    await mkdir(join(mockState.webIdentityPath, ".."), { recursive: true });
    await writeFile(
      mockState.webIdentityPath,
      `${JSON.stringify({
        namespace: "linux-tauri-lifecycle",
        pid,
        startedAt: "2026-05-20T00:00:00.000Z",
        url: "http://127.0.0.1:17456",
        version: 1,
      }, null, 2)}\n`,
      "utf8",
    );
  }
  return { pid };
});

vi.mock("@open-design/sidecar", () => ({
  createSidecarLaunchEnv,
  requestJsonIpc,
  resolveAppIpcPath,
}));

vi.mock("@open-design/platform", () => ({
  collectProcessTreePids: vi.fn(() => []),
  createPackageManagerInvocation: vi.fn(),
  createProcessStampArgs: vi.fn(() => []),
  listProcessSnapshots: vi.fn(async () => []),
  matchesStampedProcess: vi.fn(() => false),
  readLogTail: vi.fn(async () => []),
  spawnBackgroundProcess,
  stopProcesses: vi.fn(async () => ({ remainingPids: [], stoppedPids: [] })),
}));

const platform = await import("@open-design/platform");
const { inspectPackedLinuxApp, startPackedLinuxApp, startPackedLinuxHeadless, stopPackedLinuxApp } = await import("../src/linux.js");

function makeConfig(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  const namespace = "linux-tauri-lifecycle";
  return {
    containerized: false,
    desktopRuntime: "tauri",
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace,
    platform: "linux",
    portable: false,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "linux", "namespaces", namespace, "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "linux", "namespaces", namespace),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "linux"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "linux", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "linux", "namespaces", namespace),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    silent: true,
    signed: false,
    tauriCliPath: "/x/tauri/main.js",
    tauriConfigPath: join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"),
    to: "appimage",
    webOutputMode: "server",
    workspaceRoot: root,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  mockState.markerPath = "";
  mockState.webIdentityPath = "";
  requestJsonIpc.mockResolvedValue({ state: "running", url: "http://127.0.0.1:17456" });
});

describe("startPackedLinuxApp", () => {
  it("waits for a Tauri packaged AppImage to report its web URL", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-linux-lifecycle-"));
    try {
      const config = makeConfig(root);
      const appImagePath = join(config.roots.output.appBuilderRoot, "Open Design-linux-tauri-lifecycle.AppImage");
      mockState.markerPath = join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");

      requestJsonIpc
        .mockResolvedValueOnce({ state: "running", url: null })
        .mockResolvedValueOnce({ state: "running", url: "http://127.0.0.1:17456" });

      await mkdir(config.roots.output.appBuilderRoot, { recursive: true });
      await writeFile(appImagePath, "#!/bin/sh\nexit 0\n", "utf8");

      const result = await startPackedLinuxApp(config);
      const spawnArgs = spawnBackgroundProcess.mock.calls[0]?.[0]?.args as string[] | undefined;
      const launchEnv = createSidecarLaunchEnv.mock.calls[0]?.[0]?.extraEnv as NodeJS.ProcessEnv | undefined;

      expect(requestJsonIpc).toHaveBeenCalledTimes(2);
      expect(result.source).toBe("built");
      expect(result.status?.url).toBe("http://127.0.0.1:17456");
      expect(spawnArgs).toEqual([
        "--appimage-extract-and-run",
      ]);
      expect(launchEnv?.OD_DESKTOP_LOG_ECHO).toBe("0");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("stamps Linux desktop starts with the tools-pack desktop sidecar contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-linux-lifecycle-"));
    try {
      const config = makeConfig(root);
      const appImagePath = join(config.roots.output.appBuilderRoot, "Open Design-linux-tauri-lifecycle.AppImage");
      mockState.markerPath = join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");

      await mkdir(config.roots.output.appBuilderRoot, { recursive: true });
      await writeFile(appImagePath, "#!/bin/sh\nexit 0\n", "utf8");

      await startPackedLinuxApp(config);

      expect(resolveAppIpcPath).toHaveBeenCalledWith({
        app: APP_KEYS.DESKTOP,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        namespace: config.namespace,
      });
      expect(createSidecarLaunchEnv).toHaveBeenCalledWith(
        expect.objectContaining({
          base: join(config.roots.runtime.namespaceRoot, "runtime"),
          contract: OPEN_DESIGN_SIDECAR_CONTRACT,
          stamp: {
            app: APP_KEYS.DESKTOP,
            ipc: "/tmp/open-design/ipc/linux-tauri/desktop.sock",
            mode: SIDECAR_MODES.RUNTIME,
            namespace: config.namespace,
            source: SIDECAR_SOURCES.TOOLS_PACK,
          },
        }),
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("inspectPackedLinuxApp", () => {
  it("uses the standard desktop sidecar status/eval/screenshot message shapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-linux-lifecycle-"));
    try {
      const config = makeConfig(root);
      requestJsonIpc
        .mockResolvedValueOnce({ state: "running", url: "http://127.0.0.1:17456" })
        .mockResolvedValueOnce({ ok: true, value: "http://127.0.0.1:17456/" })
        .mockResolvedValueOnce({ ok: true, path: "/tmp/open-design-linux.png" });

      const result = await inspectPackedLinuxApp(config, {
        expr: "location.href",
        path: "/tmp/open-design-linux.png",
      });

      expect(result.status?.url).toBe("http://127.0.0.1:17456");
      expect(result.eval).toEqual({ ok: true, value: "http://127.0.0.1:17456/" });
      expect(result.screenshot).toEqual({ ok: true, path: "/tmp/open-design-linux.png" });
      expect(requestJsonIpc).toHaveBeenNthCalledWith(
        1,
        "/tmp/open-design/ipc/linux-tauri/desktop.sock",
        { type: SIDECAR_MESSAGES.STATUS },
        { timeoutMs: 2000 },
      );
      expect(requestJsonIpc).toHaveBeenNthCalledWith(
        2,
        "/tmp/open-design/ipc/linux-tauri/desktop.sock",
        { input: { expression: "location.href" }, type: SIDECAR_MESSAGES.EVAL },
        { timeoutMs: 5000 },
      );
      expect(requestJsonIpc).toHaveBeenNthCalledWith(
        3,
        "/tmp/open-design/ipc/linux-tauri/desktop.sock",
        { input: { path: "/tmp/open-design-linux.png" }, type: SIDECAR_MESSAGES.SCREENSHOT },
        { timeoutMs: 10000 },
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("stopPackedLinuxApp", () => {
  it("accepts a live tools-pack AppImage marker executable when /proc ownership data is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-linux-lifecycle-"));
    const markerMountRoot = join("/tmp", `.mount_open-design-${process.pid}`);
    const markerExecutablePath = join(markerMountRoot, "usr", "bin", "open-design-desktop-tauri");
    try {
      const config = makeConfig(root);
      const markerPath = join(config.roots.runtime.namespaceRoot, "runtime", "desktop-root.json");
      const stamp = {
        app: APP_KEYS.DESKTOP,
        ipc: "/tmp/open-design/ipc/linux-tauri/desktop.sock",
        mode: SIDECAR_MODES.RUNTIME,
        namespace: config.namespace,
        source: SIDECAR_SOURCES.TOOLS_PACK,
      };
      await mkdir(join(markerPath, ".."), { recursive: true });
      await mkdir(dirname(markerExecutablePath), { recursive: true });
      await writeFile(markerExecutablePath, "#!/bin/sh\n", "utf8");
      await writeFile(
        markerPath,
        `${JSON.stringify({
          appPath: "/tmp/.mount_open-design/usr/lib/open-design",
          executablePath: markerExecutablePath,
          logPath: join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.DESKTOP, "latest.log"),
          namespaceRoot: config.roots.runtime.namespaceRoot,
          pid: 1234,
          ppid: 1,
          stamp,
          startedAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-20T00:00:00.000Z",
          version: 1,
        }, null, 2)}\n`,
        "utf8",
      );
      vi.mocked(platform.listProcessSnapshots).mockResolvedValueOnce([
        {
          command: "/tmp/.mount_open-design/usr/bin/open-design-desktop-tauri --fake-stamp",
          pid: 1234,
          ppid: 1,
        },
      ]);
      vi.mocked(platform.collectProcessTreePids).mockReturnValueOnce([1234]);
      vi.mocked(platform.stopProcesses).mockResolvedValueOnce({
        alreadyStopped: false,
        forcedPids: [],
        matchedPids: [1234],
        remainingPids: [],
        stoppedPids: [1234],
      });

      const result = await stopPackedLinuxApp(config);

      expect(result.status).toBe("stopped");
      expect(result.remainingPids).toEqual([]);
      expect(platform.matchesStampedProcess).toHaveBeenCalledWith(
        expect.objectContaining({ pid: 1234 }),
        stamp,
        OPEN_DESIGN_SIDECAR_CONTRACT,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(markerMountRoot, { force: true, recursive: true });
    }
  });
});

describe("startPackedLinuxHeadless", () => {
  it("starts from the Linux assembled app and resource tree used by Tauri builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-linux-lifecycle-"));
    try {
      const config = makeConfig(root);
      const entryPath = join(
        config.roots.output.namespaceRoot,
        "assembled",
        "app",
        "node_modules",
        "@open-design",
        "packaged",
        "dist",
        "headless.mjs",
      );
      const nodePath = join(config.roots.output.namespaceRoot, "resources", "open-design", "bin", "node");
      mockState.markerPath = join(config.roots.runtime.namespaceRoot, "runtime", "headless-root.json");
      mockState.webIdentityPath = join(config.roots.runtime.namespaceRoot, "runtime", "web-root.json");

      await mkdir(join(entryPath, ".."), { recursive: true });
      await mkdir(join(nodePath, ".."), { recursive: true });
      await writeFile(entryPath, "export {};\n", "utf8");
      await writeFile(nodePath, "#!/bin/sh\nexit 0\n", "utf8");

      const result = await startPackedLinuxHeadless(config);
      const spawnCall = spawnBackgroundProcess.mock.calls[0]?.[0];

      expect(result.status.url).toBe("http://127.0.0.1:17456");
      expect(spawnCall?.command).toBe(nodePath);
      expect(spawnCall?.args).toEqual([entryPath]);
      expect(spawnCall?.env.OD_PACKAGED_NAMESPACE).toBe(config.namespace);
      expect(spawnCall?.env.OD_DATA_DIR).toBe(join(config.roots.runtime.namespaceBaseRoot, ".."));
      expect(spawnCall?.env.OD_RESOURCE_ROOT).toBe(join(config.roots.output.namespaceRoot, "resources", "open-design"));
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
