import { describe, expect, it, vi } from "vitest";

import {
  acquireOrAdoptPackagedHeadlessStartup,
  acquirePackagedHeadlessStartup,
  parsePackagedHeadlessRequest,
  resolvePackagedMcpBootstrapLaunch,
} from "../src/headless-runtime.js";

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
  it("uses macOS open against the stable signed app bundle", () => {
    expect(resolvePackagedMcpBootstrapLaunch({
      currentExecutablePath:
        "/private/payload/Open Design.app/Contents/MacOS/Open Design",
      installedLaunchPath: "/Applications/Open Design.app",
      platform: "darwin",
    })).toEqual({
      command: "/usr/bin/open",
      args: [
        "-g",
        "-j",
        "/Applications/Open Design.app",
        "--args",
        "--headless",
      ],
    });
  });

  it("invokes a non-macOS installed launcher directly", () => {
    expect(resolvePackagedMcpBootstrapLaunch({
      currentExecutablePath: "/tmp/payload/open-design",
      installedLaunchPath: "/opt/open-design/open-design",
      platform: "linux",
    })).toEqual({
      command: "/opt/open-design/open-design",
      args: ["--headless"],
    });
  });
});

describe("acquirePackagedHeadlessStartup", () => {
  function createDependencies(failAt: "mcp" | "web-identity") {
    const closed: string[] = [];
    const exit = vi.fn();
    return {
      closed,
      dependencies: {
        confirmRuntime: vi.fn(async () => undefined),
        createIpcServer: vi.fn(async () => ({
          close: async () => {
            closed.push("ipc");
          },
        })),
        exit,
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
        writeIdentity: vi.fn(async () => ({
          close: async () => {
            closed.push("identity");
          },
          identity: {} as never,
        })),
        writeWebIdentity: vi.fn(async () => {
          if (failAt === "web-identity") {
            throw new Error("web identity write failed");
          }
        }),
      },
      exit,
    };
  }

  it("closes identity and sidecars when MCP installation fails", async () => {
    const { closed, dependencies, exit } = createDependencies("mcp");

    await expect(acquirePackagedHeadlessStartup(dependencies)).rejects.toThrow(
      "MCP install failed",
    );

    expect(closed).toEqual(["ipc", "sidecars", "identity"]);
    expect(exit).not.toHaveBeenCalled();
  });

  it("closes IPC, sidecars, and identity when identity publication fails", async () => {
    const { closed, dependencies, exit } = createDependencies("web-identity");

    await expect(acquirePackagedHeadlessStartup(dependencies)).rejects.toThrow(
      "web identity write failed",
    );

    expect(closed).toEqual(["ipc", "sidecars", "identity"]);
    expect(exit).not.toHaveBeenCalled();
  });

  it('claims desktop IPC before starting sidecars so concurrent bootstrap has one owner', async () => {
    const { dependencies } = createDependencies('mcp');
    const order: string[] = [];
    dependencies.createIpcServer.mockImplementation(async () => {
      order.push('ipc');
      return { close: async () => undefined };
    });
    dependencies.startSidecars.mockImplementation(async () => {
      order.push('sidecars');
      throw new Error('stop after ownership order');
    });

    await expect(acquirePackagedHeadlessStartup(dependencies)).rejects.toThrow(
      'stop after ownership order',
    );

    expect(order).toEqual(['ipc', 'sidecars']);
  });

  it('adopts a concurrent owner without restarting its active run', async () => {
    const { dependencies } = createDependencies('web-identity');
    let ipcClaimed = false;
    let activeRunState: 'running' | 'completed' = 'running';
    const childSignals: string[] = [];
    dependencies.createIpcServer.mockImplementation(async () => {
      if (ipcClaimed) {
        const error = new Error('desktop IPC is already owned') as NodeJS.ErrnoException;
        error.code = 'EADDRINUSE';
        throw error;
      }
      ipcClaimed = true;
      return {
        close: async () => {
          ipcClaimed = false;
          childSignals.push('SIGTERM');
        },
      };
    });
    dependencies.writeWebIdentity.mockResolvedValue(undefined);
    dependencies.startSidecars.mockImplementation(async () => ({
      close: async () => {
        childSignals.push('SIGTERM');
      },
      currentWebUrl: () => 'http://127.0.0.1:7456',
      daemon: {
        desktopAuthGateActive: false,
        state: 'running' as const,
        url: 'http://127.0.0.1:7457',
      },
      web: { state: 'running' as const, url: 'http://127.0.0.1:7456' },
    }));
    const inspectExistingOwner = vi.fn(async () => ipcClaimed
      ? { state: 'running' as const, webUrl: 'http://127.0.0.1:7456' }
      : null);

    const [first, second] = await Promise.all([
      acquireOrAdoptPackagedHeadlessStartup(dependencies, { inspectExistingOwner }),
      acquireOrAdoptPackagedHeadlessStartup(dependencies, { inspectExistingOwner }),
    ]);

    activeRunState = 'completed';
    expect([first.ownership, second.ownership].sort()).toEqual(['adopted', 'owner']);
    expect(dependencies.startSidecars).toHaveBeenCalledTimes(1);
    expect(activeRunState).toBe('completed');
    expect(childSignals).toEqual([]);
  });
});
