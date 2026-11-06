// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { afterEach, describe, expect, it } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { LANE_H, TRACK_H } from "./timelineLayout";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";
import { getTimelinePropertyLanes } from "./TimelinePropertyLanes";
import { resolveTrackKeyframeClip, useTimelineTrackLayout } from "./useTimelineTrackLayout";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  usePlayerStore.getState().reset();
});

function renderTrackLayout(
  elements: TimelineElement[],
  animations: Map<string, GsapAnimation[]>,
): {
  layout: ReturnType<typeof useTimelineTrackLayout>;
  unmount: () => void;
} {
  usePlayerStore.setState({ expandedClipIds: new Set(["clip-1"]) });

  let layout: ReturnType<typeof useTimelineTrackLayout> | undefined;
  function Probe() {
    layout = useTimelineTrackLayout(elements, animations, null, new Set());
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => root.render(React.createElement(Probe)));
  if (!layout) throw new Error("Timeline track layout did not render");

  return { layout, unmount: () => act(() => root.unmount()) };
}

describe("collapsed audio groups", () => {
  const member = (id: string, track: number): TimelineElement => ({
    id,
    domId: id,
    tag: "audio",
    start: 0,
    duration: 5,
    track,
    audioGroup: "voiceover",
  });

  /** `collapsed` seeds the collapsed set — expanded is the default state. */
  function renderGrouped(collapsed = false): {
    layout: ReturnType<typeof useTimelineTrackLayout>;
    unmount: () => void;
  } {
    if (collapsed) usePlayerStore.setState({ collapsedGroupIds: new Set(["voiceover"]) });
    const elements = [member("voice-1", 0), member("voice-2", 1)];
    let layout: ReturnType<typeof useTimelineTrackLayout> | undefined;
    function Probe() {
      layout = useTimelineTrackLayout(elements, new Map(), null, new Set());
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    if (!layout) throw new Error("Timeline track layout did not render");
    return { layout, unmount: () => act(() => root.unmount()) };
  }

  // The `∿` area holds the group's own automation rows. Sized without them,
  // every lane the count had just promised was clipped out of the row — which
  // is what "expanding automation on a group doesn't show the automation"
  // looked like from outside.
  it("reserves room for the group's own automation rows, not just the strip", () => {
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 5, v: 0.4 },
          ],
        },
      ],
    });
    const elements = [
      { ...member("voice-1", 0), audioGroupAutomation: automation },
      { ...member("voice-2", 1), audioGroupAutomation: automation },
    ];
    let layout: ReturnType<typeof useTimelineTrackLayout> | undefined;
    function Probe() {
      layout = useTimelineTrackLayout(elements, new Map(), null, new Set());
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => {
      usePlayerStore.setState({ expandedLaneOwnerIds: new Set(["voiceover"]) });
      root.render(React.createElement(Probe));
    });
    // The group's anchor row: the first member track minus 0.5.
    const anchorIndex = layout!.tracks.findIndex(([track]) => track === -0.5);
    expect(anchorIndex).toBeGreaterThanOrEqual(0);
    const openHeight = layout!.rowHeights[anchorIndex];
    // One lane of headroom beyond the header row itself.
    expect(openHeight).toBe(TRACK_H + AUTOMATION_LANE_H);
    act(() => root.unmount());
  });

  // buildTimelineLogicalRows stops emitting member rows once a group is
  // collapsed, so TimelineLanes renders null for them. Rows left in `tracks`
  // still reserve height, turning that null into visible dead space — the row
  // list and the logical rows have to agree.
  it("emits only the anchor row while the group is collapsed", () => {
    const { layout, unmount } = renderGrouped(true);
    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0]!.memberTracks).toEqual([0, 1]);
    // The anchor (0 - 0.5) and nothing else.
    expect(layout.trackOrder).toEqual([-0.5]);
    expect(layout.rowGeometry.rowHeights).toHaveLength(1);
    // Membership still resolves — collapsed is hidden, not ungrouped.
    expect(layout.trackGroupOf.get(0)?.id).toBe("voiceover");
    unmount();
  });

  // Membership is not a display concern. Half-lit solo, the automation-lane
  // count and the bus strip's member labels all read the group's members, and
  // all three silently degraded to empty when those were recovered from the
  // display list — which a collapsed group does not appear in. Collapsed is the
  // default, so that was every group until someone opened it.
  it("carries its member elements even while collapsed", () => {
    const { layout, unmount } = renderGrouped(true);
    expect(layout.trackOrder).toEqual([-0.5]); // collapsed: no member rows
    expect(layout.groups[0]!.memberElements.map((el) => el.id)).toEqual(["voice-1", "voice-2"]);
    unmount();
  });

  // The reason the set is stored inverted. As an expanded-set, "absent" could
  // not tell never-touched from deliberately-collapsed, so a freshly created
  // group started collapsed — grouping three tracks made all three vanish
  // behind a header the user had not yet learned to open.
  it("is expanded by default, with nothing seeded", () => {
    const { layout, unmount } = renderGrouped();
    expect(usePlayerStore.getState().collapsedGroupIds.size).toBe(0);
    expect(layout.trackOrder).toEqual([-0.5, 0, 1]);
    unmount();
  });

  it("emits the member rows once the group is expanded", () => {
    // Expanded is the default now — nothing to seed.
    const { layout, unmount } = renderGrouped();
    expect(layout.trackOrder).toEqual([-0.5, 0, 1]);
    for (const track of layout.groups[0]!.memberTracks) {
      expect(layout.rowGeometry.getRowHeight(layout.rowGeometry.getRowIndex(track))).toBe(TRACK_H);
    }
    unmount();
  });
});

