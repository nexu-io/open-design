// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";
import { createRoot } from "react-dom/client";
import { TimelineAutomationLane } from "./TimelineAutomationLane";
import { TimelineReadOnlyContext } from "./timelineReadOnly";
import { PAD_X } from "./automationLaneGeometry";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import { MAX_AUDIO_GAIN } from "@hyperframes/core/audio-gain";
import {
  normalizeAutomation,
  resolveAutomationRange,
  sampleAutomationLane,
  VOLUME_RANGE,
  type HfAutomation,
} from "@hyperframes/core/audio-automation";

const chain: HfAudioFxChain = {
  version: 1,
  nodes: [
    { type: "lowpass", id: "n1", enabled: true, params: {} },
    // No id: the panel has not touched it, so nothing can address it.
    { type: "peaking", enabled: true, params: {} },
    // Worklet-backed: no AudioParams to schedule.
    { type: "compressor", id: "n3", enabled: true, params: {} },
  ],
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderRerenderable(node: React.ReactElement): {
  container: HTMLElement;
  rerender(next: React.ReactElement): void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    container: host,
    rerender: (next) => {
      act(() => {
        root.render(next);
      });
    },
  };
}

function render(node: React.ReactElement): { container: HTMLElement } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { container: host };
}

/**
 * Mount inside a wrapper so propagation can be observed from a real ancestor.
 * A listener on React's own root node is no test of it: two native listeners on
 * one element both run regardless of stopPropagation.
 */
function renderNested(node: React.ReactElement): {
  container: HTMLElement;
  ancestor: HTMLElement;
} {
  const ancestor = document.createElement("div");
  const host = document.createElement("div");
  ancestor.append(host);
  document.body.append(ancestor);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { container: host, ancestor };
}

/** happy-dom has no pointer-event constructors wired to React's synthetic ones,
 *  so events are dispatched as plain typed events with the coordinates React
 *  reads off them. */
function fire(
  el: Element,
  type: string,
  init: {
    clientX?: number;
    clientY?: number;
    button?: number;
    /** Buttons still held. A move reporting none is how a lost capture shows up. */
    buttons?: number;
    altKey?: boolean;
    shiftKey?: boolean;
    key?: string;
  } = {},
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: 0,
    clientY: 0,
    button: 0,
    pointerId: 1,
    altKey: false,
    shiftKey: false,
    ...init,
  });
  act(() => {
    el.dispatchEvent(event);
  });
}

/** Slack the lane insets its drawing by, so an end point is not half clipped. */
const PAD = PAD_X;

const EMPTY: HfAutomation = { version: 1, lanes: [] };

const ramp: HfAutomation = {
  version: 1,
  lanes: [
    {
      target: "volume",
      points: [
        { t: 0, v: 1 },
        { t: 4, v: 0 },
      ],
    },
  ],
};

/**
 * These are geometry and gesture tests, not ceiling tests: a plain 0..1 axis
 * keeps every pointer coordinate below readable. `VOLUME_RANGE` itself reaches
 * the +12 dB authoring ceiling — covered by its own case at the end of this
 * file, and by audioAutomation.test.ts.
 */
const UNIT_RANGE = { ...VOLUME_RANGE, max: 1 };

function laneProps(over: Partial<Parameters<typeof TimelineAutomationLane>[0]> = {}) {
  const target = over.target ?? "volume";
  return {
    duration: 4,
    widthPx: 400,
    leftPx: 100,
    topPx: 28,
    automation: EMPTY,
    accentColor: "#0af",
    playheadSec: null,
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    ...over,
    target,
    range:
      over.range ??
      (target === "volume" ? UNIT_RANGE : (resolveAutomationRange(target, chain) ?? VOLUME_RANGE)),
  };
}

/** happy-dom gives every element a zero-size box; the lane maps pointers
 *  through it, so tests that click need a real one. */
