// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { isTimelineMoving, subscribeTimelineMotion } from "./timelineMotion";
import {
  cancelTimelineZoom,
  isTimelineZoomPreviewing,
  subscribeTimelineZoomPreview,
  redrawTimelineZoomPreview,
  currentTimelineRange,
  currentTimelineZoomPercent,
  settleTimelineZoom,
  timelineTimeAtX,
  requestTimelineZoom,
  registerTimelineZoomViewport,
  takeTimelineZoomAnchor,
  timelineZoomMapping,
  zoomTimelineStep,
  zoomTimelineToRange,
} from "./timelineZoomInput";

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  });
  usePlayerStore.setState({
    zoomMode: "fit",
    manualZoomPercent: 100,
    timelineFitPps: 10,
    timelinePps: 10,
    userZoomCount: 0,
    currentTime: 0,
    duration: 0,
  });
});
afterEach(() => {
  // Run out any ease, preview and rest, so the next test starts with nothing scheduled.
  for (let i = 0; i < 40; i++) vi.advanceTimersToNextFrame();
  unregisterViewport();
  takeTimelineZoomAnchor();
  vi.useRealTimers();
});

let unregisterViewport = () => {};
const publishScroll = vi.fn();

/** A 1080px timeline viewport with 32px of track headers, holding one scaled row. */
function viewport(scrollLeft = 0, scrollWidth = 20_000) {
  const scroll = document.createElement("div");
  Object.defineProperties(scroll, {
    clientWidth: { value: 1080 },
    scrollWidth: { value: scrollWidth },
    scrollLeft: { value: scrollLeft, writable: true },
  });
  const row = scroll.appendChild(document.createElement("div"));
  row.setAttribute("data-timeline-zoom-scale", "");
  unregisterViewport = registerTimelineZoomViewport({ scroll, contentOrigin: 32, publishScroll });
  return { scroll, row };
}

/** Where `time` lands on screen once the committed zoom is laid out. */
const laidOutX = (time: number) => {
  const anchor = takeTimelineZoomAnchor();
  return anchor && anchor.x + (time - anchor.time) * usePlayerStore.getState().timelinePps;
};

