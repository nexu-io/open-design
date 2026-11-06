// @vitest-environment happy-dom

import { act, useLayoutEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveTime, usePlayerStore, type ZoomMode } from "../store/playerStore";
import { useTimelinePlayhead } from "./useTimelinePlayhead";
import { useTimelineScrollViewport } from "./useTimelineScrollViewport";
import { useTimelineClipRenderWindow } from "./useTimelineClipRenderWindow";
import { requestTimelineZoom, settleTimelineZoom } from "./timelineZoomInput";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ORIGIN = 32;

function scrollBox(scrollLeft: number, clientWidth = 800) {
  const el = document.createElement("div");
  let left = scrollLeft;
  Object.defineProperties(el, {
    clientWidth: { value: clientWidth },
    scrollWidth: { value: 20_000 },
    scrollLeft: { get: () => left, set: (v: number) => (left = v) },
  });
  return el;
}

interface HarnessProps {
  /** Omitted: the scale the store publishes, as the timeline reads it. */
  pps?: number;
  scroll: HTMLDivElement;
  dragging?: boolean;
  zoomMode?: ZoomMode;
  syncScrollViewport?: (scroll: HTMLDivElement) => void;
}

function Harness({
  pps: fixedPps,
  scroll,
  dragging = false,
  zoomMode = "manual",
  syncScrollViewport = () => {},
}: HarnessProps) {
  const storePps = usePlayerStore((s) => s.timelinePps);
  const pps = fixedPps ?? storePps;
  const scrollRef = useRef(scroll);
  const durationRef = useRef(60);
  useTimelinePlayhead({
    playheadRef: { current: document.createElement("div") },
    scrollRef,
    syncScrollViewport,
    ppsRef: { current: pps },
    durationRef,
    isDragging: { current: dragging },
    currentTime: 0,
    zoomMode,
    zoomModeRef: { current: zoomMode },
    fitPps: pps,
    fitPpsRef: { current: pps },
    effectiveDuration: 60,
    pps,
    timelineReady: true,
    elementsLength: 1,
    contentOrigin: ORIGIN,
  });
  return null;
}

const roots: Root[] = [];
function mount(props: HarnessProps) {
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(<Harness {...props} />));
  return (next: Partial<HarnessProps>, byPerson = false) =>
    act(() => {
      if (byPerson) usePlayerStore.setState((s) => ({ userZoomCount: s.userZoomCount + 1 }));
      root.render(<Harness {...props} {...next} />);
    });
}

beforeEach(() => {
  usePlayerStore.setState({ currentTime: 0, isPlaying: false, beatDragging: false });
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

/** Where the playhead at `time` sits inside the 800px viewport. */
const onScreenX = (scroll: HTMLDivElement, time: number, pps: number) =>
  ORIGIN + time * pps - scroll.scrollLeft;
function expectVisible(scroll: HTMLDivElement, time: number, pps: number) {
  const x = onScreenX(scroll, time, pps);
  expect(x).toBeGreaterThanOrEqual(ORIGIN);
  expect(x).toBeLessThanOrEqual(800);
}

describe("useTimelinePlayhead zoom anchor", () => {
  it("keeps a view at the start at the start when the window resizes", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll })({ pps: 114 });
    expect(scroll.scrollLeft).toBe(0);
  });

  it("keeps the time at the viewport centre when a scrolled window resizes", () => {
    const scroll = scrollBox(400);
    // Centre time (400 + 400 - 32) / 100 = 7.68s lands at 32 + 7.68 * 200 - 400.
    mount({ pps: 100, scroll })({ pps: 200 });
    expect(scroll.scrollLeft).toBe(1168);
  });

  it("keeps a view at 00:00 on a resize even when the playhead is mid-film", () => {
    usePlayerStore.setState({ currentTime: 6 });
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll })({ pps: 150 });
    expect(scroll.scrollLeft).toBe(0);
  });

  it("keeps the playhead where it is on screen when the toolbar zooms", () => {
    usePlayerStore.setState({ currentTime: 6 });
    const scroll = scrollBox(400);
    const before = onScreenX(scroll, 6, 100);
    mount({ pps: 100, scroll })({ pps: 200 }, true);
    expect(onScreenX(scroll, 6, 200)).toBeCloseTo(before);
  });

  it("stays at 00:00 when a zoom is set with the playhead at 0, as a zoom restored on open is", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll })({ pps: 250 }, true);
    expect(scroll.scrollLeft).toBe(0);
  });

  it("keeps the centre on a resize after a toolbar zoom that hit the zoom limit", () => {
    usePlayerStore.setState({ currentTime: 6 });
    const scroll = scrollBox(400);
    const update = mount({ pps: 100, scroll });
    update({}, true);
    update({ pps: 200 });
    expect(scroll.scrollLeft).toBe(1168);
  });

  it("brings an off-screen playhead into view when the toolbar zooms", () => {
    usePlayerStore.setState({ currentTime: 30 });
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll })({ pps: 200 }, true);
    expectVisible(scroll, 30, 200);
  });
});

