import { describe, expect, it } from "vitest";
import {
  computeRevealScroll,
  REVEAL_SCROLL_PADDING_PX,
  type RevealScrollInput,
} from "./timelineRevealScroll";

/** A 1000×400 viewport with a 32px sticky gutter and 24px sticky ruler. */
function makeInput(overrides: Partial<RevealScrollInput> = {}): RevealScrollInput {
  return {
    scrollLeft: 0,
    scrollTop: 0,
    viewportWidth: 1000,
    viewportHeight: 400,
    clipLeft: 100,
    clipRight: 200,
    clipTop: 100,
    clipBottom: 148,
    stickyLeft: 32,
    stickyTop: 24,
    allowHorizontal: true,
    ...overrides,
  };
}

describe("computeRevealScroll", () => {
  it("returns null on both axes when the clip is fully visible", () => {
    expect(computeRevealScroll(makeInput())).toEqual({ left: null, top: null });
  });

  it("scrolls right minimally when the clip end is past the right edge", () => {
    const result = computeRevealScroll(makeInput({ clipLeft: 1500, clipRight: 1600 }));
    // Clip end lands padding px inside the right edge.
    expect(result.left).toBe(1600 - 1000 + REVEAL_SCROLL_PADDING_PX);
    expect(result.top).toBeNull();
  });

  it("scrolls left when the clip start is hidden (including under the sticky gutter)", () => {
    const result = computeRevealScroll(
      makeInput({ scrollLeft: 500, clipLeft: 510, clipRight: 610 }),
    );
    // clipLeft 510 sits under the 32px sticky gutter (window starts at 500+32+pad).
    expect(result.left).toBe(510 - 32 - REVEAL_SCROLL_PADDING_PX);
  });

  it("aligns the start edge when the clip is wider than the viewport", () => {
    const result = computeRevealScroll(makeInput({ clipLeft: 2000, clipRight: 4000 }));
    expect(result.left).toBe(2000 - 32 - REVEAL_SCROLL_PADDING_PX);
  });

  it("never returns a negative scroll target", () => {
    const result = computeRevealScroll(
      makeInput({
        scrollLeft: 300,
        clipLeft: 10,
        clipRight: 60,
        scrollTop: 200,
        clipTop: 4,
        clipBottom: 20,
      }),
    );
    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
  });

  it("suppresses horizontal scroll when allowHorizontal is false (fit zoom)", () => {
    const result = computeRevealScroll(
      makeInput({
        allowHorizontal: false,
        clipLeft: 1500,
        clipRight: 1600,
        clipTop: 700,
        clipBottom: 748,
      }),
    );
    expect(result.left).toBeNull();
    // Vertical reveal still happens.
    expect(result.top).toBe(748 - 400 + REVEAL_SCROLL_PADDING_PX);
  });

  it("scrolls up when the clip lane is hidden under the sticky ruler", () => {
    const result = computeRevealScroll(
      makeInput({ scrollTop: 200, clipTop: 210, clipBottom: 258 }),
    );
    // clipTop 210 sits under the 24px sticky ruler (window starts at 200+24+pad).
    expect(result.top).toBe(210 - 24 - REVEAL_SCROLL_PADDING_PX);
  });

  it("scrolls down minimally when the clip lane is below the viewport", () => {
    const result = computeRevealScroll(makeInput({ clipTop: 500, clipBottom: 548 }));
    expect(result.top).toBe(548 - 400 + REVEAL_SCROLL_PADDING_PX);
    expect(result.left).toBeNull();
  });

  it("never scrolls on an axis whose visible window is degenerate", () => {
    // Horizontal window collapses: 40px viewport minus the 32px gutter and
    // 2x12px padding is negative; vertical is intact and still reveals.
    const result = computeRevealScroll(
      makeInput({
        viewportWidth: 40,
        clipLeft: 1500,
        clipRight: 1600,
        clipTop: 500,
        clipBottom: 548,
      }),
    );
    expect(result.left).toBeNull();
    expect(result.top).toBe(548 - 400 + REVEAL_SCROLL_PADDING_PX);

    // Exactly-zero window (viewport == sticky + 2x padding) is degenerate too.
    const zero = computeRevealScroll(
      makeInput({
        viewportWidth: 32 + 2 * REVEAL_SCROLL_PADDING_PX,
        clipLeft: 1500,
        clipRight: 1600,
      }),
    );
    expect(zero.left).toBeNull();

    // Both axes degenerate: no scroll at all.
    const both = computeRevealScroll(
      makeInput({
        viewportWidth: 10,
        viewportHeight: 10,
        clipLeft: 1500,
        clipRight: 1600,
        clipTop: 500,
        clipBottom: 548,
      }),
    );
    expect(both).toEqual({ left: null, top: null });
  });
});
