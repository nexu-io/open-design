// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { useTimelineGeometry } from "./useTimelineGeometry";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const element: TimelineElement = { id: "hero", tag: "div", start: 20, duration: 2, track: 1 };

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

function Harness({
  expandedElements,
  lastScrollLeftRef,
  scrollWidth = 20_000,
}: {
  expandedElements: TimelineElement[];
  lastScrollLeftRef: React.RefObject<number>;
  scrollWidth?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const ppsRef = useRef(0);
  const fitPpsRef = useRef(0);
  useTimelineGeometry({
    viewportWidth: 1600,
    effectiveDuration: 60,
    zoomMode: "manual",
    manualZoomPercent: 100,
    ppsRef,
    fitPpsRef,
    draggedClip: null,
    resizingClip: null,
    expandedElements,
    isDragging,
    scrollRef,
    lastScrollLeftRef,
    contentOrigin: 32,
  });
  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (node) {
          Object.defineProperty(node, "clientWidth", { configurable: true, value: 1600 });
          Object.defineProperty(node, "scrollWidth", { configurable: true, value: scrollWidth });
        }
      }}
    />
  );
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  usePlayerStore.setState({ timelineProjectId: "project-a" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  usePlayerStore.getState().reset();
  document.body.replaceChildren();
});

describe("useTimelineGeometry restore-scroll effect", () => {
  it("reads lastScrollLeftRef at frame time, not effect time, so a same-commit reveal isn't undone", async () => {
    // A sibling effect in the same commit (a fresh timeline-focus reveal) can
    // update lastScrollLeftRef and the DOM scrollLeft together after this
    // effect has already scheduled its frame. The frame must see that update,
    // not the value that was current when it was scheduled.
    const lastScrollLeftRef = { current: 132 };
    act(() => {
      root.render(<Harness expandedElements={[]} lastScrollLeftRef={lastScrollLeftRef} />);
    });
    const scroll = host.firstElementChild as HTMLDivElement;
    scroll.scrollLeft = 132;

    // Flush this effect (it schedules a frame, capturing whatever it reads
    // right now) BEFORE the sibling mutates the ref, exactly as in a real
    // commit where this effect registers and runs ahead of the reveal's.
    act(() => {
      root.render(<Harness expandedElements={[element]} lastScrollLeftRef={lastScrollLeftRef} />);
    });
    // Simulate the sibling reveal effect: it runs after this one in the same
    // commit and updates both the DOM and the ref before the frame fires.
    lastScrollLeftRef.current = 450;
    scroll.scrollLeft = 450;
    await act(async () => {
      await nextFrame();
    });

    expect(scroll.scrollLeft).toBe(450);
  });

  it("still restores the pre-edit position when nothing else changed the ref mid-frame", async () => {
    const lastScrollLeftRef = { current: 300 };
    act(() => {
      root.render(<Harness expandedElements={[]} lastScrollLeftRef={lastScrollLeftRef} />);
    });
    const scroll = host.firstElementChild as HTMLDivElement;
    scroll.scrollLeft = 0;

    act(() => {
      root.render(<Harness expandedElements={[element]} lastScrollLeftRef={lastScrollLeftRef} />);
    });
    await act(async () => {
      await nextFrame();
    });

    expect(scroll.scrollLeft).toBe(300);
  });
});

function ScaleProbe({
  duration,
  width = 1200,
  clips = duration > 0,
  seen,
}: {
  duration: number;
  width?: number;
  clips?: boolean;
  seen: { pps: number; fitPps: number };
}) {
  const ppsRef = useRef(0);
  const fitPpsRef = useRef(0);
  const zoomMode = usePlayerStore((s) => s.zoomMode);
  const manualZoomPercent = usePlayerStore((s) => s.manualZoomPercent);
  const { pps, fitPps } = useTimelineGeometry({
    viewportWidth: width,
    effectiveDuration: duration,
    zoomMode,
    manualZoomPercent,
    ppsRef,
    fitPpsRef,
    draggedClip: null,
    resizingClip: null,
    expandedElements: clips ? [{ ...element, start: 0, duration }] : [],
    isDragging: useRef(false),
    scrollRef: useRef<HTMLDivElement>(null),
    lastScrollLeftRef: useRef(0),
    contentOrigin: 32,
  });
  seen.pps = pps;
  seen.fitPps = fitPps;
  return null;
}

describe("useTimelineGeometry keeps the scale when only the length changes", () => {
  const seen = { pps: 0, fitPps: 0 };
  const renderAt = (duration: number, width?: number, clips?: boolean) =>
    act(() =>
      root.render(<ScaleProbe duration={duration} width={width} clips={clips} seen={seen} />),
    );
  const within = (pps: number) => Math.abs(seen.pps - pps) < seen.fitPps * 0.005;

  it("keeps a short film's clips the same size when the first edit lengthens it", () => {
    usePlayerStore.setState({ zoomMode: "fit", manualZoomPercent: 100 });
    renderAt(17);
    const before = seen.pps;
    act(() => usePlayerStore.getState().pinTimelineZoom(seen.pps, seen.fitPps));
    renderAt(25);
    expect(seen.fitPps).toBeLessThan(before);
    expect(within(before)).toBe(true);
  });

  it("keeps the scale in manual zoom when a later edit shortens the film", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 150 });
    renderAt(17);
    const before = seen.pps;
    renderAt(12);
    expect(seen.fitPps).toBeGreaterThan(before / 1.5);
    expect(within(before)).toBe(true);
  });

  it("still scales with the fit width when the timeline is resized, and when the length first loads", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 150 });
    renderAt(0);
    renderAt(17);
    expect(seen.pps).toBeCloseTo(seen.fitPps * 1.5);
    renderAt(17, 900);
    expect(seen.pps).toBeCloseTo(seen.fitPps * 1.5);
  });

  it("refits when another composition opens, which empties the clips first", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 150 });
    renderAt(120);
    renderAt(120, undefined, false);
    renderAt(5);
    expect(seen.pps).toBeCloseTo(seen.fitPps * 1.5);
  });

  it("refits after a project reset, which empties the clips and the length", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 150 });
    renderAt(120);
    renderAt(0);
    renderAt(17);
    expect(seen.pps).toBeCloseTo(seen.fitPps * 1.5);
  });

  it("keeps a lengthened film's scale near the maximum zoom", () => {
    usePlayerStore.setState({ zoomMode: "manual", manualZoomPercent: 100_000 });
    renderAt(17);
    const before = seen.pps;
    expect(before).toBeLessThan(seen.fitPps * 1000);
    renderAt(25);
    expect(within(before)).toBe(true);
  });

  it("leaves the manual zoom alone in fit mode", () => {
    usePlayerStore.setState({ zoomMode: "fit", manualZoomPercent: 100 });
    renderAt(17);
    renderAt(25);
    expect(seen.pps).toBe(seen.fitPps);
    expect(usePlayerStore.getState().manualZoomPercent).toBe(100);
  });
});
