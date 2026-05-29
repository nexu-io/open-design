import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendStartupLogDiagnostics,
  createStartupLogDiagnostics,
  detectLogDiagnostics,
  formatUnsupportedNodeRuntimeMessage,
  isSupportedNodeRuntime,
} from "../src/diagnostics.js";

describe("tools-dev diagnostics", () => {
  it("detects native addon ABI mismatches", () => {
    const diagnostics = detectLogDiagnostics(
      [
        "Error: The module '/repo/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
        "was compiled against a different Node.js version using",
        "NODE_MODULE_VERSION 127. This version of Node.js requires",
        "NODE_MODULE_VERSION 137. Please try re-compiling or re-installing",
      ],
      { nodeModuleVersion: "137", nodeVersion: "v24.15.0" },
    );

    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /native Node addon ABI mismatch/);
    assert.match(diagnostics[0].recommendation, /active Node 24 runtime/);
    assert.match(diagnostics[0].recommendation, /corepack pnpm --filter @open-design\/daemon rebuild better-sqlite3 --pending/);
    assert.match(diagnostics[0].recommendation, /corepack pnpm install --frozen-lockfile/);
  });

  it("points ABI mismatches under unsupported Node at Node 24 first", () => {
    const diagnostics = detectLogDiagnostics(
      [
        "Error: better_sqlite3.node was compiled against a different Node.js version using",
        "NODE_MODULE_VERSION 137. This version of Node.js requires",
        "NODE_MODULE_VERSION 127.",
      ],
      { nodeModuleVersion: "127", nodeVersion: "v22.22.3" },
    );

    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].recommendation, /Current tools-dev runtime: Node v22\.22\.3/);
    assert.match(diagnostics[0].recommendation, /Switch to Node 24 first/);
    assert.match(diagnostics[0].recommendation, /nvm use 24/);
  });

  it("formats unsupported Node runtime errors before startup", () => {
    assert.equal(isSupportedNodeRuntime("v24.15.0"), true);
    assert.equal(isSupportedNodeRuntime("v22.22.3"), false);

    const message = formatUnsupportedNodeRuntimeMessage({ nodeModuleVersion: "127", nodeVersion: "v22.22.3" });
    assert.match(message, /tools-dev must run with Node ~24/);
    assert.match(message, /Current runtime: Node v22\.22\.3 \(NODE_MODULE_VERSION 127\)/);
    assert.match(message, /corepack pnpm install --frozen-lockfile/);
  });

  it("detects missing Next.js package resolution during web startup", () => {
    const diagnostics = detectLogDiagnostics([
      "Turbopack build failed with 1 errors:",
      "./apps/web/app",
      "Error: Next.js inferred your workspace root, but it may not be correct.",
      "We couldn't find the Next.js package (next/package.json) from the project directory: /repo/apps/web/app",
    ]);

    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Next\.js package is not resolvable/);
    assert.match(diagnostics[0].recommendation, /apps\/web\/node_modules\/next/);
    assert.match(diagnostics[0].recommendation, /pnpm install --frozen-lockfile/);
  });

  it("detects missing Next.js package resolution when details change", () => {
    const diagnostics = detectLogDiagnostics([
      "Error: We couldn't find the Next.js package from the project directory: /repo/apps/web/app",
    ]);

    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Next\.js package is not resolvable/);
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
    assert.match(error.message, /corepack pnpm --filter @open-design\/daemon rebuild better-sqlite3 --pending/);
  });
});
