import assert from "node:assert/strict";
import { createServer } from "node:net";
import { describe, it } from "node:test";

import { APP_KEYS } from "@open-design/sidecar-proto";

import { ensureSharedPortsResolved } from "./shared-ports.js";

// Regression: the daemon's CORS allow-list is built once at startup from
// OD_WEB_PORT. If the web port is unknown when the daemon spawns, every
// browser POST from the web app gets rejected with 403. The orchestrator
// must pre-resolve a free web port up-front whenever both daemon and web
// are launching together so they share the same port and the daemon's
// allow-list includes the web origin.
describe("ensureSharedPortsResolved", () => {
  it("does nothing when web is not in the target set", async () => {
    const options = { webPort: undefined as number | undefined };
    await ensureSharedPortsResolved([APP_KEYS.DAEMON], options as never);
    assert.equal(options.webPort, undefined);
  });

  it("does not override an explicitly forced --web-port", async () => {
    const options = { webPort: 5175 };
    await ensureSharedPortsResolved([APP_KEYS.DAEMON, APP_KEYS.WEB], options as never);
    assert.equal(options.webPort, 5175);
  });

  it("allocates a free loopback port when the user did not pin one", async () => {
    const options = { webPort: undefined as number | undefined };
    await ensureSharedPortsResolved([APP_KEYS.DAEMON, APP_KEYS.WEB], options as never);
    assert.ok(typeof options.webPort === "number", "webPort should be assigned");
    assert.ok(options.webPort! > 0 && options.webPort! < 65536, "port should be in valid range");

    // The allocated port must actually be bindable on loopback — otherwise
    // the web sidecar will fail at spawn time with EADDRINUSE.
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ port: options.webPort, host: "127.0.0.1", exclusive: true }, () => resolve());
    });
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error == null ? resolve() : reject(error))),
    );
  });
});
