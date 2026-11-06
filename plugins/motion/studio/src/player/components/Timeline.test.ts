// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vitest";
import { describe, it, expect, vi } from "vitest";
import { rulerTickText } from "./timelineRulerGeometry";
import {
  Timeline,
  formatTimelineTickLabel,
  generateTicks,
  getDefaultDroppedTrack,
  getTimelineCanvasHeight,
  resolveTimelineAssetDrop,
  getTimelinePlayheadLeft,
  getTimelinePlaybackFollowScrollLeft,
  getTimelineScrollLeftForZoomAnchor,
  getTimelineScrollLeftForZoomTransition,
  shouldShowTimelineShortcutHint,
  shouldAutoScrollTimeline,
  getTimelineVisibleTimeRange,
  getTimelineScrollTopForGeometryChange,
} from "./Timeline";
import {
  CLIP_Y,
  FIT_ZOOM_HEADROOM,
  GUTTER,
  LABEL_COL_W,
  LANE_H,
  MIN_TIMELINE_EXTENT_S,
  PLAYHEAD_HEAD_W,
  RULER_H,
  TRACK_H,
  TRACKS_LEFT_PAD,
  getTimelineDisplayContentWidth,
  getTimelineFitPps,
  getTimelineLaneTop,
  getTimelineRowTop,
  createTimelineRowGeometry,
} from "./timelineLayout";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";
import { formatTime } from "../lib/time";
import { liveTime, usePlayerStore } from "../store/playerStore";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";

vi.mock("./timelineRowVirtualizationFlag", () => ({
  STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED: false,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
});

describe("timeline viewport geometry", () => {
  it("derives a clamped visible time range from the raw viewport", () => {
    expect(
      getTimelineVisibleTimeRange({ scrollLeft: 300, clientWidth: 500 }, 100, 200, 20),
    ).toEqual({ start: 1, end: 6 });
    expect(getTimelineVisibleTimeRange({ scrollLeft: 0, clientWidth: 100 }, 100, 200, 20)).toEqual({
      start: 0,
      end: 0,
    });
  });

  it("keeps the same row anchored when a row above it expands", () => {
    const previous = createTimelineRowGeometry([1, 2, 3], [48, 48, 48]);
    const next = createTimelineRowGeometry([1, 2, 3], [104, 48, 48]);
    const scrollTop = previous.getRowTop(2) - RULER_H + 6;
    expect(getTimelineScrollTopForGeometryChange(previous, next, scrollTop)).toBe(scrollTop + 56);
  });

  it("keeps a row added above the top row in view while the list sits at the top", () => {
    // No top padding (trackPadding { top: 0 }), so the first row sits right under the ruler.
    const previous = createTimelineRowGeometry([1, 2, 3], [48, 48, 48], { top: 0 });
    const next = createTimelineRowGeometry([9, 1, 2, 3], [48, 48, 48, 48], { top: 0 });
    expect(getTimelineScrollTopForGeometryChange(previous, next, 0)).toBe(0);
  });

  it("leaves scrollTop to edge auto-scroll while a clip drag adds a row above", () => {
    const previous = createTimelineRowGeometry([1, 2, 3], [48, 48, 48]);
    const next = createTimelineRowGeometry([9, 1, 2, 3], [48, 48, 48, 48]);
    const scrollTop = previous.getRowTop(1) - RULER_H + 6;
    expect(getTimelineScrollTopForGeometryChange(previous, next, scrollTop, true)).toBe(scrollTop);
    expect(getTimelineScrollTopForGeometryChange(previous, next, scrollTop)).toBe(scrollTop + 48);
  });
});

function trackContentOf(clip: HTMLElement | null | undefined): HTMLElement | null {
  return clip?.closest<HTMLElement>('[role="gridcell"]') ?? null;
}

function getHorizontalGeometry(host: HTMLElement, clipId: string, tickLabel: string) {
  const clip = host.querySelector<HTMLElement>(`[data-el-id="${clipId}"]`);
  if (!clip) throw new Error(`Missing timeline clip ${clipId}`);
  const trackContent = trackContentOf(clip);
  if (!trackContent) throw new Error(`Missing content row for ${clipId}`);
  const trackHeader = trackContent.previousElementSibling;
  if (!(trackHeader instanceof HTMLElement)) throw new Error(`Missing track header for ${clipId}`);
  const rulerTickLabel = Array.from(host.querySelectorAll("span")).find(
    (node) => node.textContent === tickLabel,
  );
  const rulerTick = rulerTickLabel?.parentElement;
  if (!rulerTick) throw new Error(`Missing ruler tick ${tickLabel}`);
  const ruler = rulerTick.parentElement;
  if (!ruler) throw new Error("Missing timeline ruler");
  const rulerOrigin = ruler.previousElementSibling;
  if (!(rulerOrigin instanceof HTMLElement)) throw new Error("Missing timeline ruler origin");
  const playhead = host.querySelector<HTMLElement>("[data-timeline-playhead-layer] > div");
  if (!playhead) throw new Error("Missing timeline playhead");
  return { clip, trackHeader, rulerTick, rulerOrigin, playhead };
}

function renderTimelineGeometry(clipId: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(React.createElement(Timeline));
  });
  return { host, root, ...getHorizontalGeometry(host, clipId, "00:10") };
}

function createSizedTimelineHost(width: number): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(host, "clientWidth", { configurable: true, value: width });
  return host;
}

function expectTrackExpansion(
  row: HTMLElement | null | undefined,
  expandedClipIds: string[],
  height: number,
) {
  expect(usePlayerStore.getState().expandedClipIds).toEqual(new Set(expandedClipIds));
  expect(row?.style.height).toBe(`${height}px`);
}

function renderBasicTimeline() {
  const host = createSizedTimelineHost(640);
  usePlayerStore.setState({
    duration: 4,
    timelineReady: true,
    elements: [{ id: "clip-1", tag: "div", start: 0, duration: 2, track: 0 }],
  });
  const root = createRoot(host);
  act(() => {
    root.render(React.createElement(Timeline));
  });
  return { host, root };
}

