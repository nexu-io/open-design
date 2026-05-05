import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendStartupLogDiagnostics,
  createStartupLogDiagnostics,
  detectLogDiagnostics,
} from "../src/diagnostics.js";

describe("tools-dev diagnostics", () => {
  it("detects native addon ABI mismatches", () => {
    const diagnostics = detectLogDiagnostics([
      "Error: The module '/repo/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
      "was compiled against a different Node.js version using",
      "NODE_MODULE_VERSION 127. This version of Node.js requires",
      "NODE_MODULE_VERSION 137. Please try re-compiling or re-installing",
    ]);

    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /native Node addon ABI mismatch/);
    assert.match(diagnostics[0].recommendation, /rebuild better-sqlite3 --pending/);
    assert.match(diagnostics[0].recommendation, /pnpm install/);
  });

  it("does not report diagnostics for unrelated logs", () => {
    assert.deepEqual(detectLogDiagnostics(["daemon booting", "ready"]), []);
  });

  it("appends log tails and recommendations to startup timeout errors", () => {
    const error = appendStartupLogDiagnostics(
      new Error("daemon did not expose status in time"),
      "daemon",
      createStartupLogDiagnostics("/tmp/daemon.log", [
        "better_sqlite3.node was compiled against a different Node.js version using",
        "NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 137.",
      ]),
    );

    assert.match(error.message, /daemon did not expose status in time/);
    assert.match(error.message, /daemon log tail \(\/tmp\/daemon\.log\)/);
    assert.match(error.message, /better_sqlite3\.node/);
    assert.match(error.message, /pnpm --filter @open-design\/daemon rebuild better-sqlite3 --pending/);
  });
});