describe("useTimelinePlayhead zoom anchor, percent written by Studio itself", () => {
  it("keeps 00:00 when the window resizes after an edit pinned the zoom", () => {
    usePlayerStore.setState({ currentTime: 6 });
    const scroll = scrollBox(0);
    const update = mount({ pps: 100, scroll });
    update({});
    update({ pps: 130 });
    expect(scroll.scrollLeft).toBe(0);
  });

  it("leaves an off-screen playhead alone when a length change re-pins the zoom", () => {
    usePlayerStore.setState({ currentTime: 30 });
    const scroll = scrollBox(400);
    const update = mount({ pps: 100, scroll });
    update({ pps: 90 });
    update({ pps: 101 });
    const x = onScreenX(scroll, 30, 101);
    expect(x > 800 || x < ORIGIN).toBe(true);
  });
});

describe("useTimelinePlayhead follow while paused", () => {
  it("scrolls a paused seek that lands off screen into view", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => liveTime.notifySeek(30));
    expectVisible(scroll, 30, 100);
  });

  it("leaves the view alone when a paused seek lands on screen, even past the follow line", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => liveTime.notifySeek(7));
    expect(scroll.scrollLeft).toBe(0);
  });

  it("scrolls back to the playhead when a person seeks to the time it already has", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => liveTime.notifySeek(30));
    scroll.scrollLeft = 0;
    act(() => liveTime.notifySeek(30));
    expectVisible(scroll, 30, 100);
  });

  it("keeps a person's scroll when a reload republishes the seek rounded to a frame", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => liveTime.notifySeek(12.3456));
    scroll.scrollLeft = 0;
    act(() => liveTime.notify(Math.floor(12.3456 * 30) / 30));
    expect(scroll.scrollLeft).toBe(0);
  });

  it("keeps a person's scroll when a reload follows a keyboard pause", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => usePlayerStore.setState({ isPlaying: true }));
    act(() => liveTime.notify(30));
    act(() => {
      usePlayerStore.getState().setCurrentTime(30.012);
      usePlayerStore.setState({ isPlaying: false });
    });
    scroll.scrollLeft = 0;
    act(() => liveTime.notify(30.012));
    expect(scroll.scrollLeft).toBe(0);
  });

  it("keeps a person's scroll when a reload stops a reverse shuttle", () => {
    usePlayerStore.setState({ currentTime: 30 });
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => usePlayerStore.setState({ isPlaying: true }));
    act(() => liveTime.notify(29));
    act(() => liveTime.notify(20));
    act(() => usePlayerStore.setState({ isPlaying: false }));
    scroll.scrollLeft = 0;
    act(() => liveTime.notify(20));
    expect(scroll.scrollLeft).toBe(0);
  });

  it("does not scroll while the playhead is being dragged", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll, dragging: true });
    act(() => liveTime.notifySeek(30));
    expect(scroll.scrollLeft).toBe(0);
  });

  it("does not scroll while a beat is being dragged past the edge", () => {
    usePlayerStore.setState({ beatDragging: true });
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll });
    act(() => liveTime.notifySeek(30));
    expect(scroll.scrollLeft).toBe(0);
  });

  it("does not scroll in Fit", () => {
    const scroll = scrollBox(0);
    mount({ pps: 100, scroll, zoomMode: "fit" });
    act(() => liveTime.notifySeek(30));
    expect(scroll.scrollLeft).toBe(0);
  });
});

