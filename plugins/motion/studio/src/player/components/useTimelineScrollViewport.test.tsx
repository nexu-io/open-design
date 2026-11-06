// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resizeCallback: ResizeObserverCallback | null = null;
class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  globalThis.ResizeObserver = originalResizeObserver;
  resizeCallback = null;
  document.body.innerHTML = "";
});

interface Harness {
  hook: () => ReturnType<
    typeof import("./useTimelineScrollViewport").useTimelineScrollViewport
  > | null;
  element: HTMLDivElement;
  values: {
    left: number;
    top: number;
    width: number;
    height: number;
    scrollWidth: number;
    scrollHeight: number;
  };
  unmount: () => void;
}

/**
 * The row-virtualization flag is a module constant, so the env stub has to be in
 * place before the hook module is imported. Each harness therefore resets the
 * module registry and imports fresh, which is what lets one file exercise both
 * flag states.
 */
async function mountHarness(rowVirtualizationEnabled: boolean): Promise<Harness> {
  vi.stubEnv(
    "VITE_STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED",
    rowVirtualizationEnabled ? "1" : "0",
  );
  vi.resetModules();
  const { useTimelineScrollViewport } = await import("./useTimelineScrollViewport");

  let current: ReturnType<typeof useTimelineScrollViewport> | null = null;
  function Probe() {
    current = useTimelineScrollViewport(useRef<HTMLDivElement>(null), []);
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => root.render(React.createElement(Probe)));

  const element = document.createElement("div");
  const values = {
    left: 0,
    top: 0,
    width: 640,
    height: 240,
    scrollWidth: 1200,
    scrollHeight: 800,
  };
  Object.defineProperties(element, {
    scrollLeft: { configurable: true, get: () => values.left },
    scrollTop: { configurable: true, get: () => values.top },
    clientWidth: { configurable: true, get: () => values.width },
    clientHeight: { configurable: true, get: () => values.height },
    scrollWidth: { configurable: true, get: () => values.scrollWidth },
    scrollHeight: { configurable: true, get: () => values.scrollHeight },
  });

  return { hook: () => current, element, values, unmount: () => act(() => root.unmount()) };
}

function attachScrollElement({ hook, element }: Harness): void {
  act(() => hook()?.setScrollRef(element));
}

function publishResize(harness: Harness, width: number): void {
  harness.values.width = width;
  act(() => resizeCallback?.([], {} as ResizeObserver));
}

function publishScroll(
  harness: Harness,
  { left, top }: { left: number; top: number },
  isScrolling = true,
): void {
  harness.values.left = left;
  harness.values.top = top;
  act(() => harness.hook()?.syncScrollViewport(harness.element, isScrolling));
  act(() => vi.advanceTimersByTime(16));
}

function expectResizePublication(harness: Harness): void {
  attachScrollElement(harness);
  expect(harness.hook()?.viewport.clientWidth).toBe(640);

  publishResize(harness, 800);
  expect(harness.hook()?.viewport.clientWidth).toBe(800);
}

describe("useTimelineScrollViewport with row virtualization on", () => {
  it("publishes resize, scroll, and settled snapshots", async () => {
    const harness = await mountHarness(true);
    const { hook, unmount } = harness;

    expectResizePublication(harness);

    publishScroll(harness, { left: 120, top: 48 });
    expect(hook()?.viewport).toMatchObject({ scrollLeft: 120, scrollTop: 48, isScrolling: true });

    act(() => vi.advanceTimersByTime(100));
    expect(hook()?.viewport.isScrolling).toBe(false);
    unmount();
  });
});

describe("useTimelineScrollViewport with row virtualization off", () => {
  it("publishes nothing while scrolling", async () => {
    const harness = await mountHarness(false);
    const { hook, unmount } = harness;

    attachScrollElement(harness);
    const before = hook()?.viewport;

    publishScroll(harness, { left: 120, top: 48 });

    expect(hook()?.viewport).toBe(before);
    expect(hook()?.viewport.scrollLeft).toBe(0);
    unmount();
  });

  it("never reports isScrolling, so the settle timer has nothing to undo", async () => {
    const harness = await mountHarness(false);
    const { hook, unmount } = harness;

    attachScrollElement(harness);
    publishScroll(harness, { left: 0, top: 0 });
    act(() => vi.advanceTimersByTime(500));

    expect(hook()?.viewport.isScrolling).toBe(false);
    unmount();
  });

  it("schedules no frame or timer for a scroll sync", async () => {
    const harness = await mountHarness(false);
    const { hook, element, unmount } = harness;
    attachScrollElement(harness);

    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");
    const timerSpy = vi.spyOn(globalThis, "setTimeout");
    act(() => hook()?.syncScrollViewport(element, true));

    expect(rafSpy).not.toHaveBeenCalled();
    expect(timerSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
    timerSpy.mockRestore();
    unmount();
  });

  it("still publishes resize-driven snapshots", async () => {
    const harness = await mountHarness(false);
    const { unmount } = harness;

    expectResizePublication(harness);
    unmount();
  });

  it("still publishes programmatic non-scrolling syncs", async () => {
    const harness = await mountHarness(false);
    const { hook, unmount } = harness;

    attachScrollElement(harness);
    publishScroll(harness, { left: 240, top: 96 }, false);

    expect(hook()?.viewport).toMatchObject({
      scrollLeft: 240,
      scrollTop: 96,
      isScrolling: false,
    });
    unmount();
  });
});
