import { describe, expect, it } from "vitest";

import { isAgentToolInvocation } from "../src/agent-tool-invocation.js";

// Truth table implemented by the predicate (argv-shape only; environment is
// deliberately NOT an input — agents legitimately launching the desktop
// inherit run-scoped OD_TOOL_TOKEN/ELECTRON_RUN_AS_NODE, so neither may ever
// route by itself):
//
// | argv                                  | opts.daemonCliEntry | result |
// |---------------------------------------|---------------------|--------|
// | length < 2 / argv[1] empty            | any                 | false  |
// | argv[1] === daemonCliEntry            | provided            | true   |
// | argv[1] !== daemonCliEntry            | provided            | false  |
// | basename(argv[1]) ∈ {daemon-cli.mjs, cli.js} (case-insensitive) | absent | true |
// | anything else (deeplink, file association, flags, arbitrary paths) | absent | false |

const DESKTOP_EXE = "C:\\Program Files\\Open Design\\Open Design.exe";
const BUNDLED_DAEMON_CLI = "C:\\Program Files\\Open Design\\resources\\app\\prebundled\\daemon\\daemon-cli.mjs";

describe("isAgentToolInvocation", () => {
  it("treats a plain GUI launch as a desktop start", () => {
    expect(isAgentToolInvocation([DESKTOP_EXE])).toBe(false);
  });

  it("stays out of .oddesign file-association opens", () => {
    expect(isAgentToolInvocation([DESKTOP_EXE, "C:\\projects\\poster.oddesign"])).toBe(false);
  });

  it("stays out of deeplink delivery", () => {
    expect(isAgentToolInvocation([DESKTOP_EXE, "opendesign://workspace/invite/continue?nonce=hot"])).toBe(false);
    expect(isAgentToolInvocation([DESKTOP_EXE, "od://app"])).toBe(false);
  });

  it("stays out of updater/launcher relaunch flag invocations", () => {
    expect(isAgentToolInvocation([
      DESKTOP_EXE,
      "--od-launcher-after-quit",
      "--od-launcher-target-pid=4242",
      "--od-launcher-timeout-ms=8000",
    ])).toBe(false);
  });

  it("routes a daemon CLI tool invocation through Node mode (exact configured entry)", () => {
    expect(isAgentToolInvocation(
      [DESKTOP_EXE, BUNDLED_DAEMON_CLI, "tools", "live-artifacts", "list", "--format", "compact"],
      { daemonCliEntry: BUNDLED_DAEMON_CLI },
    )).toBe(true);
  });

  it("routes a daemon CLI tool invocation through Node mode (basename fallback)", () => {
    expect(isAgentToolInvocation(
      [DESKTOP_EXE, BUNDLED_DAEMON_CLI, "tools", "live-artifacts", "list", "--format", "compact"],
    )).toBe(true);
  });

  it("accepts the cli.js fallback basename", () => {
    expect(isAgentToolInvocation([
      DESKTOP_EXE,
      "/opt/open-design/resources/app/daemons/current/bin/cli.js",
      "--json",
    ])).toBe(true);
  });

  it("matches the fallback basename case-insensitively", () => {
    expect(isAgentToolInvocation([DESKTOP_EXE, "C:\\odd\\Dir\\DAEMON-CLI.MJS"])).toBe(true);
  });

  it("keeps the basename fallback TRUE outside the install root (OD_BIN always resolves inside the install root)", () => {
    expect(isAgentToolInvocation([DESKTOP_EXE, "D:\\portable\\daemon\\daemon-cli.mjs", "tools", "ping"])).toBe(true);
  });

  it("rejects look-alike paths when the exact configured entry is provided", () => {
    expect(isAgentToolInvocation(
      [DESKTOP_EXE, "D:\\untrusted\\daemon-cli.mjs"],
      { daemonCliEntry: BUNDLED_DAEMON_CLI },
    )).toBe(false);
  });

  it("never routes on run-scoped agent tokens alone", () => {
    process.env.OD_TOOL_TOKEN = "od_tool_test_token";
    try {
      expect(isAgentToolInvocation([DESKTOP_EXE])).toBe(false);
      expect(isAgentToolInvocation([DESKTOP_EXE, "C:\\projects\\poster.oddesign"])).toBe(false);
    } finally {
      delete process.env.OD_TOOL_TOKEN;
    }
  });

  it("ignores ELECTRON_RUN_AS_NODE: argv shape decides, node-mode re-invocations stay harmless", () => {
    process.env.ELECTRON_RUN_AS_NODE = "1";
    try {
      expect(isAgentToolInvocation([DESKTOP_EXE, BUNDLED_DAEMON_CLI, "tools", "ping"])).toBe(true);
      expect(isAgentToolInvocation([DESKTOP_EXE])).toBe(false);
    } finally {
      delete process.env.ELECTRON_RUN_AS_NODE;
    }
  });

  it("returns false for empty argv or a missing entry argument", () => {
    expect(isAgentToolInvocation([])).toBe(false);
    expect(isAgentToolInvocation([DESKTOP_EXE])).toBe(false);
    expect(isAgentToolInvocation([DESKTOP_EXE, ""], { daemonCliEntry: null })).toBe(false);
  });
});