function stubBox(el: Element, box: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("TimelineAutomationLane", () => {
  it("draws a point per breakpoint", () => {
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    expect(container.querySelectorAll("circle").length).toBe(2);
  });

  it("draws a dimmed flat line when the lane is empty", () => {
    const { container } = render(<TimelineAutomationLane {...laneProps()} />);
    expect(container.querySelectorAll("circle").length).toBe(0);
    const path = container.querySelector("path");
    expect(Number(path?.getAttribute("opacity"))).toBeLessThan(0.5);
  });

  it("keeps an end point clear of the lane's edges", () => {
    // A point at t=0 drawn at x=0 is half outside the svg and unclickable; the
    // lane insets its drawing so both ends are whole.
    const ends: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 4, v: 0 },
          ],
        },
      ],
    };
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ends })} />);
    const svg = container.querySelector("svg")!;
    const points = Array.from(container.querySelectorAll("[data-automation-point]"));
    const radius = Number(points[0]!.getAttribute("r"));
    const first = Number(points[0]!.getAttribute("cx"));
    const last = Number(points[1]!.getAttribute("cx"));
    const svgWidth = Number(svg.getAttribute("width"));
    expect(first).toBeGreaterThanOrEqual(radius);
    expect(last).toBeLessThanOrEqual(svgWidth - radius);
    // Wider than the clip by the padding on both sides, so clip time still
    // lines up with screen position.
    expect(svgWidth).toBe(400 + PAD * 2);
  });

  it("draws no plate behind the envelope", () => {
    // The lane used to darken its clip's width, which put a box inside the row and
    // made a stack of lanes read as tiles rather than rows of one timeline. Only the
    // selection rectangle may fill area now, and only while a range is selected.
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("still fills the selected range, which is the one rectangle it draws", () => {
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: ramp, rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } })}
      />,
    );
    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(1);
    expect(rects[0]?.getAttribute("data-automation-selection")).toBe("");
  });

  it("divides one lane from the next with a separator", () => {
    // A stack of envelopes with no rule between them reads as one tall field, and a
    // point near a boundary looks like it belongs to either lane.
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    const border = container.querySelector<HTMLElement>("[data-automation-lane-border]");
    expect(border).not.toBeNull();
    expect(border?.style.height).toBe("1px");
    // Full row width, not just the clip's: it is a lane divider, not part of the clip.
    expect(border?.style.left).toBe("0px");
    expect(border?.style.right).toBe("0px");
    // Cannot eat a press aimed at the envelope underneath it.
    expect(border?.className).toContain("pointer-events-none");
  });

  it("keeps the lane's own height, so the separator cannot shift the geometry", () => {
    // Drawn as an overlay rather than a CSS border for this reason: hit testing maps
    // pointer positions through the svg's box, and a border would move it by a pixel.
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    const lane = container.querySelector<HTMLElement>(".hf-automation-lane");
    const svg = container.querySelector("svg");
    expect(lane?.style.height).toBe(`${AUTOMATION_LANE_H}px`);
    expect(svg?.getAttribute("height")).toBe(String(AUTOMATION_LANE_H));
  });

  it("draws no name of its own — the label column owns it", () => {
    // Over the envelope the name obscured the curve it described, and it scrolled
    // with the canvas away from the row it belonged to. TimelineTrackHeader names
    // each lane in the sticky column instead, on the keyframe rows' own tree.
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ target: "fx.n1.frequency", leftPx: 0 })} />,
    );
    expect(container.querySelector(".hf-automation-name")).toBeNull();
    expect(container.textContent).not.toMatch(/Cutoff/);
  });

  it("offers no control to swap which parameter it draws", () => {
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ target: "fx.n1.frequency" })} />,
    );
    expect(container.querySelector("select")).toBeNull();
  });

  it("adds a point on double-click, at the value the pointer was at", () => {
    const onCommit = vi.fn();
    const { container } = render(<TimelineAutomationLane {...laneProps({ onCommit })} />);
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    // Half way across, and at the very top of the lane => t=2, v=1.
    fire(svg, "dblclick", { clientX: PAD + 200, clientY: 6 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const lane = onCommit.mock.calls[0][0].lanes[0];
    expect(lane.target).toBe("volume");
    // Seeded at 0 so the envelope has somewhere to come from.
    expect(lane.points.length).toBe(2);
    expect(lane.points[1].t).toBeCloseTo(2, 5);
    expect(lane.points[1].v).toBeCloseTo(1, 2);
  });

  it("previews while dragging and persists once on release", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: ramp, onPreview, onCommit })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    // Grab the first point, at x=0 / top of the lane.
    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 100, clientY: 42 });
    fire(svg, "pointermove", { clientX: 120, clientY: 40 });
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onCommit).not.toHaveBeenCalled();
    fire(svg, "pointerup", { clientX: 120, clientY: 40 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("moves the dragged point on screen without waiting for the prop", () => {
    // The live write skips the preview refresh on purpose, so `automation` does
    // not change under the pointer. Before the draft state existed the circle
    // stayed put and only the audio moved.
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    const cyBefore = Number(container.querySelectorAll("circle")[0]!.getAttribute("cy"));
    const cxBefore = Number(container.querySelectorAll("circle")[0]!.getAttribute("cx"));

    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 160, clientY: 40 });

    const dragged = container.querySelectorAll("circle")[0]!;
    expect(Number(dragged.getAttribute("cy"))).toBeGreaterThan(cyBefore + 10);
    expect(Number(dragged.getAttribute("cx"))).toBeGreaterThan(cxBefore + 100);
  });

  it("keeps the dragged position after release, rather than snapping back", () => {
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 160, clientY: 40 });
    const during = Number(container.querySelectorAll("circle")[0]!.getAttribute("cx"));
    fire(svg, "pointerup", { clientX: 160, clientY: 40 });
    expect(Number(container.querySelectorAll("circle")[0]!.getAttribute("cx"))).toBeCloseTo(
      during,
      5,
    );
  });

  it("drops the dragged position when the save does not land", async () => {
    const onCommit = vi.fn(async () => ({ status: "refused" as const, reason: "Locked" }));
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: ramp, onCommit })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    const before = Number(container.querySelectorAll("circle")[0]!.getAttribute("cx"));
    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 160, clientY: 40 });
    fire(svg, "pointerup", { clientX: 160, clientY: 40 });
    await act(async () => {});
    expect(Number(container.querySelectorAll("circle")[0]!.getAttribute("cx"))).toBeCloseTo(
      before,
      5,
    );
  });

  it("follows the prop again once the store catches up", () => {
    const { container, rerender } = renderRerenderable(
      <TimelineAutomationLane {...laneProps({ automation: ramp })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 160, clientY: 40 });
    fire(svg, "pointerup", { clientX: 160, clientY: 40 });
    // The persisted edit lands and the store hands back a different envelope;
    // the lane must defer to it instead of holding the stale draft forever.
    const persisted: HfAutomation = {
      version: 1,
      lanes: [{ target: "volume", points: [{ t: 3, v: 0.25 }] }],
    };
    rerender(<TimelineAutomationLane {...laneProps({ automation: persisted })} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
    expect(Number(circles[0]!.getAttribute("cx"))).toBeCloseTo(PAD + 300, 0);
  });

  it("commits the dragged points when an older save lands mid-drag", () => {
    const onCommit = vi.fn(async (_next: HfAutomation) => ({ status: "saved" as const }));
    const { container, rerender } = renderRerenderable(
      <TimelineAutomationLane {...laneProps({ automation: ramp, onCommit })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 160, clientY: 40 });
    fire(svg, "pointerup", { clientX: 160, clientY: 40 });
    const older = onCommit.mock.calls[0]![0];
    fire(svg, "pointerdown", { clientX: 160, clientY: 40 });
    fire(svg, "pointermove", { clientX: 320, clientY: 40 });
    rerender(<TimelineAutomationLane {...laneProps({ automation: older, onCommit })} />);
    fire(svg, "pointerup", { clientX: 320, clientY: 40 });
    const released = onCommit.mock.calls[1]![0];
    expect(released.lanes[0]!.points[0]!.t).toBeGreaterThan(older.lanes[0]!.points[0]!.t + 1);
  });

  it("keeps lane order when editing, so the view does not switch parameters", () => {
    // The displayed lane defaults to the first one. Moving the edited lane to
    // the end of the list swapped the lane out from under the pointer on the
    // first edit — a 4-point filter sweep became a 2-point one mid-gesture.
    const onCommit = vi.fn();
    const two: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "fx.n1.frequency",
          points: [
            { t: 0, v: 400 },
            { t: 4, v: 8000 },
          ],
        },
        { target: "volume", points: [{ t: 0, v: 1 }] },
      ],
    };
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: two, target: "fx.n1.frequency", onCommit })}
      />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "dblclick", { clientX: 200, clientY: 20 });
    const next: HfAutomation = onCommit.mock.calls[0][0];
    expect(next.lanes.map((l) => l.target)).toEqual(["fx.n1.frequency", "volume"]);
    expect(next.lanes[0]!.points.length).toBe(3);
  });

  it("appends a lane that did not exist yet", () => {
    const onCommit = vi.fn();
    const only: HfAutomation = {
      version: 1,
      lanes: [{ target: "volume", points: [{ t: 0, v: 1 }] }],
    };
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: only, target: "fx.n1.frequency", onCommit })}
      />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "dblclick", { clientX: 200, clientY: 20 });
    expect(onCommit.mock.calls[0][0].lanes.map((l: { target: string }) => l.target)).toEqual([
      "volume",
      "fx.n1.frequency",
    ]);
  });

  it("removes a point on right-click", () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: ramp, onCommit })} />,
    );
    fire(container.querySelectorAll("circle")[0]!, "contextmenu");
    expect(onCommit.mock.calls[0][0].lanes[0].points.length).toBe(1);
  });

  it("drops the lane entirely once its last point is removed", () => {
    const onCommit = vi.fn();
    const single: HfAutomation = {
      version: 1,
      lanes: [{ target: "volume", points: [{ t: 1, v: 0.5 }] }],
    };
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: single, onCommit })} />,
    );
    fire(container.querySelector("circle")!, "contextmenu");
    expect(onCommit.mock.calls[0][0].lanes).toEqual([]);
  });

  it("writes nothing when read-only, and lets the press through to select", () => {
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: ramp, onCommit, onPreview, readOnly: true })}
      />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "dblclick", { clientX: 200, clientY: 6 });
    fire(svg, "pointerdown", { clientX: 0, clientY: 6 });
    fire(svg, "pointermove", { clientX: 100, clientY: 42 });
    fire(container.querySelectorAll("circle")[0]!, "contextmenu");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("marks the points a range has caught, by the same rule Delete uses", () => {
    // Feedback the tinted rectangle cannot give: which POINTS are in the range. The
    // rule has to match the delete path exactly, edges included, or the highlight
    // promises something different from what the key does.
    const dense: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 1, v: 0.8 },
            { t: 2, v: 0.5 },
            { t: 3, v: 0.2 },
            { t: 4, v: 0 },
          ],
        },
      ],
    };
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: dense, rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } })}
      />,
    );
    const marked = Array.from(container.querySelectorAll("[data-automation-point-in-range]"));
    expect(marked).toHaveLength(3); // t=1 and t=3 sit ON the edges and count
    const radii = marked.map((c) => Number(c.getAttribute("r")));
    const plain = Array.from(container.querySelectorAll("[data-automation-point]"))
      .filter((c) => !c.hasAttribute("data-automation-point-in-range"))
      .map((c) => Number(c.getAttribute("r")));
    // Bigger than the points around them, and ringed rather than recoloured — the
    // fill is the parameter's own colour and stays that way.
    expect(Math.min(...radii)).toBeGreaterThan(Math.max(...plain));
    expect(marked[0]?.getAttribute("stroke")).toBe("var(--timeline-text-solid)");
  });

  it("marks nothing when there is no range", () => {
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    expect(container.querySelectorAll("[data-automation-point-in-range]")).toHaveLength(0);
  });

  it("draws a range on the very first drag over a read-only lane", () => {
    // The papercut: the press that selects the clip used to be spent entirely on
    // selecting, so the first drag over a lane did nothing visible and a range took
    // two gestures. One gesture now selects AND draws the range — the selection is
    // ephemeral store state, and nothing can be written through it while the lane
    // is still read-only.
    const onSelect = vi.fn();
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(ramp, { readOnly: true, onSelect, onRangeSelect });
    fire(svg, "pointerdown", at(1, 0.5));
    fire(svg, "pointermove", at(2, 0.5));
    fire(svg, "pointermove", at(3, 0.5));
    fire(svg, "pointerup", at(3, 0.5));

    expect(onSelect).toHaveBeenCalledTimes(1);
    // A flat drag draws a flat box: same value at both corners, since the pointer
    // never left that height.
    expect(onRangeSelect).toHaveBeenLastCalledWith(
      expect.closeTo(1, 1),
      expect.closeTo(3, 1),
      expect.closeTo(0.5, 1),
      expect.closeTo(0.5, 1),
    );
    // Still read-only: selecting is a separate thing from editing.
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onPreview).not.toHaveBeenCalled();
  });

  it("selects the clip when pressed read-only, the only route to editing it", () => {
    // The lane sits below the clip bar, so the timeline's own selection handler
    // never sees this press. Without selecting here the lane could never be
    // made editable at all.
    const onSelect = vi.fn();
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: ramp, readOnly: true, onSelect })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    fire(svg, "pointerdown", { clientX: 40, clientY: 24 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("owns a press it cannot act on too, so the timeline does not scrub under it", () => {
    const { container, ancestor } = renderNested(
      <TimelineAutomationLane {...laneProps({ automation: ramp, readOnly: true })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    let reachedAncestor = false;
    ancestor.addEventListener("pointerdown", () => {
      reachedAncestor = true;
    });
    fire(svg, "pointerdown", { clientX: 40, clientY: 24 });
    expect(reachedAncestor).toBe(false);
  });

  it("owns the press once live, so a double-click is not eaten by the timeline", () => {
    const { container, ancestor } = renderNested(
      <TimelineAutomationLane {...laneProps({ automation: ramp })} />,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    let reachedAncestor = false;
    ancestor.addEventListener("pointerdown", () => {
      reachedAncestor = true;
    });
    fire(svg, "pointerdown", { clientX: 200, clientY: 24 });
    expect(reachedAncestor).toBe(false);
  });

  it("maps a log-read knob so its geometric middle sits mid-lane", () => {
    const sweep: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "fx.n1.frequency",
          points: [
            { t: 0, v: 100 },
            { t: 4, v: 20000 },
          ],
        },
      ],
    };
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: sweep, target: "fx.n1.frequency" })} />,
    );
    const circles = container.querySelectorAll("circle");
    // 100 Hz is the range floor and 20 kHz its ceiling, so the two points sit at
    // the lane's bottom and top.
    const ys = Array.from(circles).map((c) => Number(c.getAttribute("cy")));
    expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys) + 30);
  });
});

