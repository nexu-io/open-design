// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GsapAnimation, PropertyGroupName } from "@hyperframes/core/gsap-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelinePropertyLanes } from "./TimelinePropertyLanes";
import { TimelineTrackHeader, gutterFill } from "./TimelineTrackHeader";
import { defaultTimelineTheme } from "./timelineTheme";
import { type TimelineElement } from "../store/playerStore";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import { getTimelineLaneTop, LABEL_COL_W, TRACK_H } from "./timelineLayout";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

const ELEMENT: TimelineElement = {
  id: "clip-1",
  label: "Hero card",
  tag: "div",
  start: 0,
  duration: 2,
  track: 0,
};

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
    duration: 2,
    properties: {},
    propertyGroup,
    keyframes: { format: "percentage", keyframes },
  };
}

const POSITION = animation("position-tween", "position", [
  { percentage: 0, properties: { x: 0, y: 0 } },
  { percentage: 50, properties: { x: 100, y: 50 } },
  { percentage: 100, properties: { x: 200, y: 100 } },
]);

const OPACITY = animation("opacity-tween", "visual", [
  { percentage: 0, properties: { opacity: 0 } },
  { percentage: 50, properties: { opacity: 0.5 } },
  { percentage: 100, properties: { opacity: 1 } },
]);

interface RenderHeaderOptions {
  keyframeClip?: TimelineElement;
  /** Every clip on the track; defaults to just the keyframe clip. */
  trackElements?: readonly TimelineElement[];
  animations?: GsapAnimation[];
  clipCount?: number;
  currentTime?: number;
  expanded?: boolean;
  onSeek?: (time: number) => void;
  onTogglePropertyGroupKeyframe?: TimelineEditCallbacks["onTogglePropertyGroupKeyframe"];
  onToggleTrackHidden?: TimelineEditCallbacks["onToggleTrackHidden"];
  onRemoveAutomationLane?: (target: string) => void;
  isAudioTrack?: boolean;
  isGroupMember?: boolean;
  isTrackHidden?: boolean;
  showAudioEffects?: boolean;
}

function renderHeader(options: RenderHeaderOptions = {}): {
  host: HTMLDivElement;
  root: Root;
  rerender: (next: RenderHeaderOptions) => void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (raw: RenderHeaderOptions) => {
    // Defaults resolved once, up front, rather than as a `??` per prop in the
    // JSX — a dozen of those is a dozen branches through one arrow.
    const next = {
      keyframeClip: ELEMENT,
      clipCount: 1,
      animations: [POSITION, OPACITY],
      currentTime: 0,
      isAudioTrack: false,
      isGroupMember: false,
      isTrackHidden: false,
      onToggleTrackHidden: vi.fn(),
      ...raw,
    };
    act(() => {
      root.render(
        <TimelineTrackHeader
          // A real fractional z-order sort key, so a label built from it would
          // read out "track 0.16666666666666666".
          trackNumber={1 / 6}
          trackDisplayNumber={1}
          trackLabel="Hero card"
          lanesId="timeline-lanes-track-0"
          contentOrigin={LABEL_COL_W}
          keyframeClip={next.keyframeClip}
          trackElements={next.trackElements ?? [next.keyframeClip]}
          clipCount={next.clipCount}
          isExpanded={next.expanded !== false}
          animations={next.animations}
          currentTime={next.currentTime}
          isTrackHidden={next.isTrackHidden}
          isAudioTrack={next.isAudioTrack}
          isGroupMember={next.isGroupMember}
          theme={defaultTimelineTheme}
          showAudioEffects={next.showAudioEffects}
          onToggleClipExpanded={vi.fn()}
          onToggleTrackHidden={next.onToggleTrackHidden}
          onTogglePropertyGroupKeyframe={next.onTogglePropertyGroupKeyframe}
          onRemoveAutomationLane={next.onRemoveAutomationLane}
          onSeek={next.onSeek}
        />,
      );
    });
  };
  render(options);
  return { host, root, rerender: render };
}

function click(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  act(() => button?.click());
}

