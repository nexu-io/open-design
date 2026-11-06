import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../player";
import {
  hasProjectAudio,
  levelToFraction,
  markFraction,
  SILENT_CHANNEL,
  stepChannel,
  stepPair,
} from "./audioMeterMath";

describe("levelToFraction", () => {
  it("puts each dB mark on its equally spaced stop", () => {
    [1, 0.8, 0.6, 0.4, 0.2].forEach((f, i) =>
      expect(markFraction([0, -3, -6, -12, -24][i]!)).toBeCloseTo(f, 6),
    );
  });
  it("clamps silence and overs", () => {
    expect(levelToFraction(0)).toBe(0);
    expect(levelToFraction(4)).toBe(1);
  });
  it("is monotonic between marks", () => {
    expect(levelToFraction(0.5)).toBeGreaterThan(markFraction(-12));
    expect(levelToFraction(0.5)).toBeLessThan(markFraction(-3));
  });
});

describe("stepChannel", () => {
  it("attacks instantly, holds the peak, then falls", () => {
    let ch = stepChannel(SILENT_CHANNEL, 1, 0, 16);
    expect(ch.level).toBe(1);
    ch = stepChannel(ch, 0, 500, 16);
    expect(ch.peak).toBe(1);
    expect(ch.level).toBeLessThan(1);
    ch = stepChannel(ch, 0, 2000, 500);
    expect(ch.peak).toBeLessThan(1);
  });
});

describe("stepPair", () => {
  it("returns the same pair while silent at rest, and moves on sound", () => {
    const rest = stepPair(undefined, undefined, 0, 16);
    expect(stepPair(rest, { l: 0, r: 0 }, 16, 16)).toBe(rest);
    expect(stepPair(rest, { l: 1, r: 0 }, 32, 16)).not.toBe(rest);
  });
});

describe("hasProjectAudio", () => {
  const clip = (overrides: Partial<TimelineElement>): TimelineElement => ({
    id: "c",
    tag: "div",
    start: 0,
    duration: 1,
    track: 0,
    ...overrides,
  });

  it("ignores an audible video left on native output at unity gain", () => {
    expect(hasProjectAudio([clip({ tag: "video", hasAudio: true })])).toBe(false);
    expect(hasProjectAudio([clip({ tag: "video", hasAudio: true, volume: 1 })])).toBe(false);
  });

  it.each<[string, Partial<TimelineElement>]>([
    ["an above-unity gain", { volume: 2 }],
    ["an fx chain", { fxChain: "[]" }],
    ["automation", { automation: "{}" }],
    ["a group", { audioGroup: "music" }],
  ])("counts an audible video routed through Web Audio by %s", (_, fields) => {
    expect(hasProjectAudio([clip({ tag: "video", hasAudio: true, ...fields })])).toBe(true);
  });

  it("counts an audible video when the composition root carries a master chain", () => {
    const masterChain = '{"version":1,"nodes":[]}';
    expect(hasProjectAudio([clip({ tag: "video", hasAudio: true, masterChain })])).toBe(true);
    expect(
      hasProjectAudio([clip({ tag: "video", muted: true, hasAudio: true, masterChain })]),
    ).toBe(false);
    expect(hasProjectAudio([clip({ tag: "video", masterChain })])).toBe(false);
  });

  it("ignores a muted video even when it carries processing", () => {
    expect(hasProjectAudio([clip({ tag: "video", hasAudio: true, muted: true, volume: 2 })])).toBe(
      false,
    );
  });

  it("ignores a silent video", () => {
    expect(hasProjectAudio([clip({ tag: "video" })])).toBe(false);
  });
});
