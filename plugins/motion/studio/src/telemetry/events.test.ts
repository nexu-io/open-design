import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock client.trackEvent so we can assert event names and payloads without
// firing network requests or relying on memoized shouldTrack() state.
const trackEvent = vi.fn();
vi.mock("./client", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const {
  trackStudioSessionStart,
  trackPreviewFirstFrame,
  trackStudioRenderStart,
  trackStudioRazorSplit,
  trackStudioKeyframeLaneExpand,
  trackStudioSegmentEaseEdit,
  trackStudioFeedback,
  trackStudioTimelinePerformance,
} = await import("./events");

describe("studio telemetry events", () => {
  beforeEach(() => {
    trackEvent.mockClear();
  });

  it("trackStudioSessionStart emits 'studio_session_start' with has_project", () => {
    trackStudioSessionStart({ has_project: true });
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith("studio_session_start", { has_project: true });
  });

  it("trackStudioSessionStart preserves false for has_project (scratch open)", () => {
    trackStudioSessionStart({ has_project: false });
    expect(trackEvent).toHaveBeenCalledWith("studio_session_start", { has_project: false });
  });

  it("trackPreviewFirstFrame emits timing, composition duration, and version", () => {
    trackPreviewFirstFrame({
      duration_ms: 842,
      composition_seconds: 12.5,
      clip_count: 8,
      media_clip_count: 5,
      studio_version: "0.8.56",
    });
    expect(trackEvent).toHaveBeenCalledWith("preview_first_frame", {
      duration_ms: 842,
      composition_seconds: 12.5,
      clip_count: 8,
      media_clip_count: 5,
      studio_version: "0.8.56",
    });
  });

  it("trackStudioRenderStart emits 'studio_render_start' with all render opts", () => {
    trackStudioRenderStart({
      fps: 30,
      quality: "standard",
      format: "mp4",
      resolution: "landscape",
      composition: "intro.html",
    });
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith("studio_render_start", {
      fps: 30,
      quality: "standard",
      format: "mp4",
      resolution: "landscape",
      composition: "intro.html",
    });
  });

  it("trackStudioRenderStart leaves optional fields undefined when omitted", () => {
    trackStudioRenderStart({ fps: 60, quality: "high", format: "webm" });
    const payload = trackEvent.mock.calls[0][1];
    expect(payload).toEqual({
      fps: 60,
      quality: "high",
      format: "webm",
      resolution: undefined,
      composition: undefined,
    });
  });

  it("trackStudioTimelinePerformance emits raw timeline measurements", () => {
    const sample = {
      total_clip_count: 3_000,
      mounted_clip_count: 160,
      total_row_count: 24,
      timeline_dom_node_count: 957,
      viewport_width: 1_200,
      viewport_height: 360,
      zoom_mode: "fit",
      scroll_sample_count: 20,
      scroll_frame_latency_p95_ms: 24.5,
      scroll_frame_latency_max_ms: 31.2,
      frame_interval_p95_ms: 42.3,
    };

    trackStudioTimelinePerformance(sample);

    expect(trackEvent).toHaveBeenCalledWith("studio_timeline_performance", sample);
  });

  it("trackStudioRazorSplit emits 'studio_razor_split' with mode and count", () => {
    trackStudioRazorSplit({ mode: "all", count: 3 });
    expect(trackEvent).toHaveBeenCalledWith("studio_razor_split", { mode: "all", count: 3 });
  });

  it("trackStudioKeyframeLaneExpand emits 'studio_keyframe_lane_expand' with expanded", () => {
    trackStudioKeyframeLaneExpand({ expanded: true });
    expect(trackEvent).toHaveBeenCalledWith("studio_keyframe_lane_expand", { expanded: true });
  });

  it("trackStudioSegmentEaseEdit emits 'studio_segment_ease_edit' with action and ease", () => {
    trackStudioSegmentEaseEdit({ action: "commit", ease: "power2.out" });
    expect(trackEvent).toHaveBeenCalledWith("studio_segment_ease_edit", {
      action: "commit",
      ease: "power2.out",
    });
  });

  it.each([0, 10])("trackStudioFeedback preserves NPS boundary %i and its scale", (rating) => {
    trackStudioFeedback({ rating });

    expect(trackEvent).toHaveBeenCalledWith(
      "studio_feedback",
      expect.objectContaining({ rating, rating_scale: 10 }),
    );
  });
});
