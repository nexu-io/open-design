import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldStopWebForDaemonRestart } from "../src/daemon-restart-policy.js";

describe("shouldStopWebForDaemonRestart", () => {
  it("leaves web running for daemon-only stale build restarts", () => {
    assert.equal(
      shouldStopWebForDaemonRestart({
        shouldRefreshWebOrigin: false,
        daemonTrustedWebOriginPort: 5173,
        webPort: 5173,
      }),
      false,
    );
  });

  it("leaves web running when the daemon already trusts the requested web port", () => {
    assert.equal(
      shouldStopWebForDaemonRestart({
        shouldRefreshWebOrigin: true,
        daemonTrustedWebOriginPort: 5173,
        webPort: 5173,
      }),
      false,
    );
  });

  it("stops web only when the trusted web origin must be refreshed to a different port", () => {
    assert.equal(
      shouldStopWebForDaemonRestart({
        shouldRefreshWebOrigin: true,
        daemonTrustedWebOriginPort: 5173,
        webPort: 6173,
      }),
      true,
    );
  });
});
