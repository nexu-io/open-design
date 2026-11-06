// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { createTimelineRowGeometry, type TimelineRowGeometry } from "./timelineLayout";
import { useTimelineRowVirtualization } from "./useTimelineRowVirtualization";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("leaves the viewport still when a live preview lane is removed before the committed row arrives", () => {
  const scroll = document.createElement("div");
  scroll.scrollTop = 160;
  const scrollRef = { current: scroll };
  const lastScrollLeftRef = { current: 0 };
  const host = document.createElement("div");
  const root = createRoot(host);
  const normal = createTimelineRowGeometry([0, 1, 2, 3, 4, 5], [48, 48, 48, 48, 48, 48]);
  const preview = createTimelineRowGeometry([0, -1, 1, 2, 3, 4, 5], [48, 48, 48, 48, 48, 48, 48]);
  const committed = createTimelineRowGeometry([0, 1, 2, 3, 4, 5, 6], [48, 48, 48, 48, 48, 48, 48]);
  function Probe({
    geometry,
    draggedRowKey,
  }: {
    geometry: TimelineRowGeometry;
    draggedRowKey?: number;
  }) {
    useTimelineRowVirtualization({
      scrollRef,
      rowGeometry: geometry,
      draggedRowKey,
      sessionEpoch: 0,
      viewport: {
        scrollTop: 160,
        scrollLeft: 0,
        clientWidth: 800,
        clientHeight: 200,
        scrollWidth: 800,
        scrollHeight: 600,
        isScrolling: false,
      },
      elements: [],
      selectedElementId: null,
      lastScrollLeftRef,
      syncScrollViewport: () => {},
    });
    return null;
  }
  act(() => root.render(<Probe geometry={normal} />));
  act(() => root.render(<Probe geometry={preview} draggedRowKey={-1} />));
  expect(scroll.scrollTop).toBe(160);
  act(() => root.render(<Probe geometry={normal} />));
  expect(scroll.scrollTop).toBe(160);
  act(() => root.render(<Probe geometry={committed} />));
  expect(scroll.scrollTop).toBe(160);
  act(() => root.unmount());
});

// A long project settling hands the rows a new geometry with the same rows on many commits; each scrollTop read
// forced a layout of every clip.
it("reads no scroll position for a new geometry that places every row where it was", () => {
  const scroll = document.createElement("div");
  let reads = 0;
  let top = 160;
  Object.defineProperty(scroll, "scrollTop", {
    get: () => (reads++, top),
    set: (value: number) => void (top = value),
  });
  const scrollRef = { current: scroll };
  const root = createRoot(document.createElement("div"));
  function Probe({ geometry }: { geometry: TimelineRowGeometry }) {
    useTimelineRowVirtualization({
      scrollRef,
      rowGeometry: geometry,
      sessionEpoch: 0,
      viewport: {
        scrollTop: 160,
        scrollLeft: 0,
        clientWidth: 800,
        clientHeight: 200,
        scrollWidth: 800,
        scrollHeight: 600,
        isScrolling: false,
      },
      elements: [],
      selectedElementId: null,
      lastScrollLeftRef: { current: 0 },
      syncScrollViewport: () => {},
    });
    return null;
  }
  const rows = () => createTimelineRowGeometry([0, 1, 2], [48, 48, 48]);
  act(() => root.render(<Probe geometry={rows()} />));
  reads = 0;
  for (let i = 0; i < 3; i += 1) act(() => root.render(<Probe geometry={rows()} />));
  expect(reads, "no layout read for the same rows").toBe(0);
  act(() =>
    root.render(<Probe geometry={createTimelineRowGeometry([0, 9, 1, 2], [48, 48, 48, 48])} />),
  );
  expect(reads, "a row added still keeps the view anchored").toBeGreaterThan(0);
  act(() => root.unmount());
});
