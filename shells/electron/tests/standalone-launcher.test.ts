import { describe, expect, it, vi } from "vitest";

import {
  acquirePackagedStandaloneStartup,
  parsePackagedStandaloneRequest,
  resolvePackagedMcpBootstrapLaunch,
} from "../src/standalone-launcher.js";

describe("parsePackagedStandaloneRequest", () => {
  it("accepts a standalone Codex MCP install request", () => {
    expect(parsePackagedStandaloneRequest([
      "--standalone",
      "--mcp-install",
      "codex",
    ])).toEqual({
      standalone: true,
      mcpInstallAgent: "codex",
    });
  });

  it("rejects unsupported MCP install targets", () => {
    expect(() => parsePackagedStandaloneRequest([
      "--standalone",
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
        "--standalone",
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
      args: ["--standalone"],
    });
  });
});

describe("acquirePackagedStandaloneStartup", () => {
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
        startStandalone: vi.fn(async () => ({
          close: async () => {
            closed.push("standalone");
            return { state: "stopped" } as never;
          },
          invoke: vi.fn(),
          readStatus: async () => ({
            daemonUrl: "http://127.0.0.1:7457",
            state: "running",
            webUrl: "http://127.0.0.1:7456",
          } as never),
          waitForTerminal: async () => await new Promise<never>(() => undefined),
        })),
        writeIdentity: vi.fn(async () => ({
          close: async () => {
            closed.push("identity");
          },
          identity: {} as never,
          updateRuntimeIdentity: async () => undefined,
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

    await expect(acquirePackagedStandaloneStartup(dependencies)).rejects.toThrow(
      "MCP install failed",
    );

    expect(closed).toEqual(["standalone", "identity"]);
    expect(exit).not.toHaveBeenCalled();
  });

  it("closes IPC, sidecars, and identity when identity publication fails", async () => {
    const { closed, dependencies, exit } = createDependencies("web-identity");

    await expect(acquirePackagedStandaloneStartup(dependencies)).rejects.toThrow(
      "web identity write failed",
    );

    expect(closed).toEqual(["ipc", "standalone", "identity"]);
    expect(exit).not.toHaveBeenCalled();
  });
});
