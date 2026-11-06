// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GsapAnimation, PropertyGroupName } from "@hyperframes/core/gsap-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineClipDiamonds } from "./TimelineClipDiamonds";
import {
  getTimelinePropertyLanes,
  resolveAnimIdForProperty,
  TimelinePropertyLanes,
  type TimelinePropertyLanesProps,
} from "./TimelinePropertyLanes";
import { timelineKeyframeSelectionKey } from "./timelineKeyframeIdentity";
import { LANE_H, getTimelineLaneTop } from "./timelineLayout";
import { groupLabel } from "./trackHeaderLaneValues";
import { clipTimingStart } from "../../hooks/gsapShared";
import { resolveTimelineKeyframeTarget } from "../../components/nle/useTimelineEditCallbacks";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function animation(
  id: string,
  propertyGroup: PropertyGroupName,
  keyframes: Array<{
    percentage: number;
    properties: Record<string, number | string>;
    ease?: string;
  }>,
): GsapAnimation {
  return {
    id,
    targetSelector: "#clip-1",
    method: "to",
    position: 0,
    duration: 1,
    properties: {},
    propertyGroup,
    keyframes: { format: "percentage", keyframes },
  };
}

function flatAnimation(
  id: string,
  propertyGroup: PropertyGroupName,
  properties: Record<string, number | string>,
): GsapAnimation {
  return {
    id,
    targetSelector: "#clip-1",
    method: "to",
    position: 0,
    duration: 1,
    properties,
    propertyGroup,
  };
}

function renderPropertyLanes(overrides: Partial<TimelinePropertyLanesProps> = {}): {
  host: HTMLDivElement;
  root: Root;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <TimelinePropertyLanes
        id="timeline-property-lanes-test"
        animations={[]}
        clipStart={0}
        clipDuration={1}
        clipLeftPx={0}
        clipWidthPx={200}
        accentColor="#4ba3d2"
        isSelected
        currentPercentage={-10}
        elementId="clip-1"
        selectedKeyframes={new Set()}
        {...overrides}
      />,
    );
  });
  return { host, root };
}

function laneDiamonds(host: HTMLElement, group: string): HTMLButtonElement[] {
  return Array.from(
    host.querySelectorAll<HTMLButtonElement>(
      `[data-property-group="${group}"] button[data-keyframe-percentage]`,
    ),
  );
}

function expectLanePercentages(host: HTMLElement, group: string, percentages: string[]) {
  expect(laneDiamonds(host, group).map((diamond) => diamond.dataset.keyframePercentage)).toEqual(
    percentages,
  );
}

function laneEaseButtons(host: HTMLElement, group: string): HTMLButtonElement[] {
  return Array.from(
    host.querySelectorAll<HTMLButtonElement>(
      `[data-property-group="${group}"] button[data-keyframe-ease-button]`,
    ),
  );
}

function laneEaseSegments(host: HTMLElement, group: string): HTMLElement[] {
  return Array.from(
    host.querySelectorAll<HTMLElement>(
      `[data-property-group="${group}"] [data-keyframe-ease-segment]`,
    ),
  );
}

function revealEaseButton(segment: HTMLElement): HTMLButtonElement | null {
  return segment.querySelector<HTMLButtonElement>("button[data-keyframe-ease-button]");
}

const POSITION_SEGMENT_ANIMATION = animation("position-tween", "position", [
  { percentage: 0, properties: { x: 0 } },
  { percentage: 50, properties: { x: 50 } },
]);

function boundaryKeyframeAnimations(): GsapAnimation[] {
  return [
    animation("position-tween", "position", [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 100 } },
    ]),
    animation("visual-tween", "visual", [
      { percentage: 0, properties: { opacity: 0 } },
      { percentage: 100, properties: { opacity: 1 } },
    ]),
  ];
}

