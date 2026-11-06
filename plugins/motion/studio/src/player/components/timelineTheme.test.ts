import { describe, expect, it } from "vitest";
import {
  clipWidthLadder,
  defaultTimelineTheme,
  getClipHandleOpacity,
  getRenderedTimelineElement,
  getTimelineTrackStyle,
} from "./timelineTheme";
import { getTrackStyle } from "./timelineIcons";

describe("clipWidthLadder", () => {
  it("labels from 60px, keeps the picture below that, and uses one frame below 24px", () => {
    expect(clipWidthLadder(200)).toBe("labeled");
    expect(clipWidthLadder(60)).toBe("labeled");
    expect(clipWidthLadder(59)).toBe("picture");
    expect(clipWidthLadder(24)).toBe("picture");
    expect(clipWidthLadder(23)).toBe("frame");
    expect(defaultTimelineTheme.clipRadius).toBe("var(--timeline-clip-radius)");
    expect(defaultTimelineTheme.audioClipRadius).toBe("var(--timeline-clip-audio-radius)");
  });
});

describe("getTimelineTrackStyle", () => {
  it("uses one neutral clip style for every timeline tag", () => {
    const expectedStyle = {
      clip: "var(--timeline-track-clip-fill)",
      clipActive: "var(--timeline-track-clip-active)",
      accent: "var(--color-accent)",
      label: "var(--timeline-track-label)",
    };

    expect(getTimelineTrackStyle("video")).toEqual(expectedStyle);
    expect(getTimelineTrackStyle("audio")).toEqual(expectedStyle);
    expect(getTimelineTrackStyle("custom-tag")).toEqual(expectedStyle);
    expect(getTimelineTrackStyle("video")).toEqual(getTimelineTrackStyle("audio"));
    expect(getTimelineTrackStyle("video")).toEqual(getTimelineTrackStyle("custom-tag"));
  });
});

describe("getTrackStyle", () => {
  it("returns the timeline style only and preserves the empty tag fallback", () => {
    const style = getTrackStyle("");
    expect(style).toEqual(getTimelineTrackStyle("div"));
    expect(Object.keys(style)).not.toContain("icon");
    expect(Object.keys(style)).not.toContain("iconBackground");
  });
});

describe("getClipHandleOpacity", () => {
  it("hides handles at rest", () => {
    expect(getClipHandleOpacity({ isHovered: false, isSelected: false, isDragging: false })).toBe(
      0,
    );
  });

  it("prioritizes dragging over hover and selection", () => {
    expect(getClipHandleOpacity({ isHovered: true, isSelected: true, isDragging: true })).toBe(
      0.95,
    );
  });
});

describe("getRenderedTimelineElement", () => {
  it("keeps non-dragged clips unchanged", () => {
    const element = { id: "a", tag: "div", start: 1, duration: 2, track: 0 };
    expect(
      getRenderedTimelineElement({
        element,
        draggedElementId: "b",
        previewStart: 2,
        previewTrack: 1,
      }),
    ).toEqual(element);
  });

  it("moves the actual dragged clip to the preview position", () => {
    const element = { id: "a", tag: "div", start: 1, duration: 2, track: 0 };
    expect(
      getRenderedTimelineElement({
        element,
        draggedElementId: "a",
        previewStart: 2.4,
        previewTrack: 3,
      }),
    ).toEqual({ ...element, start: 2.4, track: 3 });
  });

  it("uses key before id when matching the dragged clip", () => {
    const element = {
      id: "Card",
      key: "index.html:.card:1",
      tag: "div",
      start: 1,
      duration: 2,
      track: 0,
    };
    expect(
      getRenderedTimelineElement({
        element,
        draggedElementId: "index.html:.card:1",
        previewStart: 2.4,
        previewTrack: 3,
      }),
    ).toEqual({ ...element, start: 2.4, track: 3 });
  });
});