/** The lane's own box, so pointer coordinates map to clip time and value. */
const BOX = { left: 100, top: 0, width: 400 + PAD * 2, height: AUTOMATION_LANE_H };

/** x for a clip time, y for a 0..1 unit height, in client coordinates. The
 *  6px inset and the height have to match the lane's own, or a point sits
 *  outside the grab radius and a press silently does nothing. */
const at = (t: number, unit: number) => ({
  clientX: BOX.left + PAD + (t / 4) * 400,
  clientY: BOX.top + 6 + (1 - unit) * (AUTOMATION_LANE_H - 12),
});

const mount = (automation: HfAutomation, over: Record<string, unknown> = {}) => {
  const base = laneProps({ automation, ...over });
  // Narrowed once here: laneProps types these as the prop signature, and every
  // assertion below reads the calls the lane made.
  const props = {
    ...base,
    onPreview: base.onPreview as Mock,
    onCommit: base.onCommit as Mock,
  };
  const { container } = render(<TimelineAutomationLane {...props} />);
  const svg = container.querySelector("svg")!;
  stubBox(svg, BOX);
  return { container, svg, props };
};

describe("TimelineAutomationLane point visibility", () => {
  const opacityOf = (container: HTMLElement, i = 0): string => {
    const circle = container.querySelectorAll<SVGCircleElement>("[data-automation-point]")[i]!;
    return circle.style.opacity;
  };
  const svgOf = (container: HTMLElement): SVGSVGElement =>
    container.querySelector<SVGSVGElement>(".hf-automation-svg")!;
  // React synthesises onPointerEnter/Leave from pointerover/pointerout, so those
  // are the events a hover has to be driven with.
  const enter = (el: Element) => fire(el, "pointerover");
  const leave = (el: Element) => fire(el, "pointerout");

  it("keeps its breakpoints out of sight until the lane is pointed at", () => {
    // A stack of lanes across a long clip is hundreds of discs; at rest the shape
    // of each envelope is what matters, and the handles are only wanted by
    // someone about to grab one.
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    expect(opacityOf(container)).toBe("0");
    // The line itself is not hidden — the envelope still reads at rest.
    expect(container.querySelector<SVGPathElement>("path")?.style.opacity).not.toBe("0");
  });

  it("shows them on hover and hides them again on leave", () => {
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    enter(svgOf(container));
    expect(opacityOf(container)).toBe("1");
    leave(svgOf(container));
    expect(opacityOf(container)).toBe("0");
  });

  it("keeps a selected range's points visible with the pointer away", () => {
    // The range is the subject of a pending Delete, and which points it caught is
    // the thing the author is checking — it cannot depend on where the mouse is.
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: ramp, rangeSelection: { t0: 0, t1: 4, v0: 0, v1: 1 } })}
      />,
    );
    expect(opacityOf(container)).toBe("1");
  });

  it("keeps them visible through a drag that leaves the lane", () => {
    // Dragging a point past the lane's edge fires pointerleave; losing the handle
    // mid-gesture would be the worst moment for it to disappear.
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    const svg = svgOf(container);
    // happy-dom boxes are zero-sized, and the lane maps a pointer through its own
    // box to find the point under it.
    stubBox(svg, { left: 0, top: 0, width: 400 + PAD * 2, height: AUTOMATION_LANE_H });
    enter(svg);
    // The first point of `ramp` is t=0 at full value: the lane's left edge, top.
    fire(svg, "pointerdown", { clientX: PAD, clientY: 6, buttons: 1 });
    fire(svg, "pointermove", { clientX: PAD + 40, clientY: 30, buttons: 1 });
    leave(svg);
    expect(opacityOf(container)).toBe("1");
  });
});

describe("TimelineAutomationLane segment drag", () => {
  const four: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 1, v: 0.8 },
          { t: 2, v: 0.6 },
          { t: 3.5, v: 0.2 },
        ],
      },
    ],
  };

  const previewedPoints = (props: { onPreview: Mock }) =>
    props.onPreview.mock.calls.at(-1)?.[0].lanes[0].points as {
      t: number;
      v: number;
      viaX?: number;
      viaY?: number;
    }[];

  it("thickens the segment and offers a grab cursor only within its hit proximity", () => {
    const { container, svg } = mount(ramp);
    const envelope = container.querySelector<SVGPathElement>("[data-automation-envelope]");
    expect(envelope?.getAttribute("stroke-width")).toBe("1.5");

    fire(svg, "pointermove", at(2, 0.5));
    const active = container.querySelector<SVGPathElement>("[data-automation-segment-active]");
    expect(active).not.toBeNull();
    expect(active?.getAttribute("stroke-width")).toBe("3");
    expect(svg.style.cursor).toBe("grab");

    // Same time span, but far enough above the drawn ramp to be background.
    fire(svg, "pointermove", at(2, 0.9));
    expect(container.querySelector("[data-automation-segment-active]")).toBeNull();
    expect(svg.style.cursor).toBe("crosshair");
  });

  it("moves both segment endpoints by the same time and value delta", () => {
    const { svg, props } = mount(four);
    // Midpoint of the segment from (1, .8) to (2, .6).
    fire(svg, "pointerdown", { ...at(1.5, 0.7), buttons: 1 });
    fire(svg, "pointermove", { ...at(2, 0.5), buttons: 1 });

    const points = previewedPoints(props);
    expect(points[0]).toEqual({ t: 0, v: 1 });
    expect(points[1]!.t).toBeCloseTo(1.5, 2);
    expect(points[2]!.t).toBeCloseTo(2.5, 2);
    expect(points[1]!.v).toBeCloseTo(0.6, 2);
    expect(points[2]!.v).toBeCloseTo(0.4, 2);
    expect(points[3]).toEqual({ t: 3.5, v: 0.2 });
  });

  it("treats a press outside the line's proximity as a background range drag", () => {
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(four, { onRangeSelect });
    fire(svg, "pointerdown", { ...at(1.5, 0.95), buttons: 1 });
    fire(svg, "pointermove", { ...at(2.5, 0.95), buttons: 1 });
    expect(onRangeSelect).toHaveBeenCalled();
    expect(props.onPreview).not.toHaveBeenCalled();
  });

  it("preserves the segment's curve while translating its endpoints", () => {
    const curved: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 1, v: 0.8, viaX: 0.4, viaY: 0.7 },
            { t: 2, v: 0.6 },
            { t: 3.5, v: 0.2 },
          ],
        },
      ],
    };
    const { svg, props } = mount(curved);
    const lineValue = sampleAutomationLane(curved.lanes[0]!, 1.7, "linear");
    fire(svg, "pointerdown", { ...at(1.7, lineValue), buttons: 1 });
    fire(svg, "pointermove", { ...at(2.1, lineValue - 0.1), buttons: 1 });
    const points = previewedPoints(props);
    expect(points[1]?.viaX).toBe(0.4);
    expect(points[1]?.viaY).toBe(0.7);
  });

  it("stops both endpoints together before the next breakpoint", () => {
    const { svg, props } = mount(four);
    fire(svg, "pointerdown", { ...at(1.5, 0.7), buttons: 1 });
    fire(svg, "pointermove", { ...at(4, 0.7), buttons: 1, altKey: true });
    const points = previewedPoints(props);
    expect(points[2]!.t).toBeLessThan(points[3]!.t);
    expect(points[3]!.t - points[2]!.t).toBeCloseTo(0.001, 4);
    expect(points[2]!.t - points[1]!.t).toBeCloseTo(1, 4);
  });

  it("previews every move and persists the segment once on release", () => {
    const { svg, props } = mount(four);
    fire(svg, "pointerdown", { ...at(1.5, 0.7), buttons: 1 });
    for (const t of [1.7, 1.9, 2.1]) {
      fire(svg, "pointermove", { ...at(t, 0.6), buttons: 1 });
    }
    expect(props.onPreview).toHaveBeenCalledTimes(3);
    expect(props.onCommit).not.toHaveBeenCalled();
    fire(svg, "pointerup", { ...at(2.1, 0.6), buttons: 0 });
    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });
});

/** `mount`, plus the re-render a real store update causes — the persisted
 *  automation and the new selection coming back down as props. */
const mountRerenderable = (automation: HfAutomation, over: Record<string, unknown> = {}) => {
  const base = laneProps({ automation, ...over });
  const props = {
    ...base,
    onPreview: base.onPreview as Mock,
    onCommit: base.onCommit as Mock,
  };
  const { container, rerender } = renderRerenderable(<TimelineAutomationLane {...props} />);
  const svg = container.querySelector("svg")!;
  stubBox(svg, BOX);
  return {
    container,
    svg,
    props,
    rerender: (next: Record<string, unknown>) =>
      rerender(<TimelineAutomationLane {...props} {...next} />),
  };
};