function renderSharedAutomationTimeline(selectedElementId?: string) {
  const host = createSizedTimelineHost(720);
  const automation = JSON.stringify({
    version: 1,
    lanes: [{ target: "volume", points: [{ t: 0, v: 1 }] }],
  });
  usePlayerStore.setState({
    duration: 8,
    timelineReady: true,
    ...(selectedElementId ? { selectedElementId } : {}),
    elements: [
      { id: "narration-1", tag: "audio", start: 0, duration: 4, track: 0, automation },
      { id: "narration-2", tag: "audio", start: 4, duration: 4, track: 0, automation },
    ],
  });
  const root = createRoot(host);
  act(() => root.render(React.createElement(Timeline)));
  return { host, root };
}

describe("Timeline playhead motion", () => {
  it("moves by fractional pixels while playing and snaps to device pixels once paused", () => {
    usePlayerStore.setState({
      duration: 11,
      timelineReady: true,
      currentTime: 10,
      isPlaying: true,
      zoomMode: "manual",
      manualZoomPercent: 100,
      elements: [{ id: "clip-1", tag: "div", start: 10, duration: 1, track: 0 }],
    });
    const { root, playhead } = renderTimelineGeometry("clip-1");
    const wrapperLeft = GUTTER + TRACKS_LEFT_PAD + 1000.3 - PLAYHEAD_HEAD_W / 2;
    act(() => liveTime.notify(10.003));
    expect(playhead.style.transform).toBe(`translateX(${wrapperLeft}px)`);
    act(() => usePlayerStore.setState({ isPlaying: false }));
    expect(playhead.style.transform).toBe(`translateX(${Math.round(wrapperLeft)}px)`);
    act(() => root.unmount());
  });
});

