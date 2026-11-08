import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { SidecarStamp } from "../src/index.js";
import { spawnSidecar, stopSidecar } from "../src/index.js";
import { supervisorExitDisposition } from "../src/supervisor-exit.js";

describe("supervisorExitDisposition", () => {
  it("re-raises an unforwarded terminating signal instead of encoding it as a number", () => {
    expect(supervisorExitDisposition(null, "SIGKILL", null, "darwin")).toEqual({ kind: "signal", signal: "SIGKILL" });
    expect(supervisorExitDisposition(null, "SIGTERM", null, "linux")).toEqual({ kind: "signal", signal: "SIGTERM" });
  });

  it("keeps an orderly stop it forwarded as a clean exit", () => {
    expect(supervisorExitDisposition(null, "SIGTERM", "SIGTERM", "darwin")).toEqual({ kind: "code", code: 0 });
    expect(supervisorExitDisposition(0, null, "SIGINT", "darwin")).toEqual({ kind: "code", code: 0 });
  });

  it("passes numeric exits through untouched, including 128 + N look-alikes (OPEND-4256)", () => {
    for (const code of [0, 7, 134, 137, 143]) {
      expect(supervisorExitDisposition(code, null, null, "darwin")).toEqual({ kind: "code", code });
    }
    expect(supervisorExitDisposition(null, null, null, "darwin")).toEqual({ kind: "code", code: 1 });
  });

  it("reports a signal death as a non-zero code on Windows", () => {
    expect(supervisorExitDisposition(null, "SIGKILL", null, "win32")).toEqual({ kind: "code", code: 1 });
  });
});

const fixture = fileURLToPath(new URL("./fixtures/exiting-target.ts", import.meta.url));

describe.skipIf(process.platform === "win32")("real supervisor exit reporting", () => {
  it.each([
    ["code:137", 137, null],
    ["code:134", 134, null],
    ["code:143", 143, null],
    ["code:7", 7, null],
    ["code:0", 0, null],
    ["signal:SIGKILL", null, "SIGKILL"],
    ["signal:SIGTERM", null, "SIGTERM"],
    ["signal:SIGUSR1", null, "SIGUSR1"],
    ["signal:SIGPIPE", null, "SIGPIPE"],
  ] as const)("target %s → supervisor code=%s signal=%s", async (mode, code, signal) => {
    const root = await mkdtemp(join(tmpdir(), "open-design-supervisor-exit-"));
    const stamp: SidecarStamp = {
      channel: "local", namespace: `exit-${process.pid}-${mode.replace(/\W/g, "")}`,
      source: "tools-dev", mode: "dev", app: "daemon",
    };
    const spawned = await spawnSidecar({
      args: ["--import", "tsx", fixture],
      command: process.execPath,
      env: { ...process.env, OD_TEST_EXIT_MODE: mode },
      resources: { dataRoot: join(root, "data"), ownerPid: null, port: 0, runtimeRoot: join(root, "runtime") },
      stamp,
    });
    try {
      const [exitCode, exitSignal] = await once(spawned.process, "exit");
      expect({ code: exitCode, signal: exitSignal }).toEqual({ code, signal });
    } finally {
      await stopSidecar(stamp, { killGraceMs: 1_000, termGraceMs: 0 }).catch(() => undefined);
      await rm(root, { force: true, recursive: true });
    }
  }, 20_000);
});
