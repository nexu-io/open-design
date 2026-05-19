import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { resolveWinPaths } from "../src/win/paths.js";

const requestJsonIpc = vi.fn(async () => ({ state: "running", url: "http://127.0.0.1:17456" }));
const resolveAppIpcPath = vi.fn(() => String.raw`\\.\pipe\open-design-test-desktop`);
const createSidecarLaunchEnv = vi.fn(({ extraEnv }: { extraEnv: NodeJS.ProcessEnv }) => extraEnv);
const spawnBackgroundProcess = vi.fn(async ({ env }: { env: NodeJS.ProcessEnv }) => ({ env, pid: 1234 }));

vi.mock("@open-design/sidecar", () => ({
  createSidecarLaunchEnv,
  requestJsonIpc,
  resolveAppIpcPath,
}));

vi.mock("@open-design/platform", () => ({
  collectProcessTreePids: vi.fn(),
  createProcessStampArgs: vi.fn(() => []),
  listProcessSnapshots: vi.fn(async () => []),
  matchesStampedProcess: vi.fn(() => false),
  readLogTail: vi.fn(async () => []),
  spawnBackgroundProcess,
  stopProcesses: vi.fn(async () => []),
}));

const { startPackedWinApp } = await import("../src/win/lifecycle.js");

function makeConfig(root: string, overrides: Partial<ToolPackConfig> = {}): ToolPackConfig {
  return {
    containerized: false,
    desktopRuntime: "tauri",
    electronBuilderCliPath: "/x/electron-builder/cli.js",
    electronDistPath: "/x/electron/dist",
    electronVersion: "41.3.0",
    macCompression: "normal",
    namespace: "win-tauri",
    platform: "win",
    portable: true,
    removeData: false,
    removeLogs: false,
    removeProductUserData: false,
    removeSidecars: false,
    roots: {
      output: {
        appBuilderRoot: join(root, ".tmp", "tools-pack", "out", "win", "namespaces", "win-tauri", "builder"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "out", "win", "namespaces", "win-tauri"),
        platformRoot: join(root, ".tmp", "tools-pack", "out", "win"),
        root: join(root, ".tmp", "tools-pack", "out"),
      },
      runtime: {
        namespaceBaseRoot: join(root, ".tmp", "tools-pack", "runtime", "win", "namespaces"),
        namespaceRoot: join(root, ".tmp", "tools-pack", "runtime", "win", "namespaces", "win-tauri"),
      },
      cacheRoot: join(root, ".tmp", "tools-pack", "cache"),
      toolPackRoot: join(root, ".tmp", "tools-pack"),
    },
    silent: true,
    signed: false,
    tauriCliPath: "/x/tauri/main.js",
    tauriConfigPath: join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"),
    to: "nsis",
    webOutputMode: "server",
    workspaceRoot: root,
    ...overrides,
  };
}

describe("startPackedWinApp", () => {
  it("passes a namespace-scoped launch config override for installed Tauri apps", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-win-lifecycle-"));
    try {
      const config = makeConfig(root);
      const paths = resolveWinPaths(config);
      const embeddedConfigPath = join(paths.installDir, "resources", "open-design-config.json");

      await mkdir(join(paths.installDir, "resources"), { recursive: true });
      await writeFile(paths.installedExePath, "", "utf8");
      await writeFile(
        embeddedConfigPath,
        `${JSON.stringify({ appVersion: "1.2.3", namespace: "baked", webOutputMode: "server" }, null, 2)}\n`,
        "utf8",
      );

      const result = await startPackedWinApp(config);
      const launchEnv = spawnBackgroundProcess.mock.calls[0]?.[0]?.env as NodeJS.ProcessEnv | undefined;
      const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "open-design-config.json");
      const launchConfig = JSON.parse(await readFile(launchConfigPath, "utf8")) as Record<string, unknown>;

      expect(result.source).toBe("installed");
      expect(result.status?.state).toBe("running");
      expect(launchEnv?.OD_PACKAGED_CONFIG_PATH).toBe(launchConfigPath);
      expect(launchConfig.appVersion).toBe("1.2.3");
      expect(launchConfig.namespace).toBe(config.namespace);
      expect(launchConfig.namespaceBaseRoot).toBe(config.roots.runtime.namespaceBaseRoot);
    } finally {
      await rm(root, { force: true, recursive: true });
      vi.clearAllMocks();
    }
  });
});
