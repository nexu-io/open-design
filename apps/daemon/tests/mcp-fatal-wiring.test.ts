import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listenersDuringConnect: 0,
}));

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class {
    setRequestHandler() {}

    getClientVersion() {
      return undefined;
    }

    async connect() {
      state.listenersDuringConnect =
        process.listeners("uncaughtException").length;
      throw new Error("transport initialization failed");
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: {},
  ListResourcesRequestSchema: {},
  ListToolsRequestSchema: {},
  ReadResourceRequestSchema: {},
}));

describe("runMcpStdio fatal handler wiring", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("installs handlers before transport startup and removes them on startup failure", async () => {
    const before = process.listeners("uncaughtException").length;
    const beforeRejection = process.listeners("unhandledRejection").length;
    const { runMcpStdio } = await import("../src/mcp.js");

    await expect(
      runMcpStdio({ daemonUrl: "http://127.0.0.1:1234" }),
    ).rejects.toThrow("transport initialization failed");

    expect(state.listenersDuringConnect).toBe(before + 1);
    expect(process.listeners("uncaughtException").length).toBe(before);
    expect(process.listeners("unhandledRejection").length).toBe(
      beforeRejection,
    );
  });
});
