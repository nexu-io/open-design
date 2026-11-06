// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  Virtualizer,
} from "@tanstack/react-virtual";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createTimelineRowGeometry, RULER_H, TRACKS_TOP_PAD } from "./timelineLayout";
import { extractTimelineVirtualRowRange, useTimelineVirtualRows } from "./useTimelineVirtualRows";
import type { TimelineScrollViewportSnapshot } from "./useTimelineScrollViewport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const { width, height } = target.getBoundingClientRect();
    this.callback(
      [
        {
          target,
          borderBoxSize: [{ inlineSize: width, blockSize: height }],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function createScrollElement(scrollTop: number, width = 800, height = 192): HTMLDivElement {
  const element = document.createElement("div");
  document.body.append(element);
  Object.defineProperties(element, {
    scrollTop: { configurable: true, writable: true, value: scrollTop },
    scrollLeft: { configurable: true, writable: true, value: 0 },
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
    scrollWidth: { configurable: true, value: width },
    scrollHeight: { configurable: true, value: 60_000 },
  });
  element.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
  return element;
}

function viewport(element: HTMLDivElement): TimelineScrollViewportSnapshot {
  return {
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    isScrolling: false,
  };
}

function createLargeGeometry(keyOffset = 0) {
  const keys = Array.from({ length: 1_000 }, (_, index) => index + keyOffset);
  return createTimelineRowGeometry(
    keys,
    keys.map(() => 48),
  );
}

describe("extractTimelineVirtualRowRange", () => {
  it("unions visible overscan with unique actor pins", () => {
    expect(
      extractTimelineVirtualRowRange(
        { startIndex: 10, endIndex: 12, overscan: 2, count: 100 },
        [0, 11, 99, 99, -1, 100],
      ),
    ).toEqual([0, 8, 9, 10, 11, 12, 13, 14, 99]);
  });
});

describe("useTimelineVirtualRows", () => {
  it("mounts a bounded vertical range plus the focused row", () => {
    const geometry = createLargeGeometry(0.5);
    const scroll = createScrollElement(RULER_H + TRACKS_TOP_PAD + 500 * 48);
    const scrollRef = { current: scroll };
    let rows: ReturnType<typeof useTimelineVirtualRows> = [];

    function Probe() {
      rows = useTimelineVirtualRows({
        enabled: true,
        scrollRef,
        viewport: viewport(scroll),
        rowGeometry: geometry,
        sessionEpoch: 1,
        pinnedRowKeys: [],
        focusedRowKey: 900.5,
      });
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    act(() => {});

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(16);
    expect(rows.some((row) => row.index === 500)).toBe(true);
    expect(rows.some((row) => row.rowKey === 900.5)).toBe(true);
    act(() => root.unmount());
  });

  it("keeps compatibility rendering complete while the gate is disabled", () => {
    const geometry = createTimelineRowGeometry([10, 5.5, 20], [48, 76, 48]);
    const scroll = createScrollElement(0);
    let rows: ReturnType<typeof useTimelineVirtualRows> = [];

    function Probe() {
      rows = useTimelineVirtualRows({
        enabled: false,
        scrollRef: { current: scroll },
        viewport: viewport(scroll),
        rowGeometry: geometry,
        sessionEpoch: 1,
        pinnedRowKeys: [],
      });
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    expect(rows.map((row) => row.rowKey)).toEqual([10, 5.5, 20]);
    act(() => root.unmount());
  });

  it("observes Timeline's authoritative scroll reset when the session epoch changes", () => {
    const geometry = createLargeGeometry();
    const scroll = createScrollElement(RULER_H + TRACKS_TOP_PAD + 500 * 48);
    const scrollRef = { current: scroll };
    let rows: ReturnType<typeof useTimelineVirtualRows> = [];

    function Probe({ sessionEpoch }: { sessionEpoch: number }) {
      rows = useTimelineVirtualRows({
        enabled: true,
        scrollRef,
        viewport: viewport(scroll),
        rowGeometry: geometry,
        sessionEpoch,
        pinnedRowKeys: [],
      });
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe, { sessionEpoch: 1 })));
    expect(rows.some((row) => row.index === 500)).toBe(true);

    scroll.scrollTop = 0;
    act(() => root.render(React.createElement(Probe, { sessionEpoch: 2 })));
    expect(rows.some((row) => row.index === 0)).toBe(true);
    expect(rows.some((row) => row.index === 500)).toBe(false);

    act(() => root.unmount());
  });

  it("offsets the mounted range by the geometry's own top pad", () => {
    const keys = Array.from({ length: 1_000 }, (_, index) => index);
    const topPad = 200 * 48;
    const geometry = createTimelineRowGeometry(
      keys,
      keys.map(() => 48),
      { top: topPad },
    );
    const scroll = createScrollElement(RULER_H + topPad + 300 * 48);
    const scrollRef = { current: scroll };
    let rows: ReturnType<typeof useTimelineVirtualRows> = [];

    function Probe() {
      rows = useTimelineVirtualRows({
        enabled: true,
        scrollRef,
        viewport: viewport(scroll),
        rowGeometry: geometry,
        sessionEpoch: 1,
        pinnedRowKeys: [],
      });
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    act(() => {});
    expect(rows.some((row) => row.index === 300)).toBe(true);
    expect(rows.some((row) => row.index === 500)).toBe(false);
    act(() => root.unmount());
  });

  // A scroll-end timer left running fires into the torn-down test window ("window is not defined").
  it("gets no virtualizer change after unmount from a scroll just before it", async () => {
    const scroll = createScrollElement(0);
    const onChange = vi.fn();
    const virtualizer = new Virtualizer<HTMLDivElement, Element>({
      count: 100,
      getScrollElement: () => scroll,
      estimateSize: () => 48,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange,
    });
    const unmount = virtualizer._didMount();
    virtualizer._willUpdate();
    scroll.dispatchEvent(new Event("scroll"));
    unmount();
    onChange.mockClear();

    await new Promise((settle) => setTimeout(settle, 200));
    expect(onChange).not.toHaveBeenCalled();
  });
});
