import { describe, expect, it } from 'vitest';

import {
  anchorMark,
  chooseAnchorTarget,
  resolveAnchor,
  type AnchorTarget,
} from '../../src/components/preview-mark-anchor';

// Issue #6361. The numbers are the measured reflow on the reported artifact:
// at a 804px-wide frame the header is 94.5px tall and BAND 05 sits at y=322.5;
// one UI zoom step narrows the frame to 692px, the header paragraph wraps to a
// second line (114px), and every band shifts down 19.5px to y=342. Frame height
// changes 744 -> 666 at the same time.

const ZOOMED = { w: 692, h: 666 };
const RESTORED = { w: 804, h: 744 };

/** Bands are 40px tall on a 50px pitch, stacked under the header. */
function bandsAt(headerBottom: number, frameW: number): AnchorTarget[] {
  const targets: AnchorTarget[] = [
    {
      elementId: 'header',
      selector: '[data-od-id="header"]',
      position: { x: 0, y: 0, width: frameW, height: headerBottom },
    },
  ];
  for (let i = 0; i < 10; i++) {
    targets.push({
      elementId: `band-${i + 1}`,
      selector: `[data-od-id="band-${i + 1}"]`,
      position: { x: 32, y: headerBottom + 28 + i * 50, width: frameW - 64, height: 40 },
    });
  }
  return targets;
}

const ZOOMED_TARGETS = bandsAt(114, 692); // BAND 05 at y = 114 + 28 + 200 = 342
const RESTORED_TARGETS = bandsAt(94.5, 804); // BAND 05 at y = 94.5 + 28 + 200 = 322.5

describe('#6361 content anchoring survives a reflow', () => {
  it('keeps a band mark on the same band after the artifact reflows', () => {
    // The user marks BAND 05 while zoomed: 342..382 in a 666-tall frame.
    const marked = { x: 32 / 692, y: 342 / 666, width: 628 / 692, height: 40 / 666 };

    const target = chooseAnchorTarget(marked, ZOOMED, ZOOMED_TARGETS);
    expect(target?.elementId).toBe('band-5');

    const anchor = anchorMark(marked, ZOOMED, target!)!;
    const resolved = resolveAnchor(anchor, RESTORED, RESTORED_TARGETS)!;

    // BAND 05 now lives at 322.5..362.5 — the mark must follow it there.
    expect(resolved.y * RESTORED.h).toBeCloseTo(322.5, 6);
    expect(resolved.height * RESTORED.h).toBeCloseTo(40, 6);
    expect(resolved.x * RESTORED.w).toBeCloseTo(32, 6);
  });

  it('lands on the marked band rather than the one a frame-relative mark would hit', () => {
    // Without anchoring the stored fraction 342/666 replays as 0.5135 * 744 =
    // 382 — inside BAND 06. This is the regression the issue reported.
    const marked = { x: 0.05, y: 342 / 666, width: 0.9, height: 40 / 666 };
    const naiveY = (342 / 666) * RESTORED.h;
    const band6 = RESTORED_TARGETS.find((t) => t.elementId === 'band-6')!;
    expect(naiveY).toBeGreaterThanOrEqual(band6.position.y);

    const anchor = anchorMark(marked, ZOOMED, chooseAnchorTarget(marked, ZOOMED, ZOOMED_TARGETS)!)!;
    const resolved = resolveAnchor(anchor, RESTORED, RESTORED_TARGETS)!;
    const band5 = RESTORED_TARGETS.find((t) => t.elementId === 'band-5')!;
    expect(resolved.y * RESTORED.h).toBeCloseTo(band5.position.y, 6);
  });

  it('picks the most specific element when targets nest', () => {
    const nested: AnchorTarget[] = [
      { elementId: 'body', selector: 'body', position: { x: 0, y: 0, width: 800, height: 700 } },
      { elementId: 'main', selector: 'main', position: { x: 0, y: 100, width: 800, height: 600 } },
      { elementId: 'band-2', selector: 'b2', position: { x: 32, y: 200, width: 736, height: 40 } },
    ];
    const mark = { x: 0.1, y: 210 / 700, width: 0.5, height: 20 / 700 };
    expect(chooseAnchorTarget(mark, { w: 800, h: 700 }, nested)?.elementId).toBe('band-2');
  });

  it('falls back to the nearest element when the mark sits in a gap', () => {
    // 10px margin between bands belongs to no annotated element.
    const mark = { x: 0.1, y: 386 / 666, width: 0.5, height: 4 / 666 };
    const chosen = chooseAnchorTarget(mark, ZOOMED, ZOOMED_TARGETS);
    expect(chosen?.elementId).toMatch(/^band-[56]$/);
  });

  it('reports no resolution when the anchor element is gone', () => {
    const marked = { x: 0.05, y: 342 / 666, width: 0.9, height: 40 / 666 };
    const anchor = anchorMark(marked, ZOOMED, chooseAnchorTarget(marked, ZOOMED, ZOOMED_TARGETS)!)!;
    expect(resolveAnchor(anchor, RESTORED, [])).toBeNull();
  });

  it('re-resolves by selector when the element id changed', () => {
    const marked = { x: 0.05, y: 342 / 666, width: 0.9, height: 40 / 666 };
    const anchor = anchorMark(marked, ZOOMED, chooseAnchorTarget(marked, ZOOMED, ZOOMED_TARGETS)!)!;
    const renamed = RESTORED_TARGETS.map((t) =>
      t.elementId === 'band-5' ? { ...t, elementId: 'regenerated-5' } : t,
    );
    const resolved = resolveAnchor(anchor, RESTORED, renamed)!;
    expect(resolved.y * RESTORED.h).toBeCloseTo(322.5, 6);
  });

  it('round-trips a mark that is unchanged when nothing moved', () => {
    const marked = { x: 32 / 692, y: 342 / 666, width: 628 / 692, height: 40 / 666 };
    const anchor = anchorMark(marked, ZOOMED, chooseAnchorTarget(marked, ZOOMED, ZOOMED_TARGETS)!)!;
    const resolved = resolveAnchor(anchor, ZOOMED, ZOOMED_TARGETS)!;
    expect(resolved.x).toBeCloseTo(marked.x, 10);
    expect(resolved.y).toBeCloseTo(marked.y, 10);
    expect(resolved.width).toBeCloseTo(marked.width, 10);
    expect(resolved.height).toBeCloseTo(marked.height, 10);
  });
});
