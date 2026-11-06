// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineRuler } from "./TimelineRuler";
import { TIMELINE_SCROLL_SETTLE_MS } from "./useTimelineScrollViewport";
import type { TimelineTheme } from "./timelineTheme";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  vi.useRealTimers();
});

describe("TimelineRuler", () => {
  it("masks the one tick label the track header would slice, once the scroll settles", () => {
    vi.useFakeTimers();
    const scroller = document.createElement("div");
    let scrollLeft = 0;
    Object.defineProperty(scroller, "scrollLeft", { get: () => scrollLeft });
    const host = document.createElement("div");
    scroller.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <TimelineRuler
          major={[0, 10, 20]}
          minor={[]}
          pps={20}
          trackContentWidth={600}
          totalH={100}
          effectiveDuration={30}
          majorTickInterval={10}
          theme={{} as TimelineTheme}
          contentOrigin={80}
          scrollRef={{ current: scroller }}
        />,
      ),
    );
    const mask = () =>
      host.querySelector<HTMLElement>("[data-timeline-ruler-label-mask]")?.style.left ?? null;
    const scrollTo = (left: number) =>
      act(() => {
        scrollLeft = left;
        scroller.dispatchEvent(new Event("scroll"));
      });
    const settle = () => act(() => vi.advanceTimersByTime(TIMELINE_SCROLL_SETTLE_MS));

    expect(mask()).toBeNull();
    // The 10s label starts at 200 - 0.5 + 5 = 204.5 in ruler space.
    scrollTo(204);
    expect(mask()).toBeNull();
    settle();
    expect(mask()).toBe("4.5px");
    scrollTo(205);
    expect(mask()).toBeNull();
    settle();
    expect(mask()).toBe("204.5px");
    act(() => root.unmount());
  });

  it("masks right away when the scroll element is swapped mid-scroll", () => {
    vi.useFakeTimers();
    const make = (left: number) => {
      const el = document.createElement("div");
      Object.defineProperty(el, "scrollLeft", { get: () => left });
      return el;
    };
    const first = make(205);
    const host = document.createElement("div");
    const root = createRoot(host);
    const render = (el: HTMLDivElement) =>
      act(() =>
        root.render(
          <TimelineRuler
            major={[0, 10, 20]}
            minor={[]}
            pps={20}
            trackContentWidth={600}
            totalH={100}
            effectiveDuration={30}
            majorTickInterval={10}
            theme={{} as TimelineTheme}
            contentOrigin={80}
            scrollRef={{ current: el }}
          />,
        ),
      );
    render(first);
    act(() => first.dispatchEvent(new Event("scroll")));
    render(make(205));
    expect(host.querySelector<HTMLElement>("[data-timeline-ruler-label-mask]")?.style.left).toBe(
      "204.5px",
    );
    act(() => root.unmount());
  });
});
