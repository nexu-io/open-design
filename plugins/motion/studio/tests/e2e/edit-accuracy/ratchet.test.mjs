import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { accurate, bankable, comment, flipped, gate, QUARANTINED } from "./ratchet.mjs";
import { entry, score } from "./report.mjs";
import { scoreTeleport } from "./teleport.mjs";

const good = {
  tracking: 0.1,
  pressJump: 0,
  drop: 0,
  reload: 0,
  render: 0.02,
  undo: true,
  dropped: 0,
  controlDropped: 0,
  workMax: 3,
  frameP95: 20,
};
const run = (id, drop = 0) => ({
  id,
  tracking: { max: 0.1 },
  pressJump: 0,
  drop,
  reload: 0,
  render: 0.02,
  undo: { bytes: true, redoBytes: true, box: 0, redoBox: 0 },
  checks: { undo: true },
  smooth: { p95: 20, dropped: 0, workMax: 3, control: { dropped: 0 } },
  unsettled: [],
});
const baseline = (cases) => ({ cases });

describe("accurate", () => {
  it("ignores smoothness and a metric the baseline does not hold", () => {
    expect(accurate({ ...good, smooth: false, dropped: 4, workMax: 90 })).toBe(true);
    expect(accurate({ tracking: 0.1, drop: 0, reload: 0, undo: true })).toBe(true);
    expect(accurate({ ...good, pressJump: null })).toBe(true);
  });

  it("fails a px metric over the limit, a failed undo and an error", () => {
    expect(accurate({ ...good, drop: 0.51 })).toBe(false);
    expect(accurate({ ...good, pressJump: 0.51 })).toBe(false);
    expect(accurate({ ...good, unsettled: ["committed"] })).toBe(false);
    expect(accurate({ ...good, render: null, renderError: true })).toBe(false);
    expect(accurate({ ...good, undo: false })).toBe(false);
    expect(accurate({ ...good, teleport: false, teleportPx: null })).toBe(false);
    expect(accurate({ ...good, teleport: true })).toBe(true);
    expect(accurate({ ...good, text: false })).toBe(false);
    expect(accurate({ ...good, text: true })).toBe(true);
    expect(accurate({ error: true })).toBe(false);
    expect(accurate(undefined)).toBe(false);
  });
});

