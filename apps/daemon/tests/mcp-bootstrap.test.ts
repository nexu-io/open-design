import { MCP_BOOTSTRAP_CONTRACT } from "@open-design/sidecar-proto";
import { describe, expect, it, vi } from "vitest";

import {
  ensureMcpDaemonUrl,
  parseManagedMcpDiscovery,
  planMcpDaemonBootstrap,
} from "../src/mcp-bootstrap.js";

// A clock the test controls, so retry budgets are exact and nothing waits in
// real time. `sleep` advances it; slow fakes call `advance` to model discovery
// and health answers that take their full timeout.
function fakeClock() {
  let current = 1_000_000;
  const start = current;
  return {
    now: () => current,
    sleep: async (milliseconds: number) => {
      current += milliseconds;
    },
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
    elapsed: () => current - start,
  };
}

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
    const clock = fakeClock();
    const resolveDaemonUrl = vi.fn(async () => "http://127.0.0.1:7456");
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl: async () => null,
      resolveDaemonUrl,
      probeDaemon: async () => true,
      ...clock,
    })).rejects.toThrow(/unavailable/i);
    expect(resolveDaemonUrl).not.toHaveBeenCalled();
  });

  // #8853: a busy host can miss one 800 ms sidecar or health answer. A
  // registration with no launcher has nothing else to fall back to, so it
  // has to retry instead of exiting on the first slow answer.
  it("retries a slow sidecar answer instead of failing on the first attempt", async () => {
    const clock = fakeClock();
    const discoverTargetDaemonUrl = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("http://127.0.0.1:61234");
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl,
      probeDaemon: async () => true,
      ...clock,
    })).resolves.toBe("http://127.0.0.1:61234");
    expect(discoverTargetDaemonUrl).toHaveBeenCalledTimes(3);
    const timeouts = discoverTargetDaemonUrl.mock.calls.map(([, timeoutMs]) => timeoutMs as number);
    expect(timeouts[0]).toBe(800);
    expect(timeouts[1]).toBeGreaterThan(timeouts[0]!);
  });

  it("retries a slow health answer for a discovered daemon", async () => {
    const clock = fakeClock();
    const probeDaemon = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl: async () => "http://127.0.0.1:61234",
      probeDaemon,
      ...clock,
    })).resolves.toBe("http://127.0.0.1:61234");
    expect(probeDaemon).toHaveBeenCalledTimes(2);
    expect(probeDaemon.mock.calls[1]![1]).toBeGreaterThan(probeDaemon.mock.calls[0]![1] as number);
  });

  it("retries discovery for an unregistered source-checkout daemon", async () => {
    const clock = fakeClock();
    const resolveDaemonUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error("Open Design daemon could not be discovered."))
      .mockResolvedValueOnce("http://127.0.0.1:60001");
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: () => null,
      resolveDaemonUrl,
      probeDaemon: async () => true,
      ...clock,
    })).resolves.toBe("http://127.0.0.1:60001");
    expect(resolveDaemonUrl).toHaveBeenCalledTimes(2);
  });

  it("stops retrying within a bounded budget when the daemon stays unavailable", async () => {
    const clock = fakeClock();
    const discoverTargetDaemonUrl = vi.fn(async () => null);
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl,
      probeDaemon: async () => true,
      ...clock,
    })).rejects.toThrow(/bootstrap-unavailable/);
    expect(discoverTargetDaemonUrl.mock.calls.length).toBeGreaterThan(1);
    // Startup must still settle well inside an MCP client's startup timeout.
    expect(clock.elapsed()).toBeLessThanOrEqual(6_000);
  });

  it("keeps discovery and health probes inside the startup budget when every answer is slow", async () => {
    const clock = fakeClock();
    const discoveryTimeouts: number[] = [];
    const probeTimeouts: number[] = [];
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      // Each call answers only when its timeout runs out.
      discoverTargetDaemonUrl: async (_env, timeoutMs) => {
        discoveryTimeouts.push(timeoutMs);
        clock.advance(timeoutMs);
        return "http://127.0.0.1:61234";
      },
      probeDaemon: async (_url, timeoutMs = 800) => {
        probeTimeouts.push(timeoutMs);
        clock.advance(timeoutMs);
        return false;
      },
      ...clock,
    })).rejects.toThrow(/bootstrap-unavailable/);
    expect(discoveryTimeouts.length).toBeGreaterThan(1);
    expect(clock.elapsed()).toBeLessThanOrEqual(6_000);
    for (const timeoutMs of [...discoveryTimeouts, ...probeTimeouts]) {
      expect(timeoutMs).toBeGreaterThan(0);
    }
  });

  it("reports the original discovery error once the budget is spent", async () => {
    const clock = fakeClock();
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: () => null,
      resolveDaemonUrl: async () => {
        throw new Error("Open Design daemon could not be discovered.");
      },
      probeDaemon: async () => true,
      ...clock,
    })).rejects.toThrow(/could not be discovered/);
  });

  it("does not wait out a registration that can never launch", async () => {
    const clock = fakeClock();
    const discoverTargetDaemonUrl = vi.fn(async () => null);
    await expect(ensureMcpDaemonUrl({
      env: { OD_MCP_BOOTSTRAP_COMMAND: "open-design", OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' },
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl,
      probeDaemon: async () => true,
      ...clock,
    })).rejects.toThrow(/invalid-bootstrap-command/);
    expect(discoverTargetDaemonUrl).toHaveBeenCalledTimes(1);
  });

  it("makes a single attempt when the caller gives it no retry budget", async () => {
    const clock = fakeClock();
    const discoverTargetDaemonUrl = vi.fn(async () => null);
    await expect(ensureMcpDaemonUrl({
      env: {},
      connectInherited: (() => ({ status: vi.fn() })) as never,
      discoverTargetDaemonUrl,
      discoveryRetryBudgetMs: 0,
      probeDaemon: async () => true,
      ...clock,
    })).rejects.toThrow(/bootstrap-unavailable/);
    expect(discoverTargetDaemonUrl).toHaveBeenCalledTimes(1);
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

describe("managed MCP registrations", () => {
  const managedEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open",
    OD_MCP_BOOTSTRAP_ARGS: JSON.stringify(["-g", "-j", "/Applications/Open Design.app", "--args", "--headless", MCP_BOOTSTRAP_CONTRACT.MANAGED_ARG]),
    [MCP_BOOTSTRAP_CONTRACT.DISCOVERY_ENV]: JSON.stringify({
      daemon: ["/ipc/daemon-runtime.sock", "/ipc/daemon-headless.sock"],
      desktop: ["/ipc/desktop-runtime.sock", "/ipc/desktop-headless.sock"],
    }),
    // Registered while the desktop owned the namespace.
    OD_SIDECAR_CLIENT_ENDPOINT: "/ipc/daemon-runtime.sock",
    ...overrides,
  });

  function statusReader(statuses: Record<string, unknown>) {
    return vi.fn(async (endpoint: string) => (statuses[endpoint] ?? null) as never);
  }

  it("parses only well-formed managed registrations", () => {
    expect(parseManagedMcpDiscovery(managedEnv())).toEqual({
      daemon: ["/ipc/daemon-runtime.sock", "/ipc/daemon-headless.sock"],
      desktop: ["/ipc/desktop-runtime.sock", "/ipc/desktop-headless.sock"],
    });
    expect(parseManagedMcpDiscovery({ ...managedEnv(), OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' })).toBeNull();
    expect(parseManagedMcpDiscovery(managedEnv({ [MCP_BOOTSTRAP_CONTRACT.DISCOVERY_ENV]: "{" }))).toBeNull();
    expect(parseManagedMcpDiscovery(managedEnv({ [MCP_BOOTSTRAP_CONTRACT.DISCOVERY_ENV]: '{"daemon":[],"desktop":[]}' }))).toBeNull();
  });

  it("finds the daemon in the other mode when the registered endpoint is gone", async () => {
    const statusAtEndpoint = statusReader({ "/ipc/daemon-headless.sock": { state: "running", url: "http://127.0.0.1:50861" } });
    const spawnBootstrap = vi.fn(async () => undefined);
    await expect(ensureMcpDaemonUrl({
      env: managedEnv(), probeDaemon: async () => true, spawnBootstrap, statusAtEndpoint,
    })).resolves.toBe("http://127.0.0.1:50861");
    expect(spawnBootstrap).not.toHaveBeenCalled();
  });

  it("waits for a running owner instead of reopening the app", async () => {
    let daemonUp = false;
    const statusAtEndpoint = vi.fn(async (endpoint: string) => {
      if (endpoint === "/ipc/desktop-headless.sock") return { state: "running" } as never;
      if (endpoint === "/ipc/daemon-headless.sock" && daemonUp) return { state: "running", url: "http://127.0.0.1:50900" } as never;
      return null;
    });
    const spawnBootstrap = vi.fn(async () => undefined);
    const sleep = vi.fn(async () => { daemonUp = true; });
    await expect(ensureMcpDaemonUrl({
      env: managedEnv(), probeDaemon: async () => true, sleep, spawnBootstrap, statusAtEndpoint,
    })).resolves.toBe("http://127.0.0.1:50900");
    expect(spawnBootstrap).not.toHaveBeenCalled();
  });

  it("cold-starts exactly once when nothing owns the namespace", async () => {
    let launched = false;
    const statusAtEndpoint = vi.fn(async (endpoint: string) =>
      launched && endpoint === "/ipc/daemon-headless.sock" ? { state: "running", url: "http://127.0.0.1:51000" } as never : null);
    const spawnBootstrap = vi.fn(async () => { launched = true; });
    await expect(ensureMcpDaemonUrl({
      env: managedEnv(), probeDaemon: async () => true, sleep: async () => undefined, spawnBootstrap, statusAtEndpoint,
    })).resolves.toBe("http://127.0.0.1:51000");
    expect(spawnBootstrap).toHaveBeenCalledTimes(1);
    expect(spawnBootstrap).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining(["--headless", MCP_BOOTSTRAP_CONTRACT.MANAGED_ARG]),
      command: "/usr/bin/open",
    }));
  });

  it("keeps the unmanaged path for registrations from an older outer", async () => {
    const statusAtEndpoint = vi.fn(async () => null);
    await expect(ensureMcpDaemonUrl({
      env: { OD_MCP_BOOTSTRAP_COMMAND: "/usr/bin/open", OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' },
      connectInherited: () => null,
      probeDaemon: async () => true,
      statusAtEndpoint,
    })).rejects.toThrow(/registration.*refresh/i);
    expect(statusAtEndpoint).not.toHaveBeenCalled();
  });
});
