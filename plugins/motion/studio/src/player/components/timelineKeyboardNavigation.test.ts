import type { GsapAnimation, PropertyGroupName } from "@hyperframes/core/gsap-parser";
import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  buildTimelineLogicalRows,
  resolveTimelineFocusFallback,
  resolveTimelineNavigationTarget,
} from "./timelineKeyboardNavigation";
import { timelineClipFocusId, timelineTrackRowId } from "./timelineNavigationIdentity";

function clip(id: string, track: number, start: number, duration = 2): TimelineElement {
  return { id, track, start, duration, tag: "div" };
}

function fallbackTracks(firstTrack: TimelineElement[]): [number, TimelineElement[]][] {
  return [
    [1, firstTrack],
    [2, []],
    [3, [clip("right", 3, 18), clip("left", 3, 2)]],
  ];
}

function animation(
  id: string,
  group: PropertyGroupName,
  percentages: readonly number[],
  resolvedStart = 10,
): GsapAnimation {
  return {
    id,
    targetSelector: "#active",
    method: "to",
    position: 0,
    resolvedStart,
    duration: 10,
    properties: {},
    propertyGroup: group,
    keyframes: {
      format: "percentage",
      keyframes: percentages.map((percentage) => ({
        percentage,
        properties: group === "position" ? { x: percentage } : { opacity: percentage / 100 },
      })),
    },
  };
}

function model(overrides: Partial<Parameters<typeof buildTimelineLogicalRows>[0]> = {}) {
  const active = clip("active", 1, 10, 10);
  return buildTimelineLogicalRows({
    tracks: [
      [1, [clip("late", 1, 20), active, clip("early", 1, 0)]],
      [2, []],
      [3, [clip("right", 3, 18), clip("left", 3, 2)]],
    ],
    displayTrackOrder: [1, 2, 3],
    laneCounts: new Map([["active", 2]]),
    selectedElementId: "active",
    selectedElementIds: new Set(),
    expandedClipIds: new Set(["active"]),
    collapsedGroupIds: new Set(),
    expandedLaneOwnerIds: new Set(),
    groups: [],
    trackGroupOf: new Map(),
    gsapAnimations: new Map([
      [
        "active",
        [animation("position", "position", [0, 50, 100]), animation("visual", "visual", [25, 75])],
      ],
    ]),
    ...overrides,
  });
}

describe("buildTimelineLogicalRows", () => {
  it("projects tracks, empty tracks, and expanded property rows with continuous indices", () => {
    const rows = model();

    expect(
      rows.map(({ physicalTrackKey, logicalIndex, level, parentId, expandable }) => ({
        physicalTrackKey,
        logicalIndex,
        level,
        parentId,
        expandable,
      })),
    ).toEqual([
      { physicalTrackKey: 1, logicalIndex: 0, level: 1, parentId: null, expandable: true },
      {
        physicalTrackKey: 1,
        logicalIndex: 1,
        level: 2,
        parentId: timelineTrackRowId(1),
        expandable: false,
      },
      {
        physicalTrackKey: 1,
        logicalIndex: 2,
        level: 2,
        parentId: timelineTrackRowId(1),
        expandable: false,
      },
      { physicalTrackKey: 2, logicalIndex: 3, level: 1, parentId: null, expandable: false },
      { physicalTrackKey: 3, logicalIndex: 4, level: 1, parentId: null, expandable: false },
    ]);
    expect(rows[0]?.expanded).toBe(true);
    expect(rows[3]?.items).toEqual([]);
    expect(rows[0]?.items.map((item) => item.elementId)).toEqual(["early", "active", "late"]);
  });

  it("orders keyframes and their segment ease controls deterministically", () => {
    const rows = model({
      gsapAnimations: new Map([
        [
          "active",
          [
            animation("z-animation", "position", [100, 0, 50]),
            animation("a-animation", "position", [50]),
          ],
        ],
      ]),
    });
    const position = rows.find((row) => row.propertyGroup === "position")!;

    expect(
      position.items.map((item) => [item.kind, item.time, item.keyframeTarget?.animationId]),
    ).toEqual([
      ["keyframe", 10, "z-animation"],
      ["ease", 12.5, "a-animation"],
      ["keyframe", 15, "a-animation"],
      ["keyframe", 15, "z-animation"],
      ["ease", 17.5, "z-animation"],
      ["keyframe", 20, "z-animation"],
    ]);
  });

  it("uses the selected keyframed clip as the sole expanded-lane owner", () => {
    const other = clip("other", 1, 0, 4);
    const rows = model({
      tracks: [[1, [other, clip("active", 1, 10, 10)]]],
      displayTrackOrder: [1],
      laneCounts: new Map([
        ["active", 1],
        ["other", 1],
      ]),
      selectedElementId: "other",
      expandedClipIds: new Set(["other", "active"]),
      gsapAnimations: new Map([
        ["active", [animation("active-position", "position", [0, 100])]],
        ["other", [animation("other-visual", "visual", [0, 100], 0)]],
      ]),
    });

    expect(rows.map((row) => row.propertyGroup).filter(Boolean)).toEqual(["visual"]);
  });
});