describe("TimelineAutomationLane modifiers", () => {
  it("bends a segment when it is Alt-dragged, and leaves the points where they were", () => {
    // The shape is honoured everywhere it is read — drawn, sampled in preview,
    // baked into the render — and this is the gesture that sets it. What it
    // writes is the via point: where the pointer took the line.
    const { svg, props } = mount(ramp);
    fire(svg, "pointerdown", { ...at(2, 0.5), altKey: true });
    fire(svg, "pointermove", { ...at(2, 0.85), altKey: true });
    const previewed = props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    const points = previewed?.lanes[0]?.points ?? [];
    expect(points[0]?.viaX).toBeCloseTo(0.5, 2);
    expect(points[0]?.viaY).toBeCloseTo(0.15, 2); // dragged to 0.85 on a falling ramp
    // The breakpoints themselves are untouched: only the shape between them moved.
    expect(points.map((p) => [p.t, p.v])).toEqual([
      [0, 1],
      [4, 0],
    ]);
  });

  it("bends toward the pointer's own end of the segment", () => {
    // The complaint this model replaced: one exponent always bulged the line near
    // the left-hand breakpoint, wherever it was grabbed. Now grabbing near either
    // end puts the bend there, which is visible in the via point it writes.
    const nearB = mount(ramp);
    fire(nearB.svg, "pointerdown", { ...at(3.4, 0.5), altKey: true });
    fire(nearB.svg, "pointermove", { ...at(3.4, 0.4), altKey: true });
    const right = (nearB.props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)
      ?.lanes[0]?.points[0];
    expect(right?.viaX).toBeCloseTo(0.85, 2);

    const nearA = mount(ramp);
    fire(nearA.svg, "pointerdown", { ...at(0.6, 0.5), altKey: true });
    fire(nearA.svg, "pointermove", { ...at(0.6, 0.6), altKey: true });
    const left = (nearA.props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)
      ?.lanes[0]?.points[0];
    expect(left?.viaX).toBeCloseTo(0.15, 2);
  });

  it("deletes a point on Shift+click", () => {
    // Right-click already removes one, but it is not a gesture a trackpad reaches
    // for. Shift+click is the second route.
    const { svg, props } = mount(ramp);
    fire(svg, "pointerdown", { ...at(0, 1), shiftKey: true });
    fire(svg, "pointerup", { ...at(0, 1), shiftKey: true });
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    expect(written.lanes[0]?.points.map((p) => p.t)).toEqual([4]);
  });

  it("still locks the axis when Shift is held through a drag", () => {
    // Decided on release, not on the press: acting on the press would take the
    // Shift axis-lock away, since both gestures start identically.
    const { svg, props } = mount(ramp);
    fire(svg, "pointerdown", { ...at(0, 1), shiftKey: true });
    fire(svg, "pointermove", { ...at(1.5, 0.4), shiftKey: true });
    fire(svg, "pointerup", { ...at(1.5, 0.4), shiftKey: true });
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    // Both points still there — a drag is a drag, however it ends.
    expect(written.lanes[0]?.points).toHaveLength(2);
  });

  it("leaves a point alone on a plain click", () => {
    const { svg, props } = mount(ramp);
    fire(svg, "pointerdown", at(0, 1));
    fire(svg, "pointerup", at(0, 1));
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    expect(written.lanes[0]?.points).toHaveLength(2);
  });

  it("closes the value field when the lane is pressed, applying what was typed", () => {
    // The field commits on blur, but the lane calls preventDefault on its own
    // pointerdown to keep the timeline from scrubbing — and that suppresses the focus
    // change the blur would have come from, so the field sat open until Enter however
    // far away the next click landed.
    const { svg, container, props } = mount(ramp);
    fire(svg, "dblclick", at(0, 1));
    const input = container.querySelector<HTMLInputElement>(".hf-automation-value");
    expect(input).not.toBeNull();
    act(() => {
      if (!input) return;
      // React tracks the value it set, so assigning `.value` directly is ignored;
      // going through the native setter is what makes onChange fire.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "0.4");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    fire(svg, "pointerdown", at(2, 0.5));
    expect(container.querySelector(".hf-automation-value")).toBeNull();
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    expect(written.lanes[0]?.points[0]?.v).toBeCloseTo(0.4, 5);
  });

  it("straightens a segment on Alt-double-click", () => {
    const curved: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1, curve: 0.6 },
            { t: 4, v: 0 },
          ],
        },
      ],
    };
    const { svg, props } = mount(curved);
    fire(svg, "dblclick", { ...at(2, 0.5), altKey: true });
    const committed = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    expect(committed?.lanes[0]?.points[0]?.curve).toBeUndefined();
  });

  it("locks a Shift-drag to one axis", () => {
    const { svg, props } = mount(ramp);
    // Grab the point at t=0, v=1 (top left) and pull mostly sideways.
    fire(svg, "pointerdown", at(0, 1));
    fire(svg, "pointermove", { ...at(2, 0.9), shiftKey: true });
    const points =
      (props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)?.lanes[0]?.points ?? [];
    const moved = points.find((p) => p.t > 0.5);
    expect(moved).toBeDefined();
    // Value held at exactly where the drag started, despite the vertical travel.
    expect(moved?.v).toBe(1);
  });

  /** Four points, so the middle two have a neighbour on either side. */
  const four: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 1, v: 0.8 },
          { t: 2, v: 0.6 },
          { t: 3.5, v: 0.2 },
        ],
      },
    ],
  };
  const draggedTimes = (props: { onPreview: Mock }) => {
    const points = props.onPreview.mock.calls.at(-1)?.[0].lanes[0].points as
      | { t: number }[]
      | undefined;
    return (points ?? []).map((p) => Number(p.t.toFixed(2)));
  };

  it("stops a dragged point at its neighbour rather than letting it cross", () => {
    // Order is the lane's contract: an envelope is a sequence, and a point that
    // swaps places with its neighbour mid-drag pulls the shape inside out under
    // the pointer. Reaching it is allowed — two points at one instant is a step.
    const { svg, props } = mount(four);
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    // Aimed a whole second past the point at t=2.
    fire(svg, "pointermove", { ...at(3, 0.8), buttons: 1, altKey: true });
    expect(draggedTimes(props)).toEqual([0, 2, 2, 3.5]);
  });

  it("keeps the neighbour it was dragged into, through a normalising round trip", () => {
    // The bug this pins: the lane collapses points that share a `t`, keeping the
    // later one — so a point dragged fully onto its neighbour deleted that
    // neighbour. Stopping a millisecond short is what keeps both, and the check has
    // to run through normalisation because that is where the loss happened, not in
    // the drag.
    const { svg, props } = mount(four);
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(3, 0.8), buttons: 1, altKey: true });
    fire(svg, "pointerup", { ...at(3, 0.8), buttons: 0, altKey: true });
    const committed = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    const normalized = normalizeAutomation(committed!);
    const times = normalized.lanes[0]!.points.map((p) => p.t);
    expect(times).toHaveLength(4);
    // It arrived just under its neighbour rather than on it.
    expect(times[1]).toBeLessThan(times[2]!);
    expect(times[2]! - times[1]!).toBeCloseTo(0.001, 4);
  });

  it("stops it at the neighbour on the way back too", () => {
    const { svg, props } = mount(four);
    fire(svg, "pointerdown", { ...at(2, 0.6), buttons: 1 });
    fire(svg, "pointermove", { ...at(-1, 0.6), buttons: 1, altKey: true });
    expect(draggedTimes(props)).toEqual([0, 1, 1, 3.5]);
  });

  it("snaps a dragged point to the beat grid", () => {
    // By eye, "on the beat" and "20 ms off the beat" look identical.
    const { svg, props } = mount(ramp, { snapTimes: [2] });
    fire(svg, "pointerdown", at(0, 1));
    fire(svg, "pointermove", at(2.02, 1));
    const points =
      (props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)?.lanes[0]?.points ?? [];
    expect(points.find((p) => p.t > 0.5)?.t).toBe(2);
  });

  it("ignores the grid while Alt is held", () => {
    const { svg, props } = mount(ramp, { snapTimes: [2] });
    fire(svg, "pointerdown", at(0, 1));
    fire(svg, "pointermove", { ...at(2.02, 1), altKey: true });
    const points =
      (props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)?.lanes[0]?.points ?? [];
    expect(points.find((p) => p.t > 0.5)?.t).toBeCloseTo(2.02, 2);
  });

  it("takes a second gesture in the same lane, not just the first", () => {
    // The panel had exactly this bug: one edit worked and every later one was
    // swallowed, because the live write skips the resync the next edit reads.
    const { svg, props } = mount(ramp);
    fire(svg, "pointerdown", at(0, 1));
    fire(svg, "pointermove", at(1, 0.8));
    fire(svg, "pointerup", at(1, 0.8));
    fire(svg, "pointerdown", at(4, 0));
    fire(svg, "pointermove", at(3, 0.4));
    const points =
      (props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)?.lanes[0]?.points ?? [];
    // Both ends moved: the first gesture's point is off t=0, the second's off t=4.
    expect(points.map((p) => Number(p.t.toFixed(2)))).toEqual([1, 3]);
  });

  it("types an exact value into a point", () => {
    // -6.0 dB is not a pixel you can find by dragging.
    const { container, svg, props } = mount(ramp);
    fire(svg, "dblclick", at(0, 1));
    const input = container.querySelector<HTMLInputElement>(".hf-automation-value");
    expect(input).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "0.25",
      );
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fire(input!, "keydown", {});
    const key = new Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(key, { key: "Enter" });
    act(() => {
      input?.dispatchEvent(key);
    });
    const committed = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    expect(committed?.lanes[0]?.points[0]?.v).toBe(0.25);
  });

  it("clamps a typed value to the parameter's range", () => {
    const { container, svg, props } = mount(ramp);
    fire(svg, "dblclick", at(0, 1));
    const input = container.querySelector<HTMLInputElement>(".hf-automation-value");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "99");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // React listens for focusout, not blur — blur does not bubble.
    act(() => {
      input?.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    const committed = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    expect(committed?.lanes[0]?.points[0]?.v).toBe(UNIT_RANGE.max);
  });

  it("reaches the authoring ceiling on the real volume range", () => {
    const { container, svg, props } = mount(ramp, { range: VOLUME_RANGE });
    // On the real range unity sits a quarter of the way up, not at the top.
    fire(svg, "dblclick", at(0, 1 / MAX_AUDIO_GAIN));
    const input = container.querySelector<HTMLInputElement>(".hf-automation-value");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "99");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input?.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    const committed = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    // A boosted clip seeds its lane above unity; clamping the lane at 1 while
    // the fader reached +12 dB silently threw the boost away.
    expect(committed?.lanes[0]?.points[0]?.v).toBeCloseTo(MAX_AUDIO_GAIN, 6);
  });
});