describe("Timeline provider boundary", () => {
  it("keeps all-collapsed horizontal positions at the gutter plus the pre-t=0 pad", () => {
    usePlayerStore.setState({
      duration: 11,
      timelineReady: true,
      currentTime: 10,
      zoomMode: "manual",
      manualZoomPercent: 100,
      elements: [{ id: "clip-1", tag: "div", start: 10, duration: 1, track: 0 }],
    });

    const { root, clip, trackHeader, rulerTick, rulerOrigin, playhead } =
      renderTimelineGeometry("clip-1");

    expect(trackHeader.style.width).toBe(`${GUTTER + TRACKS_LEFT_PAD}px`);
    // 10 s at 100 px/s: 1000% of a one-second layer 100px wide.
    expect(clip.style.left).toBe("1000%");
    expect((clip.closest("[data-timeline-time-layer]") as HTMLElement).style.width).toBe("100px");
    expect(clip.style.height).toBe("");
    expect(clip.style.bottom).toBe(`${CLIP_Y}px`);
    expect(rulerOrigin.style.width).toBe(`${GUTTER + TRACKS_LEFT_PAD}px`);
    expect(rulerTick.style.left).toBe("999.5px");
    expect(playhead.style.transform).toBe(
      `translateX(${Math.round(GUTTER + TRACKS_LEFT_PAD + 1000 - PLAYHEAD_HEAD_W / 2)}px)`,
    );
    expect(playhead.style.width).toBe(`${PLAYHEAD_HEAD_W}px`);
    expect(
      resolveTimelineAssetDrop(
        {
          rectLeft: 100,
          rectTop: 0,
          scrollLeft: 0,
          scrollTop: 0,
          contentOrigin: GUTTER,
          pixelsPerSecond: 100,
          trackOrder: [0],
        },
        1132,
        100,
      ).start,
    ).toBe(10);
    expect(getTimelineFitPps(640, 11, GUTTER)).toBeCloseTo(
      (640 - GUTTER - 2) / (11 * FIT_ZOOM_HEADROOM),
    );

    act(() => root.unmount());
  });

  it("reserves the label column and keeps expanded keyframes aligned with ruler time", () => {
    usePlayerStore.setState({
      duration: 20,
      timelineReady: true,
      currentTime: 10,
      zoomMode: "manual",
      manualZoomPercent: 100,
      selectedElementId: "clip-1",
      expandedClipIds: new Set(["clip-1"]),
      elements: [
        { id: "clip-1", label: "Hero card", tag: "div", start: 0, duration: 20, track: 0 },
        { id: "clip-2", label: "Outro", tag: "div", start: 2, duration: 1, track: 1 },
      ],
      gsapAnimations: new Map([
        [
          "clip-1",
          [
            {
              id: "position-tween",
              targetSelector: "#clip-1",
              method: "to",
              position: 0,
              duration: 20,
              properties: {},
              propertyGroup: "position",
              keyframes: {
                format: "percentage",
                keyframes: [{ percentage: 50, properties: { x: 100 } }],
              },
            },
          ],
        ],
      ]),
    });

    const { host, root, clip, trackHeader, rulerTick, rulerOrigin, playhead } =
      renderTimelineGeometry("clip-1");
    const { trackHeader: collapsedHeader } = getHorizontalGeometry(host, "clip-2", "00:10");
    const diamond = host.querySelector<HTMLElement>(
      '[data-keyframe-group="position"][data-keyframe-percentage="50"]',
    );
    if (!diamond) throw new Error("Missing expanded position keyframe");
    const propertyLane = diamond.closest<HTMLElement>("[data-timeline-property-lane]");
    if (!propertyLane) throw new Error("Missing flat position property lane");
    const headerLane = trackHeader.querySelector<HTMLElement>('[data-property-group="position"]');
    if (!headerLane) throw new Error("Missing position property header");
    // Absolute x rebuilds from the content origin (the ruler-origin spacer),
    // which now insets a GUTTER past the LABEL_COL_W label column so a 0%
    // diamond has room to its left. The content row reaches that same origin via
    // header (LABEL_COL_W) + its gutter margin, so ruler tick and diamond still
    // coincide on the shared time x.
    const contentOrigin = Number.parseFloat(rulerOrigin.style.width);
    const rulerX = contentOrigin + Number.parseFloat(rulerTick.style.left) + 0.5;
    const diamondX =
      contentOrigin +
      Number.parseFloat(propertyLane.style.left) +
      Number.parseFloat(diamond.style.left) +
      Number.parseFloat(diamond.style.width) / 2;

    expect(clip.contains(propertyLane)).toBe(false);
    expect(clip.style.height).toBe(`${TRACK_H - 2 * CLIP_Y}px`);
    expect(clip.style.bottom).toBe("");
    expect(propertyLane.style.top).toBe(`${getTimelineLaneTop(0)}px`);
    expect(propertyLane.style.top).toBe(headerLane.style.top);
    expect(propertyLane.style.background).toBe("");
    expect(propertyLane.style.border).toBe("");
    expect(propertyLane.style.borderRadius).toBe("");
    const treegrid = host.querySelector<HTMLElement>('[role="treegrid"]');
    const semanticRows = treegrid?.querySelectorAll<HTMLElement>('[role="row"]') ?? [];
    expect(treegrid?.getAttribute("aria-rowcount")).toBe("3");
    expect([...semanticRows].map((row) => row.getAttribute("aria-rowindex"))).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(semanticRows[0]?.getAttribute("aria-level")).toBe("1");
    expect(semanticRows[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(semanticRows[1]?.getAttribute("aria-level")).toBe("2");
    expect(semanticRows[1]?.textContent).toContain("position");
    expect(semanticRows[1]?.querySelector('[role="rowheader"]')?.getAttribute("aria-owns")).toBe(
      headerLane.id,
    );
    expect(semanticRows[1]?.querySelector('[role="gridcell"]')?.getAttribute("aria-owns")).toBe(
      propertyLane.id,
    );
    expect(semanticRows[2]?.hasAttribute("aria-expanded")).toBe(false);
    expect(trackHeader.style.width).toBe(`${LABEL_COL_W}px`);
    expect(rulerOrigin.style.width).toBe(`${LABEL_COL_W + GUTTER}px`);
    expect(playhead.style.transform).toBe(
      `translateX(${Math.round(LABEL_COL_W + GUTTER + 1000 - PLAYHEAD_HEAD_W / 2)}px)`,
    );
    expect(diamondX).toBe(rulerX);
    expect(rulerX).toBe(LABEL_COL_W + GUTTER + 1000);
    expect(collapsedHeader.textContent).toContain("Outro");
    expect(getTimelineFitPps(640, 20, LABEL_COL_W + GUTTER)).toBeCloseTo(
      (640 - (LABEL_COL_W + GUTTER) - 2) / (20 * FIT_ZOOM_HEADROOM),
    );
    expect(
      resolveTimelineAssetDrop(
        {
          rectLeft: 100,
          rectTop: 0,
          scrollLeft: 0,
          scrollTop: 0,
          contentOrigin: LABEL_COL_W + GUTTER,
          pixelsPerSecond: 100,
          trackOrder: [0],
        },
        100 + LABEL_COL_W + GUTTER + 1000,
        100,
      ).start,
    ).toBe(10);

    act(() => root.unmount());
  });

  it("renders the public Timeline export without TimelineEditProvider", () => {
    const { root } = renderBasicTimeline();

    act(() => root.unmount());
  });

  // The same assertion, with a group present. It passed on an empty fixture
  // while TimelineGroupRow called the THROWING context hook — one grouped clip
  // and the whole timeline render died, not just the row.
  it("renders without the provider even when a group row is on screen", () => {
    const host = createSizedTimelineHost(640);
    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      elements: [
        {
          id: "voice-1",
          domId: "voice-1",
          tag: "audio",
          start: 0,
          duration: 2,
          track: 0,
          audioGroup: "voiceover",
        },
        {
          id: "voice-2",
          domId: "voice-2",
          tag: "audio",
          start: 2,
          duration: 2,
          track: 1,
          audioGroup: "voiceover",
        },
      ],
    });
    const root = createRoot(host);
    act(() => root.render(React.createElement(Timeline)));

    expect(host.querySelector('[role="treegrid"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("renders the complete track list while row virtualization is gated off", () => {
    const host = createSizedTimelineHost(640);
    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      elements: Array.from({ length: 12 }, (_, track) => ({
        id: `clip-${track}`,
        tag: "div",
        start: 0,
        duration: 2,
        track,
      })),
    });
    const root = createRoot(host);
    act(() => root.render(React.createElement(Timeline)));

    const treegrid = host.querySelector<HTMLElement>('[role="treegrid"]');
    const rows = treegrid?.querySelectorAll('[role="row"]') ?? [];
    expect(rows).toHaveLength(12);
    expect(treegrid?.getAttribute("aria-rowcount")).toBe("12");
    expect(rows[0]?.getAttribute("aria-rowindex")).toBe("1");
    expect(rows[11]?.getAttribute("aria-rowindex")).toBe("12");

    act(() => root.unmount());
  });

  it("renders the gutter without legacy icons or hue dots", () => {
    const { host, root } = renderBasicTimeline();

    const hueDot = Array.from(host.querySelectorAll("div")).find(
      (node) =>
        node.style.width === "6px" &&
        node.style.height === "6px" &&
        node.style.borderRadius === "9999px",
    );

    expect(host.querySelector('img[src^="/icons/timeline/"]')).toBeNull();
    expect(hueDot).toBeUndefined();
    act(() => root.unmount());
  });

  it("requests persisted track visibility from the gutter without seeking", () => {
    const host = createSizedTimelineHost(640);

    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      elements: [{ id: "clip-1", tag: "div", start: 0, duration: 2, track: 0, hidden: true }],
    });

    const onSeek = vi.fn();
    const onToggleTrackHidden = vi.fn();
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(
          TimelineEditProvider,
          { value: { onToggleTrackHidden } },
          React.createElement(Timeline, { onSeek }),
        ),
      );
    });

    // Flush passive effects (ResizeObserver-driven layout) so the gutter row is
    // mounted before we query it.
    act(() => {});

    // "1", not "0": the label carries the 1-based display row, while the
    // callback below still routes by the track's own key.
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Show track 1"]');
    expect(button).not.toBeNull();
    if (!button) throw new Error("Expected a track visibility toggle");

    act(() => {
      button.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 120,
          clientY: 40,
        }),
      );
    });
    expect(onSeek).not.toHaveBeenCalled();

    act(() => {
      button.click();
    });

    // Up from the rowheader rather than counting parents: the header now lays
    // its name and its controls out on two lines, so the button sits one level
    // deeper than it used to.
    const row = button.closest('[role="rowheader"]')?.parentElement;
    // Row children: [TimelineTrackHeader (sticky column), time-mapped content].
    const trackContent = row?.children.item(1);
    expect(onToggleTrackHidden).toHaveBeenCalledWith(0, false, 1);
    expect(trackContent).toBeInstanceOf(HTMLElement);
    if (!(trackContent instanceof HTMLElement)) {
      throw new Error("Expected track content element");
    }
    expect(trackContent.style.opacity).toBe("0.35");

    act(() => root.unmount());
  });

  // An agent writes music alternatives muted; the author unmutes one and must be
  // able to mute it again from the same row.
  it("mutes, unmutes and mutes an audio track again from its header", () => {
    const host = createSizedTimelineHost(640);
    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      elements: [{ id: "music-b", tag: "audio", start: 0, duration: 4, track: 0, hidden: true }],
    });
    const onToggleTrackHidden = vi.fn((track: number, hidden: boolean) => {
      usePlayerStore.setState({
        elements: usePlayerStore
          .getState()
          .elements.map((el) => (el.track === track ? { ...el, hidden } : el)),
      });
    });
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(
          TimelineEditProvider,
          { value: { onToggleTrackHidden } },
          React.createElement(Timeline),
        ),
      );
    });
    act(() => {});

    const press = (label: string) => {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      if (!button) throw new Error(`Expected a "${label}" button`);
      act(() => button.click());
    };
    press("Unmute track 1");
    press("Mute track 1");
    press("Unmute track 1");
    press("Mute track 1");

    expect(onToggleTrackHidden.mock.calls.map((call) => call[1])).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(usePlayerStore.getState().elements[0]?.hidden).toBe(true);
    act(() => root.unmount());
  });

  it("splits all tracks once when shift-clicking the timeline with the razor", () => {
    const host = createSizedTimelineHost(640);
    usePlayerStore.setState({
      activeTool: "razor",
      duration: 4,
      timelineReady: true,
      elements: [{ id: "clip-1", tag: "div", start: 0, duration: 2, track: 0 }],
    });

    const onRazorSplitAll = vi.fn();
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(
          TimelineEditProvider,
          { value: { onRazorSplitAll } },
          React.createElement(Timeline),
        ),
      );
    });

    const viewport = host.querySelector<HTMLElement>("[data-timeline-scroll-viewport]");
    expect(viewport).not.toBeNull();
    act(() => {
      viewport?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 240,
          shiftKey: true,
        }),
      );
    });

    expect(onRazorSplitAll).toHaveBeenCalledTimes(1);
    expect(onRazorSplitAll).toHaveBeenCalledWith(expect.any(Number));
    act(() => root.unmount());
  });

  it("opens the keyframe context menu without seeking to that keyframe", () => {
    const host = createSizedTimelineHost(720);

    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      currentTime: 0.25,
      selectedElementId: "clip-1",
      elements: [{ id: "clip-1", tag: "div", start: 0, duration: 4, track: 0 }],
      keyframeCache: new Map([
        [
          "clip-1",
          {
            format: "percentage",
            keyframes: [{ percentage: 50, properties: { x: 100 }, tweenPercentage: 50 }],
          },
        ],
      ]),
    });

    const onSeek = vi.fn();
    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(Timeline, { onSeek }));
    });

    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 120,
          clientY: 40,
        }),
      );
    });

    expect(onSeek).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("shows a disclosure only for grouped keyframes and toggles the track height", () => {
    const host = createSizedTimelineHost(720);

    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      elements: [
        { id: "clip-1", tag: "div", start: 0, duration: 2, track: 0 },
        { id: "clip-2", tag: "div", start: 2, duration: 2, track: 1 },
      ],
      keyframeCache: new Map([
        [
          "clip-1",
          {
            format: "percentage",
            keyframes: [
              { percentage: 0, properties: { x: 0 }, propertyGroup: "position" },
              { percentage: 50, properties: { x: 100 }, propertyGroup: "position" },
              { percentage: 100, properties: { opacity: 0 }, propertyGroup: "visual" },
            ],
          },
        ],
      ]),
      gsapAnimations: new Map([
        [
          "clip-1",
          [
            {
              id: "clip-1-position",
              targetSelector: "#clip-1",
              method: "to",
              position: 0,
              duration: 2,
              properties: {},
              propertyGroup: "position",
              keyframes: {
                format: "percentage",
                keyframes: [
                  { percentage: 0, properties: { x: 0 } },
                  { percentage: 50, properties: { x: 100 } },
                ],
              },
            },
            {
              id: "clip-1-visual",
              targetSelector: "#clip-1",
              method: "to",
              position: 0,
              duration: 2,
              properties: {},
              propertyGroup: "visual",
              keyframes: {
                format: "percentage",
                keyframes: [{ percentage: 100, properties: { opacity: 0 } }],
              },
            },
          ],
        ],
      ]),
    });

    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(Timeline));
    });

    // Keyframed clip-1 is expanded by default (AE/Figma default); its disclosure
    // lives in the left column. clip-2 has no keyframes so it never shows one.
    const collapseButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Hide clip-1 lanes"]',
    );
    expect(collapseButton).not.toBeNull();
    expect(host.querySelector('button[aria-label="Show clip-2 lanes"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Hide clip-2 lanes"]')).toBeNull();

    const clip = host.querySelector<HTMLElement>('[data-el-id="clip-1"]');
    const row = trackContentOf(clip)?.parentElement;
    expectTrackExpansion(row, ["clip-1"], TRACK_H + 2 * LANE_H);

    // Collapsing sticks (does not bounce back open via auto-expand).
    act(() => collapseButton?.click());
    expectTrackExpansion(row, [], TRACK_H);

    const expandButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Show clip-1 lanes"]',
    );
    expect(expandButton).not.toBeNull();
    act(() => expandButton?.click());
    expectTrackExpansion(row, ["clip-1"], TRACK_H + 2 * LANE_H);
    act(() => root.unmount());
  });

  // The caret belongs to the row, not to whichever clip on it is selected: the
  // automation lanes below it are the track's, shared per property. Toggling one
  // clip left the row's state depending on the selection, and a collapse that
  // only dropped the active clip left the row stuck open.
  it("expands and collapses every clip on a shared track together", () => {
    const { host, root } = renderSharedAutomationTimeline();

    const row = trackContentOf(
      host.querySelector<HTMLElement>('[data-el-id="narration-1"]'),
    )?.parentElement;
    // A row of several clips is named for the track, so the caret is too.
    const caret = () => host.querySelector<HTMLButtonElement>('button[aria-label$=" lanes"]');
    expect(caret()?.getAttribute("aria-label")).toBe("Show Track 1 lanes");

    act(() => caret()?.click());
    // One shared volume row, and BOTH clips hold it open.
    expectTrackExpansion(row, ["narration-1", "narration-2"], TRACK_H + AUTOMATION_LANE_H);

    // Every clip bar on the row is capped to one track height. Only the clip
    // owning the property lanes used to be, so its siblings stretched the whole
    // expanded row and painted their waveforms over the envelopes below.
    expect(
      ["narration-1", "narration-2"].map(
        (id) => host.querySelector<HTMLElement>(`[data-el-id="${id}"]`)?.style.height,
      ),
    ).toEqual([`${TRACK_H - 2 * CLIP_Y}px`, `${TRACK_H - 2 * CLIP_Y}px`]);

    act(() => caret()?.click());
    expectTrackExpansion(row, [], TRACK_H);
    act(() => root.unmount());
  });

  // The lanes are the row's, and selecting a clip must not rebuild them. They
  // used to hang off the active clip's property lanes, so clicking a sibling
  // moved the whole subtree into a different element and remounted every lane —
  // which threw away each one's hover state and any gesture in flight. Pressing
  // a lane to select its clip therefore made the handles vanish under the
  // pointer, which is the one gesture the read-only lane exists to support.
  it("keeps the automation lanes mounted when the selection moves along the row", () => {
    const { host, root } = renderSharedAutomationTimeline("narration-2");
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label$=" lanes"]')?.click());

    const before = [...host.querySelectorAll(".hf-automation-lane")];
    expect(before).toHaveLength(2);

    act(() => usePlayerStore.setState({ selectedElementId: "narration-1" }));

    // Identity, not deep equality: a remount produces structurally identical
    // nodes, so only `toBe` can tell the two apart.
    const after = [...host.querySelectorAll(".hf-automation-lane")];
    expect(after).toHaveLength(before.length);
    after.forEach((node, index) => expect(node).toBe(before[index]));
    act(() => root.unmount());
  });

  it("marks every clip in selectedElementIds as selected", () => {
    const host = createSizedTimelineHost(720);

    usePlayerStore.setState({
      duration: 6,
      timelineReady: true,
      selectedElementId: "clip-2",
      selectedElementIds: new Set(["clip-1", "clip-2"]),
      elements: [
        { id: "clip-1", tag: "div", start: 0, duration: 1, track: 0 },
        { id: "clip-2", tag: "div", start: 1.5, duration: 1, track: 1 },
        { id: "clip-3", tag: "div", start: 3, duration: 1, track: 2 },
      ],
    });

    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(Timeline));
    });

    const selectedClips = host.querySelectorAll(".timeline-clip.is-selected");
    expect(selectedClips).toHaveLength(2);
    expect(host.querySelector('[data-el-id="clip-3"]')?.classList.contains("is-selected")).toBe(
      false,
    );

    act(() => root.unmount());
  });
});