/** A tween the parser leaves unclassified because it spans several groups. */
function ungroupedAnimation(
  id: string,
  properties: Record<string, number | string>,
): GsapAnimation {
  return {
    id,
    targetSelector: "#clip-1",
    method: "to",
    position: 0,
    duration: 1,
    properties,
  };
}

describe("TimelinePropertyLanes", () => {
  // `{ x, opacity }` is the canonical HyperFrames entrance tween. The parser
  // classifies it to `undefined` (two groups), which used to erase it from the
  // lanes entirely — no caret, no reserved row, nothing to edit.
  it("lanes a mixed-group tween once per group it animates", () => {
    const lanes = getTimelinePropertyLanes(
      [ungroupedAnimation("entrance", { x: 0, opacity: 1 })],
      0,
      1,
    );

    expect(lanes.map((lane) => lane.group).sort()).toEqual(["position", "visual"]);
    for (const lane of lanes) {
      expect(lane.keyframes.map((keyframe) => keyframe.percentage)).toEqual([0, 100]);
      expect(lane.keyframes.every((keyframe) => keyframe.animationId === "entrance")).toBe(true);
    }
  });

  it("lanes a tween whose properties are all unknown as one 'other' lane", () => {
    const lanes = getTimelinePropertyLanes(
      [ungroupedAnimation("rounded", { borderRadius: 12, fontSize: 24 })],
      0,
      1,
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.group).toBe("other");
    expect(groupLabel("other", lanes[0]!.keyframes[0]!.properties)).toBe("BorderRadius");
  });

  // An expanded sub-composition child sits on the MASTER timeline at a
  // host-absolute start while its tweens are parsed from its own file and are
  // local to it. clipTimingStart is what brings the two into one frame.
  it("keeps an expanded sub-comp child's lane percentages inside the clip", () => {
    const child = { start: 16.5, duration: 2, parentCompositionStart: 16 };
    const local = animation("pill-tween", "position", [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 100 } },
    ]);
    local.position = 0.5;
    local.resolvedStart = 0.5;
    local.duration = 2;

    const percentages = getTimelinePropertyLanes(
      [local],
      clipTimingStart(child),
      child.duration,
    ).flatMap((lane) => lane.keyframes.map((keyframe) => keyframe.percentage));

    expect(percentages).toHaveLength(2);
    for (const percentage of percentages) {
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    }
    // Falsifier: the raw host-absolute start is what used to be passed.
    expect(
      getTimelinePropertyLanes([local], child.start, child.duration)[0]?.keyframes[0]?.percentage,
    ).toBeLessThan(0);
  });

  it("still lanes a single-group tween exactly once", () => {
    const lanes = getTimelinePropertyLanes(
      [animation("position-tween", "position", [{ percentage: 0, properties: { x: 0, y: 0 } }])],
      0,
      1,
    );

    expect(lanes.map((lane) => lane.group)).toEqual(["position"]);
  });

  // A lane can merge several tweens, so an edit routed from it must carry the
  // clicked keyframe's own animation identity — group matching alone is
  // ambiguous once two tweens feed the same lane.
  it("routes a mixed-tween lane edit to the tween that owns the keyframe", () => {
    const mixed = ungroupedAnimation("entrance", { x: 40, opacity: 1 });
    const sibling = animation("drift", "position", [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 100, properties: { x: 9 } },
    ]);
    const lanes = getTimelinePropertyLanes([mixed, sibling], 0, 1);
    const position = lanes.find((lane) => lane.group === "position");

    expect(
      resolveTimelineKeyframeTarget(100, position?.keyframes ?? [], [
        { id: "entrance" },
        { id: "drift", propertyGroup: "position" },
      ]),
    ).toEqual({ animId: "entrance", tweenPct: 100 });
  });

  it("returns a position lane with synthesized endpoints for a flat tween", () => {
    const lanes = getTimelinePropertyLanes(
      [flatAnimation("position-tween", "position", { x: 420 })],
      0,
      1,
    );

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.group).toBe("position");
    expect(lanes[0]?.keyframes).toEqual([
      {
        percentage: 0,
        tweenPercentage: 0,
        properties: { x: 0 },
        propertyGroup: "position",
        animationId: "position-tween",
      },
      {
        percentage: 100,
        tweenPercentage: 100,
        properties: { x: 420 },
        propertyGroup: "position",
        animationId: "position-tween",
      },
    ]);
  });

  it("returns both flat and authored keyframe property groups", () => {
    const lanes = getTimelinePropertyLanes(
      [
        flatAnimation("position-tween", "position", { x: 420 }),
        animation("visual-tween", "visual", [
          { percentage: 0, properties: { opacity: 0 } },
          { percentage: 100, properties: { opacity: 1 } },
        ]),
      ],
      0,
      1,
    );

    expect(lanes.map((lane) => lane.group)).toEqual(["position", "visual"]);
    expect(lanes.map((lane) => lane.keyframes.map((keyframe) => keyframe.percentage))).toEqual([
      [0, 100],
      [0, 100],
    ]);
  });

  it("renders each source property group at its independent keyframe positions", () => {
    const animations = [
      animation("position-tween", "position", [
        { percentage: 0, properties: { x: 0, y: 0 } },
        { percentage: 50, properties: { x: 100, y: 20 } },
        { percentage: 100, properties: { x: 200, y: 40 } },
      ]),
      animation("visual-tween", "visual", [{ percentage: 25, properties: { opacity: 0.5 } }]),
    ];

    const { host, root } = renderPropertyLanes({ animations });
    const position = laneDiamonds(host, "position");
    const visual = laneDiamonds(host, "visual");

    expect(position).toHaveLength(3);
    expect(visual).toHaveLength(1);
    // Diamonds are centered on their true keyframe time (0% at -half); the
    // reserved left gutter (content origin inset, tested at the Timeline level)
    // keeps the overflowing left half visible rather than clamping it inward.
    expect(position.map((diamond) => diamond.style.left)).toEqual(["-11px", "89px", "189px"]);
    expect(visual[0]?.style.left).toBe("39px");
    expect(
      host.querySelectorAll('[data-property-group="position"] [data-keyframe-connector]'),
    ).toHaveLength(2);
    act(() => root.unmount());
  });

  it("keeps both groups' diamonds when their source keyframes share 0% and 100%", () => {
    const animations = boundaryKeyframeAnimations();

    const { host, root } = renderPropertyLanes({ animations });

    expectLanePercentages(host, "position", ["0", "100"]);
    expectLanePercentages(host, "visual", ["0", "100"]);
    act(() => root.unmount());
  });

  it("renders an authored hold keyframe whose value equals its predecessor", () => {
    const animations = [
      animation("position-tween", "position", [
        { percentage: 0, properties: { x: 10 } },
        { percentage: 50, properties: { x: 10 } },
        { percentage: 100, properties: { x: 20 } },
      ]),
    ];

    const { host, root } = renderPropertyLanes({ animations });

    expectLanePercentages(host, "position", ["0", "50", "100"]);
    act(() => root.unmount());
  });

  it("keeps Position@50% selection distinct from Opacity@50%", () => {
    const onClickKeyframe = vi.fn();
    const animations = [
      animation("position-tween", "position", [{ percentage: 50, properties: { x: 50 } }]),
      animation("visual-tween", "visual", [{ percentage: 50, properties: { opacity: 0.5 } }]),
    ];
    const { host, root } = renderPropertyLanes({ animations, onClickKeyframe });
    const position = laneDiamonds(host, "position")[0]!;

    act(() => {
      position.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    });

    const target = onClickKeyframe.mock.calls[0]?.[0];
    expect(target).toEqual({
      animationId: "position-tween",
      percentage: 50,
      propertyGroup: "position",
      tweenPercentage: 50,
    });

    act(() => {
      root.render(
        <TimelinePropertyLanes
          id="timeline-property-lanes-selected-test"
          animations={animations}
          clipStart={0}
          clipDuration={1}
          clipLeftPx={0}
          clipWidthPx={200}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={-10}
          elementId="clip-1"
          selectedKeyframes={new Set([timelineKeyframeSelectionKey("clip-1", target)])}
        />,
      );
    });

    const positionFill = laneDiamonds(host, "position")[0]?.querySelector("path:last-child");
    const visualFill = laneDiamonds(host, "visual")[0]?.querySelector("path:last-child");
    expect(positionFill?.getAttribute("fill")).toBe("#4ba3d2");
    expect(visualFill?.getAttribute("fill")).toBe("var(--timeline-diamond-muted)");
    act(() => root.unmount());
  });

  it("keeps one accessible midpoint ease button per segment, regardless of selection", () => {
    const animations = [
      animation("position-tween", "position", [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 50, properties: { x: 50 } },
        { percentage: 100, properties: { x: 100 } },
      ]),
    ];
    const { host, root } = renderPropertyLanes({ animations, onSelectSegment: vi.fn() });

    const segments = laneEaseSegments(host, "position");
    expect(segments).toHaveLength(2);
    expect(segments.map((segment) => segment.style.left)).toEqual(["0px", "100px"]);
    expect(laneDiamonds(host, "position")).toHaveLength(3);
    const buttons = laneEaseButtons(host, "position");
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.classList.contains("opacity-40"))).toBe(true);
    expect(buttons.every((button) => button.classList.contains("group-hover:opacity-100"))).toBe(
      true,
    );
    expect(buttons.every((button) => button.classList.contains("focus-visible:opacity-100"))).toBe(
      true,
    );

    // The ease button is available on hover even when the element is NOT selected
    // (a lane shows for the track's active/primary clip, not only the selected one).
    act(() => {
      root.render(
        <TimelinePropertyLanes
          id="timeline-property-lanes-unselected-test"
          animations={animations}
          clipStart={0}
          clipDuration={1}
          clipLeftPx={0}
          clipWidthPx={200}
          accentColor="#4ba3d2"
          isSelected={false}
          currentPercentage={-10}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onSelectSegment={vi.fn()}
        />,
      );
    });
    const unselectedSegments = laneEaseSegments(host, "position");
    expect(unselectedSegments).toHaveLength(2);
    expect(laneEaseButtons(host, "position")).toHaveLength(2);
    act(() => root.unmount());
  });

  it("reveals each segment's button with its destination keyframe ease curve", () => {
    const animations = [
      animation("position-tween", "position", [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 33, properties: { x: 33 }, ease: "none" },
        { percentage: 66, properties: { x: 66 }, ease: "power2.out" },
        {
          percentage: 100,
          properties: { x: 100 },
          ease: "custom(M0,0 C0.1,0.2 0.3,0.9 1,1)",
        },
      ]),
    ];
    const { host, root } = renderPropertyLanes({ animations, onSelectSegment: vi.fn() });

    const segments = laneEaseSegments(host, "position");
    expect(segments).toHaveLength(3);
    const paths = segments.map((segment) =>
      revealEaseButton(segment)?.querySelector("path")?.getAttribute("d"),
    );
    expect(paths).toHaveLength(3);
    expect(new Set(paths).size).toBe(3);
    // Uniqueness alone passes even when the curves are swapped between segments.
    // Each segment is labelled with the ease it draws, so pin the ORDER: a
    // segment carries the ease of the keyframe it arrives at. The trailing time
    // is what separates two segments that share an ease name in the same lane.
    expect(
      segments.map((segment) => revealEaseButton(segment)?.getAttribute("aria-label")),
    ).toEqual([
      "Edit none easing after 0s",
      "Edit power2.out easing after 0.33s",
      "Edit custom(M0,0 C0.1,0.2 0.3,0.9 1,1) easing after 0.66s",
    ]);
    act(() => root.unmount());
  });

  it("selects the destination keyframe when a hovered segment's ease button is clicked", () => {
    const onSelectSegment = vi.fn();
    const { host, root } = renderPropertyLanes({
      animations: [POSITION_SEGMENT_ANIMATION],
      onSelectSegment,
    });

    const button = revealEaseButton(laneEaseSegments(host, "position")[0]!);
    act(() => button?.click());

    expect(onSelectSegment).toHaveBeenCalledWith({
      animationId: "position-tween",
      percentage: 50,
      propertyGroup: "position",
      tweenPercentage: 50,
    });
    act(() => root.unmount());
  });

  it("routes a colliding Position segment to the Position animation", () => {
    const onSelectSegment = vi.fn();
    const animations = [
      POSITION_SEGMENT_ANIMATION,
      animation("visual-tween", "visual", [
        { percentage: 0, properties: { opacity: 0 } },
        { percentage: 50, properties: { opacity: 0.5 } },
      ]),
    ];
    const { host, root } = renderPropertyLanes({ animations, onSelectSegment });

    const button = revealEaseButton(laneEaseSegments(host, "position")[0]!);
    act(() => button?.click());

    expect(onSelectSegment.mock.calls[0]?.[0]).toMatchObject({
      animationId: "position-tween",
      propertyGroup: "position",
    });
    act(() => root.unmount());
  });

  // The disclosure caret's aria-controls used to name a div in the STICKY LABEL
  // COLUMN whose children are all absolutely positioned: it computed to 0x0 and
  // held no diamonds. The real lanes had no wrapper at all to point at.
  it("wraps the lanes in the identified element so aria-controls resolves to the diamonds", () => {
    const animations = boundaryKeyframeAnimations();
    const { host, root } = renderPropertyLanes({ id: "timeline-lanes-track-0", animations });
    const wrapper = host.querySelector("#timeline-lanes-track-0");

    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelectorAll("[data-timeline-property-lane]")).toHaveLength(2);
    expect(wrapper?.querySelectorAll("button[data-keyframe-percentage]").length).toBeGreaterThan(0);
    // Load-bearing: a `position: relative` wrapper would become the containing
    // block for the absolute lanes below and shift every one of them.
    expect((wrapper as HTMLElement).style.position).toBe("");
    act(() => root.unmount());
  });

  // happy-dom has no CSS engine, so measured geometry is always 0x0. The lanes'
  // own inline offsets are what the component actually computes, so pin those.
  it("leaves every lane's inline offsets untouched by the wrapper", () => {
    const animations = [
      animation("position-tween", "position", [{ percentage: 0, properties: { x: 0 } }]),
      animation("visual-tween", "visual", [{ percentage: 0, properties: { opacity: 0 } }]),
    ];
    const { host, root } = renderPropertyLanes({
      id: "timeline-lanes-track-0",
      animations,
      clipLeftPx: 120,
      clipWidthPx: 200,
    });

    const lanes = Array.from(host.querySelectorAll<HTMLElement>("[data-timeline-property-lane]"));
    expect(lanes.map((lane) => lane.style.top)).toEqual([
      `${getTimelineLaneTop(0)}px`,
      `${getTimelineLaneTop(1)}px`,
    ]);
    expect(lanes.map((lane) => lane.style.left)).toEqual(["120px", "120px"]);
    expect(lanes.map((lane) => lane.style.width)).toEqual(["200px", "200px"]);
    expect(lanes.map((lane) => lane.style.height)).toEqual([`${LANE_H}px`, `${LANE_H}px`]);
    act(() => root.unmount());
  });

  // The wrapper is the aria-controls target in BOTH disclosure states, so a
  // collapsed layer (no animations reach it) must still resolve the id.
  it("still renders the identified wrapper when there are no lanes to show", () => {
    const { host, root } = renderPropertyLanes({ id: "timeline-lanes-track-0", animations: [] });

    const wrapper = host.querySelector("#timeline-lanes-track-0");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelectorAll("[data-timeline-property-lane]")).toHaveLength(0);
    act(() => root.unmount());
  });

  it("keeps the collapsed TimelineClipDiamonds positions and callback contract unchanged", () => {
    const onClickKeyframe = vi.fn();
    const COLLAPSED_IDENTITY = { animationId: "position-tween", propertyGroup: "position" };
    const COLLAPSED_TARGET = { ...COLLAPSED_IDENTITY, percentage: 50, tweenPercentage: 50 };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineClipDiamonds
          keyframesData={{
            format: "percentage",
            keyframes: [
              { percentage: 0, ...COLLAPSED_IDENTITY, tweenPercentage: 0, properties: { x: 0 } },
              {
                percentage: 50,
                ...COLLAPSED_IDENTITY,
                tweenPercentage: 50,
                properties: { x: 100 },
              },
            ],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          clipDuration={10}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={-10}
          elementId="clip-1"
          selectedKeyframes={new Set([timelineKeyframeSelectionKey("clip-1", COLLAPSED_TARGET)])}
          onClickKeyframe={onClickKeyframe}
        />,
      );
    });
    const diamonds = Array.from(host.querySelectorAll<HTMLButtonElement>("button"));

    // Unified keyframe-diamond size (LANE_H·ratio ≈ 22px, half 11) on collapsed
    // clips too, so 0% sits at -11px regardless of clip-bar height.
    expect(diamonds.map((diamond) => diamond.style.left)).toEqual(["-11px", "89px"]);
    expect(diamonds[1]?.querySelector("path:last-child")?.getAttribute("fill")).toBe("#4ba3d2");
    act(() => {
      diamonds[1]?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    });
    // The whole identity, not just the percentage: objectContaining on the one
    // field passes even when the animation id / property group / tween-% the
    // diamond-identity refactor added are dropped on the way out.
    expect(onClickKeyframe).toHaveBeenCalledWith("clip-1", COLLAPSED_TARGET);
    act(() => root.unmount());
  });
});

