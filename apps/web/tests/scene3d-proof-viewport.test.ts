import { describe, expect, it } from 'vitest';
import {
  pickProofPart,
  proofRectToStage,
  proofViewport,
  type Scene3dProofRect,
} from '../src/runtime/scene3d-assets';

/*
 * The frame player's screen-space pipeline. The rects were projected at
 * render time through Blender's own camera; these helpers own only the
 * viewport transform (frame-normalized ⇄ stage CSS px) and its inverse —
 * and the reticle and click-picking share them, so a bug here would make
 * the highlight and the pick disagree about where a part is.
 */
describe('proofViewport', () => {
  it('letterboxes a square frame inside a wide stage', () => {
    expect(proofViewport(1000, 600)).toEqual({ left: 200, top: 0, size: 600 });
  });

  it('letterboxes inside a tall stage', () => {
    expect(proofViewport(400, 900)).toEqual({ left: 0, top: 250, size: 400 });
  });

  it('never goes negative on a degenerate stage', () => {
    expect(proofViewport(0, -5).size).toBe(0);
  });
});

describe('proofRectToStage / pickProofPart round trip', () => {
  const vp = proofViewport(1000, 600);
  const rects: Record<string, Scene3dProofRect> = {
    hull: [0.1, 0.1, 0.9, 0.9],
    rivet: [0.4, 0.4, 0.45, 0.45],
  };

  it('maps a normalized rect into the letterboxed frame', () => {
    expect(proofRectToStage(rects.hull!, vp)).toEqual({
      left: 200 + 0.1 * 600,
      top: 0.1 * 600,
      width: 0.8 * 600,
      height: 0.8 * 600,
    });
  });

  it('a point inside a drawn rect picks that part back', () => {
    const box = proofRectToStage(rects.rivet!, vp);
    const name = pickProofPart(rects, vp, box.left + box.width / 2, box.top + box.height / 2);
    expect(name).toBe('rivet');
  });

  it('prefers the smallest containing rect — the part over its hull', () => {
    // The rivet sits inside the hull's rect; a click on the rivet must not
    // resolve to the hull that surrounds it.
    const box = proofRectToStage(rects.rivet!, vp);
    expect(pickProofPart(rects, vp, box.left + 1, box.top + 1)).toBe('rivet');
    // …while a point in the hull but outside the rivet picks the hull.
    expect(pickProofPart(rects, vp, vp.left + 0.2 * vp.size, 0.2 * vp.size)).toBe('hull');
  });

  it('misses outside the frame and in the letterbox bands', () => {
    expect(pickProofPart(rects, vp, 10, 300)).toBeNull(); // left band
    expect(pickProofPart(rects, vp, 500, 300)).not.toBeNull(); // centre
  });

  it('tolerates absent rects (a compile from before they existed)', () => {
    expect(pickProofPart(undefined, vp, 500, 300)).toBeNull();
  });
});
