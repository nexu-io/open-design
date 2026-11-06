// @vitest-environment happy-dom

/**
 * Row derivation for audio groups.
 *
 * This ran behind the `audio-groups` canary at 0% until the rollout, so it had
 * never executed in the enabled state in any suite — the off-cohort branch
 * returned raw tracks and stopped. Now it reorders rows and emits synthetic
 * anchor rows for every user, which is exactly the pair of invariants pinned
 * here: an ungrouped project is untouched, and a group's members become
 * contiguous under an anchor at `memberTracks[0] - 0.5`.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { displayTrackOrder, useTimelineTrackDerivations } from "./useTimelineTrackDerivations";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  usePlayerStore.getState().reset();
});

function clip(id: string, track: number, extra: Partial<TimelineElement> = {}): TimelineElement {
  return { id, label: id, tag: "audio", start: 0, duration: 1, track, ...extra };
}

function derive(elements: TimelineElement[]): ReturnType<typeof useTimelineTrackDerivations> {
  let result: ReturnType<typeof useTimelineTrackDerivations> | undefined;
  function Probe() {
    result = useTimelineTrackDerivations(elements);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(React.createElement(Probe)));
  act(() => root.unmount());
  if (!result) throw new Error("derivations did not render");
  return result;
}

describe("useTimelineTrackDerivations", () => {
  it("leaves an ungrouped project in raw ascending order", () => {
    const { tracks, groups, trackGroupOf } = derive([clip("b", 2), clip("a", 0), clip("c", 1)]);

    expect(tracks.map(([track]) => track)).toEqual([0, 1, 2]);
    expect(tracks.map(([, els]) => els.map((el) => el.id))).toEqual([["a"], ["c"], ["b"]]);
    expect(groups).toEqual([]);
    expect(trackGroupOf.size).toBe(0);
  });

  // The reordering case: track 1 sits between the group's two members in raw
  // order and must not be dragged into the group.
  it("pulls interleaved members contiguous under a synthetic anchor row", () => {
    const { tracks, groups, trackGroupOf } = derive([
      clip("vo-1", 0, { audioGroup: "voiceover", audioGroupLabel: "Voiceover" }),
      clip("music", 1),
      clip("vo-2", 2, { audioGroup: "voiceover" }),
    ]);

    // Anchor immediately above the lowest member, then both members, then the
    // ungrouped track keeps its own position after them.
    expect(tracks.map(([track]) => track)).toEqual([-0.5, 0, 2, 1]);
    // The anchor row owns no clips of its own.
    expect(tracks[0]?.[1]).toEqual([]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "voiceover",
      label: "Voiceover",
      anchorKey: -0.5,
      memberTracks: [0, 2],
    });

    expect(trackGroupOf.get(0)?.id).toBe("voiceover");
    expect(trackGroupOf.get(2)?.id).toBe("voiceover");
    expect(trackGroupOf.has(1)).toBe(false);
  });

  it("carries the group element's own label, volume and mute onto the row", () => {
    const { groups } = derive([
      clip("vo-1", 3, {
        audioGroup: "vo",
        audioGroupLabel: "VO bus",
        audioGroupVolume: 0.5,
        audioGroupHidden: true,
      }),
    ]);

    expect(groups[0]).toMatchObject({
      label: "VO bus",
      anchorKey: 2.5,
      volume: 0.5,
      hidden: true,
    });
  });

  it("falls back to the group id and unity volume when the bus carries neither", () => {
    const { groups } = derive([clip("sfx-1", 0, { audioGroup: "sfx" })]);
    expect(groups[0]).toMatchObject({ id: "sfx", label: "sfx", volume: 1, hidden: false });
  });

  it("gives hosts the drawn row order, members left out while their group is collapsed", () => {
    const elements = [
      clip("vo-1", 0, { audioGroup: "voiceover" }),
      clip("music", 1),
      clip("vo-2", 2, { audioGroup: "voiceover" }),
    ];
    expect(displayTrackOrder(elements, new Set())).toEqual(derive(elements).trackOrder);

    usePlayerStore.setState({ collapsedGroupIds: new Set(["voiceover"]) });
    expect(derive(elements).trackOrder).toEqual([-0.5, 1]);
    expect(displayTrackOrder(elements, new Set(["voiceover"]))).toEqual([-0.5, 1]);
  });
});
