import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { APP_KEYS, OPEN_DESIGN_SIDECAR_CONTRACT, SIDECAR_ENV } from "@open-design/sidecar-proto";
import { resolveAppIpcPath } from "@open-design/sidecar";

import {
  inspectDaemonRuntime,
  waitForDaemonRuntime,
} from "../src/sidecar-client.js";

function uniqueNamespace(label: string): string {
  return `tools-dev-test-${label}-${process.pid}-${Date.now()}`;
}

function startSocketServer(socketPath: string, response: unknown): Server {
  mkdirSync(path.dirname(socketPath), { recursive: true });
  const server = createServer((socket) => {
    socket.on("data", () => {
      socket.write(`${JSON.stringify({ ok: true, result: response })}\n`);
      socket.end();
    });
  });
  server.listen(socketPath);
  return server;
}

describe("inspectDaemonRuntime", () => {
  it("returns null when the IPC socket does not exist", async () => {
    const runtime = { base: tmpdir(), namespace: uniqueNamespace("inspect-missing") };
    const snapshot = await inspectDaemonRuntime(runtime, 100);
    assert.equal(snapshot, null);
  });

  it("returns the parsed snapshot when the daemon responds", async () => {
    const namespace = uniqueNamespace("inspect-ok");
    const ipcBase = mkdtempSync(path.join(tmpdir(), "tools-dev-ipc-"));
    const prev = process.env[SIDECAR_ENV.IPC_BASE];
    process.env[SIDECAR_ENV.IPC_BASE] = ipcBase;
    const socketPath = resolveAppIpcPath({ app: APP_KEYS.DAEMON, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace });
    const server = startSocketServer(socketPath, {
      desktopAuthGateActive: true,
      pid: 4242,
      state: "running",
      url: "http://127.0.0.1:7456",
    });
    try {
      const snapshot = await inspectDaemonRuntime({ base: tmpdir(), namespace }, 1500);
      assert.notEqual(snapshot, null);
      assert.equal(snapshot?.url, "http://127.0.0.1:7456");
      assert.equal(snapshot?.desktopAuthGateActive, true);
    } finally {
      await new Promise((done) => server.close(() => done(undefined)));
      if (prev == null) delete process.env[SIDECAR_ENV.IPC_BASE];
      else process.env[SIDECAR_ENV.IPC_BASE] = prev;
      rmSync(ipcBase, { recursive: true, force: true });
    }
  });
});

describe("waitForDaemonRuntime", () => {
  it("throws when the daemon never responds before the timeout elapses", async () => {
    const runtime = { base: tmpdir(), namespace: uniqueNamespace("wait-timeout") };
    await assert.rejects(
      () => waitForDaemonRuntime(runtime, 200),
      /daemon did not expose status in time/,
    );
  });

  it("resolves on the first successful inspect", async () => {
    const namespace = uniqueNamespace("wait-ok");
    const ipcBase = mkdtempSync(path.join(tmpdir(), "tools-dev-ipc-"));
    const prev = process.env[SIDECAR_ENV.IPC_BASE];
    process.env[SIDECAR_ENV.IPC_BASE] = ipcBase;
    const socketPath = resolveAppIpcPath({ app: APP_KEYS.DAEMON, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace });
    const server = startSocketServer(socketPath, {
      desktopAuthGateActive: false,
      pid: 99,
      state: "running",
      url: "http://127.0.0.1:17456",
    });
    try {
      const snapshot = await waitForDaemonRuntime({ base: tmpdir(), namespace }, 2000);
      assert.equal(snapshot.url, "http://127.0.0.1:17456");
    } finally {
      await new Promise((done) => server.close(() => done(undefined)));
      if (prev == null) delete process.env[SIDECAR_ENV.IPC_BASE];
      else process.env[SIDECAR_ENV.IPC_BASE] = prev;
      rmSync(ipcBase, { recursive: true, force: true });
    }
  });
});
