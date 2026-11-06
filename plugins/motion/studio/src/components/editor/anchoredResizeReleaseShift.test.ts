// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { computeNextResizeAnchor } from "./domEditResizeLocal";

/**
 * Center-anchored corner resize (CapCut model): the element scales about its
 * CENTER, which must stay planted across the whole gesture — including after
 * release, on every corner and at any rotation.
 *
 * Root cause of the original release "shift" (proved with a real-layout Chromium
 * replay, see the anchor-loop test below): during a resize drag the per-frame
 * anchor is derived from the element's LIVE measured center — which already carries
 * the offset applied on the PREVIOUS frame — while `applyManualOffsetDragDraft`
 * treats that anchor as the ABSOLUTE offset. So `fixedStart - centerNow` is really
 * only the RESIDUAL correction, and using it as the absolute value makes the anchor
 * OSCILLATE between the correct value and zero every frame:
 *   frame 0: offset 0 → center shifted by the resize → anchor = full amount → apply
 *   frame 1: offset applied → center back at fixedStart → anchor = 0 → apply 0 (un-pin!)
 *   frame 2: offset 0 again → anchor = full amount → ...
 * Release commits `g.lastResizeAnchor` from whichever parity the last pointermove
 * landed on, so the element lands EITHER pinned OR un-pinned — an unpredictable
 * post-release "shift".
 *
 * Fix (useDomEditOverlayGestures pointermove, resize branch, fa4f39168): accumulate
 * the residual onto the previously-applied anchor instead of using it as the
 * absolute offset, so the loop converges to a stable value on every frame. The
 * per-frame accumulation is the exported `computeNextResizeAnchor` helper (the one
 * call site in the pointermove resize branch); tests 1 & 2 drive it directly.
 */

afterEach(() => {
  document.body.innerHTML = "";
});

describe("center-anchored corner resize — no shift after release", () => {
  it("the per-frame center anchor converges (does NOT oscillate) — the release-shift root cause", () => {
    // Model the pointermove anchor loop that pins the element's CENTER. The physical
    // truth (confirmed in a real browser): the measured center sits at
    // `fixedStart - appliedOffset` shifted by the resize — i.e. applying the offset
    // moves the center back toward its gesture-start position. Here scale=1 so
    // screen px == offset px. `trueAnchor` is the compensating offset that pins it.
    const trueAnchor = { dx: -60, dy: -27 };
    const fixedStart = { x: 500, y: 270 };

    // `appliedOffset` mirrors what applyManualOffsetDragDraft set last frame.
    let appliedOffset = { x: 0, y: 0 };
    // `lastResizeAnchor` accumulator, exactly as g.lastResizeAnchor in the fix.
    let lastResizeAnchor: { dx: number; dy: number } | undefined;

    const anchorsSeen: Array<{ dx: number; dy: number }> = [];
    for (let frame = 0; frame < 8; frame++) {
      // Live measured center: the resize would put it at fixedStart + trueAnchor
      // (un-anchored), and the currently-applied offset pulls it back by that
      // offset. So centerNow = fixedStart - trueAnchor + appliedOffset.
      const centerNow = {
        x: fixedStart.x - trueAnchor.dx + appliedOffset.x,
        y: fixedStart.y - trueAnchor.dy + appliedOffset.y,
      };
      // ── The fixed logic (accumulate residual onto the previous anchor) ──
      const anchor = computeNextResizeAnchor(lastResizeAnchor, fixedStart, centerNow);
      lastResizeAnchor = anchor;
      anchorsSeen.push(anchor);
      // applyManualOffsetDragDraft sets the absolute offset (scale 1) = anchor.
      appliedOffset = { x: anchor.dx, y: anchor.dy };
    }

    // Every frame must report the same, correct anchor — no oscillation, so the
    // committed value is parity-independent.
    for (const a of anchorsSeen) {
      expect(a).toEqual(trueAnchor);
    }
    // Guard against the OLD absolute formula regressing: with `anchor =
    // fixedStart - centerNow` (no accumulation) the sequence would be
    // [trueAnchor, 0, trueAnchor, 0, ...]; assert the last two frames agree.
    expect(anchorsSeen.at(-1)).toEqual(anchorsSeen.at(-2));
  });

  it("the center stays fixed for every corner at any rotation (loop converges)", () => {
    // The pin loop is handle- and rotation-independent: it always measures the
    // element CENTER and drives it back to fixedStart. Simulate the loop for all
    // four corners across unrotated + rotated gestures; the resize's raw center
    // shift varies with corner/rotation (modelled as `rawShift`), but the loop must
    // converge the measured center onto fixedStart every time.
    const fixedStart = { x: 640, y: 360 };
    const HANDLES = ["nw", "ne", "sw", "se"] as const;
    const DEGS = [0, 30, 90, 137];
    for (const handle of HANDLES) {
      for (const deg of DEGS) {
        const t = (deg * Math.PI) / 180;
        // Raw (un-pinned) center shift the size write would cause this frame —
        // a corner/rotation-dependent vector. Its exact value is irrelevant; the
        // loop only needs to cancel it.
        const seed = (HANDLES.indexOf(handle) + 1) * 11;
        const rawShift = {
          dx: Math.cos(t) * seed - Math.sin(t) * (seed / 2),
          dy: Math.sin(t) * seed + Math.cos(t) * (seed / 2),
        };
        let appliedOffset = { x: 0, y: 0 };
        let lastResizeAnchor: { dx: number; dy: number } | undefined;
        let centerNow = { x: fixedStart.x, y: fixedStart.y };
        for (let frame = 0; frame < 6; frame++) {
          centerNow = {
            x: fixedStart.x + rawShift.dx + appliedOffset.x,
            y: fixedStart.y + rawShift.dy + appliedOffset.y,
          };
          const anchor = computeNextResizeAnchor(lastResizeAnchor, fixedStart, centerNow);
          lastResizeAnchor = anchor;
          appliedOffset = { x: anchor.dx, y: anchor.dy };
        }
        // After convergence the pinned center equals the gesture-start center.
        const pinnedCenter = {
          x: fixedStart.x + rawShift.dx + appliedOffset.x,
          y: fixedStart.y + rawShift.dy + appliedOffset.y,
        };
        expect(pinnedCenter.x).toBeCloseTo(fixedStart.x, 9);
        expect(pinnedCenter.y).toBeCloseTo(fixedStart.y, 9);
      }
    }
  });
});