describe("useTimelineTrackLayout", () => {
  it("counts a flat tween lane and reserves its expanded row height", () => {
    const elements: TimelineElement[] = [
      { id: "clip-1", tag: "div", start: 0, duration: 1, track: 0 },
    ];
    const animations = new Map<string, GsapAnimation[]>([
      [
        "clip-1",
        [
          {
            id: "position-tween",
            targetSelector: "#clip-1",
            method: "to",
            position: 0,
            duration: 1,
            properties: { x: 420 },
            propertyGroup: "position",
          },
        ],
      ],
    ]);
    const { layout, unmount } = renderTrackLayout(elements, animations);

    expect(layout.laneCounts.get("clip-1")).toBe(1);
    expect(layout.rowHeights).toEqual([TRACK_H + LANE_H]);
    expect(layout.rowGeometry.rowKeys).toEqual([0]);
    expect(layout.rowGeometry.canvasHeight).toBeGreaterThan(TRACK_H + LANE_H);
    unmount();
  });

  // The row height reserved here and the lanes actually rendered are two
  // readings of the same question. They used to be two inline copies of the
  // group-set rule, and a mixed-group tween made them disagree: zero reserved
  // rows under two rendered lanes.
  it("reserves exactly as many rows as the lanes a mixed-group tween renders", () => {
    const elements: TimelineElement[] = [
      { id: "clip-1", tag: "div", start: 0, duration: 1, track: 0 },
    ];
    const mixed: GsapAnimation = {
      id: "entrance",
      targetSelector: "#clip-1",
      method: "to",
      position: 0,
      duration: 1,
      properties: { x: 420, opacity: 1 },
    };
    const animations = new Map<string, GsapAnimation[]>([["clip-1", [mixed]]]);
    const { layout, unmount } = renderTrackLayout(elements, animations);

    expect(getTimelinePropertyLanes([mixed], 0, 1)).toHaveLength(2);
    expect(layout.laneCounts.get("clip-1")).toBe(2);
    expect(layout.rowHeights).toEqual([TRACK_H + 2 * LANE_H]);
    unmount();
  });
});
const audioClip = (id: string, over: Partial<TimelineElement> = {}): TimelineElement => ({
  id,
  key: id,
  tag: "audio",
  start: 0,
  duration: 10,
  track: 10,
  ...over,
});

/**
 * Clips sharing a row share a lane row per property, so the height they reserve
 * is the track's grouped count — and the row is open when ANY of them is
 * expanded, or clicking a sibling collapsed it.
 */
describe("a track several clips share", () => {
  const peaking = (gain: number) =>
    JSON.stringify({
      version: 1,
      nodes: [{ type: "peaking", id: "n1", params: { frequency: 1000, gain, q: 1.4 } }],
    });
  const lanes = (...targets: string[]) =>
    JSON.stringify({
      version: 1,
      lanes: targets.map((target) => ({ target, points: [{ t: 0, v: 1 }] })),
    });
  const narration1 = audioClip("narration-1", {
    fxChain: peaking(-3),
    automation: lanes("fx.n1.gain"),
  });
  const narration2 = audioClip("narration-2", {
    start: 10,
    fxChain: peaking(-6),
    automation: lanes("fx.n1.gain", "volume"),
  });

  /** Reserved height for the row, with only narration-1 ever expanded. */
  function rowHeight(selectedElementId: string | null): number {
    usePlayerStore.setState({ expandedClipIds: new Set(["narration-1"]) });
    let height = 0;
    function Probe() {
      height =
        useTimelineTrackLayout([narration1, narration2], new Map(), selectedElementId, new Set())
          .rowHeights[0] ?? 0;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    act(() => root.unmount());
    return height;
  }

  it("reserves one row per property, not per clip's lane", () => {
    // Two properties across the two clips — a shared 1 kHz peaking gain and a
    // volume envelope on one of them — so two rows, not three.
    expect(rowHeight("narration-1")).toBe(TRACK_H + 2 * AUTOMATION_LANE_H);
  });

  it("stays open at the same height when the selection moves to a sibling", () => {
    // Expansion is stored per clip but reads as the row's: asking only about the
    // active clip collapsed the row the moment another was clicked.
    expect(rowHeight("narration-2")).toBe(rowHeight("narration-1"));
  });
});

describe("resolveTrackKeyframeClip", () => {
  const none = new Map<string, number>();

  it("picks an audio clip that has only automation, no tweens", () => {
    // Gating on tweens alone left an audio clip's envelopes unreachable: no
    // clip resolved, so the track got no caret, no height and no lanes.
    const bgm = audioClip("bgm");
    const picked = resolveTrackKeyframeClip([bgm], none, null, new Set(), () => 1);
    expect(picked).toBe(bgm);
  });

  it("still resolves nothing when a clip has neither", () => {
    expect(resolveTrackKeyframeClip([audioClip("bgm")], none, null, new Set(), () => 0)).toBeNull();
  });

  it("prefers the selected clip over the one with more to show", () => {
    const a = audioClip("a");
    const b = audioClip("b");
    const picked = resolveTrackKeyframeClip([a, b], new Map([["b", 4]]), "a", new Set(), (e) =>
      e.id === "a" ? 1 : 0,
    );
    expect(picked).toBe(a);
  });

  it("counts tweens and automation together when breaking a tie", () => {
    const a = audioClip("a");
    const b = audioClip("b");
    const picked = resolveTrackKeyframeClip(
      [a, b],
      new Map([
        ["a", 1],
        ["b", 1],
      ]),
      null,
      new Set(),
      (e) => (e.id === "b" ? 3 : 0),
    );
    expect(picked).toBe(b);
  });
});
