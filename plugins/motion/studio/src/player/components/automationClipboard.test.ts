import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAutomationClipboard,
  copyRange,
  pastePoints,
  readClipboard,
} from "./automationClipboard";
import { resolveAutomationRange, VOLUME_RANGE } from "@hyperframes/core/audio-automation";
import type { HfAutomationLane } from "@hyperframes/core/audio-automation";

/** The fixture's values double as unit positions, so pin it to a 0..1 axis. */
const UNIT_RANGE = { ...VOLUME_RANGE, max: 1 };

const duck: HfAutomationLane = {
  target: "volume",
  points: [
    { t: 2, v: 1, curve: -0.4 },
    { t: 3, v: 0.25 },
    { t: 4, v: 1 },
  ],
};

beforeEach(clearAutomationClipboard);

describe("automation clipboard", () => {
  it("copies the range rebased to zero", () => {
    copyRange("project-a", duck, UNIT_RANGE, 2, 4);
    const entry = readClipboard("project-a");
    expect(entry?.span).toBe(2);
    expect(entry?.points.map((p) => p.t)).toEqual([0, 1, 2]);
    expect(entry?.points[0]?.curve).toBe(-0.4);
  });

  it("pastes at a new time on the same axis unchanged", () => {
    copyRange("project-a", duck, UNIT_RANGE, 2, 4);
    const entry = readClipboard("project-a");
    expect(entry).not.toBeNull();
    if (!entry) return;
    const pts = pastePoints(entry, UNIT_RANGE, 10);
    expect(pts.map((p) => p.t)).toEqual([10, 11, 12]);
    expect(pts.map((p) => p.v)).toEqual([1, 0.25, 1]);
  });

  it("maps values through unit space onto a different parameter", () => {
    // fx.n1.frequency (lowpass cutoff) is log-scaled (min:20, max:20000):
    // linear unit math and a literal copy of the source value would both
    // read as a passing test on a range that happens to be numerically
    // identical to VOLUME_RANGE (e.g. fx.r.wet), so this target has to be
    // genuinely log for the test to discriminate real unit-space mapping.
    const frequency = resolveAutomationRange("fx.n1.frequency", {
      version: 1,
      nodes: [{ type: "lowpass", id: "n1", params: {} }],
    });
    expect(frequency).toBeTruthy();
    if (!frequency) return;
    expect(frequency.scale).toBe("log");
    copyRange("project-a", duck, UNIT_RANGE, 2, 4);
    const entry = readClipboard("project-a");
    if (!entry) return;
    const pts = pastePoints(entry, frequency, 0);
    // volume 1 (unit 1) → frequency max; volume 0.25 (unit 0.25) → a quarter
    // up frequency's LOG axis, i.e. exp(ln(min) + 0.25*(ln(max)-ln(min))) —
    // NOT the naive linear guess (min + 0.25*(max-min)) and nowhere near a
    // literal copy of 0.25.
    expect(pts[0]?.v).toBeCloseTo(frequency.max, 5);
    const expectedLog = Math.exp(
      Math.log(frequency.min) + 0.25 * (Math.log(frequency.max) - Math.log(frequency.min)),
    );
    const naiveLinear = frequency.min + 0.25 * (frequency.max - frequency.min);
    expect(pts[1]?.v).toBeCloseTo(expectedLog, 5);
    expect(pts[1]?.v).not.toBeCloseTo(naiveLinear, 0);
    expect(pts[1]?.v).not.toBeCloseTo(0.25, 0);
  });

  it("reads null when nothing was copied", () => {
    expect(readClipboard("project-a")).toBeNull();
  });

  it("does not hand a range copied in one project to another", () => {
    copyRange("project-a", duck, UNIT_RANGE, 2, 4);
    expect(readClipboard("project-b")).toBeNull();
  });

  it("drops the entry for good once another project has read past it", () => {
    copyRange("project-a", duck, UNIT_RANGE, 2, 4);
    readClipboard("project-b");
    // Not merely hidden from B: switching back must not resurrect a shape whose
    // source clip may have been edited or deleted while the project was closed.
    expect(readClipboard("project-a")).toBeNull();
  });

  it("keeps serving the entry inside its own project", () => {
    copyRange("project-a", duck, UNIT_RANGE, 2, 4);
    expect(readClipboard("project-a")?.span).toBe(2);
    expect(readClipboard("project-a")?.span).toBe(2);
  });
});
