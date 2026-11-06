import { describe, expect, it } from "vitest";
import { TIMELINE_VIEWPORT_BUDGETS } from "../../src/player/lib/timelineViewportBudgets";
import {
  attemptPassed,
  describeAgainstBase,
  gatePassed,
  judgeAgainstBase,
  judgeResponsiveness,
  percentile,
  shouldCompareWithBase,
  responsivenessLimits,
} from "./timeline-viewport-verdict.mjs";

const LIMITS = { samplesPerRun: 63, interactionLimitMs: 75, frameIntervalLimitMs: 75 };
const FAST = 49;
const SLOW = 83;

/** Five runs of 63 steps; `slowAt(run, step)` marks the steps that take five frames. */
function runs(slowAt) {
  return Array.from({ length: 5 }, (_, run) => {
    const interactions = Array.from({ length: 63 }, (_, step) => (slowAt(run, step) ? SLOW : FAST));
    return { interactions, frameIntervals: interactions.map(() => 33.3) };
  });
}

const slowSteps = (count) => (run, step) => run * 63 + step < count;

describe("percentile", () => {
  it("takes the nearest rank, so the p95 of 315 steps is the 16th-worst", () => {
    const values = Array.from({ length: 315 }, (_, index) => index);
    expect(percentile(values, 0.95)).toBe(299);
    expect(percentile([3, 1, 2], 0.95)).toBe(3);
  });
});

describe("judgeResponsiveness", () => {
  it("fails 16 slow steps of 315 and passes 15", () => {
    expect(judgeResponsiveness(runs(slowSteps(16)), LIMITS)).toMatchObject({
      interactionP95Ms: SLOW,
      passed: false,
    });
    expect(judgeResponsiveness(runs(slowSteps(15)), LIMITS)).toMatchObject({
      interactionP95Ms: FAST,
      passed: true,
    });
  });

  it("passes two slow steps in every run, 10 of 315", () => {
    expect(
      judgeResponsiveness(
        runs((_, step) => step < 2),
        LIMITS,
      ).passed,
    ).toBe(true);
  });

  it("fails one run that is slow throughout", () => {
    expect(
      judgeResponsiveness(
        runs((run) => run === 2),
        LIMITS,
      ).passed,
    ).toBe(false);
  });

  it("fails on the frame interval alone", () => {
    const measured = runs(() => false).map((run) => ({
      ...run,
      frameIntervals: run.frameIntervals.map(() => 83),
    }));
    expect(judgeResponsiveness(measured, LIMITS).passed).toBe(false);
  });

  it("throws on a run short of samples instead of reading it as fast", () => {
    const measured = runs(() => false);
    measured[1] = { interactions: [], frameIntervals: [] };
    expect(() => judgeResponsiveness(measured, LIMITS)).toThrow("Expected 315 scroll samples");
    expect(() => judgeResponsiveness([], LIMITS)).toThrow("Expected 0 scroll samples");
  });
});

describe("the CI virtualized arm's limits", () => {
  const limits = {
    samplesPerRun: 63,
    ...responsivenessLimits(TIMELINE_VIEWPORT_BUDGETS, "ci", "on"),
  };
  // Two frames is a normal step, four a step two frames late; one frame is a normal interval, two a dropped one.
  const steps = (count, normal, slow) =>
    Array.from({ length: 5 }, (_, run) =>
      Array.from({ length: 63 }, (_, step) => (run * 63 + step < count ? slow : normal)),
    );
  const interactionRuns = (count) =>
    steps(count, 33.3, 66.7).map((interactions) => ({
      interactions,
      frameIntervals: interactions.map(() => 16.7),
    }));
  const frameRuns = (count) =>
    steps(count, 16.7, 33.3).map((frameIntervals) => ({
      interactions: frameIntervals.map(() => 33.3),
      frameIntervals,
    }));

  it("fails 16 of 315 steps two frames late and passes 15", () => {
    expect(judgeResponsiveness(interactionRuns(16), limits).passed).toBe(false);
    expect(judgeResponsiveness(interactionRuns(15), limits).passed).toBe(true);
  });

  it("fails 16 of 315 frame intervals that drop a frame and passes 15", () => {
    expect(judgeResponsiveness(frameRuns(16), limits).passed).toBe(false);
    expect(judgeResponsiveness(frameRuns(15), limits).passed).toBe(true);
  });

  it("leaves the unvirtualized arm and the other constrained tiers at 75 ms", () => {
    const loose = { interactionLimitMs: 75, frameIntervalLimitMs: 75 };
    expect(responsivenessLimits(TIMELINE_VIEWPORT_BUDGETS, "ci", "off")).toEqual(loose);
    expect(responsivenessLimits(TIMELINE_VIEWPORT_BUDGETS, "low-resource", "on")).toEqual(loose);
    expect(responsivenessLimits(TIMELINE_VIEWPORT_BUDGETS, "primary", "on")).toEqual({
      interactionLimitMs: 50,
      frameIntervalLimitMs: 33.3,
    });
  });
});