describe("requestTimelineZoom", () => {
  it("scales the drawn rows during a gesture and lays the zoom out once it rests", () => {
    const { row } = viewport();
    const writes = vi.fn();
    const unsubscribe = usePlayerStore.subscribe(writes);
    requestTimelineZoom(120, { time: 4, x: 100 });
    requestTimelineZoom(150, { time: 4, x: 100 });
    vi.advanceTimersToNextFrame();
    expect(writes).not.toHaveBeenCalled();
    expect(currentTimelineZoomPercent()).toBe(150);
    // 4 s stays at 100px: 32 + 4 * 15 - left = 100, left = -8 clamps to 0, translated by 0.
    expect(row.style.transform).toBe("translateX(0px) scaleX(1.5)");
    vi.advanceTimersByTime(150);
    unsubscribe();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState()).toMatchObject({
      zoomMode: "manual",
      manualZoomPercent: 150,
      timelinePps: 15,
      userZoomCount: 1,
    });
    expect(row.style.transform).toBe("");
  });

  it("keeps the time under the pointer while previewing, then lays it out there", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 400, timelinePps: 40 });
    const { scroll, row } = viewport(400);
    // 432px in: (400 + 432 - 32) / 40 = 20 s.
    requestTimelineZoom(600, { time: 20, x: 432 });
    vi.advanceTimersToNextFrame();
    const mapping = timelineZoomMapping(40, 32);
    expect(mapping.pps).toBe(60);
    expect(mapping.contentOrigin + 20 * mapping.pps - scroll.scrollLeft).toBeCloseTo(432);
    expect(row.style.transform).toContain("scaleX(1.5)");
    vi.advanceTimersByTime(150);
    expect(laidOutX(20)).toBeCloseTo(432);
  });

  it("never previews a scroll the laid-out zoom cannot reach, zooming in from below Fit", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 50, timelinePps: 5 });
    viewport();
    // 90 s sits 482px in at 5 px/s. At 110% the content is 32 + 1046 * 1.1 wide,
    // so the view can scroll at most 102.6px.
    requestTimelineZoom(110, { time: 90, x: 482 });
    expect(timelineTimeAtX(32)! * 11).toBeLessThanOrEqual(102.6 + 1e-6);
  });

  it("lays a zoom-out about the left edge out at once, before it shows unmounted time", () => {
    usePlayerStore.setState({ duration: 1000 });
    viewport();
    // Mounted to (1080 - 32 + 270) / 10 = 131.8 s; at 5 px/s the view reaches 209.6 s.
    requestTimelineZoom(50, { time: 0, x: 32 });
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(5);
  });

  it("previews a zoom-out about the middle that stays within what is mounted", () => {
    usePlayerStore.setState({
      duration: 100,
      zoomMode: "manual",
      manualZoomPercent: 1000,
      timelinePps: 100,
    });
    viewport(5000);
    // Mounted 46.98..63.18 s; at 70 px/s about 55.24 s the view shows 47.75..62.73 s.
    requestTimelineZoom(700, { time: 55.24, x: 556 });
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(100);
  });

  it("lays out a zoom-out before it shows past the window ruler ticks are drawn in", () => {
    // 50 s of clips in content 1996 s wide: ticks are drawn to 131.8 s, a view and a quarter in.
    usePlayerStore.setState({ duration: 50 });
    viewport();
    requestTimelineZoom(60, { time: 0, x: 32 });
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(6);
  });

  it("lays a zoom-out out at once before it shows past where the ruler is drawn", () => {
    // 50 s of clips at Fit: the ruler and lanes are drawn to the viewport's edge, 104.8 s.
    usePlayerStore.setState({ duration: 50 });
    viewport(0, 1080);
    requestTimelineZoom(50, { time: 0, x: 32 });
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(5);
  });

  it("previews a zoom-out at the content's end without laying out each frame", () => {
    // At 330% the content is 32 + 1046 * 3.3 = 3483.8px, reported whole as 3483; the view is
    // scrolled to its end, and a zoom-out lands that end a fraction of a pixel past it.
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 330, timelinePps: 33 });
    viewport(2403, 3483);
    requestTimelineZoom(300, { time: 100, x: 800 });
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(33);
  });

  it("keeps previewing through a scroll, and scales the rows the scroll mounted", async () => {
    const { scroll } = viewport();
    requestTimelineZoom(150);
    vi.advanceTimersToNextFrame();
    // React mounts the row after the scroll's redraw frame; it is scaled before it paints.
    redrawTimelineZoomPreview();
    vi.advanceTimersToNextFrame();
    const mountedRow = document.createElement("div");
    mountedRow.setAttribute("data-timeline-zoom-scale", "");
    scroll.appendChild(document.createElement("div")).appendChild(mountedRow);
    await Promise.resolve();
    expect(usePlayerStore.getState().timelinePps).toBe(10);
    expect(mountedRow.style.transform).toContain("scaleX(1.5)");
  });

  it("lays a pending zoom out at once when settled, as a press does", () => {
    viewport();
    requestTimelineZoom(150);
    settleTimelineZoom();
    expect(usePlayerStore.getState().timelinePps).toBe(15);
  });

  it("tells listeners when a pending zoom is dropped", () => {
    viewport();
    requestTimelineZoom(150);
    vi.advanceTimersToNextFrame();
    let shownAfterDrop: boolean | null = null;
    const unsubscribe = subscribeTimelineZoomPreview(() => {
      shownAfterDrop = isTimelineZoomPreviewing();
    });
    cancelTimelineZoom();
    unsubscribe();
    expect(shownAfterDrop).toBe(false);
  });

  it("drops a pending zoom when cancelled, as Fit does", () => {
    const { row } = viewport();
    requestTimelineZoom(150);
    vi.advanceTimersToNextFrame();
    cancelTimelineZoom();
    vi.advanceTimersByTime(300);
    expect(usePlayerStore.getState().timelinePps).toBe(10);
    expect(row.style.transform).toBe("");
  });

  it("lays the zoom out before the timeline counts as at rest", () => {
    viewport();
    let ppsAtRest = 0;
    const unsubscribe = subscribeTimelineMotion(() => {
      if (!isTimelineMoving()) ppsAtRest = usePlayerStore.getState().timelinePps;
    });
    requestTimelineZoom(150);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(200);
    unsubscribe();
    expect(ppsAtRest).toBe(15);
  });

  it("keeps a pending zoom when the timeline registers again, as a re-render does", async () => {
    const { scroll } = viewport();
    requestTimelineZoom(150);
    unregisterViewport();
    unregisterViewport = registerTimelineZoomViewport({ scroll, contentOrigin: 32, publishScroll });
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(usePlayerStore.getState().timelinePps).toBe(15);
  });

  it("keeps a newer timeline's registration when an older one unmounts", () => {
    const unregisterOlder = registerTimelineZoomViewport({
      scroll: document.createElement("div"),
      contentOrigin: 32,
      publishScroll,
    });
    viewport();
    unregisterOlder();
    expect(currentTimelineRange()).not.toBeNull();
  });

  it("lays the zoom out mid-gesture once the preview has scaled too far", () => {
    viewport();
    requestTimelineZoom(300);
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(10);
    requestTimelineZoom(500);
    vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBe(50);
  });
});

