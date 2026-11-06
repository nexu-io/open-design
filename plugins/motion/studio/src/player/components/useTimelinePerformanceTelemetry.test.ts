// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const trackStudioTimelinePerformance = vi.hoisted(() => vi.fn());

vi.mock("../../telemetry/events", () => ({
  trackStudioTimelinePerformance,
}));

import {
  summarizeTimelinePerformance,
  useTimelinePerformanceTelemetry,
} from "./useTimelinePerformanceTelemetry";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  trackStudioTimelinePerformance.mockReset();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("summarizeTimelinePerformance", () => {
  it("reports raw mounted work and p95 scroll timings", () => {
    const scroll = document.createElement("div");
    Object.defineProperties(scroll, {
      clientWidth: { value: 1_200 },
      clientHeight: { value: 360 },
    });
    scroll.innerHTML = `
      <div>
        <div data-clip="true"></div>
        <div data-clip="true"><span></span></div>
      </div>
    `;

    expect(
      summarizeTimelinePerformance(
        scroll,
        { totalClipCount: 3_000, totalRowCount: 24, zoomMode: "fit" },
        [8, 10, 12, 80],
        [16, 17, 45],
      ),
    ).toEqual({
      total_clip_count: 3_000,
      mounted_clip_count: 2,
      total_row_count: 24,
      timeline_dom_node_count: 4,
      viewport_width: 1_200,
      viewport_height: 360,
      zoom_mode: "fit",
      scroll_sample_count: 4,
      scroll_frame_latency_p95_ms: 80,
      scroll_frame_latency_max_ms: 80,
      frame_interval_p95_ms: 45,
    });
  });

  it("does not emit a summary without a completed animation frame", () => {
    const scroll = document.createElement("div");

    expect(
      summarizeTimelinePerformance(
        scroll,
        { totalClipCount: 1, totalRowCount: 1, zoomMode: "manual" },
        [],
        [],
      ),
    ).toBeNull();
  });
});

describe("useTimelinePerformanceTelemetry", () => {
  it("measures callback delivery when the animation-frame timestamp predates the scroll", () => {
    vi.useFakeTimers();
    let frameCallback: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    let recordTimelineScroll: ((scroll: HTMLDivElement) => void) | undefined;
    function Probe() {
      recordTimelineScroll = useTimelinePerformanceTelemetry({
        totalClipCount: 1,
        totalRowCount: 1,
        zoomMode: "manual",
      }).recordTimelineScroll;
      return null;
    }

    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));

    try {
      vi.spyOn(performance, "now")
        .mockReturnValueOnce(100)
        .mockReturnValueOnce(108)
        .mockReturnValueOnce(500);

      recordTimelineScroll?.(document.createElement("div"));
      frameCallback?.(99);
      vi.advanceTimersByTime(400);

      expect(trackStudioTimelinePerformance).toHaveBeenCalledWith(
        expect.objectContaining({
          scroll_frame_latency_p95_ms: 8,
          scroll_frame_latency_max_ms: 8,
        }),
      );
    } finally {
      act(() => root.unmount());
    }
  });
});