describe("TimelineTrackHeader", () => {
  // §5: gain stages multiply. A group fading to 0.42 under a clip fading to
  // 0.80 plays at 0.34, and an author who drew both hears something quieter
  // than either with nothing on screen to say why. Not a warning; an
  // explanation.
  it("says so when the clip's group is fading the same parameter", () => {
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 2, v: 0.4 },
          ],
        },
      ],
    });
    const clip: TimelineElement = {
      ...ELEMENT,
      tag: "audio",
      automation,
      audioGroup: "voiceover",
      audioGroupLabel: "Voiceover",
      audioGroupAutomation: automation,
    };
    const view = renderHeader({ keyframeClip: clip, trackElements: [clip], animations: [] });
    expect(view.host.textContent).toContain("Voiceover is also fading this.");
    act(() => view.root.unmount());
  });

  // The same clip with an un-automated group must stay quiet — the note is
  // only honest when the two curves actually multiply.
  it("stays quiet when the group automates nothing", () => {
    const automation = JSON.stringify({
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 2, v: 0.4 },
          ],
        },
      ],
    });
    const clip: TimelineElement = {
      ...ELEMENT,
      tag: "audio",
      automation,
      audioGroup: "voiceover",
      audioGroupLabel: "Voiceover",
    };
    const view = renderHeader({ keyframeClip: clip, trackElements: [clip], animations: [] });
    expect(view.host.textContent).not.toContain("is also fading this");
    act(() => view.root.unmount());
  });

  // An expanded sub-composition child sits on the MASTER timeline at a
  // host-absolute start, but its tweens are parsed from its own file and are
  // local to it. Feeding the raw start straight into the clip-% math put every
  // lane keyframe far outside the clip.
  it("keeps an expanded sub-comp child's lane percentages inside the clip", () => {
    const child: TimelineElement = {
      id: "pill",
      tag: "div",
      start: 16.5,
      duration: 2,
      track: 0,
      parentCompositionStart: 16,
      sourceFile: "scene.html",
    };
    const local: GsapAnimation = {
      id: "pill-tween",
      targetSelector: "#pill",
      method: "to",
      position: 0.5,
      resolvedStart: 0.5,
      duration: 2,
      properties: {},
      propertyGroup: "position",
      keyframes: {
        format: "percentage",
        keyframes: [
          { percentage: 0, properties: { x: 0 } },
          { percentage: 100, properties: { x: 100 } },
        ],
      },
    };
    // Playhead at the clip's midpoint (master time), so the 100% keyframe is
    // ahead of it. On the raw host-absolute basis every keyframe rebased to a
    // large negative percentage and nothing was ever ahead of the playhead.
    const view = renderHeader({
      keyframeClip: child,
      animations: [local],
      currentTime: 17.5,
    });

    expect(
      view.host.querySelector<HTMLButtonElement>('button[aria-label="Next Position keyframe"]')
        ?.disabled,
    ).toBe(false);
    act(() => view.root.unmount());
  });

  // The header shows one clip's lanes, so how many clips the track holds is
  // otherwise invisible from the label column. A single-clip track stays silent.
  it("shows the track's clip count only once the track holds more than one clip", () => {
    const view = renderHeader({ clipCount: 1 });
    expect(view.host.querySelector('[aria-label="1 clips"]')).toBeNull();

    view.rerender({ clipCount: 3 });
    expect(view.host.querySelector('[aria-label="3 clips"]')?.textContent).toBe("3");
    act(() => view.root.unmount());
  });

  // `data-hidden` silences an audio track, so its toggle is a mute, offered in
  // both states: an agent writes alternatives muted and the author flips them.
  it.each([
    [false, "Mute track 1"],
    [true, "Unmute track 1"],
  ])("offers the audio track toggle when hidden=%s", (isTrackHidden, label) => {
    const audio: TimelineElement = { ...ELEMENT, tag: "audio" };
    const view = renderHeader({
      keyframeClip: audio,
      trackElements: [audio],
      isAudioTrack: true,
      isTrackHidden,
      animations: [],
    });
    expect(view.host.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    act(() => view.root.unmount());
  });

  // Same rule as the undo entry: a track with any visual clip hides, it does not mute.
  it("offers the eye on a track mixing audio and a visual clip", () => {
    const audio: TimelineElement = { ...ELEMENT, id: "vo", tag: "audio" };
    const view = renderHeader({
      keyframeClip: audio,
      trackElements: [audio, ELEMENT],
      clipCount: 2,
      isAudioTrack: true,
      animations: [],
    });
    expect(view.host.querySelector('button[aria-label="Hide track 1"]')).not.toBeNull();
    act(() => view.root.unmount());
  });

  it("keeps it on a non-audio track", () => {
    const view = renderHeader({ isAudioTrack: false });
    const labels = Array.from(view.host.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels.some((l) => l && /^Hide track/.test(l))).toBe(true);
    act(() => view.root.unmount());
  });

  // The eye acts on the layer, so it has to be reachable without a pointer and
  // in every disclosure state — a hover-gated eye is unusable by keyboard.
  it("keeps the visibility eye mounted whether the layer is expanded or collapsed", () => {
    const view = renderHeader({ expanded: true });
    expect(view.host.querySelector('button[aria-label="Hide track 1"]')).not.toBeNull();

    view.rerender({ expanded: false });
    expect(view.host.querySelector('button[aria-label="Hide track 1"]')).not.toBeNull();
    act(() => view.root.unmount());
  });

  // trackNumber is a fractional z-order sort key, so building the label from it
  // made screen readers announce "Hide track 0.16666666666666666". The display
  // number is label-only; the toggle still routes by the real key.
  it("announces the display track number but toggles with the real fractional key", () => {
    const onToggleTrackHidden = vi.fn();
    const view = renderHeader({ onToggleTrackHidden });
    const eye = view.host.querySelector<HTMLButtonElement>('button[aria-label="Hide track 1"]');

    expect(eye).not.toBeNull();
    expect(eye?.title).toBe("Hide track 1");
    expect(view.host.innerHTML).not.toContain("0.16666666666666666");

    act(() => eye?.click());
    // The real fractional key acts; the display row rides along for the label.
    expect(onToggleTrackHidden).toHaveBeenCalledWith(1 / 6, true, 1);
    act(() => view.root.unmount());
  });

  it("adds and removes a keyframe on the explicitly targeted property-group tween", () => {
    const onTogglePropertyGroupKeyframe = vi.fn();
    const view = renderHeader({ currentTime: 0.5, onTogglePropertyGroupKeyframe });

    click(view.host, "Add Opacity keyframe");
    expect(onTogglePropertyGroupKeyframe).toHaveBeenLastCalledWith(
      ELEMENT,
      expect.objectContaining({
        animationId: "opacity-tween",
        propertyGroup: "visual",
        tweenPercentage: 25,
        properties: { opacity: 0.25 },
        remove: false,
      }),
    );

    view.rerender({ currentTime: 1, onTogglePropertyGroupKeyframe });
    click(view.host, "Remove Opacity keyframe");
    expect(onTogglePropertyGroupKeyframe).toHaveBeenLastCalledWith(
      ELEMENT,
      expect.objectContaining({
        animationId: "opacity-tween",
        propertyGroup: "visual",
        tweenPercentage: 50,
        properties: { opacity: 0.5 },
        remove: true,
      }),
    );
    expect(onTogglePropertyGroupKeyframe).not.toHaveBeenCalledWith(
      ELEMENT,
      expect.objectContaining({ animationId: "position-tween" }),
    );
    act(() => view.root.unmount());
  });

  it("seeks only to the selected group's adjacent keyframes", () => {
    const onSeek = vi.fn();
    const view = renderHeader({
      currentTime: 1,
      animations: [
        POSITION,
        animation("opacity-tween", "visual", [
          { percentage: 25, properties: { opacity: 0.25 } },
          { percentage: 50, properties: { opacity: 0.5 } },
          { percentage: 75, properties: { opacity: 0.75 } },
        ]),
      ],
      onSeek,
    });

    click(view.host, "Next Position keyframe");
    expect(onSeek).toHaveBeenLastCalledWith(2);
    click(view.host, "Previous Position keyframe");
    expect(onSeek).toHaveBeenLastCalledWith(0);
    expect(onSeek).not.toHaveBeenCalledWith(1.5);
    act(() => view.root.unmount());
  });

  // The lane header sits inside the track row, whose own click handler selects
  // the track. Every control in the label column has to own its click, or
  // seeking to a keyframe also reselects whatever is behind the header.
  it("keeps lane-header control clicks off the ancestor track row", () => {
    const onAncestorClick = vi.fn();
    const view = renderHeader({
      currentTime: 1,
      onSeek: vi.fn(),
      onTogglePropertyGroupKeyframe: vi.fn(),
    });
    // React 18 delegates from the root container, so an ancestor of it is where
    // a leaked click actually shows up.
    document.body.addEventListener("click", onAncestorClick);

    // Every control in the lane's label column, found by row rather than by
    // label, so a wording change to one button can't silently drop it here.
    const controls = view.host.querySelectorAll<HTMLButtonElement>(
      '[data-property-group="position"] button',
    );
    expect(controls.length).toBeGreaterThanOrEqual(3);
    for (const button of controls) {
      act(() => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    document.body.removeEventListener("click", onAncestorClick);
    expect(onAncestorClick).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });

  it("fills the toggle diamond exactly at that group's keyframe", () => {
    const view = renderHeader({ currentTime: 0.5 });
    const positionToggle = view.host.querySelector<HTMLButtonElement>(
      'button[aria-label="Add Position keyframe"]',
    );
    expect(positionToggle?.textContent).toBe("◇");

    view.rerender({ currentTime: 1 });
    expect(
      view.host.querySelector<HTMLButtonElement>('button[aria-label="Remove Position keyframe"]')
        ?.textContent,
    ).toBe("◆");
    act(() => view.root.unmount());
  });

  it("updates formatted group values when the playhead moves", () => {
    const view = renderHeader({ currentTime: 0.5 });
    expect(view.host.querySelector('[data-property-group="position"]')?.textContent).toContain(
      "50, 25",
    );
    expect(view.host.querySelector('[data-property-group="visual"]')?.textContent).toContain("25%");

    view.rerender({ currentTime: 1.5 });
    expect(view.host.querySelector('[data-property-group="position"]')?.textContent).toContain(
      "150, 75",
    );
    expect(view.host.querySelector('[data-property-group="visual"]')?.textContent).toContain("75%");
    act(() => view.root.unmount());
  });

  it("samples mid-segment values along the segment's ease, not linearly", () => {
    // GSAP hangs a segment's ease on the keyframe it arrives at, so 0% -> 50%
    // runs power2.in. Half way through that segment power2.in(0.5) = 0.125, so
    // the readout is 12.5/6.25 and NOT the linear 50/25.
    const eased = animation("eased-position", "position", [
      { percentage: 0, properties: { x: 0, y: 0 } },
      { percentage: 50, properties: { x: 100, y: 50 }, ease: "power2.in" },
      { percentage: 100, properties: { x: 200, y: 100 }, ease: "power2.in" },
    ]);
    const onTogglePropertyGroupKeyframe = vi.fn();
    const view = renderHeader({
      animations: [eased],
      currentTime: 0.5,
      onTogglePropertyGroupKeyframe,
    });

    expect(view.host.querySelector('[data-property-group="position"]')?.textContent).toContain(
      "12.5, 6.25",
    );

    // The same sampled value is what an added keyframe gets stamped with, so a
    // header insert lands on the existing curve instead of deforming it.
    click(view.host, "Add Position keyframe");
    expect(onTogglePropertyGroupKeyframe).toHaveBeenCalledOnce();
    expect(onTogglePropertyGroupKeyframe.mock.calls[0][1]).toMatchObject({
      properties: { x: 12.5, y: 6.25 },
    });
    act(() => view.root.unmount());
  });

  it("disables the previous chevron at or before the group's first keyframe", () => {
    const view = renderHeader({ currentTime: 0 });
    const prevAt0 = view.host.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous Position keyframe"]',
    );
    expect(prevAt0).not.toBeNull();
    expect(prevAt0?.disabled).toBe(true);

    view.rerender({ currentTime: 1 });
    const prevAt1 = view.host.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous Position keyframe"]',
    );
    expect(prevAt1?.disabled).toBe(false);
    act(() => view.root.unmount());
  });

  it("uses the same lane row offsets when collapsed, expanded once, and expanded multiple times", () => {
    const view = renderHeader({ expanded: false });
    expect(view.host.querySelectorAll("[data-timeline-lane-top]")).toHaveLength(0);

    const assertAligned = (animations: GsapAnimation[]) => {
      view.rerender({ animations });
      const lanesHost = document.createElement("div");
      document.body.append(lanesHost);
      const lanesRoot = createRoot(lanesHost);
      act(() => {
        lanesRoot.render(
          <TimelinePropertyLanes
            id="timeline-property-lanes-alignment-test"
            animations={animations}
            clipStart={0}
            clipDuration={2}
            clipLeftPx={120}
            clipWidthPx={200}
            accentColor="#3CE6AC"
            isSelected
            currentPercentage={0}
            elementId="clip-1"
            selectedKeyframes={new Set()}
          />,
        );
      });
      expect(
        Array.from(view.host.querySelectorAll<HTMLElement>("[data-timeline-lane-top]")).map(
          (row) => row.style.top,
        ),
      ).toEqual(
        Array.from(lanesHost.querySelectorAll<HTMLElement>("[data-timeline-lane-top]")).map(
          (row) => row.style.top,
        ),
      );
      expect(
        Array.from(lanesHost.querySelectorAll<HTMLElement>("[data-timeline-property-lane]")).map(
          (row) => row.style.left,
        ),
      ).toEqual(animations.map(() => "120px"));
      act(() => lanesRoot.unmount());
    };

    assertAligned([POSITION]);
    assertAligned([POSITION, OPACITY]);
    act(() => view.root.unmount());
  });

  /**
   * Automation lanes are named in the label column, on the same tree as the
   * keyframe rows — not painted inside the lane, where the name sat on top of
   * the envelope it belonged to and scrolled away from its own row.
   */
  describe("audio automation rows", () => {
    const BED: TimelineElement = {
      id: "bed",
      label: "Music Bed",
      tag: "audio",
      start: 0,
      duration: 10,
      track: 0,
      fxChain: JSON.stringify({
        version: 1,
        nodes: [{ type: "peaking", id: "n1", params: { frequency: 1600, gain: -6, q: 1.4 } }],
      }),
      automation: JSON.stringify({
        version: 1,
        lanes: [
          {
            target: "volume",
            points: [
              { t: 0, v: 1 },
              { t: 5, v: 0.4 },
            ],
          },
          {
            target: "fx.n1.gain",
            points: [
              { t: 0, v: 0 },
              { t: 5, v: -6 },
            ],
          },
        ],
      }),
    } as TimelineElement;

    it("offers the effect rack from an effect lane only while audio effects are shown", () => {
      const clip = { ...BED, domId: "bed" } as TimelineElement;
      const gainLabel = (showAudioEffects?: boolean) => {
        const { host, root } = renderHeader({
          keyframeClip: clip,
          animations: [],
          showAudioEffects,
        });
        const button = host
          .querySelector('[data-automation-lane-label="Peaking EQ 1.6 kHz · Gain"]')
          ?.querySelector("button");
        const state = {
          label: button?.getAttribute("aria-label") ?? null,
          disabled: button?.disabled,
        };
        act(() => root.unmount());
        return state;
      };
      expect(gainLabel()).toEqual({
        label: "Show Peaking EQ 1.6 kHz · Gain in the effect rack",
        disabled: false,
      });
      expect(gainLabel(false)).toEqual({ label: null, disabled: true });
    });

    it("names every envelope in the label column", () => {
      const { host, root } = renderHeader({ keyframeClip: BED, animations: [] });
      const rows = Array.from(host.querySelectorAll<HTMLElement>("[data-automation-lane-label]"));
      // The attribute is the ROW's identity, which is the label: a row can hold
      // several clips' envelopes, whose lane targets differ from each other.
      expect(rows.map((r) => r.getAttribute("data-automation-lane-label"))).toEqual([
        "Peaking EQ 1.6 kHz · Gain",
        "Volume",
      ]);
      // A band is named by its frequency: with several of them, "Peaking EQ" says
      // nothing about which is which. Bands sit above the level lanes.
      // Two lines per row: what the effect is, then which knob the envelope
      // drives. One line truncated mid-word in a column this narrow.
      expect(rows.map((r) => r.querySelector("[data-automation-lane-name]")?.textContent)).toEqual([
        "Peaking EQ 1.6 kHz",
        "Volume",
      ]);
      expect(rows.map((r) => r.querySelector("[data-automation-lane-param]")?.textContent)).toEqual(
        [
          "Gain",
          // Volume has no effect behind it, so it has no second line at all.
          undefined,
        ],
      );
      act(() => root.unmount());
    });

    it("hides them when the track is collapsed", () => {
      const { host, root } = renderHeader({
        keyframeClip: BED,
        animations: [],
        expanded: false,
      });
      expect(host.querySelectorAll("[data-automation-lane-label]")).toHaveLength(0);
      act(() => root.unmount());
    });

    it("removes just that envelope from the label column", () => {
      // The panel's automate toggle can only reach a parameter it still shows; a
      // carve's own lanes are not in it at all, so without this an envelope could
      // be created and never deleted.
      const onRemoveAutomationLane = vi.fn();
      const { host, root } = renderHeader({
        keyframeClip: BED,
        animations: [],
        onRemoveAutomationLane,
      });
      const button = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove Peaking EQ 1.6 kHz · Gain automation"]',
      );
      expect(button).not.toBeNull();
      act(() => button?.click());
      expect(onRemoveAutomationLane).toHaveBeenCalledWith("fx.n1.gain");
      act(() => root.unmount());
    });

    it("offers no remove button when the lanes are read-only", () => {
      const { host, root } = renderHeader({ keyframeClip: BED, animations: [] });
      expect(host.querySelectorAll('button[aria-label$="automation"]')).toHaveLength(0);
      act(() => root.unmount());
    });

    it("stacks each envelope's row where its lane is drawn", () => {
      // Same rhythm the canvas uses: automation begins below the keyframe lanes
      // and steps by its own taller row height.
      const { host, root } = renderHeader({ keyframeClip: BED, animations: [OPACITY] });
      const tops = Array.from(
        host.querySelectorAll<HTMLElement>("[data-automation-lane-label]"),
      ).map((r) => r.style.top);
      const base = getTimelineLaneTop(1);
      expect(tops).toEqual([`${base}px`, `${base + AUTOMATION_LANE_H}px`]);
      act(() => root.unmount());
    });
  });

  /**
   * Several clips on one row share a lane row per property, so the label column
   * has to name the row for the property and the header for the track — not for
   * whichever clip happens to be selected.
   */
  describe("a track several clips share", () => {
    const clip = (id: string, over: Partial<TimelineElement>): TimelineElement =>
      ({
        id,
        key: id,
        label: id,
        tag: "audio",
        start: 0,
        duration: 4,
        track: 0,
        ...over,
      }) as TimelineElement;
    const PEAKING = (gain: number) =>
      JSON.stringify({
        version: 1,
        nodes: [{ type: "peaking", id: "n1", params: { frequency: 1000, gain, q: 1.4 } }],
      });
    const NARRATION_1 = clip("narration-1", {
      fxChain: PEAKING(-3),
      automation: JSON.stringify({
        version: 1,
        lanes: [{ target: "fx.n1.gain", points: [{ t: 0, v: -3 }] }],
      }),
    });
    const NARRATION_2 = clip("narration-2", {
      start: 4,
      fxChain: PEAKING(-6),
      automation: JSON.stringify({
        version: 1,
        lanes: [
          { target: "fx.n1.gain", points: [{ t: 0, v: -6 }] },
          { target: "volume", points: [{ t: 0, v: 1 }] },
        ],
      }),
    });
    const ROW = { trackElements: [NARRATION_1, NARRATION_2], clipCount: 2, animations: [] };

    it("lists every clip's envelopes, whichever clip is selected", () => {
      const labels = (host: HTMLElement) =>
        Array.from(host.querySelectorAll("[data-automation-lane-label]")).map((r) =>
          r.getAttribute("data-automation-lane-label"),
        );
      const first = renderHeader({ ...ROW, keyframeClip: NARRATION_1 });
      const second = renderHeader({ ...ROW, keyframeClip: NARRATION_2 });
      // narration-1 has no volume envelope, but the row is still there — it is
      // the track's, and it was its sibling's before the selection moved.
      expect(labels(first.host)).toEqual(["Peaking EQ 1 kHz · Gain", "Volume"]);
      expect(labels(second.host)).toEqual(labels(first.host));
      act(() => first.root.unmount());
      act(() => second.root.unmount());
    });

    it("removes only from the clip it is showing, and offers nothing where it has no lane", () => {
      // A write can only reach the selected clip, so a button on a row that clip
      // is absent from could only remove nothing, or somebody else's envelope.
      const onRemoveAutomationLane = vi.fn();
      const { host, root } = renderHeader({
        ...ROW,
        keyframeClip: NARRATION_1,
        onRemoveAutomationLane,
      });
      expect(
        Array.from(host.querySelectorAll('button[aria-label$="automation"]')).map((b) =>
          b.getAttribute("aria-label"),
        ),
      ).toEqual(["Remove Peaking EQ 1 kHz · Gain automation"]);
      act(() => host.querySelector<HTMLButtonElement>('button[aria-label$="automation"]')?.click());
      expect(onRemoveAutomationLane).toHaveBeenCalledWith("fx.n1.gain");
      act(() => root.unmount());
    });

    it("names the header for the track, not for one of the clips on it", () => {
      const view = renderHeader({ ...ROW, keyframeClip: NARRATION_2 });
      expect(view.host.textContent).not.toContain("narration-2");
      // Asserted on the rendered text, not a `title`: the name wraps now rather
      // than truncating, so it no longer carries a tooltip to be found by.
      expect(view.host.textContent).toContain("Track 1");
      // Alone on the track it is still named for itself.
      view.rerender({
        ...ROW,
        keyframeClip: NARRATION_2,
        trackElements: [NARRATION_2],
        clipCount: 1,
      });
      expect(view.host.textContent).toContain("narration-2");
      act(() => view.root.unmount());
    });
  });

  describe("audio ids and canary gates", () => {
    const VOICE: TimelineElement = {
      id: "voice-1",
      key: "index.html#voice-1",
      domId: "voice-1",
      tag: "audio",
      start: 0,
      duration: 5,
      track: 0,
    };
    const VOICE_2: TimelineElement = {
      ...VOICE,
      id: "voice-2",
      key: "index.html#voice-2",
      domId: "voice-2",
    };

    // A member row is `aria-level="2"`, and without this it looked identical to
    // every top-level row — the nesting existed for a screen reader and not for
    // an eye. B2's design called for the accent rail; only the semantics shipped.
    it("indents a group member's row and gives it the accent rail", () => {
      const view = renderHeader({
        keyframeClip: VOICE,
        animations: [],
        expanded: false,
        isAudioTrack: true,
      });
      const header = () => view.host.querySelector<HTMLElement>('[role="rowheader"]');

      expect(header()?.style.paddingLeft).toBe("");
      expect(header()?.style.borderLeft).toBe("");
      expect(header()?.style.background).not.toContain("linear-gradient");

      view.rerender({
        keyframeClip: VOICE,
        animations: [],
        expanded: false,
        isAudioTrack: true,
        isGroupMember: true,
      });
      expect(header()?.style.paddingLeft).toBe("14px");
      expect(header()?.style.borderLeft).toContain("var(--timeline-accent-rail)");
      act(() => view.root.unmount());
    });

    it("offers the FX button on every audio track", () => {
      const view = renderHeader({
        keyframeClip: VOICE,
        animations: [],
        expanded: false,
        isAudioTrack: true,
      });
      expect(view.host.querySelector('button[aria-label="Effects"]')).not.toBeNull();
      act(() => view.root.unmount());
    });

    // A visual track has no chain to open, so the button must not follow the
    // header onto every row.
    it("withholds the FX button from a non-audio track", () => {
      const view = renderHeader({
        keyframeClip: ELEMENT,
        animations: [],
        expanded: false,
      });
      expect(view.host.querySelector('button[aria-label="Effects"]')).toBeNull();
      act(() => view.root.unmount());
    });

    // A chain belongs to ONE bus, so a track carrying several ungrouped clips
    // gets the pointer instead of the FX button — group first, then mix.
    it("shows the group pointer on a multi-clip ungrouped audio track", () => {
      const opts = {
        keyframeClip: VOICE,
        trackElements: [VOICE, VOICE_2],
        clipCount: 2,
        animations: [],
        expanded: false,
        isAudioTrack: true,
      };
      const pointer = (host: HTMLElement) =>
        host.querySelector('button[aria-label="Effects: group these clips first"]');
      const view = renderHeader(opts);
      expect(pointer(view.host)).not.toBeNull();
      // One clip needs no grouping — the real FX button takes its place.
      view.rerender({ ...opts, trackElements: [VOICE], clipCount: 1 });
      expect(pointer(view.host)).toBeNull();
      expect(view.host.querySelector('button[aria-label="Effects"]')).not.toBeNull();
      act(() => view.root.unmount());
    });

    it("offers grouping on a track of audible videos, not on muted b-roll", () => {
      const aRoll: TimelineElement = {
        ...VOICE,
        id: "a-roll",
        domId: "a-roll",
        tag: "video",
        hasAudio: true,
      };
      const aRoll2: TimelineElement = { ...aRoll, id: "a-roll-2", domId: "a-roll-2" };
      const bRoll: TimelineElement = {
        ...aRoll,
        id: "b-roll",
        domId: "b-roll",
        hasAudio: undefined,
      };
      const bRoll2: TimelineElement = { ...bRoll, id: "b-roll-2", domId: "b-roll-2" };
      const opts = {
        keyframeClip: aRoll,
        trackElements: [aRoll, aRoll2],
        clipCount: 2,
        animations: [],
        expanded: false,
      };
      const pointer = (host: HTMLElement) =>
        host.querySelector<HTMLButtonElement>(
          'button[aria-label="Effects: group these clips first"]',
        );
      const view = renderHeader(opts);
      const button = pointer(view.host);
      expect(button).not.toBeNull();
      act(() => button?.click());
      expect(document.body.textContent).not.toContain("can't be grouped");
      view.rerender({ ...opts, keyframeClip: bRoll, trackElements: [bRoll, bRoll2] });
      expect(pointer(view.host)).toBeNull();
      act(() => view.root.unmount());
    });

    // The header is a 48px column of exactly TWO lines — what the row is, then
    // what you can do to it. The group pointer used to render as a sibling of
    // both, making a third: 17 + 24 + 24 + gaps in a 48px box, which
    // `justify-center` then spilled evenly out of the top and bottom. The name
    // rode 10px above its own row and the pointer collided with the row below.
    // The header GROWS by AUTOMATION_LANE_H for every open lane, and the lanes
    // are absolutely positioned from its top. `justify-center` on the header
    // itself therefore centred the two lines in the FULL height, so opening a
    // lane pushed the name and its controls down on top of the lane rows.
    it("pins the two lines to the top TRACK_H, whatever the header grows to", () => {
      const automated: TimelineElement = {
        ...VOICE,
        automation: JSON.stringify({
          version: 1,
          lanes: [{ target: "volume", points: [{ t: 0, v: 1 }] }],
        }),
      };
      const view = renderHeader({
        keyframeClip: automated,
        trackElements: [automated],
        clipCount: 1,
        animations: [],
        expanded: true,
        isAudioTrack: true,
      });
      const header = view.host.querySelector<HTMLElement>('[role="rowheader"]');
      const lines = header?.children[0] as HTMLElement | undefined;
      expect(lines?.style.height).toBe(`${TRACK_H}px`);
      // The lane row is a sibling of the wrapper, not inside it — it stacks
      // BELOW the two lines rather than sharing their box.
      expect((header?.children.length ?? 0) > 1).toBe(true);
      act(() => view.root.unmount());
    });

    // The header is ONE line: name, clip count, then every control anchored to
    // the right edge. It was two — a name line and a control line — which is
    // what let a stray third child overflow the 48px box; now there is a single
    // row and the controls share one right-aligned group.
    it("keeps the name and every control on one line, controls to the right", () => {
      const view = renderHeader({
        keyframeClip: VOICE,
        trackElements: [VOICE, VOICE_2],
        clipCount: 2,
        animations: [],
        expanded: false,
        isAudioTrack: true,
      });
      const header = view.host.querySelector<HTMLElement>('[role="rowheader"]');
      // One TRACK_H-tall wrapper holding one line.
      const lines = header?.children[0];
      expect(lines?.children).toHaveLength(1);
      // The controls live in a right-anchored group at the end of that line,
      // after the name and the clip count — `ml-auto` is what holds the edge.
      const line = lines?.children[0];
      const controls = line?.lastElementChild as HTMLElement | null;
      expect(controls?.className).toContain("ml-auto");
      expect(
        controls?.querySelector('button[aria-label="Effects: group these clips first"]'),
      ).not.toBeNull();
      // And the clip count is beside the name, not out with the controls.
      expect(controls?.querySelector('[aria-label="2 clips"]')).toBeNull();
      expect(line?.querySelector('[aria-label="2 clips"]')).not.toBeNull();
      act(() => view.root.unmount());
    });
  });
});

