import { describe, expect, it } from "vitest";
import { getTimelinePlayheadTransform } from "./timelinePlayheadTransform";

const x = (transform: string) => Number(/translateX\(([-\d.e]+)px\)/.exec(transform)?.[1]);

describe("getTimelinePlayheadTransform", () => {
  it("keeps fractional pixels while playing, so slow motion does not stair-step", () => {
    // Fit zoom on a two-minute film is about 13.3px a second: 120 frames of one second of playback.
    const frames = Array.from({ length: 121 }, (_, i) => i / 120);
    const playing = new Set(frames.map((t) => getTimelinePlayheadTransform(t, 13.3, 80, false, 1)));
    const resting = new Set(frames.map((t) => getTimelinePlayheadTransform(t, 13.3, 80, true, 1)));
    expect(playing.size).toBe(121);
    expect(resting.size).toBeLessThan(20);
  });

  it("at rest puts the line on the device pixel layout gives its ruler tick", () => {
    // The 1px line sits 4px into the 9px wrapper; the tick is laid out at t * pps - 0.5 and rounded by layout.
    for (const dpr of [1, 1.5, 2]) {
      for (let i = 0; i <= 400; i += 1) {
        const t = i * 0.0137;
        const wrapper = x(getTimelinePlayheadTransform(t, 13.3, 80, true, dpr));
        const lineDevicePx = Math.round((wrapper + 4) * dpr);
        const tickDevicePx = Math.round((80 + t * 13.3 - 0.5) * dpr);
        expect(lineDevicePx, `t=${t} dpr=${dpr}`).toBe(tickDevicePx);
      }
    }
  });

  it("at time zero at 1x lands the line on the tick's column", () => {
    expect(getTimelinePlayheadTransform(0, 100, 80, true, 1)).toBe("translateX(76px)");
    expect(Math.round(80 - 0.5)).toBe(76 + 4);
  });
});
