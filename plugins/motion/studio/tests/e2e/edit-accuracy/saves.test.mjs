import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { saveFault, timedWrite } from "./case.mjs";
import { slowest } from "./sequences.mjs";
import { score, UNDO_WRITE_MAX_MS } from "./report.mjs";

const measured = (undoTimeout, ms = 80) => ({
  tracking: { max: 0.1 },
  pressJump: 0,
  teleport: null,
  drop: 0,
  reload: 0,
  render: 0,
  undo: { bytes: true, redoBytes: true, box: 0, redoBox: 0, ms, redoMs: 80 },
  undoTimeout,
  smooth: { intervals: [16], work: [2], control: { intervals: [16], work: [2] } },
  unsettled: [],
});

describe("undo and redo saves", () => {
  it("names the first lost write, or none", () => {
    const ok = { reached: true, ms: 80 };
    expect(
      saveFault([
        ["undo", ok],
        ["redo", ok],
      ]),
    ).toBe(null);
    expect(
      saveFault([
        ["undo", ok],
        ["redo", { reached: false }],
      ]),
    ).toBe("redo lost");
  });

  it("fails undo on a late or lost save even when the bytes come back right", () => {
    expect(score({}, measured(null)).checks.undo).toBe(true);
    expect(score({}, measured(null, UNDO_WRITE_MAX_MS + 1)).checks.undo).toBe(false);
    expect(score({}, measured("redo lost")).checks.undo).toBe(false);
  });

  it("times a write from its key, and fails undo past the limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "edit-bench-save-"));
    writeFileSync(join(dir, "index.html"), "after");
    const ctx = { dir, files: ["index.html"] };
    const from = { "index.html": "before" };
    const undoIn = async (ago) => {
      const w = await timedWrite(ctx, from, Date.now() - ago);
      return score({}, measured(null, w.ms)).checks.undo;
    };
    expect(await undoIn(UNDO_WRITE_MAX_MS - 1000)).toBe(true);
    expect(await undoIn(UNDO_WRITE_MAX_MS + 1000)).toBe(false);
  });

  it("judges a sequence's undo walk by its slowest write", () => {
    const walk = [{ ms: 60 }, { ms: UNDO_WRITE_MAX_MS + 500 }, { ms: 70 }];
    expect(slowest(walk)).toBe(UNDO_WRITE_MAX_MS + 500);
    expect(slowest([])).toBe(null);
    expect(score({}, measured(null, slowest(walk))).checks.undo).toBe(false);
    expect(score({}, measured(null, slowest(walk.slice(0, 1)))).checks.undo).toBe(true);
  });
});
