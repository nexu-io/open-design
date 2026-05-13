/**
 * PR #974 round 6 (mrcfps): pin the split-start dev-flow auto-restart
 * sequence in `ensureDaemonGateForDesktop`.
 *
 * Background: `tools-dev start daemon` followed by `tools-dev start desktop`
 * was leaving the daemon ungated because `OD_REQUIRE_DESKTOP_AUTH=1`
 * is only injected when daemon and desktop spawn together. The
 * helper now introspects the running daemon's STATUS over IPC and
 * restarts it (and web, if running) before launching desktop main
 * when the daemon reports `desktopAuthGateActive: false`.
 *
 * These four cases pin the call sequence so a future refactor cannot
 * silently regress the gate. We record every call into an ordered
 * array of `{ kind, arg? }` records and assert the exact sequence —
 * the helper is a state machine, and the order of stop/start matters
 * (web stops BEFORE daemon so the proxy doesn't 502 against an
 * intermediate daemon down state).
 *
 * @see tools/dev/src/desktop-auth-gate.ts
 * @see https://github.com/nexu-io/open-design/pull/974
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { APP_KEYS, type DaemonStatusSnapshot, type WebStatusSnapshot } from "@open-design/sidecar-proto";

import {
  ensureDaemonGateForDesktop,
  type EnsureDaemonGateDeps,
} from "../src/desktop-auth-gate.js";

type CallRecord =
  | { kind: "inspectDaemon" }
  | { kind: "inspectWeb" }
  | { kind: "stopApp"; app: typeof APP_KEYS.DAEMON | typeof APP_KEYS.WEB }
  | { kind: "startDaemonGated"; port: number | null }
  | { kind: "startWeb"; port: number | null }
  | { kind: "log"; msg: string };

function makeRecorder(setup: {
  daemon: DaemonStatusSnapshot | null;
  web: WebStatusSnapshot | null;
}): { calls: CallRecord[]; deps: EnsureDaemonGateDeps } {
  const calls: CallRecord[] = [];
  const deps: EnsureDaemonGateDeps = {
    inspectDaemon: async () => {
      calls.push({ kind: "inspectDaemon" });
      return setup.daemon;
    },
    inspectWeb: async () => {
      calls.push({ kind: "inspectWeb" });
      return setup.web;
    },
    stopApp: async (app) => {
      calls.push({ kind: "stopApp", app });
    },
    startDaemonGated: async ({ port }) => {
      calls.push({ kind: "startDaemonGated", port });
    },
    startWeb: async ({ port }) => {
      calls.push({ kind: "startWeb", port });
    },
    log: (msg) => {
      calls.push({ kind: "log", msg });
    },
  };
  return { calls, deps };
}

function armed(): DaemonStatusSnapshot {
  return {
    desktopAuthGateActive: true,
    pid: 1234,
    state: "running",
    updatedAt: "2026-05-09T03:00:00.000Z",
    url: "http://127.0.0.1:7456",
  };
}

function ungated(): DaemonStatusSnapshot {
  return {
    desktopAuthGateActive: false,
    pid: 1234,
    state: "running",
    updatedAt: "2026-05-09T03:00:00.000Z",
    url: "http://127.0.0.1:7456",
  };
}

function webRunning(): WebStatusSnapshot {
  return {
    pid: 5678,
    state: "running",
    updatedAt: "2026-05-09T03:00:00.000Z",
    url: "http://127.0.0.1:5173",
  };
}

describe("ensureDaemonGateForDesktop", () => {
  it("is a no-op when no daemon is running (regular flow surfaces that)", async () => {
    const { calls, deps } = makeRecorder({ daemon: null, web: null });
    await ensureDaemonGateForDesktop(deps);
    assert.deepEqual(calls, [{ kind: "inspectDaemon" }]);
  });

  it("is a no-op when the running daemon already reports the gate active", async () => {
    // Bundled-targets path (`pnpm tools-dev`): trigger (A) in startApp
    // already armed the gate at first daemon spawn, so the helper just
    // confirms via STATUS and exits with no side effects. This case
    // protects against a regression that adds an unconditional restart.
    const { calls, deps } = makeRecorder({ daemon: armed(), web: webRunning() });
    await ensureDaemonGateForDesktop(deps);
    assert.deepEqual(calls, [{ kind: "inspectDaemon" }]);
  });

  it("restarts only the daemon when gate is inactive and web is NOT running", async () => {
    // Split-start `tools-dev start daemon` -> `tools-dev start desktop`
    // with no web sidecar in between. The helper logs once, stops the
    // daemon, restarts it gated, and does NOT touch web. Order matters:
    // log -> inspectWeb -> stopApp(daemon) -> startDaemonGated.
    const { calls, deps } = makeRecorder({ daemon: ungated(), web: null });
    await ensureDaemonGateForDesktop(deps);
    assert.equal(calls.length, 5);
    assert.equal(calls[0].kind, "inspectDaemon");
    assert.equal(calls[1].kind, "log");
    assert.match((calls[1] as { msg: string }).msg, /restarting daemon/);
    assert.equal(calls[2].kind, "inspectWeb");
    assert.deepEqual(calls[3], { kind: "stopApp", app: APP_KEYS.DAEMON });
    assert.deepEqual(calls[4], { kind: "startDaemonGated", port: 7456 });
    // Defensive: ensure no web spawn happened.
    assert.equal(calls.find((c) => c.kind === "startWeb"), undefined);
    assert.equal(calls.find((c) => c.kind === "stopApp" && c.app === APP_KEYS.WEB), undefined);
  });

  it("restarts daemon AND web in the right order when both are running and gate is inactive", async () => {
    // Split-start `start daemon` -> `start web` -> `start desktop`.
    // Order is critical: web stops FIRST (so its proxy doesn't 502
    // against the down-then-up daemon during the restart window),
    // THEN daemon stops, THEN daemon respawns gated, THEN web restarts.
    // Inverting any pair would either leave a transient 502 or restart
    // web against the OLD daemon URL.
    const { calls, deps } = makeRecorder({ daemon: ungated(), web: webRunning() });
    await ensureDaemonGateForDesktop(deps);
    assert.equal(calls.length, 7);
    assert.equal(calls[0].kind, "inspectDaemon");
    assert.equal(calls[1].kind, "log");
    assert.equal(calls[2].kind, "inspectWeb");
    assert.deepEqual(calls[3], { kind: "stopApp", app: APP_KEYS.WEB });
    assert.deepEqual(calls[4], { kind: "stopApp", app: APP_KEYS.DAEMON });
    assert.deepEqual(calls[5], { kind: "startDaemonGated", port: 7456 });
    assert.deepEqual(calls[6], { kind: "startWeb", port: 5173 });
  });

  // Round 7 (lefarcen P2): the hardening restart was passing the
  // current `start desktop` CLI options to startDaemonGated/startWeb,
  // which meant a daemon/web started with `--daemon-port 17456` could
  // silently drift to a random port during the restart. The helper now
  // extracts the running ports from the STATUS URLs and forwards them
  // explicitly. These three cases pin the new port-preservation contract.
  it("preserves the running daemon port across the hardening restart", async () => {
    const ungatedOnExplicitPort: DaemonStatusSnapshot = {
      desktopAuthGateActive: false,
      pid: 1234,
      state: "running",
      updatedAt: "2026-05-09T03:00:00.000Z",
      url: "http://127.0.0.1:17456",
    };
    const { calls, deps } = makeRecorder({ daemon: ungatedOnExplicitPort, web: null });
    await ensureDaemonGateForDesktop(deps);
    const restart = calls.find((c) => c.kind === "startDaemonGated");
    assert.notEqual(restart, undefined);
    assert.deepEqual(restart, { kind: "startDaemonGated", port: 17456 });
  });

  it("preserves the running web port across the hardening restart when web is alive", async () => {
    const ungatedDaemon: DaemonStatusSnapshot = {
      desktopAuthGateActive: false,
      pid: 1234,
      state: "running",
      updatedAt: "2026-05-09T03:00:00.000Z",
      url: "http://127.0.0.1:17456",
    };
    const webOnExplicitPort: WebStatusSnapshot = {
      pid: 5678,
      state: "running",
      updatedAt: "2026-05-09T03:00:00.000Z",
      url: "http://127.0.0.1:17573",
    };
    const { calls, deps } = makeRecorder({ daemon: ungatedDaemon, web: webOnExplicitPort });
    await ensureDaemonGateForDesktop(deps);
    const webRestart = calls.find((c) => c.kind === "startWeb");
    assert.notEqual(webRestart, undefined);
    assert.deepEqual(webRestart, { kind: "startWeb", port: 17573 });
    const daemonRestart = calls.find((c) => c.kind === "startDaemonGated");
    assert.deepEqual(daemonRestart, { kind: "startDaemonGated", port: 17456 });
  });

  it("falls back to caller options (port:null) when the running URL has no port", async () => {
    // Defensive: a malformed or IPC-only status URL should yield null
    // so the caller's existing options govern the restart, rather than
    // shipping a meaningless "0" port that would force a random port.
    const ungatedNullishUrl: DaemonStatusSnapshot = {
      desktopAuthGateActive: false,
      pid: 1234,
      state: "running",
      updatedAt: "2026-05-09T03:00:00.000Z",
      url: null,
    };
    const { calls, deps } = makeRecorder({ daemon: ungatedNullishUrl, web: null });
    await ensureDaemonGateForDesktop(deps);
    const restart = calls.find((c) => c.kind === "startDaemonGated");
    assert.deepEqual(restart, { kind: "startDaemonGated", port: null });
  });

  it("logs a single warn line that names both daemon and web in the restart message", async () => {
    // The user sees one line per `start desktop` invocation in the
    // ungated case, so it must be self-explanatory — naming both
    // affected services in one message lets them anticipate the
    // disruption without grepping for context.
    const { calls, deps } = makeRecorder({ daemon: ungated(), web: webRunning() });
    await ensureDaemonGateForDesktop(deps);
    const logs = calls.filter((c): c is { kind: "log"; msg: string } => c.kind === "log");
    assert.equal(logs.length, 1);
    assert.match(logs[0].msg, /tools-dev/);
    assert.match(logs[0].msg, /desktop-auth gate/);
    assert.match(logs[0].msg, /daemon/);
    assert.match(logs[0].msg, /web/);
  });
});
