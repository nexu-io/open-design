import { describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquirePackagedHeadlessStartup,
  parsePackagedHeadlessRequest,
  resolvePackagedMcpBootstrapLaunch,
  runPackagedMcpActionAgainstExistingDaemon,
} from "../src/headless-runtime.js";
import { APP_KEYS, SIDECAR_SOURCES } from "@open-design/sidecar-proto";

describe("parsePackagedHeadlessRequest", () => {
  it("accepts a headless Codex MCP install request", () => {
    expect(parsePackagedHeadlessRequest([
      "--headless",
      "--mcp-install",
      "codex",
    ])).toEqual({
      headless: true,
      mcpInstallAgent: "codex",
    });
  });

  it("rejects unsupported MCP install targets", () => {
    expect(() => parsePackagedHeadlessRequest([
      "--headless",
      "--mcp-install",
      "claude",
    ])).toThrow(/only supports codex/i);
  });
});

describe("resolvePackagedMcpBootstrapLaunch", () => {
  it("keeps one stable macOS bootstrap alias pointed at the active payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-mcp-bootstrap-alias-"));
    try {
      const namespaceRoot = join(root, "launcher", "channels", "stable", "namespaces", "release-stable");
      const firstBundle = join(namespaceRoot, "versions", "0.21.0", "payload", "Open Design.app");
      const secondBundle = join(namespaceRoot, "versions", "0.21.1", "payload", "Open Design.app");
      await mkdir(join(firstBundle, "Contents", "MacOS"), { recursive: true });
      await mkdir(join(secondBundle, "Contents", "MacOS"), { recursive: true });

      const first = await resolvePackagedMcpBootstrapLaunch({
        currentExecutablePath: join(firstBundle, "Contents", "MacOS", "Open Design"),
        installedLaunchPath: "/Applications/Open Design.app",
        launcherNamespaceRoot: namespaceRoot,
        platform: "darwin",
      });
      const stableBundle = join(namespaceRoot, "active", "Open Design.app");
      expect(first).toEqual({
        command: "/usr/bin/open",
        args: ["-g", "-j", stableBundle, "--args", "--headless"],
      });
      expect(await readlink(stableBundle)).toBe(firstBundle);

      const second = await resolvePackagedMcpBootstrapLaunch({
        currentExecutablePath: join(secondBundle, "Contents", "MacOS", "Open Design"),
        installedLaunchPath: "/Applications/Open Design.app",
        launcherNamespaceRoot: namespaceRoot,
        platform: "darwin",
      });
      expect(second.args[2]).toBe(stableBundle);
      expect(await readlink(stableBundle)).toBe(secondBundle);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("invokes a non-macOS installed launcher directly", async () => {
    await expect(resolvePackagedMcpBootstrapLaunch({
      currentExecutablePath: "/tmp/payload/open-design",
      installedLaunchPath: "/opt/open-design/open-design",
      platform: "linux",
    })).resolves.toEqual({
      command: "/opt/open-design/open-design",
      args: ["--headless"],
    });
  });
});

describe("runPackagedMcpActionAgainstExistingDaemon", () => {
  const launchStamp = {
    app: APP_KEYS.DESKTOP,
    channel: "beta",
    mode: "headless",
    namespace: "release-beta",
    source: "packaged",
  } as const;

  it("installs through a healthy existing headless daemon without bootstrapping", async () => {
    const installMcp = vi.fn(async () => undefined);
    const getStatus = vi.fn(async () => ({
      state: "running",
      url: "http://127.0.0.1:7457",
    }));

    await expect(runPackagedMcpActionAgainstExistingDaemon(
      { headless: true, mcpInstallAgent: "codex" },
      launchStamp,
      { getStatus: getStatus as never, installMcp },
    )).resolves.toBe(true);
    expect(getStatus).toHaveBeenCalledWith(
      { ...launchStamp, app: APP_KEYS.DAEMON },
      { timeoutMs: 350 },
    );
    expect(installMcp).toHaveBeenCalledWith("http://127.0.0.1:7457");
  });

  it("leaves bootstrap to the caller when no healthy daemon exists", async () => {
    const installMcp = vi.fn(async () => undefined);
    await expect(runPackagedMcpActionAgainstExistingDaemon(
      { headless: true, mcpInstallAgent: "codex" },
      launchStamp,
      {
        getStatus: vi.fn(async () => ({ state: "stopped", url: "http://127.0.0.1:7457" })) as never,
        installMcp,
      },
    )).resolves.toBe(false);
    expect(installMcp).not.toHaveBeenCalled();
  });

  it("finds a packaged-source daemon for a tools-pack request", async () => {
    const installMcp = vi.fn(async () => undefined);
    const getStatus = vi.fn(async (candidate: { source: string }) => candidate.source === SIDECAR_SOURCES.PACKAGED
      ? { state: "running", url: "http://127.0.0.1:7457" }
      : Promise.reject(new Error("missing endpoint")));
    await expect(runPackagedMcpActionAgainstExistingDaemon(
      { headless: true, mcpInstallAgent: "codex" },
      { ...launchStamp, source: SIDECAR_SOURCES.TOOLS_PACK },
      { getStatus: getStatus as never, installMcp },
    )).resolves.toBe(true);
    expect(getStatus.mock.calls.map(([candidate]) => candidate.source)).toEqual([
      SIDECAR_SOURCES.TOOLS_PACK,
      SIDECAR_SOURCES.PACKAGED,
    ]);
    expect(installMcp).toHaveBeenCalledWith("http://127.0.0.1:7457");
  });
});

describe("acquirePackagedHeadlessStartup", () => {
  function createDependencies(failAt: "mcp" | "none") {
    const closed: string[] = [];
    return {
      closed,
      dependencies: {
        confirmRuntime: vi.fn(async () => undefined),
        installMcp: vi.fn(async () => {
          if (failAt === "mcp") throw new Error("MCP install failed");
        }),
        startSidecars: vi.fn(async () => ({
          close: async () => {
            closed.push("sidecars");
          },
          currentWebUrl: () => "http://127.0.0.1:7456",
          daemon: {
            desktopAuthGateActive: false,
            state: "running" as const,
            url: "http://127.0.0.1:7457",
          },
          web: { state: "running" as const, url: "http://127.0.0.1:7456" },
        })),
      },
    };
  }

  it("closes sidecars when MCP installation fails", async () => {
    const { closed, dependencies } = createDependencies("mcp");

    await expect(acquirePackagedHeadlessStartup(dependencies)).rejects.toThrow(
      "MCP install failed",
    );

    expect(closed).toEqual(["sidecars"]);
  });

  it("returns a shutdown handle that closes sidecars", async () => {
    const { closed, dependencies } = createDependencies("none");
    const handle = await acquirePackagedHeadlessStartup(dependencies);
    await handle.shutdown();
    expect(closed).toEqual(["sidecars"]);
  });
});
