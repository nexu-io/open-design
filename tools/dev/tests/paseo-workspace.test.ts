import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parsePaseoWorkspaceAction,
  resolvePaseoLeasePorts,
  resolvePaseoWorkspaceNamespace,
} from "../src/paseo-workspace.js";

describe("Paseo workspace lifecycle", () => {
  it("derives a stable namespace from the current worktree", () => {
    assert.equal(
      resolvePaseoWorkspaceNamespace("/repo/.worktrees/fix-settings"),
      "fix-settings",
    );
    assert.equal(resolvePaseoWorkspaceNamespace("C:\\repo\\open-design"), "open-design");
  });

  it("only accepts supported lifecycle actions", () => {
    assert.equal(parsePaseoWorkspaceAction("run"), "run");
    assert.equal(parsePaseoWorkspaceAction("status"), "status");
    assert.equal(parsePaseoWorkspaceAction("stop"), "stop");
    assert.throws(() => parsePaseoWorkspaceAction("cleanup"), /expected run, status, or stop/);
  });

  it("uses ports only after the Open Design lease is active", () => {
    assert.equal(resolvePaseoLeasePorts({}), null);
    assert.equal(resolvePaseoLeasePorts({ PORTS_PROJECT: "other" }), null);
    assert.deepEqual(
      resolvePaseoLeasePorts({
        DAEMON_PORT: "20600",
        PORTS_PROJECT: "open-design",
        WEB_PORT: "20601",
      }),
      { daemonPort: "20600", webPort: "20601" },
    );
    assert.throws(
      () => resolvePaseoLeasePorts({ PORTS_PROJECT: "open-design" }),
      /missing DAEMON_PORT or WEB_PORT/,
    );
  });
});
