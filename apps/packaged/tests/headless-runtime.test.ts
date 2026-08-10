import { describe, expect, it, vi } from "vitest";

import {
  acquireOrAdoptPackagedHeadlessStartup,
  acquirePackagedHeadlessStartup,
  parsePackagedHeadlessRequest,
  type PackagedHeadlessStartupDependencies,
  repairCodexMcpRegistrationViaLiveOwner,
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
  function createDependencies(failAt: "mcp" | "web-identity" | null) {
    const closed: string[] = [];
    const exit = vi.fn();
    const createIpcServer = vi.fn<
      PackagedHeadlessStartupDependencies["createIpcServer"]
    >(async () => ({
      close: async () => {
        closed.push("ipc");
      },
    }));
    const startSidecars = vi.fn<
      PackagedHeadlessStartupDependencies["startSidecars"]
    >(async () => ({
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
    }));
    return {
      closed,
      dependencies: {
        confirmRuntime: vi.fn(async () => undefined),
        createIpcServer,
        exit,
        installMcp: vi.fn(async () => {
          if (failAt === "mcp") throw new Error("MCP install failed");
        }),
        startSidecars,
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

  it('repairs stale MCP registration through a healthy owner before adopting it', async () => {
    const { dependencies } = createDependencies('web-identity');
    const repairAdoptedOwner = vi.fn(async () => undefined);

    const adopted = await acquireOrAdoptPackagedHeadlessStartup(dependencies, {
      inspectExistingOwner: async () => ({
        state: 'running',
        webUrl: 'http://127.0.0.1:7456',
      }),
      repairAdoptedOwner,
    });

    expect(adopted).toEqual({
      ownership: 'adopted',
      webUrl: 'http://127.0.0.1:7456',
    });
    expect(repairAdoptedOwner).toHaveBeenCalledOnce();
    expect(repairAdoptedOwner).toHaveBeenCalledWith('http://127.0.0.1:7456');
    expect(dependencies.startSidecars).not.toHaveBeenCalled();
  });

  it('publishes a respawned web URL so adoption repairs through the live listener', async () => {
    const { dependencies } = createDependencies(null);
    let liveWebUrl = 'http://127.0.0.1:7456';
    let publishedWebUrl: (() => string | null) | null = null;
    dependencies.createIpcServer.mockImplementation(async ({ currentWebUrl }) => {
      publishedWebUrl = currentWebUrl;
      return { close: async () => undefined };
    });
    dependencies.startSidecars.mockImplementation(async () => ({
      close: async () => undefined,
      currentWebUrl: () => liveWebUrl,
      daemon: {
        desktopAuthGateActive: false,
        state: 'running' as const,
        url: 'http://127.0.0.1:7457',
      },
      web: { state: 'running' as const, url: liveWebUrl },
    }));

    await acquirePackagedHeadlessStartup(dependencies);
    liveWebUrl = 'http://127.0.0.1:8465';
    const repairAdoptedOwner = vi.fn(async () => undefined);
    await acquireOrAdoptPackagedHeadlessStartup(dependencies, {
      inspectExistingOwner: async () => ({
        state: 'running',
        webUrl: publishedWebUrl?.() ?? null,
      }),
      repairAdoptedOwner,
    });

    expect(repairAdoptedOwner).toHaveBeenCalledWith('http://127.0.0.1:8465');
  });
});

describe('repairCodexMcpRegistrationViaLiveOwner', () => {
  it('adds the registration directly when no previous entry exists', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => (
      args[1] === 'get'
        ? {
            exitCode: 1,
            stdout: '',
            stderr: "Error: No MCP server named 'open-design' found.",
          }
        : { exitCode: 0, stdout: '', stderr: '' }
    ));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      command: 'C:\\Program Files\\Open Design\\Open Design.exe',
      args: ['C:\\Program Files\\Open Design\\daemon-cli.mjs', 'mcp'],
      env: {},
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await repairCodexMcpRegistrationViaLiveOwner(
      'http://127.0.0.1:7456',
      'C:\\RR-ESW\\bin\\codex.exe',
      { fetchImpl, run },
    );

    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[1]?.slice(0, 4)).toEqual([
      'mcp',
      'add',
      'open-design',
      '--env',
    ]);
  });

  it('rebuilds the live owner registration with the current exact CODEX_BIN', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === 'get') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            name: 'open-design',
            enabled: true,
            transport: {
              type: 'stdio',
              command: 'C:\\Old Open Design\\Open Design.exe',
              args: ['C:\\Old Open Design\\daemon-cli.mjs', 'mcp'],
              env: { CODEX_BIN: 'C:\\stale\\codex.exe' },
            },
          }),
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      command: 'C:\\Program Files\\Open Design\\Open Design.exe',
      args: [
        'C:\\Program Files\\Open Design\\resources\\app\\prebundled\\daemon\\daemon-cli.mjs',
        'mcp',
      ],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        CODEX_BIN: 'C:\\stale\\codex.exe',
        OD_DATA_DIR: 'C:\\OpenDesignData',
        OD_SIDECAR_IPC_PATH: '\\\\.\\pipe\\open-design-daemon',
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await repairCodexMcpRegistrationViaLiveOwner(
      'http://127.0.0.1:7456',
      'C:\\RR-ESW\\bin\\codex.exe',
      { fetchImpl, run },
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/mcp/install-info',
    );
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls[0]?.[1]).toEqual(['mcp', 'get', 'open-design', '--json']);
    expect(run.mock.calls[1]?.[1]).toEqual(['mcp', 'remove', 'open-design']);
    const [command, args] = run.mock.calls[2] ?? [];
    expect(command).toBe('C:\\RR-ESW\\bin\\codex.exe');
    expect(args).toContain('CODEX_BIN=C:\\RR-ESW\\bin\\codex.exe');
    expect(args).not.toContain('CODEX_BIN=C:\\stale\\codex.exe');
    expect(args.slice(-3)).toEqual([
      'C:\\Program Files\\Open Design\\Open Design.exe',
      'C:\\Program Files\\Open Design\\resources\\app\\prebundled\\daemon\\daemon-cli.mjs',
      'mcp',
    ]);
  });

  it('restores the previous registration when replacement add fails', async () => {
    const oldCommand = 'C:\\Old Open Design\\Open Design.exe';
    const oldArgs = ['C:\\Old Open Design\\daemon-cli.mjs', 'mcp'];
    let addAttempt = 0;
    const run = vi.fn(async (_command: string, args: string[]) => {
      if (args[1] === 'get') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            name: 'open-design',
            enabled: true,
            transport: {
              type: 'stdio',
              command: oldCommand,
              args: oldArgs,
              env: { CODEX_BIN: 'C:\\stale\\codex.exe' },
            },
          }),
          stderr: '',
        };
      }
      if (args[1] === 'add') {
        addAttempt += 1;
        if (addAttempt === 1) {
          return { exitCode: 1, stdout: '', stderr: 'replacement rejected' };
        }
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      command: 'C:\\Program Files\\Open Design\\Open Design.exe',
      args: ['C:\\Program Files\\Open Design\\daemon-cli.mjs', 'mcp'],
      env: { CODEX_BIN: 'C:\\stale\\codex.exe' },
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await expect(repairCodexMcpRegistrationViaLiveOwner(
      'http://127.0.0.1:7456',
      'C:\\RR-ESW\\bin\\codex.exe',
      { fetchImpl, run },
    )).rejects.toThrow(/replacement rejected/);

    expect(run).toHaveBeenCalledTimes(5);
    expect(run.mock.calls[3]?.[1]).toEqual(['mcp', 'remove', 'open-design']);
    const restoreArgs = run.mock.calls[4]?.[1] ?? [];
    expect(restoreArgs).toContain('CODEX_BIN=C:\\stale\\codex.exe');
    expect(restoreArgs.slice(-3)).toEqual([oldCommand, ...oldArgs]);
  });

  it('fails closed when the existing registration cannot be inspected', async () => {
    const run = vi.fn(async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'permission denied',
    }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      command: 'C:\\Program Files\\Open Design\\Open Design.exe',
      args: ['C:\\Program Files\\Open Design\\daemon-cli.mjs', 'mcp'],
      env: {},
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await expect(repairCodexMcpRegistrationViaLiveOwner(
      'http://127.0.0.1:7456',
      'C:\\RR-ESW\\bin\\codex.exe',
      { fetchImpl, run },
    )).rejects.toThrow(/mcp get failed.*permission denied/i);

    expect(run).toHaveBeenCalledOnce();
  });
});