describe("generateTicks", () => {
  it("returns empty arrays for duration <= 0", () => {
    expect(generateTicks(0)).toEqual({ major: [], minor: [] });
    expect(generateTicks(-5)).toEqual({ major: [], minor: [] });
  });

  it("generates ticks for a short duration (3 seconds)", () => {
    const { major } = generateTicks(3);
    expect(major.length).toBeGreaterThan(0);
    expect(major[0]).toBe(0);
    expect(major).toContain(0);
    expect(major).toContain(1);
    expect(major).toContain(2);
    expect(major).toContain(3);
  });

  it("generates ticks for a medium duration (10 seconds)", () => {
    const { major, minor } = generateTicks(10);
    expect(major).toContain(0);
    expect(major).toContain(2);
    expect(major).toContain(4);
    expect(major).toContain(6);
    expect(major).toContain(8);
    expect(major).toContain(10);
    expect(minor).toContain(1);
    expect(minor).toContain(3);
    expect(minor).toContain(5);
  });

  it("generates ticks for a long duration (120 seconds)", () => {
    const { major, minor } = generateTicks(120);
    expect(major).toContain(0);
    expect(major).toContain(30);
    expect(major).toContain(60);
    expect(major).toContain(90);
    expect(major).toContain(120);
    expect(minor).toContain(15);
    expect(minor).toContain(45);
  });

  it("generates ticks for a very long duration (500 seconds)", () => {
    const { major } = generateTicks(500);
    expect(major).toContain(0);
    expect(major).toContain(60);
    expect(major).toContain(120);
  });

  it("major and minor ticks do not overlap", () => {
    const { major, minor } = generateTicks(30);
    for (const t of minor) {
      expect(major).not.toContain(t);
    }
  });

  it("all tick values are non-negative", () => {
    const { major, minor } = generateTicks(60);
    for (const t of [...major, ...minor]) {
      expect(t).toBeGreaterThanOrEqual(0);
    }
  });

  it("major ticks always start at 0", () => {
    for (const d of [1, 5, 10, 30, 60, 120, 300]) {
      const { major } = generateTicks(d);
      expect(major[0]).toBe(0);
    }
  });

  it("uses denser major labels as timeline zoom increases", () => {
    const fitTicks = generateTicks(180, 10);
    const zoomedTicks = generateTicks(180, 48);
    expect(fitTicks.major[1] - fitTicks.major[0]).toBe(10);
    expect(fitTicks.minor).toContain(5);
    expect(zoomedTicks.major[1] - zoomedTicks.major[0]).toBe(2);
    expect(zoomedTicks.minor).toContain(1);
  });

  it("keeps labels readable instead of placing one at every tiny tick", () => {
    const { major } = generateTicks(180, 80);
    expect(major[1] - major[0]).toBe(2);
  });

  it("picks 'nice' NLE steps across zoom levels (no 7s-style intervals)", () => {
    // step = first nice interval whose px spacing >= 88 at that pps.
    const cases: Array<[number, number]> = [
      [2, 60], // 60s * 2pps = 120px
      [10, 10], // 10s * 10pps = 100px
      [20, 5], // 5s * 20pps = 100px
      [50, 2], // 2s * 50pps = 100px
      [100, 1], // 1s * 100pps = 100px
    ];
    for (const [pps, expected] of cases) {
      const { major } = generateTicks(600, pps);
      expect(major[1] - major[0]).toBe(expected);
    }
  });

  it("uses minute/hour steps when zoomed far out instead of colliding 10m labels", () => {
    // 0.05 pps → 600s step would be 30px apart (labels collide); 1800s = 90px.
    const { major } = generateTicks(7200, 0.05);
    expect(major[1] - major[0]).toBe(1800);
    expect(major).toContain(3600);
  });

  it("does not drift on long rulers (ticks are exact multiples of the step)", () => {
    const { major } = generateTicks(600, 100); // 1s step, 601 ticks
    expect(major[599]).toBe(599);
  });

  describe("frame display mode (frameRate provided)", () => {
    it("snaps sub-frame steps up to one whole frame (no duplicate frame labels)", () => {
      // 4400 pps would pick a 0.02s step = 0.6 frames at 30fps → snapped to 1 frame.
      const { major } = generateTicks(2, 4400, 30);
      const frames = major.map((t) => Math.round(t * 30));
      // Frame labels are consecutive integers — no duplicates, no gaps.
      frames.forEach((f, i) => expect(f).toBe(i));
    });

    it("keeps major AND minor ticks on whole frames", () => {
      // 200 pps → 0.5s step (15 frames); quarters (3.75f) are rejected in
      // frame mode in favour of fifths (3f).
      const { major, minor } = generateTicks(20, 200, 30);
      expect(major[1]).toBeCloseTo(0.5);
      expect(minor).toContain(0.1); // 3 frames
      for (const t of [...major, ...minor]) {
        const frames = t * 30;
        expect(Math.abs(frames - Math.round(frames))).toBeLessThan(1e-3);
      }
    });

    it("leaves whole-second steps unchanged", () => {
      const { major } = generateTicks(60, 100, 30);
      expect(major[1] - major[0]).toBe(1);
    });
  });
});

