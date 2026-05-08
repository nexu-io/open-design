import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import { createJsonIpcServer, type JsonIpcServerHandle } from "@open-design/sidecar";
import { SIDECAR_ENV, SIDECAR_MESSAGES } from "@open-design/sidecar-proto";
import { resolveMcpDaemonUrl, MCP_DEFAULT_DAEMON_URL } from "../src/mcp-daemon-url.js";

// On Windows the sidecar IPC contract switches to named pipes whose
// names are not relocatable via OD_SIDECAR_IPC_BASE, so the discovery
// case cannot use a per-test temp socket; skip just that case there.
const ipcTest = process.platform === "win32" ? test.skip : test;

// Verifies the resolution chain: --daemon-url > OD_DAEMON_URL > sidecar
// IPC status discovery > legacy default. Each layer must short-circuit
// the next so the spawned `od mcp` follows the live daemon across
// restarts without re-pasting the install snippet.

describe("resolveMcpDaemonUrl", () => {
  let ipcBaseDir: string;

  beforeAll(() => {
    ipcBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-mcp-resolve-"));
  });

  afterAll(() => {
    fs.rmSync(ipcBaseDir, { recursive: true, force: true });
  });

  it("prefers the explicit --daemon-url flag", async () => {
    const url = await resolveMcpDaemonUrl({
      flagUrl: "http://flag.example:1111",
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
      },
    });
    expect(url).toBe("http://flag.example:1111");
  });

  it("falls back to OD_DAEMON_URL when no flag given", async () => {
    const url = await resolveMcpDaemonUrl({
      env: {
        OD_DAEMON_URL: "http://env.example:2222",
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
      },
    });
    expect(url).toBe("http://env.example:2222");
  });

  it("returns the legacy default when no flag/env/socket is available", async () => {
    const url = await resolveMcpDaemonUrl({
      env: {
        // Point IPC discovery at a directory with no socket; discovery
        // should fail silently and we fall back to the default.
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
        [SIDECAR_ENV.NAMESPACE]: "missing-ns",
      },
      timeoutMs: 200,
    });
    expect(url).toBe(MCP_DEFAULT_DAEMON_URL);
  });

  ipcTest("discovers the live daemon URL via the sidecar IPC status socket", async () => {
    const namespace = "discover-test";
    const namespaceDir = path.join(ipcBaseDir, namespace);
    fs.mkdirSync(namespaceDir, { recursive: true });
    const socketPath = path.join(namespaceDir, "daemon.sock");
    let ipc: JsonIpcServerHandle | null = null;
    try {
      ipc = await createJsonIpcServer({
        socketPath,
        handler: (message) => {
          if (
            message != null &&
            typeof message === "object" &&
            (message as { type?: unknown }).type === SIDECAR_MESSAGES.STATUS
          ) {
            return {
              pid: 4242,
              state: "running",
              updatedAt: new Date().toISOString(),
              url: "http://127.0.0.1:54321",
            };
          }
          throw new Error("unexpected message");
        },
      });

      const url = await resolveMcpDaemonUrl({
        env: {
          [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
          [SIDECAR_ENV.NAMESPACE]: namespace,
        },
        timeoutMs: 1000,
      });
      expect(url).toBe("http://127.0.0.1:54321");
    } finally {
      await ipc?.close();
    }
  });
});