/** Two peaks with a dip between them, so a box can take the peaks alone. */
const stacked: HfAutomation = {
  version: 1,
  lanes: [
    {
      target: "volume",
      points: [
        { t: 1, v: 0.9 },
        { t: 2, v: 0.1 },
        { t: 3, v: 0.85 },
      ],
    },
  ],
};

describe("TimelineAutomationLane selection box", () => {
  it("drag on the background selects a range, snapped to the grid", () => {
    const onRangeSelect = vi.fn();
    const { svg } = mount(ramp, { snapTimes: [1], onRangeSelect });
    fire(svg, "pointerdown", at(0.98, 0.5)); // background: no point within grab radius
    fire(svg, "pointermove", at(3, 0.5));
    fire(svg, "pointerup", at(3, 0.5));
    const last = onRangeSelect.mock.calls.at(-1);
    expect(last?.[0]).toBe(1); // snapped to the beat
    expect(last?.[1]).toBeCloseTo(3, 1);
  });

  it("a sub-threshold click clears instead of selecting", () => {
    const onRangeSelect = vi.fn();
    const onRangeClear = vi.fn();
    const { svg } = mount(ramp, { onRangeSelect, onRangeClear });
    fire(svg, "pointerdown", at(1, 0.5));
    fire(svg, "pointerup", at(1.001, 0.5));
    expect(onRangeSelect).not.toHaveBeenCalled();
    expect(onRangeClear).toHaveBeenCalled();
  });

  it("reports both axes of the box a diagonal drag draws", () => {
    // The gesture the whole feature is: a box round some points, not a span of
    // time. Ordered on the way out, so dragging up-and-left is the same box as
    // dragging down-and-right.
    const onRangeSelect = vi.fn();
    const { svg } = mount(ramp, { onRangeSelect });
    fire(svg, "pointerdown", at(3, 0.8));
    fire(svg, "pointermove", at(1, 0.2));
    const last = onRangeSelect.mock.calls.at(-1);
    expect(last?.[0]).toBeCloseTo(1, 1);
    expect(last?.[1]).toBeCloseTo(3, 1);
    expect(last?.[2]).toBeCloseTo(0.2, 1);
    expect(last?.[3]).toBeCloseTo(0.8, 1);
  });

  it("a purely vertical drag still crosses the threshold", () => {
    // The threshold is what tells a box from a click that should clear one, and it
    // has to watch both axes: measured on time alone, a straight-down drag over a
    // dense passage read as a click and cleared the selection instead of drawing.
    const onRangeSelect = vi.fn();
    const onRangeClear = vi.fn();
    const { svg } = mount(ramp, { onRangeSelect, onRangeClear });
    fire(svg, "pointerdown", at(2, 0.9));
    fire(svg, "pointermove", at(2, 0.1));
    fire(svg, "pointerup", at(2, 0.1));
    expect(onRangeSelect).toHaveBeenCalled();
    expect(onRangeClear).not.toHaveBeenCalled();
  });

  it("catches the points inside the box and not one at the same time outside it", () => {
    // What a box is FOR, and the one thing a time range could never do: pick the
    // top of an envelope out of a passage without taking the bottom with it.
    const { container } = mount(stacked, {
      rangeSelection: { t0: 0.5, t1: 3.5, v0: 0.6, v1: 1 },
    });
    const caught = Array.from(container.querySelectorAll("[data-automation-point-in-range]")).map(
      (el) => el.getAttribute("data-automation-point"),
    );
    expect(caught).toEqual(["0", "2"]); // the dip at t=2, v=0.1 is below the box
  });

  it("draws the rect bounded on the value axis, not down the whole lane", () => {
    const { container } = mount(ramp, {
      rangeSelection: { t0: 1, t1: 3, v0: 0.25, v1: 0.75 },
    });
    const rect = container.querySelector("[data-automation-selection]");
    const inner = AUTOMATION_LANE_H - 12;
    // v1 is the upper bound, so it is the smaller y.
    expect(Number(rect?.getAttribute("y"))).toBeCloseTo(6 + 0.25 * inner, 0);
    expect(Number(rect?.getAttribute("height"))).toBeCloseTo(0.5 * inner, 0);
  });

  it("draws the selection rect between its endpoints", () => {
    const { container } = mount(ramp, { rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } });
    const rect = container.querySelector("[data-automation-selection]");
    expect(rect).not.toBeNull();
    expect(Number(rect?.getAttribute("x"))).toBeCloseTo(PAD + 100, 0); // xOf(1) at 400px/4s
    expect(Number(rect?.getAttribute("width"))).toBeCloseTo(200, 0);
  });

  it("point drags still win over range selection", () => {
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(ramp, { onRangeSelect });
    fire(svg, "pointerdown", at(0, 1)); // exactly on a point
    fire(svg, "pointermove", at(1, 0.8));
    fire(svg, "pointerup", at(1, 0.8));
    expect(onRangeSelect).not.toHaveBeenCalled();
    expect(props.onCommit).toHaveBeenCalled();
  });
});

describe("TimelineAutomationLane group drag", () => {
  /** Four points; the middle two sit inside the range the tests select. */
  const four: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 1, v: 0.8 },
          { t: 2, v: 0.6 },
          { t: 3.5, v: 0.2 },
        ],
      },
    ],
  };
  const pointsOf = (props: { onPreview: Mock }) =>
    props.onPreview.mock.calls.at(-1)?.[0].lanes[0].points as { t: number; v: number }[];

  it("moves every selected point by the same distance", () => {
    // Dragging one of a selected set has to move the set: nudging a carve's
    // envelope a beat later, or lifting a passage, is one gesture on a selection,
    // not one drag per point.
    const { svg, props } = mount(four, { rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    // A whole second later and a fifth of the lane's height lower, with Alt so the
    // grid does not round the deltas out from under the assertion.
    fire(svg, "pointermove", { ...at(2, 0.6), buttons: 1, altKey: true });
    const points = pointsOf(props);
    expect(points[1]!.t).toBeCloseTo(2, 2);
    expect(points[2]!.t).toBeCloseTo(3, 2);
    expect(points[1]!.v).toBeCloseTo(0.6, 2);
    expect(points[2]!.v).toBeCloseTo(0.4, 2);
  });

  it("leaves points outside the selection where they are", () => {
    const { svg, props } = mount(four, { rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(1.5, 0.8), buttons: 1, altKey: true });
    const points = pointsOf(props);
    expect(points[0]).toEqual({ t: 0, v: 1 });
    expect(points.at(-1)).toEqual({ t: 3.5, v: 0.2 });
  });

  it("moves only the one under the pointer when it is not in the selection", () => {
    // The selection is elsewhere, so this is an ordinary single-point drag.
    const { svg, props } = mount(four, { rangeSelection: { t0: 3, t1: 3.6, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(1.5, 0.5), buttons: 1, altKey: true });
    const points = pointsOf(props);
    expect(points[1]!.t).toBeCloseTo(1.5, 2);
    expect(points[2]).toEqual({ t: 2, v: 0.6 });
    expect(points[3]).toEqual({ t: 3.5, v: 0.2 });
  });

  it("stops the whole group at the lane's edge rather than piling points up", () => {
    // Clamping each point on its own would squash the shape flat against the
    // boundary; the group has to stop when its first member reaches it.
    const { svg, props } = mount(four, { rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(-4, 0.8), buttons: 1, altKey: true });
    const points = pointsOf(props);
    // The group stopped with its earliest member on zero, a second apart as it
    // began — and the unselected point that was already at zero is still there,
    // which is why the moved pair are the middle two after the sort.
    expect(points.map((p) => Number(p.t.toFixed(2)))).toEqual([0, 0, 1, 3.5]);
  });

  it("clamps the group's values to the lane's own floor and ceiling", () => {
    const { svg, props } = mount(four, { rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(1, 4), buttons: 1, altKey: true });
    const points = pointsOf(props);
    expect(Math.max(...points.map((p) => p.v))).toBeLessThanOrEqual(1);
    // The gap between the two moved points survives the clamp.
    expect(points[1]!.v - points[2]!.v).toBeCloseTo(0.2, 2);
  });

  it("carries the selection along, so the same points stay selected", () => {
    // Otherwise a second nudge is no longer a group drag, and the highlight sits
    // where the points used to be.
    const onRangeSelect = vi.fn();
    const { svg } = mount(four, {
      rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 },
      onRangeSelect,
    });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(2, 0.8), buttons: 1, altKey: true });
    const last = onRangeSelect.mock.calls.at(-1);
    expect(last?.[0]).toBeCloseTo(1.9, 1);
    expect(last?.[1]).toBeCloseTo(3.1, 1);
  });

  it("stops the group at a point it did not select", () => {
    // A box can catch a non-contiguous set — two peaks and not the dip between
    // them — so the constraint is per member, not just the ends of the group.
    // Here the two peaks each have an unselected neighbour a second ahead.
    const peaks: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 1, v: 0.2 },
            { t: 2, v: 0.9 },
            { t: 3, v: 0.5 },
          ],
        },
      ],
    };
    const { svg, props } = mount(peaks, {
      rangeSelection: { t0: 0, t1: 2, v0: 0.8, v1: 1 },
    });
    fire(svg, "pointerdown", { ...at(0, 1), buttons: 1 });
    // Aimed two seconds later; the dip at t=1 is a second away and stays put.
    fire(svg, "pointermove", { ...at(2, 1), buttons: 1, altKey: true });
    fire(svg, "pointerup", { ...at(2, 1), buttons: 0, altKey: true });
    const points = pointsOf(props);
    expect(points.map((p) => Number(p.t.toFixed(2)))).toEqual([1, 1, 3, 3]);
    // And short of them, not onto them: a group drag must not consume what it runs
    // into either, which normalisation is where it would have shown.
    const committed = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined;
    const times = normalizeAutomation(committed!).lanes[0]!.points.map((p) => p.t);
    expect(times).toHaveLength(4);
    expect(times[0]).toBeLessThan(times[1]!);
    expect(times[2]).toBeLessThan(times[3]!);
  });

  it("carries the box's value bounds along too", () => {
    // Both axes, or a vertical nudge slides its own points out of the box that
    // caught them and the second nudge moves fewer of them.
    const onRangeSelect = vi.fn();
    const { svg } = mount(four, {
      rangeSelection: { t0: 0.9, t1: 2.1, v0: 0.5, v1: 0.9 },
      onRangeSelect,
    });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(1, 0.6), buttons: 1, altKey: true });
    const last = onRangeSelect.mock.calls.at(-1);
    expect(last?.[2]).toBeCloseTo(0.3, 1);
    expect(last?.[3]).toBeCloseTo(0.7, 1);
  });
});

