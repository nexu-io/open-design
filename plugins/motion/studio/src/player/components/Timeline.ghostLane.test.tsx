// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountThreeTrackTimeline as mountThreeTracks,
  dragTimelineFixtureAsset,
  pointerTimelineFixture as pointer,
} from "./timelineMountFixtures";
import { installTimelineMountEnv } from "./timelineMountTestEnv";
import { CLIP_Y, TRACK_H, getTimelineRowTop } from "./timelineLayout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

afterEach(() => {
  document.body.innerHTML = "";
});

const GHOST_MID = getTimelineRowTop(3) + TRACK_H / 2;
const ROW1_MID = getTimelineRowTop(1) + TRACK_H / 2;

describe("Timeline ghost lane", () => {
  it("draws one empty track below the last with a drop hint", async () => {
    const { root, ghost } = await mountThreeTracks({ onAssetDrop: vi.fn() });
    expect(ghost()?.textContent).toBe("Drop media here");
    expect(ghost()?.getAttribute("aria-hidden")).toBe("true");
    expect(ghost()?.style.top).toBe(`${getTimelineRowTop(3) + CLIP_Y}px`);
    expect(ghost()?.dataset.active).toBeUndefined();
    act(() => root.unmount());
  });

  it("drops the hint without a drop handler and the lane without a bottom pad", async () => {
    const readOnly = await mountThreeTracks();
    expect(readOnly.ghost()?.textContent).toBe("");
    act(() => readOnly.root.unmount());
    const unpadded = await mountThreeTracks({ trackPadding: { bottom: 0 } });
    expect(unpadded.ghost()).toBeNull();
    act(() => unpadded.root.unmount());
  });

  it("lights up under a file dragged into it and opens a new track on drop", async () => {
    const onAssetDrop = vi.fn();
    const { host, root, ghost } = await mountThreeTracks({ onAssetDrop });
    const viewport = host.querySelector<HTMLElement>("[data-timeline-scroll-viewport]")!;
    const drag = (type: string, clientY: number) =>
      dragTimelineFixtureAsset(viewport, type, clientY);
    drag("dragover", ROW1_MID);
    expect(ghost()?.dataset.active).toBeUndefined();
    drag("dragover", GHOST_MID);
    expect(ghost()?.dataset.active).toBe("true");
    drag("drop", GHOST_MID);
    expect(onAssetDrop).toHaveBeenCalledWith("a.png", expect.objectContaining({ track: 3 }));
    act(() => root.unmount());
  });

  it.each([0, 2])("lights up under clip c%i dragged into it", async (track) => {
    const { host, root, ghost } = await mountThreeTracks({
      onMoveElement: vi.fn(),
      onResizeElement: vi.fn(),
    });
    const clipMid = getTimelineRowTop(track) + TRACK_H / 2;
    pointer(host.querySelector(`[data-clip][data-el-id="c${track}"]`)!, "pointerdown", clipMid);
    pointer(window, "pointermove", ROW1_MID);
    expect(ghost()?.dataset.active).toBeUndefined();
    pointer(window, "pointermove", GHOST_MID);
    expect(ghost()?.dataset.active).toBe("true");
    // Dragging the last track's clip adds a preview row; the lane must stay under the pointer.
    expect(ghost()?.style.top).toBe(`${getTimelineRowTop(3) + CLIP_Y}px`);
    act(() => root.unmount());
  });
});
