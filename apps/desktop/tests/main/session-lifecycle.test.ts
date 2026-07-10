import { describe, expect, test } from "vitest";

import {
  beginDesktopSession,
  clearReportedCrash,
  endDesktopSessionCleanly,
  markDesktopSessionRunning,
  type DesktopSessionState,
} from "../../src/main/session-lifecycle.js";

// In-memory fs so the pure lifecycle logic is exercised without touching disk.
function makeStore(initial?: string) {
  const files = new Map<string, string>();
  if (initial != null) files.set("state.json", initial);
  return {
    readFile: (p: string) => {
      const v = files.get(p);
      if (v == null) throw new Error("ENOENT");
      return v;
    },
    writeFile: (p: string, d: string) => {
      files.set(p, d);
    },
    state: () => JSON.parse(files.get("state.json")!) as DesktopSessionState,
  };
}

const FIXED = new Date("2026-07-09T12:00:00.000Z");
const io = (store: ReturnType<typeof makeStore>) => ({ readFile: store.readFile, writeFile: store.writeFile });

function begin(store: ReturnType<typeof makeStore>, sessionId: string, version = "0.14.0") {
  return beginDesktopSession({ stateFilePath: "state.json", sessionId, version, now: () => FIXED, ...io(store) });
}
const running = (s: ReturnType<typeof makeStore>) => markDesktopSessionRunning({ stateFilePath: "state.json", ...io(s) });
const quit = (s: ReturnType<typeof makeStore>) => endDesktopSessionCleanly({ stateFilePath: "state.json", ...io(s) });
const ids = (r: { previousUncleanSessions: { sessionId: string }[] }) => r.previousUncleanSessions.map((c) => c.sessionId);

describe("desktop session lifecycle", () => {
  test("first run reports nothing and writes a not-yet-running marker", () => {
    const store = makeStore();
    expect(ids(begin(store, "s1"))).toEqual([]);
    expect(store.state()).toMatchObject({ sessionId: "s1", reachedRunning: false, clean: false, unreportedCrashes: [] });
  });

  test("reached-running then crashed → next launch reports it and queues it", () => {
    const store = makeStore();
    begin(store, "a");
    running(store);
    expect(ids(begin(store, "b"))).toEqual(["a"]);
    expect(store.state().unreportedCrashes.map((c) => c.sessionId)).toEqual(["a"]);
  });

  test("never reached running → not reported (startup failure, not a crash)", () => {
    const store = makeStore();
    begin(store, "a");
    expect(ids(begin(store, "b"))).toEqual([]);
  });

  test("graceful quit → next launch reports nothing", () => {
    const store = makeStore();
    begin(store, "a");
    running(store);
    quit(store);
    expect(ids(begin(store, "b"))).toEqual([]);
  });

  test("consecutive crashes with failed reports keep EVERY crash (nettee's sequence)", () => {
    const store = makeStore();
    // A runs and crashes.
    begin(store, "a");
    running(store);
    // B launches, detects A (report fails → not cleared), then B runs and crashes.
    expect(ids(begin(store, "b"))).toEqual(["a"]);
    running(store);
    // C launches: BOTH A and B must be reported — neither dropped.
    expect(ids(begin(store, "c"))).toEqual(["a", "b"]);
    expect(store.state().unreportedCrashes.map((c) => c.sessionId)).toEqual(["a", "b"]);
  });

  test("clearReportedCrash(id) drops only the acked crash", () => {
    const store = makeStore();
    begin(store, "a");
    running(store);
    begin(store, "b");
    running(store);
    begin(store, "c"); // queue now [a, b]
    clearReportedCrash({ stateFilePath: "state.json", ...io(store) }, "a");
    expect(store.state().unreportedCrashes.map((x) => x.sessionId)).toEqual(["b"]);
    // c quits cleanly but b was never acked → d still retries b.
    quit(store);
    expect(ids(begin(store, "d"))).toEqual(["b"]);
  });

  test("markRunning and clean preserve the queued crashes", () => {
    const store = makeStore();
    begin(store, "a");
    running(store);
    begin(store, "b"); // carries [a]
    running(store);
    expect(store.state().unreportedCrashes.map((c) => c.sessionId)).toEqual(["a"]);
    quit(store);
    expect(store.state().unreportedCrashes.map((c) => c.sessionId)).toEqual(["a"]);
  });

  test("never throws on a corrupt marker and still stamps this run", () => {
    const store = makeStore("}{ not json");
    expect(() => begin(store, "s5")).not.toThrow();
    expect(store.state().sessionId).toBe("s5");
  });
});