// A host themes the timeline by overriding --timeline-* on theme.css, so the
// rendered gutter must carry the CSS variable, not a baked-in colour.
describe("theming", () => {
  it("reads the gutter background and border from timeline theme tokens", () => {
    const view = renderHeader({});
    const header = view.host.querySelector<HTMLElement>('[role="rowheader"]');
    expect(header?.style.background).toBe(defaultTimelineTheme.gutterBackground);
    expect(header?.style.background).toContain("var(--timeline-gutter-bg)");
    expect(header?.style.borderRight).toContain(defaultTimelineTheme.gutterBorder);
    act(() => view.root.unmount());
  });

  // happy-dom's `background` shorthand garbles a `var()` layer next to
  // `linear-gradient(...)` (verified), so this checks the same value through
  // the pure function instead of the broken CSSOM roundtrip.
  it("overlays the group-member tint on the themed gutter, not a hard-coded colour", () => {
    const filled = gutterFill(defaultTimelineTheme.gutterBackground, true);
    expect(filled).toContain("linear-gradient");
    expect(filled.endsWith(defaultTimelineTheme.gutterBackground)).toBe(true);
    expect(gutterFill(defaultTimelineTheme.gutterBackground, false)).toBe(
      defaultTimelineTheme.gutterBackground,
    );
  });
});
