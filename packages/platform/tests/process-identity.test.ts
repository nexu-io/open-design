import { spawn } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  isProcessGroupAlive,
  readProcessIdentities,
  terminateProcessGroup,
} from "../src/index.js";
import { parsePosixProcessIdentities } from "../src/process.js";

const onWindows = process.platform === "win32";
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) {
    try {
      cleanups.pop()?.();
    } catch {
      // best-effort
    }
  }
});

/** A detached (own group) child that ignores SIGTERM, so only SIGKILL ends it. */
async function stubbornGroupLeader(): Promise<number> {
  const child = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)"],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  const pid = child.pid;
  if (pid == null) throw new Error("test child did not start");
  cleanups.push(() => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // gone
    }
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.stdout?.once("data", () => resolve());
  });
  child.unref();
  return pid;
}

describe("parsePosixProcessIdentities", () => {
  it("reads pid, ppid, pgid, the C-locale lstart and the command", () => {
    const [identity] = parsePosixProcessIdentities(
      "  4242   1  4242 Tue Sep 15 12:21:09 2026     /usr/bin/node agent.cjs --print\n",
    );
    expect(identity).toEqual({
      command: "/usr/bin/node agent.cjs --print",
      pid: 4242,
      ppid: 1,
      processGroupId: 4242,
      startedAtMs: new Date(2026, 8, 15, 12, 21, 9).getTime(),
      startedAtResolutionMs: 1000,
    });
  });

  it("parses single-digit, space-padded days", () => {
    const [identity] = parsePosixProcessIdentities("7 1 7 Mon Sep  7 01:02:03 2026 sleep 30");
    expect(identity?.startedAtMs).toBe(new Date(2026, 8, 7, 1, 2, 3).getTime());
  });
});

describe.skipIf(onWindows)("readProcessIdentities", () => {
  it("reports this process's creation time and group, and omits missing PIDs", async () => {
    const started = Date.now() - process.uptime() * 1000;
    const identities = await readProcessIdentities([process.pid, 99_990]);
    const self = identities.get(process.pid);
    expect(self?.processGroupId).toBeTypeOf("number");
    expect(Math.abs((self?.startedAtMs ?? 0) - started)).toBeLessThan(3_000);
    expect(identities.has(99_990)).toBe(false);
  });
});

describe.skipIf(onWindows)("terminateProcessGroup", () => {
  it("escalates to SIGKILL when members ignore SIGTERM", async () => {
    const pid = await stubbornGroupLeader();
    const result = await terminateProcessGroup(pid, { termGraceMs: 100, killGraceMs: 2_000 });
    expect(result).toEqual({ alreadyStopped: false, forced: true, survived: false });
    expect(isProcessGroupAlive(pid)).toBe(false);
  }, 10_000);
});