describe("TimelineAutomationLane shift axis lock", () => {
  const two: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 1, v: 0.5 },
          { t: 3, v: 0.5 },
        ],
      },
    ],
  };
  const lastPoints = (props: { onPreview: Mock }) =>
    props.onPreview.mock.calls.at(-1)?.[0].lanes[0].points as { t: number; v: number }[];

  it("holds the value when the pointer travels mostly sideways", () => {
    const { svg, props } = mount(two);
    fire(svg, "pointerdown", { ...at(1, 0.5), buttons: 1 });
    fire(svg, "pointermove", { ...at(2, 0.62), buttons: 1, shiftKey: true });
    const moved = lastPoints(props)[0]!;
    expect(moved.t).toBeCloseTo(2, 1);
    expect(moved.v).toBeCloseTo(0.5, 3);
  });

  it("holds the time when the pointer travels mostly up or down", () => {
    const { svg, props } = mount(two);
    fire(svg, "pointerdown", { ...at(1, 0.5), buttons: 1 });
    fire(svg, "pointermove", { ...at(1.05, 0.95), buttons: 1, shiftKey: true });
    const moved = lastPoints(props).find((p) => p.v !== 0.5)!;
    expect(moved.t).toBeCloseTo(1, 3);
    expect(moved.v).toBeGreaterThan(0.5);
  });

  it("keeps the axis it locked, rather than swapping as the pointer wobbles", () => {
    // The lock has to be decided once and held: recomputed per event, whichever
    // axis the last move happened to favour wins, so a hand that drifts up while
    // dragging sideways sees the point move in both — which is no lock at all.
    const { svg, props } = mount(two);
    fire(svg, "pointerdown", { ...at(1, 0.5), buttons: 1 });
    fire(svg, "pointermove", { ...at(1.6, 0.52), buttons: 1, shiftKey: true });
    // Now drift further vertically than the horizontal travel so far.
    fire(svg, "pointermove", { ...at(1.7, 0.95), buttons: 1, shiftKey: true });
    const moved = lastPoints(props)[0]!;
    expect(moved.v).toBeCloseTo(0.5, 3);
    expect(moved.t).toBeCloseTo(1.7, 1);
  });

  it("holds a value lock through sideways drift too", () => {
    const { svg, props } = mount(two);
    fire(svg, "pointerdown", { ...at(1, 0.5), buttons: 1 });
    fire(svg, "pointermove", { ...at(1.02, 0.8), buttons: 1, shiftKey: true });
    fire(svg, "pointermove", { ...at(2.5, 0.85), buttons: 1, shiftKey: true });
    const moved = lastPoints(props).find((p) => p.v !== 0.5)!;
    expect(moved.t).toBeCloseTo(1, 3);
  });

  it("locks an axis for a group drag too", () => {
    const four: HfAutomation = {
      version: 1,
      lanes: [
        {
          target: "volume",
          points: [
            { t: 0, v: 1 },
            { t: 1, v: 0.8 },
            { t: 2, v: 0.6 },
            { t: 3.5, v: 0.2 },
          ],
        },
      ],
    };
    const { svg, props } = mount(four, { rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    fire(svg, "pointermove", { ...at(2, 0.9), buttons: 1, shiftKey: true });
    const points = lastPoints(props);
    // Sideways wins, so both selected points keep the values they started with.
    expect(points[1]!.v).toBeCloseTo(0.8, 3);
    expect(points[2]!.v).toBeCloseTo(0.6, 3);
    expect(points[1]!.t).toBeCloseTo(2, 1);
  });
});

describe("TimelineAutomationLane gesture commits", () => {
  /**
   * One gesture, one persisting commit — which is one undo step.
   *
   * Every pointermove previews; only the release writes. Persisting each move put
   * fragments of one drag in the undo stack, and because those writes race, the
   * chain history needs to coalesce them was broken as often as not: undo took
   * back a few milliseconds of the gesture and read as doing nothing.
   */
  const four: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 1, v: 0.8 },
          { t: 2, v: 0.6 },
          { t: 3.5, v: 0.2 },
        ],
      },
    ],
  };

  it("commits once for a single-point drag, however many moves it took", () => {
    const { svg, props } = mount(four);
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    for (const t of [1.2, 1.4, 1.6, 1.8]) fire(svg, "pointermove", { ...at(t, 0.7), buttons: 1 });
    fire(svg, "pointerup", { ...at(1.8, 0.7), buttons: 0 });
    expect(props.onPreview.mock.calls.length).toBeGreaterThan(1);
    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits once for a group drag", () => {
    const { svg, props } = mount(four, { rangeSelection: { t0: 0.9, t1: 2.1, v0: 0, v1: 1 } });
    fire(svg, "pointerdown", { ...at(1, 0.8), buttons: 1 });
    for (const t of [1.2, 1.5, 1.8]) fire(svg, "pointermove", { ...at(t, 0.8), buttons: 1 });
    fire(svg, "pointerup", { ...at(1.8, 0.8), buttons: 0 });
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    // And what it commits is the moved set, not the shape it started from.
    const committed = props.onCommit.mock.calls[0]![0].lanes[0].points as { t: number }[];
    expect(committed[1]!.t).toBeGreaterThan(1);
  });

  it("commits once for a bend", () => {
    const { svg, props } = mount(four);
    // Alt-drag the line between two points curves that segment.
    fire(svg, "pointerdown", { ...at(1.5, 0.7), buttons: 1, altKey: true });
    for (const v of [0.6, 0.5, 0.4])
      fire(svg, "pointermove", { ...at(1.5, v), buttons: 1, altKey: true });
    fire(svg, "pointerup", { ...at(1.5, 0.4), buttons: 0, altKey: true });
    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("TimelineAutomationLane selection menu", () => {
  it("right-click inside the selection opens the shape menu", () => {
    const { container, svg } = mount(ramp, { rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } });
    fire(svg, "contextmenu", at(2, 0.5));
    expect(document.querySelector(".hf-automation-menu")).not.toBeNull();
    // The menu portals to document.body, outside `container` — dismiss it via
    // Escape before tearing down, or it leaks into the next test's DOM query.
    const escape = new Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(escape, { key: "Escape" });
    act(() => {
      document.dispatchEvent(escape);
    });
    expect(document.querySelector(".hf-automation-menu")).toBeNull();
    act(() => container.remove());
  });

  it("inserting a swell replaces the range and commits once", () => {
    const { svg, props } = mount(ramp, { rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } });
    fire(svg, "contextmenu", at(2, 0.5));
    const swell = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".hf-automation-menu button"),
    ).find((b) => b.textContent === "Swell");
    expect(swell).toBeTruthy();
    act(() => swell?.click());
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    const points =
      (props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation | undefined)?.lanes[0]?.points ?? [];
    expect(points.some((p) => p.t === 2 && p.v === 1)).toBe(true); // peak at range.max
  });

  it("right-click outside the selection does not open it", () => {
    const { svg } = mount(ramp, { rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } });
    fire(svg, "contextmenu", at(3.8, 0.5));
    expect(document.querySelector(".hf-automation-menu")).toBeNull();
  });
});