describe("resolveAnimIdForProperty", () => {
  /** A legacy mixed tween: the parser leaves propertyGroup undefined for it. */
  const mixed = {
    id: "mixed-1",
    targetSelector: "#box",
    method: "to",
    position: 0,
    properties: {},
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { x: 0, opacity: 0 } },
        { percentage: 100, properties: { x: 40, opacity: 1 } },
      ],
    },
  } as unknown as GsapAnimation;

  it("routes both groups of a mixed tween to that tween, not the fallback", () => {
    expect(mixed.propertyGroup).toBeUndefined();

    expect(resolveAnimIdForProperty("x", [mixed], "fallback")).toBe("mixed-1");
    expect(resolveAnimIdForProperty("opacity", [mixed], "fallback")).toBe("mixed-1");
  });

  it("falls back only when no tween animates the property's group", () => {
    expect(resolveAnimIdForProperty("rotation", [mixed], "fallback")).toBe("fallback");
    expect(resolveAnimIdForProperty("rotation", [mixed], undefined)).toBe("");
  });

  it("prefers a single-group tween that owns the lane", () => {
    const opacityOnly = {
      ...mixed,
      id: "opacity-1",
      propertyGroup: "visual",
      keyframes: {
        keyframes: [
          { percentage: 0, properties: { opacity: 0 } },
          { percentage: 100, properties: { opacity: 1 } },
        ],
      },
    } as unknown as GsapAnimation;

    expect(resolveAnimIdForProperty("opacity", [opacityOnly, mixed], "fallback")).toBe("opacity-1");
    expect(resolveAnimIdForProperty("x", [opacityOnly, mixed], "fallback")).toBe("mixed-1");
  });
});
