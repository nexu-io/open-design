import { describe, expect, it } from "vitest";
import { fadeHandleBoxes } from "./timelineClipFadeGeometry";

const flatClip = (width: number) => ({ width, height: 30, radius: 0, toolsLeft: null });

describe("fadeHandleBoxes", () => {
  it("centres each handle on its fade's end", () => {
    const boxes = fadeHandleBoxes({
      widthPx: 1000,
      inPx: 100,
      outPx: 200,
      clipBox: flatClip(1000),
      drawn: { in: true, out: true },
    });
    expect(boxes.in).toEqual({ left: 88, width: 24, height: 24, tabLeft: 12, top: -7 });
    expect(boxes.out).toEqual({ left: 788, width: 24, height: 24, tabLeft: 12, top: -7 });
  });

  it("splits two overlapping handles at the midpoint between their tabs", () => {
    const input = { widthPx: 100, inPx: 45, outPx: 45, clipBox: flatClip(100) };
    const boxes = fadeHandleBoxes({ ...input, drawn: { in: true, out: true } });
    expect(boxes.in).toMatchObject({ left: 26, width: 24, tabLeft: 19 });
    expect(boxes.out).toMatchObject({ left: 50, width: 24, tabLeft: 5 });

    // With its twin hidden, a handle keeps its full centred box.
    const alone = fadeHandleBoxes({ ...input, drawn: { in: true, out: false } });
    expect(alone.in).toMatchObject({ left: 33, width: 24 });
  });
});