describe("formatTime", () => {
  it("formats 0 seconds as 00:00", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  // fallow-ignore-next-line code-duplication
  it("formats seconds below a minute", () => {
    expect(formatTime(5)).toBe("00:05");
    expect(formatTime(30)).toBe("00:30");
    expect(formatTime(59)).toBe("00:59");
  });

  it("formats exactly one minute", () => {
    expect(formatTime(60)).toBe("01:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(90)).toBe("01:30");
    expect(formatTime(125)).toBe("02:05");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(5.7)).toBe("00:05");
    expect(formatTime(59.9)).toBe("00:59");
    expect(formatTime(90.5)).toBe("01:30");
  });

  it("handles large values", () => {
    expect(formatTime(600)).toBe("10:00");
    expect(formatTime(3661)).toBe("61:01");
  });

  it("zero-pads minutes and seconds to two digits", () => {
    expect(formatTime(1)).toBe("00:01");
    expect(formatTime(9)).toBe("00:09");
    expect(formatTime(61)).toBe("01:01");
  });
});

describe("formatTimelineTickLabel", () => {
  it("uses minute-second labels for normal timeline intervals", () => {
    expect(formatTimelineTickLabel(90, 180, 5)).toBe("01:30");
  });

  it("uses hour labels for long timelines", () => {
    expect(formatTimelineTickLabel(3661, 4000, 60)).toBe("1:01:01");
  });

  it("shows subsecond labels when the major ruler interval is below one second", () => {
    expect(formatTimelineTickLabel(1.5, 3, 0.5)).toBe("00:01.5");
  });
});

describe("shouldAutoScrollTimeline", () => {
  it("never auto-scrolls in fit mode", () => {
    expect(shouldAutoScrollTimeline("fit", 1200, 800)).toBe(false);
  });

  it("does not auto-scroll when there is no horizontal overflow", () => {
    expect(shouldAutoScrollTimeline("manual", 800, 800)).toBe(false);
    expect(shouldAutoScrollTimeline("manual", 800.5, 800)).toBe(false);
  });

  it("auto-scrolls in manual mode when horizontal overflow exists", () => {
    expect(shouldAutoScrollTimeline("manual", 1200, 800)).toBe(true);
  });
});

describe("getTimelineFitPps (fit headroom, 60s floor only without a duration)", () => {
  const viewport = 632; // usable width = 632 - GUTTER - TRACKS_LEFT_PAD - 2

  it("fits a short film to the width, not to a 60s ruler", () => {
    const usable = viewport - (GUTTER + TRACKS_LEFT_PAD) - 2;
    const pps = getTimelineFitPps(viewport, 17, GUTTER + TRACKS_LEFT_PAD);
    expect(17 * pps).toBeCloseTo(usable / FIT_ZOOM_HEADROOM);
  });

  it("fits duration * FIT_ZOOM_HEADROOM (not the bare duration) for long compositions", () => {
    expect(getTimelineFitPps(viewport, 60, GUTTER + TRACKS_LEFT_PAD)).toBeCloseTo(
      (viewport - (GUTTER + TRACKS_LEFT_PAD) - 2) / (60 * FIT_ZOOM_HEADROOM),
    );
    expect(getTimelineFitPps(viewport, 120, GUTTER + TRACKS_LEFT_PAD)).toBeCloseTo(
      (viewport - (GUTTER + TRACKS_LEFT_PAD) - 2) / (120 * FIT_ZOOM_HEADROOM),
    );
  });

  it("subtracts the expanded keyframe label column before fitting headroom", () => {
    expect(getTimelineFitPps(viewport, 120, LABEL_COL_W)).toBeCloseTo(
      (viewport - LABEL_COL_W - 2) / (120 * FIT_ZOOM_HEADROOM),
    );
  });

  it("leaves CapCut-style trailing headroom: the comp ends at 1/1.2 of the usable width", () => {
    const usable = viewport - (GUTTER + TRACKS_LEFT_PAD) - 2;
    const pps = getTimelineFitPps(viewport, 120, GUTTER + TRACKS_LEFT_PAD);
    // Composition content occupies usable/1.2 px; the remaining ~17% is empty
    // droppable ruler/lane surface past the end.
    expect(120 * pps).toBeCloseTo(usable / FIT_ZOOM_HEADROOM);
    expect(120 * pps).toBeLessThan(usable);
  });

  it("falls back to 100 pps before the viewport is measured", () => {
    expect(getTimelineFitPps(0, 10, GUTTER)).toBe(100);
    expect(getTimelineFitPps(GUTTER, 10, GUTTER)).toBe(100);
    expect(getTimelineFitPps(Number.NaN, 10, GUTTER)).toBe(100);
  });

  it("uses the floor for zero/invalid durations", () => {
    expect(getTimelineFitPps(viewport, 0, GUTTER + TRACKS_LEFT_PAD)).toBeCloseTo(
      (viewport - (GUTTER + TRACKS_LEFT_PAD) - 2) / MIN_TIMELINE_EXTENT_S,
    );
    expect(getTimelineFitPps(viewport, Number.NaN, GUTTER + TRACKS_LEFT_PAD)).toBeCloseTo(
      (viewport - (GUTTER + TRACKS_LEFT_PAD) - 2) / MIN_TIMELINE_EXTENT_S,
    );
  });
});

describe("getTimelineDisplayContentWidth", () => {
  it("spans MIN_TIMELINE_EXTENT_S seconds while the duration is unknown", () => {
    expect(
      getTimelineDisplayContentWidth({
        effectiveDuration: 0,
        viewportWidth: 400,
        contentOrigin: GUTTER,
        pps: 20,
      }),
    ).toBe(MIN_TIMELINE_EXTENT_S * 20);
  });

  it("renders a short film at fit exactly as wide as the viewport, so fit never scrolls", () => {
    const viewport = 632;
    const origin = GUTTER + TRACKS_LEFT_PAD;
    const pps = getTimelineFitPps(viewport, 17, origin);
    expect(
      getTimelineDisplayContentWidth({
        effectiveDuration: 17,
        viewportWidth: viewport,
        contentOrigin: origin,
        pps,
      }),
    ).toBeCloseTo(viewport - origin - 2);
  });

  it("still fills the viewport when that is larger than the fit span", () => {
    expect(
      getTimelineDisplayContentWidth({
        effectiveDuration: 40,
        viewportWidth: 2000,
        contentOrigin: GUTTER + TRACKS_LEFT_PAD,
        pps: 5,
      }),
    ).toBe(2000 - (GUTTER + TRACKS_LEFT_PAD) - 2);
  });

  it("tracks a drag ghost past every other bound (drag-to-extend)", () => {
    expect(
      getTimelineDisplayContentWidth({
        effectiveDuration: 100,
        viewportWidth: 400,
        contentOrigin: GUTTER,
        pps: 5,
        dragGhostEndPx: 5000,
      }),
    ).toBe(5000);
  });

  it("tracks a resize (trim) ghost past every other bound (trim-to-extend)", () => {
    expect(
      getTimelineDisplayContentWidth({
        effectiveDuration: 100,
        viewportWidth: 400,
        contentOrigin: GUTTER,
        pps: 5,
        resizeGhostEndPx: 4200,
      }),
    ).toBe(4200);
  });

  it("keeps the fit headroom past the end when zoomed in", () => {
    expect(
      getTimelineDisplayContentWidth({
        effectiveDuration: 180,
        viewportWidth: 400,
        contentOrigin: GUTTER,
        pps: 50,
      }),
    ).toBeCloseTo(180 * FIT_ZOOM_HEADROOM * 50);
  });
});

describe("getTimelineScrollLeftForZoomTransition", () => {
  it("resets horizontal scroll when switching from manual zoom back to fit", () => {
    expect(getTimelineScrollLeftForZoomTransition("manual", "fit", 480)).toBe(0);
  });

  it("resets horizontal scroll whenever the next zoom mode is fit", () => {
    expect(getTimelineScrollLeftForZoomTransition("fit", "fit", 480)).toBe(0);
    expect(getTimelineScrollLeftForZoomTransition(null, "fit", 480)).toBe(0);
  });

  it("preserves the current scroll offset for manual zoom transitions", () => {
    expect(getTimelineScrollLeftForZoomTransition("fit", "manual", 480)).toBe(480);
    expect(getTimelineScrollLeftForZoomTransition("manual", "manual", 480)).toBe(480);
  });
});

describe("getTimelineScrollLeftForZoomAnchor", () => {
  it("preserves the time under the pointer when zooming in", () => {
    expect(
      getTimelineScrollLeftForZoomAnchor({
        pointerX: 300,
        currentScrollLeft: 200,
        contentOrigin: GUTTER,
        currentPixelsPerSecond: 10,
        nextPixelsPerSecond: 20,
        duration: 120,
      }),
    ).toBe(668);
  });

  it("clamps negative scroll targets", () => {
    expect(
      getTimelineScrollLeftForZoomAnchor({
        pointerX: 300,
        currentScrollLeft: 0,
        contentOrigin: GUTTER,
        currentPixelsPerSecond: 20,
        nextPixelsPerSecond: 5,
        duration: 120,
      }),
    ).toBe(0);
  });

  it("preserves current scroll when inputs are invalid", () => {
    expect(
      getTimelineScrollLeftForZoomAnchor({
        pointerX: 300,
        currentScrollLeft: 120,
        contentOrigin: GUTTER,
        currentPixelsPerSecond: 0,
        nextPixelsPerSecond: 20,
        duration: 120,
      }),
    ).toBe(120);
  });
});

describe("getTimelinePlayheadLeft", () => {
  it("offsets the wrapper by half the head width so the line CENTER = contentOrigin + t*pps", () => {
    // Wrapper left + PLAYHEAD_HEAD_W/2 (where the 1px line is centered) must
    // equal contentOrigin + t*pps at any zoom, for both the padded default
    // origin and the plain gutter origin.
    expect(getTimelinePlayheadLeft(4, 20, GUTTER + TRACKS_LEFT_PAD) + PLAYHEAD_HEAD_W / 2).toBe(
      GUTTER + TRACKS_LEFT_PAD + 4 * 20,
    );
    expect(getTimelinePlayheadLeft(10, 7.5, GUTTER + TRACKS_LEFT_PAD) + PLAYHEAD_HEAD_W / 2).toBe(
      GUTTER + TRACKS_LEFT_PAD + 75,
    );
    expect(getTimelinePlayheadLeft(4, 20, GUTTER) + PLAYHEAD_HEAD_W / 2).toBe(GUTTER + 4 * 20);
    expect(getTimelinePlayheadLeft(10, 7.5, GUTTER) + PLAYHEAD_HEAD_W / 2).toBe(GUTTER + 75);
  });

  it("uses the expanded keyframe label column as the playhead origin", () => {
    expect(getTimelinePlayheadLeft(4, 20, LABEL_COL_W) + PLAYHEAD_HEAD_W / 2).toBe(
      LABEL_COL_W + 4 * 20,
    );
  });

  it("centers the line exactly on the left pad's end (the 00:00 tick) at t = 0", () => {
    expect(getTimelinePlayheadLeft(0, 20, GUTTER + TRACKS_LEFT_PAD) + PLAYHEAD_HEAD_W / 2).toBe(
      GUTTER + TRACKS_LEFT_PAD,
    );
  });

  it("centers the line exactly on the gutter (the 00:00 tick) at t = 0", () => {
    expect(getTimelinePlayheadLeft(0, 20, GUTTER) + PLAYHEAD_HEAD_W / 2).toBe(GUTTER);
  });

  it("guards invalid input", () => {
    expect(getTimelinePlayheadLeft(Number.NaN, 20, GUTTER + TRACKS_LEFT_PAD)).toBe(
      GUTTER + TRACKS_LEFT_PAD - PLAYHEAD_HEAD_W / 2,
    );
    expect(getTimelinePlayheadLeft(4, Number.NaN, GUTTER + TRACKS_LEFT_PAD)).toBe(
      GUTTER + TRACKS_LEFT_PAD - PLAYHEAD_HEAD_W / 2,
    );
    expect(getTimelinePlayheadLeft(Number.NaN, 20, GUTTER)).toBe(GUTTER - PLAYHEAD_HEAD_W / 2);
    expect(getTimelinePlayheadLeft(4, Number.NaN, LABEL_COL_W)).toBe(
      LABEL_COL_W - PLAYHEAD_HEAD_W / 2,
    );
  });
});

describe("getTimelinePlaybackFollowScrollLeft", () => {
  it("holds the viewport still while the playhead remains inside the comfort area", () => {
    expect(
      getTimelinePlaybackFollowScrollLeft({
        playheadX: 700,
        currentScrollLeft: 100,
        viewportWidth: 1000,
        contentOrigin: 264,
        maxScrollLeft: 2000,
      }),
    ).toBe(100);
  });

  it("follows forward playback at the right-side comfort line", () => {
    expect(
      getTimelinePlaybackFollowScrollLeft({
        playheadX: 1200,
        currentScrollLeft: 100,
        viewportWidth: 1000,
        contentOrigin: 264,
        maxScrollLeft: 2000,
      }),
    ).toBe(384);
  });

  it("returns to the matching earlier viewport after a playback loop", () => {
    expect(
      getTimelinePlaybackFollowScrollLeft({
        playheadX: 264,
        currentScrollLeft: 900,
        viewportWidth: 1000,
        contentOrigin: 264,
        maxScrollLeft: 2000,
      }),
    ).toBe(0);
  });

  it("clamps at the end of the scrollable timeline", () => {
    expect(
      getTimelinePlaybackFollowScrollLeft({
        playheadX: 5000,
        currentScrollLeft: 100,
        viewportWidth: 1000,
        contentOrigin: 264,
        maxScrollLeft: 1500,
      }),
    ).toBe(1500);
  });
});

describe("getTimelineCanvasHeight", () => {
  it("includes bottom scroll buffer below the last track", () => {
    expect(getTimelineCanvasHeight([TRACK_H, TRACK_H, TRACK_H])).toBeGreaterThan(
      RULER_H + 3 * TRACK_H,
    );
  });

  it("still keeps ruler space when there are no tracks", () => {
    expect(getTimelineCanvasHeight([])).toBeGreaterThan(24);
  });
});

describe("shouldShowTimelineShortcutHint", () => {
  it("shows the hint when the timeline does not vertically overflow", () => {
    expect(shouldShowTimelineShortcutHint(220, 220)).toBe(true);
    expect(shouldShowTimelineShortcutHint(220.5, 220)).toBe(true);
  });

  it("hides the hint when timeline tracks need vertical scrolling", () => {
    expect(shouldShowTimelineShortcutHint(221.5, 220)).toBe(false);
  });
});

describe("getDefaultDroppedTrack", () => {
  it("defaults to track 0 when there are no rows yet", () => {
    expect(getDefaultDroppedTrack([])).toBe(0);
  });

  it("creates a new bottom track when dropped below existing rows", () => {
    expect(getDefaultDroppedTrack([0, 1, 5], 10)).toBe(6);
  });
});

describe("resolveTimelineAssetDrop", () => {
  it("maps drop coordinates to a start time and visible track", () => {
    expect(
      resolveTimelineAssetDrop(
        {
          rectLeft: 100,
          rectTop: 200,
          scrollLeft: 0,
          scrollTop: 0,
          contentOrigin: GUTTER,
          pixelsPerSecond: 100,
          trackHeight: 72,
          trackOrder: [0, 3, 7],
        },
        432, // rectLeft(100) + GUTTER(32) + 3s*100pps  (contentOrigin = GUTTER)
        // clientY: rectTop(200) + the middle of row 1 → track 3.
        200 + getTimelineRowTop(1) + TRACK_H / 2,
      ),
    ).toEqual({ start: 3, track: 3 });
  });

  it("can create a new bottom track when dropped below the last visible row", () => {
    expect(
      resolveTimelineAssetDrop(
        {
          rectLeft: 100,
          rectTop: 200,
          scrollLeft: 0,
          scrollTop: 0,
          contentOrigin: GUTTER,
          pixelsPerSecond: 100,
          trackHeight: 72,
          trackOrder: [0, 3, 7],
        },
        250, // rectLeft(100) + GUTTER(32) + 1.18s*100pps  (contentOrigin = GUTTER)
        600,
      ),
    ).toEqual({ start: 1.18, track: 8 });
  });
});

describe("rulerTickText", () => {
  it("counts frames at the rate the ticks were laid out at", () => {
    expect(rulerTickText(2, 25, 10, 1)).toBe(50);
    expect(rulerTickText(2, 30_000 / 1_001, 10, 1)).toBe(60);
  });

  it("shows time when the ruler is not counting frames", () => {
    expect(rulerTickText(2, undefined, 10, 1)).toBe("00:02");
  });
});
