import { describe, expect, it, vi } from "vitest";

import {
  ensureMcpDaemonUrl,
  planMcpDaemonBootstrap,
} from "../src/mcp-bootstrap.js";

describe("planMcpDaemonBootstrap", () => {
  it("does not override an explicit daemon URL", () => {
    expect(planMcpDaemonBootstrap({
      daemonReachable: false,
      explicitDaemonUrl: true,
      env: {
        OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open",
        OD_MCP_BOOTSTRAP_ARGS:
          '["-g","-j","/Applications/Open Design.app","--args","--headless"]',
      },
    })).toEqual({
      action: "none",
      reason: "explicit-daemon-url",
    });
  });

  it("removes Electron-as-Node before launching the signed app headlessly", () => {
    const plan = planMcpDaemonBootstrap({
      daemonReachable: false,
      explicitDaemonUrl: false,
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        OD_DAEMON_URL: "http://127.0.0.1:1",
        OD_DATA_DIR: "/tmp/open-design-data",
        OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open",
        OD_MCP_BOOTSTRAP_ARGS:
          '["-g","-j","/Applications/Open Design.app","--args","--headless"]',
      },
    });

    expect(plan).toMatchObject({
      action: "spawn",
      command: "/usr/bin/open",
      args: [
        "-g",
        "-j",
        "/Applications/Open Design.app",
        "--args",
        "--headless",
      ],
    });
    if (plan.action !== "spawn") throw new Error("expected spawn plan");
    expect(plan.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(plan.env.OD_DAEMON_URL).toBeUndefined();
    expect(plan.env.OD_DATA_DIR).toBe("/tmp/open-design-data");
  });

  it("refuses a relative or non-headless bootstrap command", () => {
    expect(planMcpDaemonBootstrap({
      daemonReachable: false,
      explicitDaemonUrl: false,
      env: {
        OD_MCP_BOOTSTRAP_COMMAND: "open-design",
        OD_MCP_BOOTSTRAP_ARGS: '["--headless"]',
      },
    })).toEqual({
      action: "none",
      reason: "invalid-bootstrap-command",
    });
    expect(planMcpDaemonBootstrap({
      daemonReachable: false,
      explicitDaemonUrl: false,
      env: {
        OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open",
        OD_MCP_BOOTSTRAP_ARGS: '["/Applications/Open Design.app"]',
      },
    })).toEqual({
      action: "none",
      reason: "invalid-bootstrap-args",
    });
  });
});

describe("ensureMcpDaemonUrl", () => {
  it("rejects an old bootstrap registration without a sidecar capability before probing another daemon", async () => {
    const resolveDaemonUrl = vi.fn(async () => "http://127.0.0.1:7456");
    const probeDaemon = vi.fn(async () => true);
    const spawnBootstrap = vi.fn(async () => undefined);
    await expect(ensureMcpDaemonUrl({
      env: { OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open", OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' },
      connectInherited: () => null,
      resolveDaemonUrl, probeDaemon, spawnBootstrap,
    })).rejects.toThrow(/registration.*refresh/i);
    expect(resolveDaemonUrl).not.toHaveBeenCalled();
    expect(probeDaemon).not.toHaveBeenCalled();
    expect(spawnBootstrap).not.toHaveBeenCalled();
  });

  it("keeps a stale inherited endpoint authoritative even without bootstrap arguments", async () => {
    const resolveDaemonUrl = vi.fn(async () => "http://127.0.0.1:7456");
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl: async () => null,
      resolveDaemonUrl,
      probeDaemon: async () => true,
    })).rejects.toThrow(/unavailable/i);
    expect(resolveDaemonUrl).not.toHaveBeenCalled();
  });

  it("does not allow a guessed default URL when discovering an unregistered MCP daemon", async () => {
    const resolveDaemonUrl = vi.fn(async () => "http://127.0.0.1:60001");
    await ensureMcpDaemonUrl({ env: {}, connectInherited: () => null, resolveDaemonUrl, probeDaemon: async () => true });
    expect(resolveDaemonUrl).toHaveBeenCalledWith(expect.objectContaining({ allowLegacyDefault: false }));
  });

  it("does not substitute an unrelated tools-dev daemon for the registered packaged IPC", async () => {
    const spawnBootstrap = vi.fn(async () => undefined);
    const discoverTargetDaemonUrl = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("http://127.0.0.1:61234");
    const resolveDaemonUrl = vi
      .fn()
      .mockResolvedValue("http://127.0.0.1:56513");
    const probeDaemon = vi.fn(async () => true);

    await expect(ensureMcpDaemonUrl({
      env: {
        OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open",
        OD_MCP_BOOTSTRAP_ARGS:
          '["-g","-j","/Applications/Open Design.app","--args","--headless"]',
      },
      connectInherited: (() => ({ invoke: vi.fn(), status: vi.fn() })) as never,
      discoverTargetDaemonUrl,
      probeDaemon,
      resolveDaemonUrl,
      sleep: async () => undefined,
      spawnBootstrap,
      timeoutMs: 1_000,
    })).resolves.toBe("http://127.0.0.1:61234");

    expect(resolveDaemonUrl).not.toHaveBeenCalled();
    expect(spawnBootstrap).toHaveBeenCalledTimes(1);
  });

  it("spawns once and waits for the sidecar-discovered daemon", async () => {
    const spawnBootstrap = vi.fn(async () => undefined);
    const discoverTargetDaemonUrl = vi
      .fn()
      .mockResolvedValueOnce("http://127.0.0.1:7456")
      .mockResolvedValueOnce("http://127.0.0.1:61234");
    const probeDaemon = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(ensureMcpDaemonUrl({
      env: {
        OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open",
        OD_MCP_BOOTSTRAP_ARGS:
          '["-g","-j","/Applications/Open Design.app","--args","--headless"]',
      },
      probeDaemon,
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl,
      sleep: async () => undefined,
      spawnBootstrap,
      timeoutMs: 1_000,
    })).resolves.toBe("http://127.0.0.1:61234");

    expect(spawnBootstrap).toHaveBeenCalledTimes(1);
  });
});
