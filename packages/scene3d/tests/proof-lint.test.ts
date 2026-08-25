import { describe, expect, it } from "vitest";
import { lintProof } from "../src/lint/proof.js";
import { Issue, ProofFrameStats } from "../src/types.js";

function frame(overrides: Partial<ProofFrameStats> = {}): ProofFrameStats {
  return { path: "/tmp/proof-000.png", meanLuminance: 0.35, coverage: 0.4, ...overrides };
}

function codes(frames: ProofFrameStats[] | undefined): string[] {
  const issues: Issue[] = [];
  lintProof(frames, issues);
  return issues.map((i) => i.code);
}

describe("lintProof", () => {
  it("says nothing when the proof stage did not run", () => {
    expect(codes(undefined)).toEqual([]);
    expect(codes([])).toEqual([]);
  });

  it("says nothing about a well-exposed render", () => {
    expect(codes([frame({ path: "a.png" }), frame({ path: "b.png", coverage: 0.5 })])).toEqual([]);
  });

  it("errors once when every frame rendered empty", () => {
    const result = codes([
      frame({ path: "a.png", meanLuminance: 0, coverage: 0 }),
      frame({ path: "b.png", meanLuminance: 0.0005, coverage: 0 }),
    ]);
    expect(result).toEqual(["S3D-E-383"]);
  });

  it("warns (not errors) per frame when only some angles render empty (PF-3)", () => {
    // One off-angle where the subject leaves frame is a warning, not the
    // compile-failing error that EVERY frame black is.
    const issues: Issue[] = [];
    lintProof(
      [
        frame({ path: "a.png" }),
        frame({ path: "b.png", meanLuminance: 0, coverage: 0 }),
        frame({ path: "c.png", meanLuminance: 0, coverage: 0 }),
      ],
      issues,
    );
    expect(issues.map((i) => i.code)).toEqual(["S3D-W-386", "S3D-W-386"]);
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
    expect(issues.map((i) => i.target)).toEqual(["b.png", "c.png"]);
  });

  it("warns when the subject is a speck in every frame", () => {
    expect(
      codes([
        frame({ path: "a.png", meanLuminance: 0.02, coverage: 0.002 }),
        frame({ path: "b.png", meanLuminance: 0.02, coverage: 0.003 }),
      ]),
    ).toEqual(["S3D-W-383"]);
  });

  it("warns when a turntable never moves — the stale-transform signature", () => {
    const same = { meanLuminance: 0.3, coverage: 0.25 };
    expect(
      codes([
        frame({ path: "a.png", ...same }),
        frame({ path: "b.png", ...same }),
        frame({ path: "c.png", ...same }),
        frame({ path: "d.png", ...same }),
      ]),
    ).toEqual(["S3D-W-384"]);
  });

  it("does not call a moving turntable static", () => {
    expect(
      codes([
        frame({ path: "a.png", coverage: 0.25 }),
        frame({ path: "b.png", coverage: 0.31 }),
        frame({ path: "c.png", coverage: 0.28 }),
      ]),
    ).toEqual([]);
  });

  it("reports unmeasured frames instead of silently passing them", () => {
    // Frames that exist but returned no pixel stats are UNCHECKED, and
    // unchecked must never read as clean — the old `return` here was the
    // black-render trap reinstated one layer up.
    const issues: Issue[] = [];
    lintProof([frame({ meanLuminance: null, coverage: null })], issues);
    expect(issues.map((i) => i.code)).toEqual(["S3D-W-387"]);
    expect(issues[0]!.severity).toBe("warning");
    expect(issues[0]!.message).toContain("not visually verified");
    expect(issues[0]!.detail).toMatchObject({ frames: 1, measured: 0, skipped: 1 });
  });

  it("does not claim EVERY frame empty when some frames were never measured", () => {
    // One measured-empty frame plus one unmeasured frame proves only what it
    // saw: the compile-failing total-failure error would overclaim, so the
    // measured-empty frame degrades to the per-frame warning beside the
    // unmeasured-coverage note.
    const issues: Issue[] = [];
    lintProof(
      [
        frame({ path: "a.png", meanLuminance: 0, coverage: 0 }),
        frame({ path: "b.png", meanLuminance: null, coverage: null }),
      ],
      issues,
    );
    const codes = issues.map((i) => i.code).sort();
    expect(codes).toEqual(["S3D-W-386", "S3D-W-387"]);
  });

  it("names partial measurement coverage while still judging the measured frames", () => {
    const issues: Issue[] = [];
    lintProof(
      [
        frame({ path: "a.png" }),
        frame({ path: "b.png", meanLuminance: null, coverage: null }),
      ],
      issues,
    );
    expect(issues.map((i) => i.code)).toEqual(["S3D-W-387"]);
    expect(issues[0]!.message).toContain("PARTIAL");
    expect(issues[0]!.detail).toMatchObject({ frames: 2, measured: 1, skipped: 1 });
  });

  it("treats non-finite pixel statistics as unmeasured, never as clean", () => {
    // NaN satisfies `!== null` and then fails every threshold comparison,
    // so a corrupt readback used to bypass empty/sparse/static checks with
    // no issue at all. Red before the fix.
    const issues: Issue[] = [];
    lintProof([frame({ meanLuminance: NaN, coverage: NaN })], issues);
    expect(issues.map((i) => i.code)).toEqual(["S3D-W-387"]);
  });

  it("scopes the all-blown claim to measured frames when some carry no blownRatio", () => {
    const issues: Issue[] = [];
    lintProof(
      [frame({ path: "a.png", blownRatio: 0.8 }), frame({ path: "b.png" })],
      issues,
    );
    const blown = issues.find((i) => i.code === "S3D-W-385")!;
    expect(blown.message).toContain("1 measured proof frame");
    expect(blown.message).toContain("1 unmeasured");
    expect(blown.message).not.toContain("every proof frame");
  });

  it("warns when every frame is blown out — the pale-mush failure", () => {
    // Lint-clean, not black, and illegible: the exact lighting mistake the
    // black-frame rule cannot see. Real case: a 320W key light on a 1m
    // crate rendered every frame to pastel with no shadows.
    expect(
      codes([
        frame({ path: "a.png", meanLuminance: 0.85, blownRatio: 0.8 }),
        frame({ path: "b.png", meanLuminance: 0.83, blownRatio: 0.75 }),
      ]),
    ).toEqual(["S3D-W-385"]);
  });

  it("does not flag a well-exposed render with a bright highlight", () => {
    expect(
      codes([
        frame({ path: "a.png", blownRatio: 0.1 }),
        frame({ path: "b.png", blownRatio: 0.15 }),
      ]),
    ).toEqual([]);
  });

  it("does not flag when only some angles catch the light", () => {
    expect(
      codes([
        frame({ path: "a.png", blownRatio: 0.7 }),
        frame({ path: "b.png", blownRatio: 0.2 }),
      ]),
    ).toEqual([]);
  });

  it("tolerates runners that predate the blownRatio field", () => {
    expect(codes([frame({ path: "a.png", blownRatio: null })])).toEqual([]);
  });

  it("names both causes of an identical turntable, not just the camera (PF-1)", () => {
    const same = { meanLuminance: 0.3, coverage: 0.25 };
    const issues: Issue[] = [];
    lintProof(
      [frame({ path: "a.png", ...same }), frame({ path: "b.png", ...same }), frame({ path: "c.png", ...same })],
      issues,
    );
    const hint = issues.find((i) => i.code === "S3D-W-384")?.hint ?? "";
    expect(hint).toMatch(/rotationally symmetric/);
    expect(hint).toMatch(/camera is not moving/);
  });

  it("honours contract-supplied proof-quality thresholds (PF-2)", () => {
    // A stylized asset the project declares darker-tolerant: a frame at 0.05
    // luminance is empty under the default 0.002 floor only if we IGNORE the
    // override. With a stricter 0.1 floor it reads as empty; with the default
    // it does not.
    const dim = [frame({ path: "a.png", meanLuminance: 0.05, coverage: 0.4 })];
    const strict: Issue[] = [];
    lintProof(dim, strict, { emptyLuminance: 0.1, sparseCoverage: 0.01, blownRatio: 0.6 });
    expect(strict.some((i) => i.code === "S3D-E-383")).toBe(true);

    const lenient: Issue[] = [];
    lintProof(dim, lenient, { emptyLuminance: 0.002, sparseCoverage: 0.01, blownRatio: 0.6 });
    expect(lenient.some((i) => i.code === "S3D-E-383")).toBe(false);
  });
});

