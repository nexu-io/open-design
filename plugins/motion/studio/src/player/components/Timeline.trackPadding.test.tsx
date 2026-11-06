// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { installTimelineMountEnv } from "./timelineMountTestEnv";
import { usePlayerStore } from "../store/playerStore";
import { CLIP_Y, RULER_H, TRACK_H, TRACKS_BOTTOM_PAD, TRACKS_TOP_PAD } from "./timelineLayout";
import {
  mountThreeTrackTimeline,
  dragTimelineFixtureAsset,
  pointerTimelineFixture as pointer,
} from "./timelineMountFixtures";
import type { TimelineProps } from "./TimelineTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

afterEach(() => {
  document.body.innerHTML = "";
});

async function mountCanvas(trackPadding?: TimelineProps["trackPadding"]) {
  usePlayerStore.setState({
    duration: 10,
    currentTime: 0,
    timelineReady: true,
    gsapAnimations: new Map(),
    elements: [{ id: "card", label: "Card", tag: "div", start: 0, duration: 4, track: 0 }],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Timeline trackPadding={trackPadding} />));
  const canvas = Array.from(host.querySelectorAll<HTMLElement>("div.relative")).find(
    (el) => el.style.height && el.style.width,
  );
  const height = canvas?.style.height;
  const firstRowTop = host.querySelector<HTMLElement>('[data-timeline-row="0"]')?.style.top;
  act(() => root.unmount());
  return { height, firstRowTop };
}

describe("Timeline trackPadding", () => {
  it("keeps Studio's pads by default", async () => {
    expect(await mountCanvas()).toEqual({
      height: `${RULER_H + TRACKS_TOP_PAD + TRACK_H + TRACKS_BOTTOM_PAD}px`,
      firstRowTop: `${RULER_H + TRACKS_TOP_PAD}px`,
    });
  });

  it("places the first row and sizes the canvas from the host's pads", async () => {
    expect(await mountCanvas({ top: 0, bottom: TRACK_H })).toEqual({
      height: `${RULER_H + 2 * TRACK_H}px`,
      firstRowTop: `${RULER_H}px`,
    });
  });

  // With no top pad, y = 96 is the middle of row 1; any reader still on the default pad sees row 0.
  const ROW1_MID = RULER_H + TRACK_H + TRACK_H / 2;
  const hostPads = { top: 0, bottom: TRACK_H };

  async function mountThreeTracks(props: TimelineProps = {}) {
    return mountThreeTrackTimeline({ trackPadding: hostPads, ...props });
  }

  const top = (el: Element | null | undefined) => (el as HTMLElement | null)?.style.top;

  it("draws the gap strip, drop preview and insert line, and drops, on the host's rows", async () => {
    const onAssetDrop = vi.fn();
    const { host, root, viewport } = await mountThreeTracks({ onAssetDrop });
    act(() => usePlayerStore.getState().setSelectedElementId("c1"));
    expect(top(host.querySelector('[style*="--timeline-accent-faint"]'))).toBe(
      `${RULER_H + TRACK_H + CLIP_Y}px`,
    );

    const drag = (type: string, clientY: number) =>
      dragTimelineFixtureAsset(viewport, type, clientY);
    drag("dragover", ROW1_MID);
    expect(top(host.querySelector('[data-testid="timeline-drop-preview"]'))).toBe(
      `${RULER_H + TRACK_H + CLIP_Y}px`,
    );
    drag("dragover", RULER_H / 2);
    expect(top(host.querySelector('[data-testid="timeline-insert-line"]'))).toBe(
      `${RULER_H - 0.5}px`,
    );
    drag("drop", ROW1_MID);
    expect(onAssetDrop).toHaveBeenCalledWith("a.png", expect.objectContaining({ track: 1 }));
    act(() => root.unmount());
  });

  it("drags a clip onto the host's rows and opens a new track in the bottom pad", async () => {
    const { host, root } = await mountThreeTracks({
      onMoveElement: vi.fn(),
      onResizeElement: vi.fn(),
    });
    const clip = host.querySelector('[data-clip][data-el-id="c0"]')!;
    pointer(clip, "pointerdown", RULER_H + TRACK_H / 2);
    pointer(window, "pointermove", ROW1_MID);
    const ghost = host.querySelector<HTMLElement>('[data-testid="timeline-drag-landing"]');
    expect(top(ghost)).toBe(`${RULER_H + TRACK_H + CLIP_Y}px`);
    pointer(window, "pointermove", RULER_H + 3 * TRACK_H + TRACK_H / 2);
    const lane = host.querySelector<HTMLElement>("[data-timeline-new-track-lane]");
    expect(top(lane)).toBe(`${RULER_H + 3 * TRACK_H}px`);
    expect(lane?.style.height).toBe(`${TRACK_H}px`);
    act(() => root.unmount());
  });
});