describe("TimelineAutomationLane stretch", () => {
  // Most edges here are off any existing point, which is the EASY case. The
  // normal state after any range operation is the opposite — delete, shape
  // insert and stretch all leave a breakpoint exactly on the edge they created
  // — so the priority test below is the one that decides whether the feature is
  // repeatable, not an edge case.

  /** Press, drag and release the right edge of a stretchable selection — the
   *  shape most of this block's tests share, differing only in where the
   *  drag ends up. */
  function dragRightEdge(svg: Element, from: number, to: number): void {
    fire(svg, "pointerdown", at(from, 0.5));
    fire(svg, "pointermove", at(to, 0.5));
    fire(svg, "pointerup", at(to, 0.5));
  }

  const stretchable: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 1, v: 0.5 },
          { t: 2, v: 0.8 },
          { t: 4, v: 0 },
        ],
      },
    ],
  };

  it("dragging the right edge retimes the interior and persists on release", () => {
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeSelect,
    });
    dragRightEdge(svg, 2.5, 3.3); // off any point, dragged out to 3.3

    expect(props.onCommit).toHaveBeenCalledTimes(1);
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    const points = written.lanes[0]?.points ?? [];
    // Interior points (t=1, t=2) scale by the new/old span ratio (2.8 / 2 = 1.4).
    expect(points.some((p) => Math.abs(p.t - 1.2) < 0.01 && p.v === 0.5)).toBe(true);
    expect(points.some((p) => Math.abs(p.t - 2.6) < 0.01 && p.v === 0.8)).toBe(true);

    expect(onRangeSelect).toHaveBeenLastCalledWith(0.5, expect.closeTo(3.3, 1), 0, 1);
  });

  it("moves the selection with the pointer instead of snapping it on release", () => {
    // The highlight and both edge lines render from the rangeSelection prop, so
    // a stretch that only reported its bounds on release dragged an invisible
    // handle: the rect stayed pinned at the pre-drag bounds for the whole
    // gesture. The marquee drag fires live for exactly this reason.
    const onRangeSelect = vi.fn();
    const { svg } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeSelect,
    });
    fire(svg, "pointerdown", at(2.5, 0.5));
    fire(svg, "pointermove", at(3, 0.5));
    expect(onRangeSelect).toHaveBeenLastCalledWith(0.5, expect.closeTo(3, 1), 0, 1);
    fire(svg, "pointermove", at(3.3, 0.5));
    expect(onRangeSelect).toHaveBeenLastCalledWith(0.5, expect.closeTo(3.3, 1), 0, 1);
  });

  it("a bare click on an edge clears the selection instead of committing a no-op", () => {
    // Without a movement threshold this pushed an undo entry that changed
    // nothing, and — because the halo covers both edges — it also made the
    // "click the background to clear" escape unreachable near either one.
    const onRangeSelect = vi.fn();
    const onRangeClear = vi.fn();
    const { svg, props } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeSelect,
      onRangeClear,
    });
    fire(svg, "pointerdown", at(2.5, 0.5));
    fire(svg, "pointerup", at(2.5, 0.5));
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onPreview).not.toHaveBeenCalled();
    expect(onRangeSelect).not.toHaveBeenCalled();
    expect(onRangeClear).toHaveBeenCalledTimes(1);
  });

  it("a press that jitters under the threshold still clears rather than retiming", () => {
    const onRangeClear = vi.fn();
    const { svg, props } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeClear,
    });
    fire(svg, "pointerdown", at(2.5, 0.5));
    // ~2px at 100 px/s: a hand resting on the button, not a drag.
    fire(svg, "pointermove", at(2.52, 0.5));
    fire(svg, "pointerup", at(2.52, 0.5));
    expect(props.onPreview).not.toHaveBeenCalled();
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(onRangeClear).toHaveBeenCalledTimes(1);
  });

  it("reverts an interrupted stretch rather than persisting the partial retime", () => {
    // pointercancel means the browser abandoned the gesture. Routing it to the
    // same handler as pointerup persisted whatever half-drag it had reached,
    // with no way back other than undo.
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeSelect,
    });
    fire(svg, "pointerdown", at(2.5, 0.5));
    fire(svg, "pointermove", at(3.3, 0.5));
    fire(svg, "pointercancel", at(3.3, 0.5));

    expect(props.onCommit).not.toHaveBeenCalled();
    // The envelope goes back through the preview channel — nothing to undo —
    // and the selection returns to the bounds the drag started from.
    const reverted = (props.onPreview.mock.calls.at(-1)?.[0] as HfAutomation | undefined)?.lanes[0]
      ?.points;
    expect(reverted).toEqual(stretchable.lanes[0]?.points);
    expect(props.onPreview.mock.calls.at(-1)?.[1]).toBe(true);
    expect(onRangeSelect).toHaveBeenLastCalledWith(0.5, 2.5, 0, 1);
  });

  it("gives up a stretch whose pointer capture vanished without a cancel", () => {
    // A capture taken on a child that unmounts mid-drag is lost silently: no
    // pointercancel, no pointerup. Every later hover kept retiming and writing.
    const { svg, props } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
    });
    fire(svg, "pointerdown", at(2.5, 0.5));
    fire(svg, "pointermove", { ...at(3.3, 0.5), buttons: 1 });
    fire(svg, "pointermove", { ...at(3.4, 0.5), buttons: 0 });
    const writes = props.onPreview.mock.calls.length;

    fire(svg, "pointermove", { ...at(3.8, 0.5), buttons: 0 });
    fire(svg, "pointermove", { ...at(1, 0.5), buttons: 0 });
    expect(props.onPreview.mock.calls.length).toBe(writes);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("previews the stretch on move without persisting, then commits once on release", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const { svg } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onPreview,
      onCommit,
    });
    fire(svg, "pointerdown", at(2.5, 0.5));
    fire(svg, "pointermove", at(3, 0.5));
    fire(svg, "pointermove", at(3.3, 0.5));
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onCommit).not.toHaveBeenCalled();
    fire(svg, "pointerup", at(3.3, 0.5));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  /** A breakpoint sitting exactly on the selection's right edge — the state every
   *  range operation leaves behind, and the one a stretch has to be able to grab
   *  a second time. */
  const pointOnEdge: HfAutomation = {
    version: 1,
    lanes: [
      {
        target: "volume",
        points: [
          { t: 0, v: 1 },
          { t: 1.5, v: 0.5 },
          { t: 2, v: 0.8 },
          { t: 4, v: 0 },
        ],
      },
    ],
  };

  it("a point sitting exactly on the edge is selected content, not the edge", () => {
    // #3207's rule was the opposite — the edge won, so a repeated stretch of the
    // same edge (which pins a breakpoint there) always resolved to a point-drag.
    // A box selection changes the question: with value bounds as well as time,
    // a point on the edge is visibly INSIDE the box, and dragging selected
    // content has to move it or the box means nothing. So the press below drags
    // the group the box already caught — both points inside it — rather than
    // stretching the edge; the box travels with them.
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(pointOnEdge, {
      rangeSelection: { t0: 1, t1: 2, v0: 0, v1: 1 },
      onRangeSelect,
    });
    fire(svg, "pointerdown", at(2, 0.8)); // the point at t=2, which is also the right edge
    fire(svg, "pointermove", at(3, 0.8));
    fire(svg, "pointerup", at(3, 0.8));
    expect(onRangeSelect).toHaveBeenLastCalledWith(2, expect.closeTo(3, 1), 0, 1);
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    const times = (written.lanes[0]?.points ?? []).map((p) => p.t);
    // Both points the box caught (t=1.5 and t=2) moved by the same +1 delta.
    expect(times.some((t) => Math.abs(t - 2.5) < 0.01)).toBe(true);
    expect(times.some((t) => Math.abs(t - 3) < 0.01)).toBe(true);
  });

  it("leaves that point reachable once the selection is gone", () => {
    // The escape hatch the rule above depends on: no selection, no handle, so
    // the point is an ordinary point again.
    const onRangeSelect = vi.fn();
    const { svg, props } = mount(pointOnEdge, { rangeSelection: null, onRangeSelect });
    fire(svg, "pointerdown", at(2, 0.8));
    fire(svg, "pointermove", at(3, 0.8));
    fire(svg, "pointerup", at(3, 0.8));
    const written = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    const times = (written.lanes[0]?.points ?? []).map((p) => p.t);
    expect(times).toContain(3);
  });

  it("stretches the same edge twice in a row", () => {
    // The whole point of the priority rule, end to end: two stretches of the
    // right edge, the second grabbing the breakpoint the first one left there.
    const onRangeSelect = vi.fn();
    const { svg, props, rerender } = mountRerenderable(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2, v0: 0, v1: 1 },
      onRangeSelect,
    });
    dragRightEdge(svg, 2, 2.6);
    expect(onRangeSelect).toHaveBeenLastCalledWith(0.5, expect.closeTo(2.6, 1), 0, 1);
    const afterFirst = props.onCommit.mock.calls.at(-1)?.[0] as HfAutomation;
    // A breakpoint landed on the new edge, which is what used to disarm it.
    expect((afterFirst.lanes[0]?.points ?? []).some((p) => Math.abs(p.t - 2.6) < 0.05)).toBe(true);

    // The store comes back with the persisted envelope and the new selection.
    rerender({ automation: afterFirst, rangeSelection: { t0: 0.5, t1: 2.6, v0: 0, v1: 1 } });
    dragRightEdge(svg, 2.6, 3.4);
    expect(onRangeSelect).toHaveBeenLastCalledWith(0.5, expect.closeTo(3.4, 1), 0, 1);
    expect(props.onCommit).toHaveBeenCalledTimes(2);
  });

  it("keeps the far edge grabbable on a selection narrower than its own halos", () => {
    // A selection this thin — a pasted short span, or any span at low zoom — has
    // both handles under one press, so which edge a press takes is decided
    // entirely by the midpoint split. Characterizing it here because nothing
    // else does: every other test in this block has halos far enough apart that
    // the rule never comes up.
    const onRangeSelect = vi.fn();
    const { svg } = mount(stretchable, {
      rangeSelection: { t0: 2, t1: 2.08, v0: 0, v1: 1 }, // 8px wide at 100 px/s: both halos overlap
      onRangeSelect,
    });
    fire(svg, "pointerdown", at(2.07, 0.5)); // nearer t1, inside t0's halo too
    fire(svg, "pointermove", at(3, 0.5));
    fire(svg, "pointerup", at(3, 0.5));
    // t0 stayed put and t1 moved out: the press resolved to the right edge.
    expect(onRangeSelect).toHaveBeenLastCalledWith(2, expect.closeTo(3, 1), 0, 1);
  });

  it("clamps the dragged edge so it cannot cross its partner", () => {
    const onRangeSelect = vi.fn();
    const { svg } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeSelect,
    });
    dragRightEdge(svg, 2.5, 0.3); // dragged past the left edge (t0=0.5)
    const [, t1] = onRangeSelect.mock.calls.at(-1) as [number, number];
    expect(t1).toBeGreaterThan(0.5);
  });

  it("clamps the dragged edge to the lane's own duration", () => {
    const onRangeSelect = vi.fn();
    const { svg } = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onRangeSelect,
    });
    dragRightEdge(svg, 2.5, 10); // far past the clip's own duration (4s)
    const [, t1] = onRangeSelect.mock.calls.at(-1) as [number, number];
    expect(t1).toBeLessThanOrEqual(4);
  });

  it("retimes identically whether the right edge arrives in one move or several", () => {
    // moveEdge must always retime from the points snapshotted at arm time,
    // never from the live draft — retimeRange is a RELATIVE transform (it
    // scales the lane's OWN current point positions by newSpan/oldSpan), so
    // feeding it the live draft on every pointermove compounds the scale
    // factor instead of applying it once. A real drag fires dozens of moves;
    // this asserts the FINAL preview is identical regardless of how many.
    const onPreviewSingle = vi.fn();
    const single = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onPreview: onPreviewSingle,
    });
    fire(single.svg, "pointerdown", at(2.5, 0.5));
    fire(single.svg, "pointermove", at(3.3, 0.5));
    const singleShot = (onPreviewSingle.mock.calls.at(-1)?.[0] as HfAutomation | undefined)
      ?.lanes[0]?.points;
    expect(singleShot).toBeDefined();

    const onPreviewMulti = vi.fn();
    const multi = mount(stretchable, {
      rangeSelection: { t0: 0.5, t1: 2.5, v0: 0, v1: 1 },
      onPreview: onPreviewMulti,
    });
    fire(multi.svg, "pointerdown", at(2.5, 0.5));
    // At least 3 separate pointermoves crossing the same span, not one jump.
    fire(multi.svg, "pointermove", at(2.7, 0.5));
    fire(multi.svg, "pointermove", at(2.9, 0.5));
    fire(multi.svg, "pointermove", at(3.1, 0.5));
    fire(multi.svg, "pointermove", at(3.3, 0.5));
    const afterFourMoves = (onPreviewMulti.mock.calls.at(-1)?.[0] as HfAutomation | undefined)
      ?.lanes[0]?.points;
    expect(afterFourMoves).toBeDefined();

    // Both interior points (t=1, t=2) land exactly where a single-shot retime
    // puts them — not compounded, and not dropped.
    expect(afterFourMoves).toEqual(singleShot);
    expect(afterFourMoves?.length).toBe(6);
    expect(afterFourMoves?.some((p) => Math.abs(p.t - 1.2) < 0.001 && p.v === 0.5)).toBe(true);
    expect(afterFourMoves?.some((p) => Math.abs(p.t - 2.6) < 0.001 && p.v === 0.8)).toBe(true);
  });

  it("retimes identically whether the left edge arrives in one move or several", () => {
    const onPreviewSingle = vi.fn();
    const single = mount(stretchable, {
      rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 },
      onPreview: onPreviewSingle,
    });
    fire(single.svg, "pointerdown", at(1, 0.5));
    fire(single.svg, "pointermove", at(0.2, 0.5));
    const singleShot = (onPreviewSingle.mock.calls.at(-1)?.[0] as HfAutomation | undefined)
      ?.lanes[0]?.points;
    expect(singleShot).toBeDefined();

    const onPreviewMulti = vi.fn();
    const multi = mount(stretchable, {
      rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 },
      onPreview: onPreviewMulti,
    });
    fire(multi.svg, "pointerdown", at(1, 0.5));
    fire(multi.svg, "pointermove", at(0.7, 0.5));
    fire(multi.svg, "pointermove", at(0.4, 0.5));
    fire(multi.svg, "pointermove", at(0.2, 0.5));
    const afterThreeMoves = (onPreviewMulti.mock.calls.at(-1)?.[0] as HfAutomation | undefined)
      ?.lanes[0]?.points;
    expect(afterThreeMoves).toBeDefined();
    expect(afterThreeMoves).toEqual(singleShot);
  });

  it("shows a resize cursor when hovering an edge with nothing else live", () => {
    const { svg } = mount(ramp, { rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } });
    fire(svg, "pointermove", at(3, 0.5)); // near the right edge, nothing pressed
    expect(svg.style.cursor).toBe("col-resize");
  });

  it("keeps the normal cursor away from the selection's edges", () => {
    const { svg } = mount(ramp, { rangeSelection: { t0: 1, t1: 3, v0: 0, v1: 1 } });
    fire(svg, "pointermove", at(2, 0.5)); // middle of the selection, not an edge
    expect(svg.style.cursor).not.toBe("col-resize");
  });
});