describe("useTimelinePlayhead committed viewport", () => {
  function mountViewport(scrollLeft: number) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    usePlayerStore.setState({
      zoomMode: "manual",
      manualZoomPercent: 1000,
      timelineFitPps: 10,
      timelinePps: 100,
    });
    const scroll = scrollBox(scrollLeft, 1080);
    const container = document.createElement("div");
    function Probe() {
      const pps = usePlayerStore((s) => s.timelinePps);
      const { viewport, setScrollRef, syncScrollViewport } = useTimelineScrollViewport(
        useRef(scroll),
        [],
      );
      useLayoutEffect(() => setScrollRef(scroll), [setScrollRef]);
      const { renderTimeRange } = useTimelineClipRenderWindow({
        tracks: [],
        viewport,
        pixelsPerSecond: pps,
        contentOrigin: ORIGIN,
        duration: 100,
      });
      return (
        <>
          <Harness scroll={scroll} syncScrollViewport={syncScrollViewport} />
          {renderTimeRange.start <= 59 && renderTimeRange.end >= 59 && <span data-clip="59" />}
          <output>{viewport.scrollLeft}</output>
        </>
      );
    }
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Probe />));
    return { scroll, container };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("keeps the visible 59-second clip mounted when a pointer zoom commits", () => {
    const { scroll, container } = mountViewport(5000);
    expect(container.querySelector('[data-clip="59"]')).not.toBeNull();
    act(() => {
      requestTimelineZoom(1090, { time: 55.24, x: 556 });
      settleTimelineZoom();
    });
    expect(scroll.scrollLeft).toBeCloseTo(5497.16);
    expect(container.querySelector('[data-clip="59"]')).not.toBeNull();
    expect(Number(container.querySelector("output")?.textContent)).toBeCloseTo(5497.16);
  });

  it("renders a pan at the laid-out scale before the browser paints", () => {
    const { scroll, container } = mountViewport(0);
    const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const wasActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      requestTimelineZoom(1000, { time: 60, x: ORIGIN });
      settleTimelineZoom();
      expect(scroll.scrollLeft).toBe(6000);
      expect(container.querySelector("output")?.textContent).toBe("6000");
    } finally {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
    }
  });
});

describe("useTimelinePlayhead wheel zoom", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"],
    });
    usePlayerStore.setState({
      zoomMode: "manual",
      manualZoomPercent: 100,
      timelineFitPps: 100,
      timelinePps: 100,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A wheel step 432px in, previewed for one frame. */
  const previewWheel = (scroll: HTMLDivElement, init: WheelEventInit) =>
    act(() => {
      const event = new WheelEvent("wheel", { deltaY: -50, cancelable: true, ...init });
      // happy-dom's WheelEvent drops the MouseEvent fields of its init.
      Object.defineProperties(event, {
        clientX: { value: 432 },
        ctrlKey: { value: Boolean(init.ctrlKey) },
        metaKey: { value: Boolean(init.metaKey) },
      });
      scroll.dispatchEvent(event);
      vi.advanceTimersToNextFrame();
    });

  /** A wheel step, then the rest at which its zoom is laid out. */
  const wheel = (scroll: HTMLDivElement, init: WheelEventInit) => {
    previewWheel(scroll, init);
    act(() => vi.advanceTimersByTime(200));
  };

  it("zooms on Cmd+wheel as on a pinch, and leaves a plain wheel to scroll", () => {
    const scroll = scrollBox(0);
    mount({ scroll });
    wheel(scroll, {});
    expect(usePlayerStore.getState().manualZoomPercent).toBe(100);
    wheel(scroll, { metaKey: true });
    expect(usePlayerStore.getState().manualZoomPercent).toBeGreaterThan(100);
  });

  it("keeps previewing a pinch through a scroll, laying it out only at rest", () => {
    const scroll = scrollBox(0);
    mount({ scroll });
    previewWheel(scroll, { ctrlKey: true });
    act(() => {
      scroll.dispatchEvent(new Event("scroll"));
      vi.advanceTimersToNextFrame();
    });
    expect(usePlayerStore.getState().timelinePps).toBe(100);
    act(() => vi.advanceTimersByTime(200));
    expect(usePlayerStore.getState().timelinePps).toBeGreaterThan(100);
  });

  it("lays a pending pinch out at once when the timeline is pressed", () => {
    const scroll = scrollBox(0);
    mount({ scroll });
    previewWheel(scroll, { ctrlKey: true });
    expect(usePlayerStore.getState().timelinePps).toBe(100);
    act(() => {
      scroll.dispatchEvent(new Event("pointerdown"));
    });
    expect(usePlayerStore.getState().timelinePps).toBeGreaterThan(100);
  });

  it("keeps the time under the pointer in place as a pinch lays out", () => {
    // Zoomed to 150%, so a 300px scroll is one the content allows.
    usePlayerStore.setState({ manualZoomPercent: 150, timelinePps: 150 });
    const scroll = scrollBox(300);
    mount({ scroll });
    // Pointer 432px in: (300 + 432 - 32) / 150 s sits there before and after.
    wheel(scroll, { ctrlKey: true });
    const pps = usePlayerStore.getState().timelinePps;
    expect(pps).toBeGreaterThan(150);
    expect(ORIGIN + (700 / 150) * pps - scroll.scrollLeft).toBeCloseTo(432);
  });
});
