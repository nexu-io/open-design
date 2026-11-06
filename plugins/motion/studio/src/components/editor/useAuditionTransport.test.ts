import { describe, expect, it } from "vitest";
import { auditionStart } from "./useAuditionTransport";

const SPANS = [
  { start: 2, duration: 7 },
  { start: 18, duration: 7 },
];

describe("auditionStart", () => {
  // Nothing to aim at — a caller with no spans keeps the old behaviour: play
  // from wherever the author left the playhead.
  it("stays put when there are no spans", () => {
    expect(auditionStart(undefined, 0)).toBeNull();
    expect(auditionStart([], 0)).toBeNull();
  });

  // Already inside the clip: moving the playhead here would be the UI taking a
  // decision it was not asked for, and it would cost the author their place for
  // no gain.
  it("stays put when the playhead is already inside a span", () => {
    expect(auditionStart(SPANS, 2)).toBeNull();
    expect(auditionStart(SPANS, 8.9)).toBeNull();
  });

  // The bug this exists for: hovering a preset at 0:00 on a group whose members
  // start at 0:02 played silence under the effect.
  it("jumps to the next span when the playhead is before or between them", () => {
    expect(auditionStart(SPANS, 0)).toBe(2);
    expect(auditionStart(SPANS, 9)).toBe(18);
  });

  // Past everything, wrap to the first rather than play out the tail in silence.
  it("wraps to the first span when the playhead is past them all", () => {
    expect(auditionStart(SPANS, 40)).toBe(2);
  });
});
