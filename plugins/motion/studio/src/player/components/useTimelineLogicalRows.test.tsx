// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import { useTimelineLogicalRows } from "./useTimelineLogicalRows";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const tracks = Array.from(
  { length: 1_000 },
  (_, track) =>
    [
      track,
      [{ id: `clip-${track}`, tag: "div", track, start: track, duration: 1 }],
    ] as const satisfies readonly [number, readonly TimelineElement[]],
);
const displayTrackOrder = tracks.map(([track]) => track);
const laneCounts = new Map<string, number>();
const selectedElementIds = new Set<string>();
const expandedClipIds = new Set<string>();
const collapsedGroupIds = new Set<string>();
const expandedLaneOwnerIds = new Set<string>();
const groups: never[] = [];
const trackGroupOf = new Map();
const gsapAnimations = new Map();

function Harness({ snapshots }: { snapshots: Array<readonly TimelineLogicalRow[]> }) {
  usePlayerStore((state) => state.requestedSeekTime);
  const logicalRows = useTimelineLogicalRows({
    tracks,
    displayTrackOrder,
    laneCounts,
    selectedElementId: null,
    selectedElementIds,
    expandedClipIds,
    collapsedGroupIds,
    expandedLaneOwnerIds,
    groups,
    trackGroupOf,
    gsapAnimations,
  });
  snapshots.push(logicalRows);
  return null;
}

afterEach(() => usePlayerStore.getState().reset());

describe("useTimelineLogicalRows", () => {
  it("preserves the dense logical model across an unrelated store update", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const snapshots: Array<readonly TimelineLogicalRow[]> = [];
    act(() => root.render(<Harness snapshots={snapshots} />));
    const first = snapshots.at(-1);

    act(() => usePlayerStore.setState({ requestedSeekTime: 1 }));

    expect(snapshots.at(-1)).toBe(first);
    act(() => root.unmount());
  });
});