describe("resolveTimelineNavigationTarget", () => {
  it("navigates horizontal items plus row Home and End", () => {
    const rows = model();
    const activeId = timelineClipFocusId("active");

    expect(resolveTimelineNavigationTarget(rows, activeId, "ArrowLeft")?.id).toBe(
      timelineClipFocusId("early"),
    );
    expect(resolveTimelineNavigationTarget(rows, activeId, "ArrowRight")?.id).toBe(
      timelineClipFocusId("late"),
    );
    expect(resolveTimelineNavigationTarget(rows, timelineTrackRowId(1), "ArrowLeft")?.id).toBe(
      timelineTrackRowId(1),
    );
    expect(
      resolveTimelineNavigationTarget(rows, timelineClipFocusId("late"), "ArrowRight")?.id,
    ).toBe(timelineClipFocusId("late"));
    expect(resolveTimelineNavigationTarget(rows, timelineTrackRowId(1), "ArrowRight")?.id).toBe(
      timelineClipFocusId("early"),
    );
    expect(
      resolveTimelineNavigationTarget(rows, timelineClipFocusId("early"), "ArrowLeft")?.id,
    ).toBe(timelineTrackRowId(1));
    expect(resolveTimelineNavigationTarget(rows, activeId, "Home")?.id).toBe(timelineTrackRowId(1));
    expect(resolveTimelineNavigationTarget(rows, timelineTrackRowId(1), "End")?.id).toBe(
      timelineClipFocusId("late"),
    );
  });

  it("navigates every logical row including properties and empty tracks", () => {
    const rows = model();
    const activeId = timelineClipFocusId("active");
    const propertyTarget = resolveTimelineNavigationTarget(rows, activeId, "ArrowDown")!;

    expect(propertyTarget.kind).toBe("keyframe");
    expect(propertyTarget.time).toBe(15);
    expect(
      resolveTimelineNavigationTarget(rows, propertyTarget.id, "PageDown", { pageSize: 2 })?.id,
    ).toBe(timelineTrackRowId(2));
    expect(resolveTimelineNavigationTarget(rows, timelineTrackRowId(2), "ArrowDown")?.id).toBe(
      timelineTrackRowId(3),
    );
    expect(resolveTimelineNavigationTarget(rows, propertyTarget.id, "ArrowUp")?.id).toBe(activeId);
    expect(
      resolveTimelineNavigationTarget(rows, propertyTarget.id, "PageUp", { pageSize: 2 })?.id,
    ).toBe(activeId);
  });

  it("uses a caller-supplied page size and ignores invalid page commands", () => {
    const rows = model();
    const current = timelineTrackRowId(1);

    expect(resolveTimelineNavigationTarget(rows, current, "PageDown")?.id).toBe(current);
    expect(resolveTimelineNavigationTarget(rows, current, "PageDown", { pageSize: 3 })?.id).toBe(
      timelineTrackRowId(2),
    );
    expect(
      resolveTimelineNavigationTarget(rows, timelineTrackRowId(3), "PageDown", { pageSize: 1 })?.id,
    ).toBe(timelineTrackRowId(3));
  });

  it("supports modified Home and End across the whole logical model", () => {
    const rows = model();
    const current = timelineTrackRowId(2);

    expect(
      resolveTimelineNavigationTarget(rows, current, "Home", { timelineBoundary: true })?.id,
    ).toBe(timelineTrackRowId(1));
    expect(
      resolveTimelineNavigationTarget(rows, current, "End", { timelineBoundary: true })?.id,
    ).toBe(timelineTrackRowId(3));
  });

  it("returns from a property row to its parent with ArrowLeft", () => {
    const rows = model();
    const property = rows.find((row) => row.propertyGroup === "position")!;

    expect(resolveTimelineNavigationTarget(rows, property.id, "ArrowLeft")?.id).toBe(
      timelineTrackRowId(1),
    );
  });

  it("breaks equal-distance vertical ties by time then stable identity", () => {
    const rows = buildTimelineLogicalRows({
      tracks: [
        [1, [clip("current", 1, 9, 2)]],
        [2, [clip("later", 2, 14, 2), clip("earlier-z", 2, 4, 2), clip("earlier-a", 2, 4, 2)]],
      ],
      displayTrackOrder: [1, 2],
      laneCounts: new Map(),
      selectedElementId: null,
      selectedElementIds: new Set(),
      expandedClipIds: new Set(),
      collapsedGroupIds: new Set(),
      expandedLaneOwnerIds: new Set(),
      groups: [],
      trackGroupOf: new Map(),
      gsapAnimations: new Map(),
    });

    expect(
      resolveTimelineNavigationTarget(rows, timelineClipFocusId("current"), "ArrowDown")?.id,
    ).toBe(timelineClipFocusId("earlier-a"));
  });
});

