import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MCP_BOOTSTRAP_CONTRACT } from "@open-design/sidecar-proto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPackagedMcpAutoLaunchPolicy, createPackagedQuitIntent } from "../src/mcp-auto-launch.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
const root = () => { const path = mkdtempSync(join(tmpdir(), "od-mcp-quit-")); roots.push(path); return path; };

describe("MCP auto-launch user intent", () => {
  it("persists a quit across processes until a user launch clears it", () => {
    const dataRoot = root();
    const clock = { now: () => 100_000, uptime: () => 50 };
    const policy = createPackagedMcpAutoLaunchPolicy(dataRoot, clock);
    expect(policy.isSuspended()).toBe(false);
    policy.suspend();
    expect(JSON.parse(readFileSync(join(dataRoot, MCP_BOOTSTRAP_CONTRACT.USER_QUIT_FILE), "utf8")))
      .toEqual({ schemaVersion: 1, quitAtMs: 100_000 });
    expect(createPackagedMcpAutoLaunchPolicy(dataRoot, clock).isSuspended()).toBe(true);
    policy.resume();
    expect(policy.isSuspended()).toBe(false);
  });

  it("expires after reboot and isolates separate daemon data roots", () => {
    const dataRoot = root();
    createPackagedMcpAutoLaunchPolicy(dataRoot, { now: () => 100_000, uptime: () => 50 }).suspend();
    expect(createPackagedMcpAutoLaunchPolicy(dataRoot, { now: () => 200_000, uptime: () => 20 }).isSuspended()).toBe(false);
    expect(createPackagedMcpAutoLaunchPolicy(root(), { now: () => 100_000, uptime: () => 50 }).isSuspended()).toBe(false);
  });

  it("does not turn a damaged marker into a permanent startup failure", () => {
    const dataRoot = root();
    writeFileSync(join(dataRoot, MCP_BOOTSTRAP_CONTRACT.USER_QUIT_FILE), "{");
    expect(createPackagedMcpAutoLaunchPolicy(dataRoot).isSuspended()).toBe(false);
  });

  it("records an external quit once before teardown", () => {
    const record = vi.fn();
    const intent = createPackagedQuitIntent(record);
    intent.userQuit();
    expect(intent.isStopping()).toBe(true);
    intent.beginShutdown();
    intent.userQuit();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("leaves updater, sidecar shutdown and OS shutdown recoverable", () => {
    const record = vi.fn();
    const internal = createPackagedQuitIntent(record);
    internal.beginShutdown();
    internal.userQuit();
    const system = createPackagedQuitIntent(record);
    system.systemExit();
    system.userQuit();
    expect(record).not.toHaveBeenCalled();
  });
});