describe("zoomTimelineToRange", () => {
  it("tells the timeline where a pan at the laid-out scale scrolled to", () => {
    usePlayerStore.setState({
      duration: 1000,
      zoomMode: "manual",
      manualZoomPercent: 1000,
      timelineFitPps: 10,
      timelinePps: 100,
    });
    const { scroll } = viewport(0);
    const published: number[] = [];
    publishScroll.mockImplementation((el: HTMLDivElement) => published.push(el.scrollLeft));
    void zoomTimelineToRange(60, 70);
    for (let i = 0; i < 40; i++) vi.advanceTimersToNextFrame();
    publishScroll.mockReset();
    expect(usePlayerStore.getState().timelinePps).toBe(100);
    expect(scroll.scrollLeft).toBeGreaterThan(5000);
    expect(published.at(-1)).toBe(scroll.scrollLeft);
  });

  it("fills the width with the range and puts its start at the left margin", () => {
    viewport();
    void zoomTimelineToRange(40, 90, { smooth: false });
    // Laid out on the next frame, never inside the caller's own render or effect.
    expect(usePlayerStore.getState().timelinePps).toBe(10);
    vi.advanceTimersToNextFrame();
    // 1080 - (32 + 24) - 24 = 1000px for 50s is 20 pps.
    expect(usePlayerStore.getState().timelinePps).toBeCloseTo(20);
    expect(laidOutX(40)).toBeCloseTo(56);
  });

  it("eases there over several frames and ends exactly on the range", () => {
    viewport();
    void zoomTimelineToRange(10, 20);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(currentTimelineZoomPercent()).toBeGreaterThan(100);
    expect(currentTimelineZoomPercent()).toBeLessThan(1000);
    for (let i = 0; i < 30; i++) vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().timelinePps).toBeCloseTo(100);
    expect(laidOutX(10)).toBeCloseTo(56);
  });

  it("stops easing when a person zooms during it, and says it was cancelled", async () => {
    viewport();
    const result = zoomTimelineToRange(10, 20);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    requestTimelineZoom(150);
    for (let i = 0; i < 30; i++) vi.advanceTimersToNextFrame();
    expect(usePlayerStore.getState().manualZoomPercent).toBe(150);
    await expect(result).resolves.toBe("cancelled");
  });

  it("resolves done once the range is laid out, without counting as a person's zoom", async () => {
    const { row } = viewport();
    let settled: string | null = null;
    void zoomTimelineToRange(10, 20).then((r) => (settled = r));
    for (let i = 0; i < 30 && settled === null; i++) {
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    }
    expect(settled).toBe("done");
    expect(usePlayerStore.getState().timelinePps).toBeCloseTo(100);
    expect(usePlayerStore.getState().userZoomCount).toBe(0);
    expect(row.style.transform).toBe("");
  });

  it("leaves a newer zoom alone when an older one's signal aborts", async () => {
    viewport();
    const abort = new AbortController();
    const older = zoomTimelineToRange(10, 20, { signal: abort.signal });
    const newer = zoomTimelineToRange(30, 40);
    abort.abort();
    for (let i = 0; i < 30; i++) vi.advanceTimersToNextFrame();
    await expect(older).resolves.toBe("cancelled");
    await expect(newer).resolves.toBe("done");
  });

  it("cancels when the caller aborts", async () => {
    viewport();
    const abort = new AbortController();
    const result = zoomTimelineToRange(10, 20, { signal: abort.signal });
    vi.advanceTimersToNextFrame();
    abort.abort();
    await expect(result).resolves.toBe("cancelled");
  });

  it("resolves cancelled when the timeline is no wider than its headers", async () => {
    const scroll = document.createElement("div");
    Object.defineProperties(scroll, {
      clientWidth: { value: 32 },
      scrollWidth: { value: 32 },
      scrollLeft: { value: 0, writable: true },
    });
    unregisterViewport = registerTimelineZoomViewport({ scroll, contentOrigin: 32, publishScroll });
    const result = zoomTimelineToRange(10, 20, { smooth: false });
    await expect(result).resolves.toBe("cancelled");
    expect(usePlayerStore.getState().zoomMode).toBe("fit");
    expect(usePlayerStore.getState().timelinePps).toBe(10);
  });
});