describe("resolveTimelineFocusFallback", () => {
  it("chooses previous, then next, then the containing row after deletion", () => {
    const before = model({ expandedClipIds: new Set() });
    const withoutActive = model({
      expandedClipIds: new Set(),
      tracks: fallbackTracks([clip("early", 1, 0), clip("late", 1, 20)]),
    });
    expect(
      resolveTimelineFocusFallback(before, withoutActive, timelineClipFocusId("active"))?.id,
    ).toBe(timelineClipFocusId("early"));

    const onlyNext = model({
      expandedClipIds: new Set(),
      tracks: fallbackTracks([clip("late", 1, 20)]),
    });
    expect(resolveTimelineFocusFallback(before, onlyNext, timelineClipFocusId("active"))?.id).toBe(
      timelineClipFocusId("late"),
    );

    const onlyActive = model({
      expandedClipIds: new Set(),
      tracks: [[1, [clip("active", 1, 10, 10)]]],
      displayTrackOrder: [1],
    });
    const empty = model({
      expandedClipIds: new Set(),
      tracks: [[1, []]],
      displayTrackOrder: [1],
    });
    expect(resolveTimelineFocusFallback(onlyActive, empty, timelineClipFocusId("active"))?.id).toBe(
      timelineTrackRowId(1),
    );
  });

  it("falls back from a collapsed property row to its parent track", () => {
    const before = model();
    const property = before.find((row) => row.propertyGroup === "position")!;
    const after = model({ expandedClipIds: new Set() });

    expect(resolveTimelineFocusFallback(before, after, property.items[0]!.id)?.id).toBe(
      timelineTrackRowId(1),
    );
  });

  it("returns null for an identity absent from the previous model", () => {
    expect(resolveTimelineFocusFallback(model(), model(), "missing")).toBeNull();
  });
});
