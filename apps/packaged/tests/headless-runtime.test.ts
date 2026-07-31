import { describe, expect, it, vi } from "vitest";

import {
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

    expect(closed).toEqual(["sidecars", "identity"]);
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
});
