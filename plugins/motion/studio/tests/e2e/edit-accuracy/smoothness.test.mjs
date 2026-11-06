import { describe, expect, it } from "vitest";
import { controlDrag, smoothness } from "./case.mjs";

const thread = { pid: 1, tid: 2 };
const mark = { name: "edit-bench-end", cat: "blink.user_timing", ts: 1_000_000, ...thread };
const task = (ts, dur, tdur) => ({ name: "RunTask", ph: "X", ts, dur, tdur, ...thread });
// Frame stamps 50, 66 and 82 ms before a mark at 100 ms: trace time 950, 966 and 982 ms.
const rec = (trace) => ({ frames: [50, 66, 82], mark: 100, long: [], trace });

describe("smoothness work per frame", () => {
  it("measures the frames when a task outside them lacks thread time", () => {
    const s = smoothness(rec([mark, task(900_000, 10_000), task(960_000, 4_000, 2_000)]));
    expect(s.work).toEqual([2, 0]);
    expect(s.wallTimed).toBe(0);
  });

  it("counts a task inside the frames that lacks thread time at its wall time", () => {
    const s = smoothness(rec([mark, task(960_000, 4_000)]));
    expect(s.work).toEqual([4, 0]);
    expect(s.wallTimed).toBe(1);
  });

  it("leaves the work unknown without the end mark", () => {
    const s = smoothness(rec([task(960_000, 4_000, 4_000)]));
    expect(s.work).toBeNull();
    expect(s.unknown).toBe("no end mark in the trace");
  });
});

describe("controlDrag", () => {
  it("measures again after a failed control instead of failing every later case", async () => {
    let calls = 0;
    const browser = {
      createBrowserContext: async () => {
        calls += 1;
        throw new Error(`blank page ${calls} failed`);
      },
    };
    await expect(controlDrag(browser, "move")).rejects.toThrow("blank page 1 failed");
    await expect(controlDrag(browser, "move")).rejects.toThrow("blank page 2 failed");
    expect(calls).toBe(2);
  });
});
