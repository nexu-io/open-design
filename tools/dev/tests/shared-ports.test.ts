import assert from "node:assert/strict";
import { createServer } from "node:net";
import { describe, it } from "node:test";

import { APP_KEYS } from "@open-design/sidecar-proto";

import { ensureSharedPortsResolved, resolveSharedPortsFromRunningState } from "../src/shared-ports.js";

describe("tools-dev shared ports", () => {
  it("does nothing when web is not starting", async () => {
    const options: { daemonPort?: string; webPort?: string } = {};

    await ensureSharedPortsResolved([APP_KEYS.DAEMON], options);

    assert.equal(options.webPort, undefined);
  });

  it("preserves an explicit web port", async () => {
    const options: { daemonPort?: string; webPort?: string } = { webPort: "3000" };

    await ensureSharedPortsResolved([APP_KEYS.WEB, APP_KEYS.DAEMON], options);

    assert.equal(options.webPort, "3000");
    assert.match(options.daemonPort ?? "", /^\d+$/);
    assert.notEqual(options.daemonPort, options.webPort);
  });

  it("allocates a web port when web starts without one", async () => {
    const options: { daemonPort?: string; webPort?: string } = {};

    await ensureSharedPortsResolved([APP_KEYS.WEB, APP_KEYS.DAEMON], options);

    assert.match(options.webPort ?? "", /^\d+$/);
    assert.match(options.daemonPort ?? "", /^\d+$/);
    const port = Number(options.webPort);
    assert.ok(Number.isInteger(port) && port > 0);
    assert.notEqual(options.webPort, options.daemonPort);

    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error == null ? resolve() : reject(error)));
    });
  });

  it("avoids reusing an explicit daemon port", async () => {
    const options: { daemonPort?: string; webPort?: string } = { daemonPort: "3100" };

    await ensureSharedPortsResolved([APP_KEYS.WEB, APP_KEYS.DAEMON], options);

    assert.notEqual(options.webPort, "3100");
    assert.equal(options.daemonPort, "3100");
  });

  it("does not allocate a daemon port when daemon is not starting", async () => {
    const options: { daemonPort?: string; webPort?: string } = {};

    await ensureSharedPortsResolved([APP_KEYS.WEB], options);

    assert.equal(options.daemonPort, undefined);
    assert.match(options.webPort ?? "", /^\d+$/);
  });

  it("reuses an already-running web port", async () => {
    const options: { daemonPort?: string; webPort?: string } = {};

    await ensureSharedPortsResolved(
      [APP_KEYS.WEB, APP_KEYS.DAEMON],
      options,
      "http://127.0.0.1:4123",
    );

    assert.equal(options.webPort, "4123");
  });

  it("preserves a running daemon port when reusing a running daemon", async () => {
    const options: { daemonPort?: string; webPort?: string } = {};

    await ensureSharedPortsResolved(
      [APP_KEYS.WEB, APP_KEYS.DAEMON],
      options,
      null,
      "http://127.0.0.1:5123",
    );

    assert.equal(options.daemonPort, "5123");
    assert.match(options.webPort ?? "", /^\d+$/);
    assert.notEqual(options.webPort, options.daemonPort);
  });

  it("looks up the running daemon before resolving split start web ports", async () => {
    const options: { daemonPort?: string; webPort?: string } = {};
    const calls: string[] = [];

    await resolveSharedPortsFromRunningState([APP_KEYS.WEB, APP_KEYS.DAEMON], options, {
      daemonUrl: async () => {
        calls.push("daemon");
        return "http://127.0.0.1:6123";
      },
      webUrl: async () => {
        calls.push("web");
        return null;
      },
    });

    assert.deepEqual(calls, ["daemon", "web"]);
    assert.equal(options.daemonPort, "6123");
    assert.match(options.webPort ?? "", /^\d+$/);
    assert.notEqual(options.webPort, options.daemonPort);
  });
});