describe("judgeAgainstBase", () => {
  const limits = { samplesPerRun: 63, interactionLimitMs: 58.3, frameIntervalLimitMs: 25 };
  // Ten runs of 63 steps, two alternating blocks of five; the first `late` steps take four frames.
  const measured = (late, droppedFrames = 0) =>
    Array.from({ length: 10 }, (_, run) => {
      const step = (index) => run * 63 + index;
      return {
        interactions: Array.from({ length: 63 }, (_, i) => (step(i) < late ? 66.7 : 33.3)),
        frameIntervals: Array.from({ length: 63 }, (_, i) =>
          step(i) < droppedFrames ? 33.3 : 16.7,
        ),
      };
    });

  // The base's 40 late steps, each made 200 ms on the head.
  const lateStepsAt200 = () =>
    measured(40).map((run) => ({
      ...run,
      interactions: run.interactions.map((value) => (value > 58.3 ? 200 : value)),
    }));

  it("fails a head slower than its base even where this comparison puts it under the budget", () => {
    const verdict = judgeAgainstBase(measured(31), measured(0), limits);
    expect(verdict.head.passed).toBe(true);
    expect(verdict.passed).toBe(false);
  });

  it("passes a head over budget when its base misses it as often on the same machine", () => {
    const verdict = judgeAgainstBase(measured(40), measured(40), limits);
    expect(verdict.head.passed).toBe(false);
    expect(verdict.passed).toBe(true);
  });

  it("passes identical builds that land either side of the budget by chance", () => {
    expect(judgeAgainstBase(measured(36), measured(27), limits).passed).toBe(true);
  });

  it("fails a head that misses the budget on more steps than its base", () => {
    expect(judgeAgainstBase(measured(40), measured(2), limits)).toMatchObject({
      passed: false,
      interactions: { atBudget: { head: 40, base: 2 }, slower: true },
    });
    expect(judgeAgainstBase(measured(90), measured(40), limits).passed).toBe(false);
  });

  it("fails a head that makes the base's late steps a frame later, with the same count over budget", () => {
    expect(judgeAgainstBase(lateStepsAt200(), measured(40), limits)).toMatchObject({
      passed: false,
      interactions: {
        atBudget: { head: 40, base: 40, slower: false },
        frameLater: { head: 40, base: 0, slower: true },
      },
    });
  });

  it("describes the counts behind a verdict, including the frame-later ones", () => {
    expect(describeAgainstBase(judgeAgainstBase(lateStepsAt200(), measured(40), limits))).toBe(
      "interaction p95 200.0 vs 66.7 ms, steps over budget 40 vs 40 (allowed excess 33.1), " +
        "a frame later 40 vs 0 (allowed excess 25.3), frame gaps over budget 0 vs 0 (allowed excess 6.3), " +
        "a frame past that 0 vs 0 (allowed excess 6.3), fail",
    );
  });

  it("passes a stall's handful of extra late steps on identical builds", () => {
    expect(judgeAgainstBase(measured(0, 10), measured(0), limits).passed).toBe(true);
    expect(judgeAgainstBase(measured(0, 30), measured(0), limits).passed).toBe(false);
  });

  it("fails on dropped frames alone", () => {
    expect(judgeAgainstBase(measured(0, 60), measured(0, 5), limits).passed).toBe(false);
  });
});

describe("attemptPassed", () => {
  const passing = { responsivenessPassed: true, passingRuns: 5, requiredPassingRuns: 4 };

  it("needs pooled responsiveness and enough passing runs", () => {
    expect(attemptPassed(passing)).toBe(true);
    expect(attemptPassed({ ...passing, responsivenessPassed: false })).toBe(false);
    expect(attemptPassed({ ...passing, passingRuns: 3 })).toBe(false);
  });
});

describe("gatePassed", () => {
  const pass = { passed: true };
  const fail = { passed: false };
  const passing = { directScrollApproved: true, attempts: [pass], memoryReturned: true };

  it("passes only when every check holds", () => {
    expect(gatePassed(passing)).toBe(true);
    expect(gatePassed({ ...passing, directScrollApproved: false })).toBe(false);
    expect(gatePassed({ ...passing, memoryReturned: false })).toBe(false);
  });

  it("fails timing only when the attempt and its one rerun both fail", () => {
    expect(gatePassed({ ...passing, attempts: [fail, pass] })).toBe(true);
    expect(gatePassed({ ...passing, attempts: [fail, fail] })).toBe(false);
    expect(gatePassed({ ...passing, attempts: [fail, fail, pass] })).toBe(false);
    expect(gatePassed({ ...passing, attempts: [] })).toBe(false);
  });

  it("lets the same-machine base comparison decide timing once both attempts fail", () => {
    const slow = { passed: false, runChecksPassed: true };
    expect(gatePassed({ ...passing, attempts: [slow, slow], againstBase: pass })).toBe(true);
    expect(gatePassed({ ...passing, attempts: [slow, slow], againstBase: fail })).toBe(false);
    expect(gatePassed({ ...passing, memoryReturned: false, againstBase: pass })).toBe(false);
  });

  it("never lets the base comparison pass runs that failed long-task or DOM checks", () => {
    const broken = { passed: false, runChecksPassed: false };
    const slow = { passed: false, runChecksPassed: true };
    expect(shouldCompareWithBase([slow, broken])).toBe(false);
    expect(shouldCompareWithBase([slow, slow])).toBe(true);
    expect(shouldCompareWithBase([])).toBe(false);
    expect(gatePassed({ ...passing, attempts: [slow, broken], againstBase: pass })).toBe(false);
    expect(gatePassed({ ...passing, attempts: [], againstBase: pass })).toBe(false);
  });
});
