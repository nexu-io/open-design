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

  it("errors per frame when only some angles render empty", () => {
    const issues: Issue[] = [];
    lintProof(
      [
        frame({ path: "a.png" }),
        frame({ path: "b.png", meanLuminance: 0, coverage: 0 }),
        frame({ path: "c.png", meanLuminance: 0, coverage: 0 }),
      ],
      issues,
    );
    expect(issues.map((i) => i.code)).toEqual(["S3D-E-383", "S3D-E-383"]);
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

  it("stays silent when the renderer could not measure the frames", () => {
    expect(codes([frame({ meanLuminance: null, coverage: null })])).toEqual([]);
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
});
