// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useSettledScrollLeft } from "./useSettledScrollLeft";
import { TIMELINE_SCROLL_SETTLE_MS } from "./useTimelineScrollViewport";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// The ruler's label read scrollLeft on every commit while a long project settled, each read a layout of the whole
// timeline.
it("reads scrollLeft when a scroll settles, never on a render", () => {
  vi.useFakeTimers();
  const scroll = document.createElement("div");
  let reads = 0;
  let left = 120;
  Object.defineProperty(scroll, "scrollLeft", { get: () => (reads++, left) });
  const scrollRef = { current: scroll };
  const seen: (number | null)[] = [];
  function Probe({ tick }: { tick: number }) {
    seen.push(useSettledScrollLeft(scrollRef));
    return <i data-tick={tick} />;
  }
  const root = createRoot(document.createElement("div"));
  try {
    act(() => root.render(<Probe tick={0} />));
    expect(seen.at(-1)).toBe(120);
    reads = 0;
    for (let tick = 1; tick <= 3; tick += 1) act(() => root.render(<Probe tick={tick} />));
    expect(reads, "no layout read on a render").toBe(0);
    left = 300;
    act(() => void scroll.dispatchEvent(new Event("scroll")));
    expect(seen.at(-1)).toBeNull();
    act(() => void vi.advanceTimersByTime(TIMELINE_SCROLL_SETTLE_MS + 1));
    expect(seen.at(-1)).toBe(300);
    expect(reads, "one read when the scroll settles").toBe(1);
  } finally {
    act(() => root.unmount());
    vi.useRealTimers();
  }
});