describe("quarantine", () => {
  const base = baseline({ a: good, b: good });
  const q = { a: "#1234" };

  it("measures a quarantined case but never fails the gate on it, while any other case still can", () => {
    const failing = [run("a", 9), run("a", 9), run("a", 9), run("b")];
    expect(gate(base, base, failing, q)).toMatchObject({ regressed: [], ok: true });
    expect(gate(base, base, failing, {})).toMatchObject({ regressed: ["a"], ok: false });
    const fresh = baseline({});
    expect(gate(fresh, fresh, [run("a"), run("b")], q)).toMatchObject({
      unbanked: ["b"],
      ok: true,
    });
    expect(
      gate(base, baseline({ a: good, b: good }), [run("a", 9), run("b")], q).overclaimed,
    ).toEqual([]);
  });

  it("lists every quarantined case with its fixer and each run's verdict, on every run", () => {
    const text = comment(gate(base, base, [run("a", 9), run("a"), run("a", 9), run("b")], q));
    expect(text).toContain("- a (fixed by #1234): fail / pass / fail, fails");
    expect(comment(gate(base, base, [run("b")], q))).toContain("- a (fixed by #1234): not run");
  });

  it("heads the comment with the accurate and smooth counts, smoothness never gating", () => {
    const smooth = (id, ok, drop = 0) => ({ ...run(id, drop), checks: { undo: true, smooth: ok } });
    // c is smooth but not accurate, so it is not counted.
    const g = gate(base, base, [smooth("a", false), smooth("b", true), smooth("c", true, 9)], {});
    expect(comment(g)).toContain("accurate 2 (base branch 2), smooth 1 of those");
    expect(g.headSmooth).toBeLessThanOrEqual(g.headPassing);
    expect(g.ok).toBe(true);
  });

  it("names a fixing PR for every quarantined id", () => {
    for (const fixer of Object.values(QUARANTINED)) expect(fixer).toMatch(/#\d+/);
  });
});

describe("gate", () => {
  const base = baseline({ a: good, b: good });

  it("banks for each case a run that agrees with its 2 of 3 verdict, not its first run", () => {
    const runs = [run("a", 9), run("b"), run("a"), run("b", 9), run("a"), run("b", 9)];
    const banked = bankable(runs);
    const g = gate(base, baseline({}), runs);
    expect(banked.map((r) => [r.id, accurate(entry(r))])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    const head = baseline(Object.fromEntries(banked.map((r) => [r.id, entry(r)])));
    const again = gate(base, head, runs);
    expect([again.unbanked, again.overclaimed]).toEqual([[], []]);
    expect(g.regressed).toEqual(["b"]);
  });

  it("re-runs every case whose verdict differs from the base branch, in either direction", () => {
    const mixed = baseline({ a: good, b: good, d: { ...good, drop: 9 } });
    expect(flipped(mixed, [run("a", 3), run("b"), run("c", 3), run("d")])).toEqual(["a", "d"]);
  });

  it("banks a newly passing case only when it passes 2 of 3 runs, and lists a lucky pass as unstable", () => {
    const before = baseline({ a: good, b: { ...good, drop: 9 } });
    const lucky = gate(before, before, [run("a"), run("b"), run("b", 9), run("b", 9)]);
    expect(lucky.newlyPassing).toEqual([]);
    expect(lucky.unbanked).toEqual([]);
    expect(lucky.unstable.map((u) => u.id)).toEqual(["b"]);
    expect(lucky.ok).toBe(true);
    const real = gate(before, before, [run("a"), run("b"), run("b"), run("b", 9)]);
    expect(real.unbanked).toEqual(["b"]);
    expect(real.ok).toBe(true);
  });

  it("fails a regression that fails 2 of 3 runs", () => {
    const g = gate(base, base, [run("a", 3), run("a", 3), run("a"), run("b")]);
    expect(g.regressed).toEqual(["a"]);
    expect(g.ok).toBe(false);
    expect(g.unstable.map((u) => u.id)).toEqual(["a"]);
  });

  it("passes a case that fails 1 of 3 runs but still lists it as unstable", () => {
    const g = gate(base, base, [run("a", 3), run("a"), run("a"), run("b")]);
    expect(g.regressed).toEqual([]);
    expect(g.unstable).toHaveLength(1);
    expect(g.unstable[0].runs[0]).toContain("drop 3");
    expect(g.ok).toBe(true);
  });

  it("reports a newly passing case that baseline.json does not bank, without failing on it", () => {
    const before = baseline({ a: good, b: { ...good, drop: 9 } });
    const g = gate(before, before, [run("a"), run("b")]);
    expect(g).toMatchObject({ unbanked: ["b"], ok: true });
    expect(comment(g)).toContain("- b");
    expect(gate(before, base, [run("a"), run("b")]).unbanked).toEqual([]);
  });

  it("fails when baseline.json claims a pass the run does not reproduce", () => {
    const g = gate(baseline({}), baseline({ a: good }), [run("a", 3)]);
    expect(g.overclaimed).toEqual(["a"]);
    expect(g.ok).toBe(false);
  });

  it("fails when the passing count falls, as when a passing case leaves the grid", () => {
    const g = gate(base, base, [run("a")]);
    expect(g.missing).toEqual(["b"]);
    expect(g.reasons.join()).toContain("fell from 2 to 1");
  });

  it("does not count a case retired from the grid with its baseline.json entry, and lists it", () => {
    const g = gate(base, baseline({ a: good }), [run("a")]);
    expect(g).toMatchObject({ basePassing: 1, missing: [], retired: ["b"], ok: true });
    expect(comment(g)).toContain("Retired");
  });

  it("counts only the cases that ran when a run covers part of the grid, still failing a regression", () => {
    const slice = new Set(["a"]);
    expect(gate(base, base, [run("a")], {}, slice)).toMatchObject({ missing: [], ok: true });
    const g = gate(base, base, [run("a", 3), run("a", 3), run("a")], {}, slice);
    expect(g).toMatchObject({ regressed: ["a"], ok: false });
  });
});

describe("teleport in the gate", () => {
  it("rejects a drag whose frames could not be measured, from scoring to the baseline entry", () => {
    const r = {
      tracking: { max: 0 },
      pressJump: 0,
      teleport: scoreTeleport("move", [{ t: 0, pointer: null, down: true }]),
      drop: 0,
      reload: 0,
      render: 0,
      undo: { bytes: true, redoBytes: true, box: 0, redoBox: 0 },
      undoTimeout: null,
      smooth: { intervals: [16], work: [2], control: { intervals: [16], work: [2] } },
      unsettled: [],
    };
    expect(accurate(entry(score({ id: "move-x" }, r)))).toBe(false);
    expect(accurate(entry(score({ id: "nudge-x" }, { ...r, teleport: null })))).toBe(true);
  });
});

describe("gate command, as CI runs it", () => {
  const script = fileURLToPath(new URL("./ratchet.mjs", import.meta.url));
  /** Runs `gate --shards <shards>` over the given shard results; returns its exit code, comment and verdict. */
  function runGate(shards, shardCases) {
    const dir = mkdtempSync(join(tmpdir(), "edit-accuracy-gate-"));
    const base = join(dir, "base.json");
    writeFileSync(base, JSON.stringify(baseline({ a: good, b: good })));
    const results = shardCases.map((cases, i) => {
      const path = join(dir, `shard-${i}.json`);
      writeFileSync(path, JSON.stringify({ meta: { grid: `pr shard ${i + 1}/${shards}` }, cases }));
      return path;
    });
    const out = join(dir, "out");
    const run = spawnSync(
      process.execPath,
      [script, "gate", "--shards", String(shards), base, base, out, ...results],
      {
        encoding: "utf8",
      },
    );
    const report = JSON.parse(readFileSync(join(out, "gate.json"), "utf8"));
    return {
      code: run.status,
      comment: readFileSync(join(out, "comment.md"), "utf8"),
      verdict: report.verdict,
    };
  }

  it("says the shards did not run when none reported results, never that accuracy fell", () => {
    const g = runGate(5, []);
    expect(g.code).toBe(2);
    expect(g.verdict).toBe(
      "Edit accuracy did not run: 0 of 5 shards reported results; see the shard jobs.",
    );
    expect(g.comment).toContain("0 of 5 shards reported results");
    expect(g.comment).not.toMatch(/fell|accurate \d/);
  });

  it("says the shards did not all run when the cases that ran hold, so a missing shard is not a drop", () => {
    const g = runGate(2, [[run("a")]]);
    expect(g.code).toBe(2);
    expect(g.verdict).toBe(
      "Edit accuracy did not run: 1 of 2 shards reported results; see the shard jobs.",
    );
  });

  it("still says accuracy fell when a case that ran regressed, even with a shard missing", () => {
    const g = runGate(2, [[run("a", 9), run("a", 9), run("a", 9)]]);
    expect(g.code).toBe(1);
    expect(g.verdict).toBe("Edit accuracy fell against the base branch; see the PR comment.");
    expect(g.comment).toContain("1 of 2 shards reported results");
  });

  it("passes when every shard reported and nothing fell", () => {
    const g = runGate(2, [[run("a")], [run("b")]]);
    expect(g.code).toBe(0);
    expect(g.verdict).toBe("Edit accuracy holds against the base branch.");
  });
});
