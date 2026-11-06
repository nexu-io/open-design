import { describe, expect, it } from "vitest";
import { accurate } from "./ratchet.mjs";
import { entry, score, slowRunner, UNDO_WRITE_MAX_MS } from "./report.mjs";

const frames = { intervals: [16, 17, 16], work: [2, 3, 2] };
const result = (undo) => ({
  tracking: { max: 0 },
  pressJump: 0,
  teleport: null,
  drop: 0,
  reload: 0,
  render: 0,
  undo: { bytes: true, redoBytes: true, box: 0, redoBox: 0, ...undo },
  smooth: { ...frames, control: frames },
  unsettled: [],
});
const undoCheck = (undo) => score({ id: "case" }, result(undo)).checks.undo;

describe("the undo check", () => {
  it("passes an undo and redo whose writes land within the limit of their keys", () => {
    expect(undoCheck({ ms: UNDO_WRITE_MAX_MS, redoMs: 80 })).toBe(true);
  });

  it("fails an undo or a redo whose write lands later than the limit", () => {
    expect(undoCheck({ ms: UNDO_WRITE_MAX_MS + 1, redoMs: 80 })).toBe(false);
    expect(undoCheck({ ms: 80, redoMs: UNDO_WRITE_MAX_MS + 1 })).toBe(false);
  });
});

describe("the smooth verdict", () => {
  const smooth = (work, intervals = [16, 17, 16]) => {
    const r = result({});
    return score({ id: "case" }, { ...r, smooth: { ...r.smooth, intervals, work } });
  };

  it("fails one frame over 8 ms of work, even when the rest are idle", () => {
    expect(smooth([8, 1, 1]).checks.smooth).toBe(true);
    expect(smooth([...Array(39).fill(1), 8.5]).checks.smooth).toBe(false);
  });

  it("fails a dropped frame the blank-page control did not drop, and unknown work", () => {
    expect(smooth([2, 3, 2], [16, 40, 16]).checks.smooth).toBe(false);
    expect(smooth(null).checks.smooth).toBe(false);
  });

  it("is banked as smooth alone, apart from accuracy", () => {
    const e = entry(smooth([9, 1, 1]));
    expect(e).toMatchObject({ smooth: false, workMax: 9 });
    expect(e).not.toHaveProperty("pass");
    expect(accurate(e)).toBe(true);
  });
});

describe("a case's verdict", () => {
  it("passes only when every metric does, smoothness included", () => {
    expect(score({ id: "case" }, result({})).pass).toBe(true);
    expect(score({ id: "case" }, { ...result({}), drop: 1000 }).pass).toBe(false);
    const slow = { ...frames, work: [9, 1, 1], control: frames };
    expect(score({ id: "case" }, { ...result({}), smooth: slow }).pass).toBe(false);
    expect(score({ id: "case" }, { error: "boom" }).pass).toBe(false);
  });
});

describe("the slow runner check", () => {
  // Each case's usual seconds is 20 here; the grid's own come from timings.json.
  const at = (...seconds) => seconds.map((s, i) => ({ id: `case-${i}`, seconds: s }));
  const usual = () => 20;

  it("stops a shard whose first four cases ran about 5x slower than usual", () => {
    // A merge queue shard that ran into its timeout: its first cases, in seconds.
    expect(slowRunner(at(95.5, 133.7, 57.9, 107.5, 91.6), usual)).toBeCloseTo(4.775);
  });

  it("lets a healthy runner through, including one slow case among its first four", () => {
    expect(slowRunner(at(22, 21.4, 19.8, 23.1), usual)).toBeNull();
    expect(slowRunner(at(14, 92.7, 16.3, 15.2), usual)).toBeNull();
  });

  it("judges speed, not how long the cases are", () => {
    const long = [
      { id: "a", seconds: 90 },
      { id: "b", seconds: 84 },
      { id: "c", seconds: 88 },
      { id: "d", seconds: 86 },
    ];
    expect(slowRunner(long, () => 60)).toBeNull();
  });

  it("waits for four cases before judging", () => {
    expect(slowRunner(at(95.5, 133.7, 107.5), usual)).toBeNull();
  });
});