describe("exposure coverage + turntable identity (bug-shaker round 4)", () => {
  it("notes partial exposure coverage as unchecked, at info severity", () => {
    const issues: Issue[] = [];
    lintProof(
      [frame({ path: "a.png", blownRatio: 0.1 }), frame({ path: "b.png", blownRatio: NaN })],
      issues,
    );
    const note = issues.find((i) => i.code === "S3D-W-387")!;
    expect(note).toBeDefined();
    expect(note.severity).toBe("info");
    expect(note.message).toContain("overexposure was not measured for 1 of 2");
  });

  it("stays quiet when NO frame carries blownRatio — uniform absence is version skew, not corruption", () => {
    const issues: Issue[] = [];
    lintProof(
      [frame({ path: "a.png", coverage: 0.3 }), frame({ path: "b.png", coverage: 0.4 })],
      issues,
    );
    expect(issues.filter((i) => i.message.includes("overexposure"))).toEqual([]);
  });

  it("does not call a turntable static when only the blown ratio distinguishes the frames", () => {
    const same = { meanLuminance: 0.3, coverage: 0.25 };
    const issues: Issue[] = [];
    lintProof(
      [
        frame({ path: "a.png", ...same, blownRatio: 0.1 }),
        frame({ path: "b.png", ...same, blownRatio: 0.2 }),
        frame({ path: "c.png", ...same, blownRatio: 0.3 }),
      ],
      issues,
    );
    expect(issues.filter((i) => i.code === "S3D-W-384")).toEqual([]);
  });
});

describe("statistic validity + threshold immutability (bug-shaker round 5)", () => {
  it("treats finite-but-impossible fractions as unmeasured", () => {
    // coverage 1.3 or luminance -0.2 is corruption in a subtler coat than
    // NaN — both fractions live in [0,1] by construction.
    const issues: Issue[] = [];
    lintProof(
      [
        frame({ path: "a.png", coverage: 1.3 }),
        frame({ path: "b.png", meanLuminance: -0.2 }),
      ],
      issues,
    );
    const note = issues.find((i) => i.code === "S3D-W-387")!;
    expect(note).toBeDefined();
    expect(note.detail).toMatchObject({ measured: 0, skipped: 2 });
  });

  it("ships frozen default thresholds — a caller cannot retune every later invocation", async () => {
    const { DEFAULT_PROOF_THRESHOLDS } = await import("../src/lint/proof.js");
    expect(Object.isFrozen(DEFAULT_PROOF_THRESHOLDS)).toBe(true);
  });
});
