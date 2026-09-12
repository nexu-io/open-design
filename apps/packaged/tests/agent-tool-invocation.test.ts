import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isAgentToolInvocation,
  runAgentToolInvocation,
  type AgentToolSpawn,
} from "../src/agent-tool-invocation.js";

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

describe("runAgentToolInvocation (Electron-as-Node re-spawn)", () => {
  function captureSpawn(): {
    calls: { args: readonly string[]; command: string; env: NodeJS.ProcessEnv; stdio: string }[];
    child: EventEmitter;
    spawnChild: AgentToolSpawn;
  } {
    const calls: { args: readonly string[]; command: string; env: NodeJS.ProcessEnv; stdio: string }[] = [];
    const child = new EventEmitter();
    const spawnChild = ((
      command: string,
      args: readonly string[],
      options: { env: NodeJS.ProcessEnv; stdio: string },
    ) => {
      calls.push({ args, command, env: options.env, stdio: options.stdio });
      return child;
    }) as unknown as AgentToolSpawn;
    return { calls, child, spawnChild };
  }

  it("runs the macOS App Helper, not the main executable, for an agent tools call", async () => {
    const root = mkdtempSync(join(tmpdir(), "od-agent-tool-helper-"));
    try {
      const appPath = posix.join(root.replaceAll("\\", "/"), "Open Design.app");
      const execPath = posix.join(appPath, "Contents", "MacOS", "Open Design");
      const helperPath = posix.join(
        appPath,
        "Contents",
        "Frameworks",
        "Open Design Helper.app",
        "Contents",
        "MacOS",
        "Open Design Helper",
      );
      mkdirSync(posix.join(appPath, "Contents", "MacOS"), { recursive: true });
      mkdirSync(dirname(helperPath), { recursive: true });
      writeFileSync(execPath, "#!/bin/sh\n", "utf8");
      writeFileSync(helperPath, "#!/bin/sh\n", "utf8");

      const { calls, spawnChild } = captureSpawn();
      await runAgentToolInvocation({
        argv: [BUNDLED_DAEMON_CLI, "tools", "live-artifacts", "list"],
        execPath,
        exit: () => {},
        platform: "darwin",
        spawnChild,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.command.replaceAll("\\", "/")).toBe(helperPath);
      expect(calls[0]!.args).toEqual([BUNDLED_DAEMON_CLI, "tools", "live-artifacts", "list"]);
      expect(calls[0]!.env.ELECTRON_RUN_AS_NODE).toBe("1");
      expect(calls[0]!.stdio).toBe("inherit");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps the main executable where the platform has no Electron helper", async () => {
    const { calls, spawnChild } = captureSpawn();

    await runAgentToolInvocation({
      argv: [BUNDLED_DAEMON_CLI],
      execPath: "/opt/open-design/open-design",
      exit: () => {},
      platform: "linux",
      spawnChild,
    });

    expect(calls[0]!.command).toBe("/opt/open-design/open-design");
  });

  it("preserves the child's numeric exit code", async () => {
    const { child, spawnChild } = captureSpawn();
    const exits: number[] = [];

    await runAgentToolInvocation({ argv: [BUNDLED_DAEMON_CLI], exit: (code) => exits.push(code), spawnChild });
    child.emit("exit", 7, null);

    expect(exits).toEqual([7]);
  });

  it("reports a signal-terminated child (code null) as a non-zero exit", async () => {
    const { child, spawnChild } = captureSpawn();
    const exits: number[] = [];

    await runAgentToolInvocation({ argv: [BUNDLED_DAEMON_CLI], exit: (code) => exits.push(code), spawnChild });
    child.emit("exit", null, "SIGINT");

    expect(exits).toEqual([1]);
  });

  it("reports a failed spawn as a non-zero exit", async () => {
    const { child, spawnChild } = captureSpawn();
    const exits: number[] = [];

    await runAgentToolInvocation({ argv: [BUNDLED_DAEMON_CLI], exit: (code) => exits.push(code), spawnChild });
    child.emit("error", new Error("spawn ENOENT"));

    expect(exits).toEqual([1]);
  });
});