describe("TimelineAutomationLane — a read-only lane offers nothing to grab", () => {
  /** Hover the lane the way a pointer entering it does. */
  function hover(container: HTMLElement): SVGSVGElement {
    const svg = container.querySelector("svg")!;
    stubBox(svg, { left: 0, top: 0, width: 400, height: 48 });
    // React implements onPointerEnter through the delegated `pointerover`
    // event, not a native `pointerenter` — which does not bubble and so never
    // reaches its listener.
    fire(svg, "pointerover");
    return svg as SVGSVGElement;
  }

  const handles = (container: HTMLElement) =>
    [...container.querySelectorAll("circle[data-automation-point]")] as SVGCircleElement[];

  // A grab handle raised on hover is an offer, and a carve lane cannot honour
  // it: the analysis rewrites these envelopes on every run, so a point moved
  // here is discarded rather than saved. Dimming alone did not say that — the
  // handles still came up under the cursor and the drag silently did nothing.
  it("keeps its point handles hidden on hover", () => {
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: ramp, readOnly: true, readOnlyNote: "Owned by the carve." })}
      />,
    );
    hover(container);
    const drawn = handles(container);
    expect(drawn.length).toBeGreaterThan(0);
    for (const c of drawn) {
      expect(c.style.opacity).toBe("0");
      expect(c.style.cursor).toBe("default");
    }
  });

  it("still raises them on an editable lane, so the gate is readOnly and not hover", () => {
    const { container } = render(<TimelineAutomationLane {...laneProps({ automation: ramp })} />);
    hover(container);
    const drawn = handles(container);
    expect(drawn.length).toBeGreaterThan(0);
    for (const c of drawn) {
      expect(c.style.opacity).toBe("1");
      expect(c.style.cursor).toBe("grab");
    }
  });

  it("says why, in the lane, once hovered", () => {
    const { container } = render(
      <TimelineAutomationLane
        {...laneProps({ automation: ramp, readOnly: true, readOnlyNote: "Owned by the carve." })}
      />,
    );
    expect(container.querySelector("[data-automation-readonly-note]")).toBeNull();
    hover(container);
    expect(container.querySelector("[data-automation-readonly-note]")?.textContent).toContain(
      "Owned by the carve.",
    );
  });

  it("says nothing when no reason was given", () => {
    const { container } = render(
      <TimelineAutomationLane {...laneProps({ automation: ramp, readOnly: true })} />,
    );
    hover(container);
    expect(container.querySelector("[data-automation-readonly-note]")).toBeNull();
  });
});

describe("TimelineAutomationLane inside a read-only timeline", () => {
  it("reports a point drag and a double-click once each, and writes nothing", () => {
    const onReadOnlyPress = vi.fn();
    const props = laneProps({ automation: ramp, readOnly: true });
    const { container } = render(
      <TimelineReadOnlyContext.Provider value={onReadOnlyPress}>
        <TimelineAutomationLane {...props} />
      </TimelineReadOnlyContext.Provider>,
    );
    const svg = container.querySelector("svg")!;
    stubBox(svg, BOX);
    fire(svg, "pointerdown", at(0, 1));
    fire(svg, "pointermove", at(1, 0.6));
    fire(svg, "pointermove", at(2, 0.4));
    fire(svg, "pointerup", at(2, 0.4));
    expect(onReadOnlyPress).toHaveBeenCalledTimes(1);
    fire(svg, "dblclick", at(2, 0.4));
    expect(onReadOnlyPress).toHaveBeenCalledTimes(2);
    expect(props.onCommit).not.toHaveBeenCalled();
  });
});