describe("currentTimelineRange", () => {
  it("reads back the range zoomTimelineToRange filled", () => {
    viewport();
    void zoomTimelineToRange(40, 90, { smooth: false });
    vi.advanceTimersToNextFrame();
    const range = currentTimelineRange()!;
    expect(range.start).toBeCloseTo(40);
    expect(range.end).toBeCloseTo(90);
  });

  it("reads the range a gesture shows before it is laid out", () => {
    viewport();
    requestTimelineZoom(150, { time: 0, x: 32 });
    const range = currentTimelineRange()!;
    // 1000px between the margins at 15 px/s, from 24px in.
    expect(range.start).toBeCloseTo(24 / 15);
    expect(range.end - range.start).toBeCloseTo(1000 / 15);
  });

  it("is null with no timeline mounted", () => {
    expect(currentTimelineRange()).toBeNull();
  });
});

describe("zoomTimelineStep", () => {
  const run = () => {
    for (let i = 0; i < 30; i++) vi.advanceTimersToNextFrame();
  };

  it("counts as a person's zoom", () => {
    viewport();
    zoomTimelineStep("in");
    run();
    expect(usePlayerStore.getState().userZoomCount).toBeGreaterThan(0);
  });

  it("doubles the scale and keeps an on-screen playhead where it is", () => {
    usePlayerStore.setState({ currentTime: 40 });
    viewport();
    // At 10 pps the playhead sits at 32 + 400 = 432px.
    zoomTimelineStep("in");
    run();
    expect(usePlayerStore.getState().timelinePps).toBeCloseTo(20);
    expect(laidOutX(40)).toBeCloseTo(432);
  });

  it("lays a zoom-out step out once, at its start, then eases by scaling", () => {
    usePlayerStore.setState({
      currentTime: 110,
      duration: 1000,
      zoomMode: "manual",
      manualZoomPercent: 400,
      timelinePps: 40,
    });
    // 100..126 s on screen at 40 px/s, the playhead at 110 s among it.
    const { row } = viewport(4000);
    const laidOut: number[] = [];
    const unsubscribe = usePlayerStore.subscribe((s, prev) => {
      if (s.timelinePps !== prev.timelinePps) laidOut.push(s.timelinePps);
    });
    zoomTimelineStep("out");
    // Laid out in the first frame, never inside the caller (a host's effect, a click).
    expect(laidOut).toEqual([]);
    vi.advanceTimersToNextFrame();
    expect(laidOut).toEqual([20]);
    // Near the old view, drawn in the first frame by scaling the new layout up.
    expect(Number(/scaleX\(([\d.]+)\)/.exec(row.style.transform)?.[1])).toBeGreaterThan(1.5);
    run();
    unsubscribe();
    expect(laidOut).toEqual([20]);
    // Counted once as the person's zoom: the end of the ease writes nothing more.
    expect(usePlayerStore.getState().userZoomCount).toBe(1);
  });

  it("eases a zoom-out that pans away without laying its target out first", () => {
    // 100..126 s on screen at 40 px/s; the playhead at 0 s is off screen, so the new view
    // (centred on it) does not hold the old one.
    usePlayerStore.setState({
      duration: 1000,
      zoomMode: "manual",
      manualZoomPercent: 400,
      timelinePps: 40,
    });
    viewport(4000);
    const laidOut: number[] = [];
    const unsubscribe = usePlayerStore.subscribe((s, prev) => {
      if (s.timelinePps !== prev.timelinePps) laidOut.push(s.timelinePps);
    });
    zoomTimelineStep("out");
    vi.advanceTimersToNextFrame();
    unsubscribe();
    expect(laidOut[0]).not.toBe(20);
  });

  it("centres an off-screen playhead", () => {
    usePlayerStore.setState({
      currentTime: 60,
      zoomMode: "manual",
      manualZoomPercent: 400,
      timelinePps: 40,
    });
    // 0..26.2 s on screen at 40 px/s.
    viewport();
    zoomTimelineStep("in");
    run();
    // The range's middle, 56 + 1000 / 2, is the playhead.
    expect(laidOutX(60)).toBeCloseTo(556);
  });

  it("still doubles the scale when the timeline is no wider than its headers", () => {
    const scroll = document.createElement("div");
    Object.defineProperties(scroll, {
      clientWidth: { value: 32 },
      scrollWidth: { value: 32 },
      scrollLeft: { value: 0, writable: true },
    });
    unregisterViewport = registerTimelineZoomViewport({ scroll, contentOrigin: 32, publishScroll });
    zoomTimelineStep("in");
    vi.advanceTimersByTime(150);
    expect(usePlayerStore.getState().timelinePps).toBeCloseTo(20);
  });
});
