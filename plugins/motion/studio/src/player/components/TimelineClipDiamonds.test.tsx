// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import {
  TimelineClipDiamonds,
  TimelineDiamondLane,
  type TimelineDiamondKeyframe,
} from "./TimelineClipDiamonds";
import { timelineKeyframeSelectionKey } from "./timelineKeyframeIdentity";
import { configureTimelineTestViewport } from "./timelineTestViewport";
import { readPendingTimelineKeyframeRetimes } from "./useTimelineKeyframeHandlers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.setState({ elements: [], timelineSessionEpoch: 0 });
});

const RETIME_ELEMENT: TimelineElement = {
  id: "clip-1",
  label: "Clip",
  tag: "div",
  start: 0,
  duration: 10,
  track: 0,
};

function pointerEvent(type: string, init: PointerEventInit): Event {
  const event =
    typeof PointerEvent === "function" ? new PointerEvent(type, init) : new MouseEvent(type, init);
  if (!("pointerId" in event)) {
    Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 0 });
  }
  return event;
}

function createTimelineHost() {
  const host = document.createElement("div");
  host.setAttribute("data-timeline-scroll-viewport", "");
  document.body.append(host);
  return host;
}

function renderDiamonds(onClickKeyframe = vi.fn(), onShiftClickKeyframe = vi.fn()) {
  const host = createTimelineHost();
  const root = createRoot(host);
  act(() => {
    root.render(
      <TimelineClipDiamonds
        keyframesData={{
          format: "percentage",
          keyframes: [
            { percentage: 0, properties: { x: 0 } },
            { percentage: 50, properties: { x: 100 } },
          ],
        }}
        clipWidthPx={200}
        clipHeightPx={48}
        accentColor="#4ba3d2"
        isSelected
        currentPercentage={0}
        elementId="clip-1"
        clipStart={10}
        clipDuration={10}
        selectedKeyframes={new Set()}
        onClickKeyframe={onClickKeyframe}
        onShiftClickKeyframe={onShiftClickKeyframe}
      />,
    );
  });
  return { host, root, onClickKeyframe, onShiftClickKeyframe };
}

it("pins authored keyframes outside the clip to an inspectable boundary marker", () => {
  const host = createTimelineHost();
  const root = createRoot(host);
  act(() => {
    root.render(
      <TimelineDiamondLane
        keyframesData={{
          format: "percentage",
          keyframes: [
            { percentage: -40, properties: { x: 0 }, propertyGroup: "position" },
            { percentage: -20, properties: { x: 25 }, propertyGroup: "position" },
            { percentage: 5, properties: { x: 50 }, propertyGroup: "position" },
            { percentage: 120, properties: { x: 100 }, propertyGroup: "position" },
          ],
        }}
        clipWidthPx={200}
        clipHeightPx={48}
        accentColor="#4ba3d2"
        isSelected
        currentPercentage={5}
        elementId="clip-1"
        clipStart={10}
        clipDuration={10}
        selectedKeyframes={new Set()}
      />,
    );
  });

  const before = host.querySelectorAll<HTMLButtonElement>('[data-keyframe-outside-clip="before"]');
  const after = host.querySelector<HTMLButtonElement>('[data-keyframe-outside-clip="after"]');
  expect(Array.from(before, (marker) => marker.style.left)).toEqual(["-35px", "-23px"]);
  expect(before[0]?.getAttribute("aria-label")).toBe("position keyframe at 6s (before clip)");
  expect(after?.style.left).toBe("201px");
  expect(after?.getAttribute("aria-label")).toBe("position keyframe at 22s (after clip)");
  expect(host.querySelectorAll('button[aria-label*="keyframe at"]')).toHaveLength(4);

  act(() => root.unmount());
});

function renderRetimeLane(
  onMoveKeyframe = vi.fn().mockResolvedValue(true),
  strict = false,
  options: {
    elementId?: string;
    host?: HTMLDivElement;
    keyframes?: TimelineDiamondKeyframe[];
  } = {},
) {
  const elementId = options.elementId ?? RETIME_ELEMENT.id;
  if (!options.host) {
    usePlayerStore.setState({ elements: [{ ...RETIME_ELEMENT, id: elementId, key: elementId }] });
  }
  const host = options.host ?? createTimelineHost();
  const keyframes = options.keyframes ?? [
    {
      percentage: 0,
      tweenPercentage: 0,
      propertyGroup: "position",
      animationId: "anim-1",
      properties: { x: 0 },
    },
    {
      percentage: 50,
      tweenPercentage: 50,
      propertyGroup: "position",
      animationId: "anim-1",
      properties: { x: 100 },
    },
    {
      percentage: 100,
      tweenPercentage: 100,
      propertyGroup: "position",
      animationId: "anim-1",
      properties: { x: 200 },
    },
  ];
  const onClickKeyframe = vi.fn();
  const mountLane = () => {
    const laneHost = document.createElement("div");
    host.append(laneHost);
    const root = createRoot(laneHost);
    const lane = (
      <TimelineDiamondLane
        keyframesData={{
          format: "percentage",
          keyframes,
        }}
        clipWidthPx={200}
        clipHeightPx={48}
        accentColor="#4ba3d2"
        isSelected
        currentPercentage={0}
        elementId={elementId}
        selectedKeyframes={new Set()}
        onClickKeyframe={onClickKeyframe}
        onMoveKeyframe={onMoveKeyframe}
        groupAware
      />
    );
    act(() => {
      root.render(strict ? <React.StrictMode>{lane}</React.StrictMode> : lane);
    });
    const diamond = laneHost.querySelector<HTMLButtonElement>(
      `button[title="${keyframes[1]?.percentage}%"]`,
    );
    expect(diamond).not.toBeNull();
    return { diamond: diamond!, root };
  };
  return { ...mountLane(), host, mountLane, onClickKeyframe, onMoveKeyframe };
}

describe("TimelineClipDiamonds", () => {
  it("marks only the nearest keyframe in a dense lane as under the playhead", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [34.6, 34.8, 35, 35.2, 35.4].map((percentage) => ({
              percentage,
              propertyGroup: "position",
              properties: { x: percentage },
            })),
          }}
          clipWidthPx={4000}
          clipHeightPx={48}
          clipDuration={12}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={35.05}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          groupAware
        />,
      );
    });

    expect(host.querySelectorAll('[data-keyframe-at-playhead="true"]')).toHaveLength(1);
    expect(host.querySelector<HTMLButtonElement>('[data-keyframe-at-playhead="true"]')?.title).toBe(
      "35%",
    );
    act(() => root.unmount());
  });

  it("distinguishes a playhead match from an explicitly selected keyframe", () => {
    const selectedKey = timelineKeyframeSelectionKey("clip-1", {
      percentage: 60,
      propertyGroup: "position",
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              { percentage: 40, propertyGroup: "position", properties: { x: 40 } },
              { percentage: 60, propertyGroup: "position", properties: { x: 60 } },
            ],
          }}
          clipWidthPx={1200}
          clipHeightPx={48}
          clipDuration={10}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={40}
          elementId="clip-1"
          selectedKeyframes={new Set([selectedKey])}
          groupAware
        />,
      );
    });

    const playheadDiamond = host.querySelector<HTMLButtonElement>('button[title="40%"]');
    const selectedDiamond = host.querySelector<HTMLButtonElement>('button[title="60%"]');
    expect(playheadDiamond?.dataset.keyframeAtPlayhead).toBe("true");
    expect(playheadDiamond?.dataset.keyframeSelected).toBe("false");
    expect(playheadDiamond?.querySelector("path:last-child")?.getAttribute("fill")).toBe(
      "var(--timeline-diamond-muted)",
    );
    expect(playheadDiamond?.querySelector('path[stroke="#4ba3d2"]')).not.toBeNull();
    expect(selectedDiamond?.dataset.keyframeAtPlayhead).toBe("false");
    expect(selectedDiamond?.dataset.keyframeSelected).toBe("true");
    expect(selectedDiamond?.querySelector("path:last-child")?.getAttribute("fill")).toBe("#4ba3d2");
    act(() => root.unmount());
  });

  it("keeps dense keyframe visuals full-size while bounding their hit regions", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [30, 60, 90].map((percentage) => ({
              percentage,
              propertyGroup: "position",
              properties: { x: percentage },
            })),
          }}
          clipWidthPx={36}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          groupAware
        />,
      );
    });

    const diamonds = Array.from(host.querySelectorAll<HTMLButtonElement>("button[title]"));
    expect(diamonds).toHaveLength(3);
    for (const diamond of diamonds) {
      expect(Number.parseFloat(diamond.style.width)).toBeCloseTo(12);
      expect(Number(diamond.querySelector("svg")?.getAttribute("width"))).toBe(22);
    }
    act(() => root.unmount());
  });

  it("gives keyframes time-based names and native keyboard selection semantics", () => {
    const { host, root, onClickKeyframe } = renderDiamonds();
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]')!;
    expect(diamond.getAttribute("aria-label")).toBe("Motion keyframe at 15s");
    expect(diamond.getAttribute("aria-pressed")).toBe("false");
    act(() => diamond.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(onClickKeyframe).toHaveBeenCalledWith(
      "clip-1",
      expect.objectContaining({ percentage: 50 }),
    );
    act(() => root.unmount());
  });

  it("uses Shift+Space's native click for additive keyframe selection", () => {
    const { host, root, onClickKeyframe, onShiftClickKeyframe } = renderDiamonds();
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]')!;
    act(() =>
      diamond.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0, shiftKey: true })),
    );
    expect(onShiftClickKeyframe).toHaveBeenCalledWith(
      "clip-1",
      expect.objectContaining({ percentage: 50 }),
    );
    expect(onClickKeyframe).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("publishes retime previews after StrictMode effect replay", () => {
    const { diamond, host, root } = renderRetimeLane(undefined, true);
    const initialLeft = diamond.style.left;
    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointermove", { bubbles: true, clientX: 120, pointerId: 7 }),
      );
    });
    expect(host.querySelector<HTMLButtonElement>('button[title="50%"]')?.style.left).not.toBe(
      initialLeft,
    );
    act(() => root.unmount());
  });

  it("treats primary pointerup without drag as a keyframe click", () => {
    const { host, root, onClickKeyframe } = renderDiamonds();
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0 }));
    });

    expect(onClickKeyframe).toHaveBeenCalledWith(
      "clip-1",
      expect.objectContaining({ percentage: 50 }),
    );
    act(() => root.unmount());
  });

  // The collapsed clip row and the expanded property lanes read the same cache,
  // so a keyframe that carries a property group has to hash to the same key in
  // both — otherwise collapsing a track silently drops the selection.
  it("keys a grouped keyframe the same way collapsed as expanded", () => {
    const groupedKeyframe = {
      percentage: 50,
      tweenPercentage: 25,
      propertyGroup: "position",
      animationId: "anim-1",
      properties: { x: 100 },
    };
    const sharedKey = timelineKeyframeSelectionKey("clip-1", groupedKeyframe);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClickKeyframe = vi.fn();
    act(() => {
      root.render(
        <TimelineClipDiamonds
          keyframesData={{ format: "percentage", keyframes: [groupedKeyframe] }}
          clipWidthPx={200}
          clipHeightPx={48}
          clipDuration={10}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={-10}
          elementId="clip-1"
          selectedKeyframes={new Set([sharedKey])}
          onClickKeyframe={onClickKeyframe}
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    // Highlighted from the shared key alone (the playhead is off-clip here).
    expect(diamond?.querySelector("path:last-child")?.getAttribute("fill")).toBe("#4ba3d2");

    act(() => {
      diamond?.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0 }));
    });
    expect(onClickKeyframe).toHaveBeenCalledWith("clip-1", {
      percentage: 50,
      tweenPercentage: 25,
      propertyGroup: "position",
      animationId: "anim-1",
    });
    act(() => root.unmount());
  });

  it("does not treat secondary pointerup as a keyframe click", () => {
    const { host, root, onClickKeyframe } = renderDiamonds();
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 2 }));
    });

    expect(onClickKeyframe).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  // Regression: once the clip is selected, canDrag arms on every diamond
  // press. A real click's few px of mouse/trackpad jitter then resolves (via
  // the neighbour clamp) back onto ~the same position — "noop", not "move" —
  // which fell through neither branch and silently did nothing: no
  // selection, no retime. It must still count as the click it was.
  it("treats a drag-armed press that resolves to a no-op move as a click", () => {
    const onClickKeyframe = vi.fn();
    const onMoveKeyframe = vi.fn();
    const host = createTimelineHost();
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              {
                percentage: 0,
                tweenPercentage: 0,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 0 },
              },
              {
                percentage: 50,
                tweenPercentage: 100,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 100 },
              },
            ],
          }}
          clipWidthPx={5000}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onClickKeyframe={onClickKeyframe}
          onMoveKeyframe={onMoveKeyframe}
          groupAware
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100 }),
      );
      // 4px of travel at a 5000px clip width is ~0.08 clip-% — above the drag
      // threshold (so resolveKeyframeDrag doesn't short-circuit to "click"
      // itself) but below the no-op epsilon once neighbour-clamped.
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 104 }));
    });

    expect(onClickKeyframe).toHaveBeenCalledWith({
      percentage: 50,
      tweenPercentage: 100,
      propertyGroup: "position",
      animationId: "anim-1",
    });
    expect(onMoveKeyframe).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  // Regression: a genuine retime (drag far enough to actually move the
  // keyframe) committed the move but never selected/parked on the result —
  // the diamond it was just dragged looked exactly like one nothing happened
  // to. Select it at its NEW position too.
  it("reselects a retimed keyframe with its post-move tween percentage", () => {
    const onClickKeyframe = vi.fn();
    const onMoveKeyframe = vi.fn().mockResolvedValue(true);
    const host = createTimelineHost();
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              {
                percentage: 20,
                tweenPercentage: 0,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 0 },
              },
              {
                percentage: 40,
                tweenPercentage: 50,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 100 },
              },
              {
                percentage: 60,
                tweenPercentage: 100,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 200 },
              },
            ],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          clipDuration={10}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onClickKeyframe={onClickKeyframe}
          onMoveKeyframe={onMoveKeyframe}
          groupAware
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="40%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 80 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 100 }));
    });

    expect(onMoveKeyframe).toHaveBeenCalledWith(
      {
        percentage: 40,
        tweenPercentage: 50,
        propertyGroup: "position",
        animationId: "anim-1",
      },
      50,
    );
    expect(onClickKeyframe).toHaveBeenCalledWith({
      percentage: 50,
      tweenPercentage: 75,
      propertyGroup: "position",
      animationId: "anim-1",
    });
    act(() => root.unmount());
  });

  it("leaves the selection alone when a stale retime fails after a newer drag", async () => {
    const onClickKeyframe = vi.fn();
    let failFirstDrag: (() => void) | undefined;
    const onMoveKeyframe = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            failFirstDrag = () => resolve(false);
          }),
      )
      .mockResolvedValue(true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              {
                percentage: 0,
                tweenPercentage: 0,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 0 },
              },
              {
                percentage: 50,
                tweenPercentage: 50,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 100 },
              },
              {
                percentage: 100,
                tweenPercentage: 100,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 200 },
              },
            ],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          clipDuration={10}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onClickKeyframe={onClickKeyframe}
          onMoveKeyframe={onMoveKeyframe}
          groupAware
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');

    // Two drags back to back; the first one's commit is still in flight.
    act(() => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 150 }));
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 150 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 170 }));
    });
    onClickKeyframe.mockClear();

    await act(async () => {
      failFirstDrag?.();
      await Promise.resolve();
    });

    // The stale failure must not drag the selection back to the first drag's
    // source: the second retime, which the user can see, owns it now.
    expect(onClickKeyframe).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("composes a rapid second retime from the pending position", () => {
    const onMoveKeyframe = vi.fn().mockResolvedValue(true);
    const host = createTimelineHost();
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              {
                percentage: 0,
                tweenPercentage: 0,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 0 },
              },
              {
                percentage: 50,
                tweenPercentage: 50,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 100 },
              },
              {
                percentage: 100,
                tweenPercentage: 100,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 200 },
              },
            ],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onMoveKeyframe={onMoveKeyframe}
          groupAware
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 150 }));

      // The cache still exposes 50%, but this second +10% drag starts at the
      // pending 75% destination and must therefore land at 85%, not 60%.
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 150 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 170 }));
    });

    // The second move must identify the FROM keyframe by the pending (already-
    // moved) position 75%, not the stale rendered 50%; otherwise the serialized
    // mutation can't locate the keyframe the first move relocated.
    expect(onMoveKeyframe).toHaveBeenNthCalledWith(
      2,
      {
        percentage: 75,
        tweenPercentage: 75,
        propertyGroup: "position",
        animationId: "anim-1",
      },
      85,
    );

    act(() => {
      usePlayerStore.setState({ timelineSessionEpoch: 1 });
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120 }));
    });
    expect(onMoveKeyframe).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ percentage: 50 }),
      60,
    );
    act(() => root.unmount());
  });

  it("preserves another element's pending retime when the active source is removed", () => {
    const host = createTimelineHost();
    const elementA = { ...RETIME_ELEMENT, id: "clip-a", key: "clip-a" };
    const elementB = { ...RETIME_ELEMENT, id: "clip-b", key: "clip-b" };
    usePlayerStore.setState({ elements: [elementA, elementB] });
    const laneA = renderRetimeLane(vi.fn().mockResolvedValue(true), false, {
      elementId: "clip-a",
      host,
    });
    const onMoveB = vi.fn().mockResolvedValue(true);
    const laneB = renderRetimeLane(onMoveB, false, { elementId: "clip-b", host });

    act(() => {
      laneB.diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 150, pointerId: 7 }),
      );

      laneA.diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 9 }),
      );
      usePlayerStore.setState({ elements: [elementB] });

      laneB.diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 150, pointerId: 11 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 170, pointerId: 11 }),
      );
    });

    expect(onMoveB).toHaveBeenNthCalledWith(2, expect.objectContaining({ percentage: 75 }), 85);
    act(() => {
      laneA.root.unmount();
      laneB.root.unmount();
    });
  });

  it("retires a pending retime once the cache exposes its destination identity", () => {
    const first = renderRetimeLane();
    act(() => {
      first.diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 150, pointerId: 7 }),
      );
    });
    expect(readPendingTimelineKeyframeRetimes(first.host).size).toBe(1);
    act(() => first.root.unmount());

    const destination = renderRetimeLane(vi.fn().mockResolvedValue(true), false, {
      host: first.host,
      keyframes: [
        {
          percentage: 0,
          tweenPercentage: 0,
          propertyGroup: "position",
          animationId: "anim-1",
          properties: { x: 0 },
        },
        {
          percentage: 75,
          tweenPercentage: 75,
          propertyGroup: "position",
          animationId: "anim-1",
          properties: { x: 100 },
        },
        {
          percentage: 100,
          tweenPercentage: 100,
          propertyGroup: "position",
          animationId: "anim-1",
          properties: { x: 200 },
        },
      ],
    });
    act(() => {
      destination.diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 150, pointerId: 9 }),
      );
    });
    expect(readPendingTimelineKeyframeRetimes(first.host).size).toBe(0);

    act(() => {
      window.dispatchEvent(pointerEvent("pointercancel", { bubbles: true, pointerId: 9 }));
      destination.root.unmount();
    });
  });

  it.each([
    ["returns false", () => Promise.resolve(false)],
    ["rejects", () => Promise.reject(new Error("retime failed"))],
  ])("clears a failed pending retime when the callback %s", async (_label, settle) => {
    const onMoveKeyframe = vi.fn().mockImplementationOnce(settle).mockResolvedValue(true);
    const host = createTimelineHost();
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              {
                percentage: 0,
                tweenPercentage: 0,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 0 },
              },
              {
                percentage: 50,
                tweenPercentage: 50,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 100 },
              },
              {
                percentage: 100,
                tweenPercentage: 100,
                propertyGroup: "position",
                animationId: "anim-1",
                properties: { x: 200 },
              },
            ],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onMoveKeyframe={onMoveKeyframe}
          groupAware
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    await act(async () => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 150 }));
      await Promise.resolve();
    });

    act(() => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100 }),
      );
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120 }));
    });

    expect(onMoveKeyframe).toHaveBeenNthCalledWith(
      2,
      {
        percentage: 50,
        tweenPercentage: 50,
        propertyGroup: "position",
        animationId: "anim-1",
      },
      60,
    );
    act(() => root.unmount());
  });

  it("cancels an in-flight retime on Escape without committing or selecting", () => {
    const onClickKeyframe = vi.fn();
    const onMoveKeyframe = vi.fn().mockResolvedValue(true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              { percentage: 20, tweenPercentage: 0, properties: { x: 0 } },
              { percentage: 40, tweenPercentage: 50, properties: { x: 100 } },
              { percentage: 60, tweenPercentage: 100, properties: { x: 200 } },
            ],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onClickKeyframe={onClickKeyframe}
          onMoveKeyframe={onMoveKeyframe}
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="40%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 80 }),
      );
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 100 }));
    });

    // Escape ends the gesture: no retime is written, and the release is not
    // reinterpreted as a click that would park the playhead on the keyframe.
    expect(onMoveKeyframe).not.toHaveBeenCalled();
    expect(onClickKeyframe).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("commits once from the stable viewport after the source lane unmounts", () => {
    const { diamond, onMoveKeyframe, root } = renderRetimeLane();

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      root.unmount();
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 140, pointerId: 7 }),
      );
    });

    expect(onMoveKeyframe).toHaveBeenCalledExactlyOnceWith(
      {
        percentage: 50,
        tweenPercentage: 50,
        propertyGroup: "position",
        animationId: "anim-1",
      },
      60,
    );
  });

  it("keeps the retime preview coherent when the source lane remounts", () => {
    const { diamond, mountLane, onMoveKeyframe, root } = renderRetimeLane();

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointermove", { bubbles: true, button: 0, clientX: 120, pointerId: 7 }),
      );
    });
    const beforeUnmountLeft = Number.parseFloat(diamond.style.left);

    act(() => {
      root.unmount();
      window.dispatchEvent(
        pointerEvent("pointermove", { bubbles: true, button: 0, clientX: 140, pointerId: 7 }),
      );
    });
    const { diamond: remountedDiamond, root: remountedRoot } = mountLane();
    const remountedLeft = Number.parseFloat(remountedDiamond.style.left);
    expect(remountedLeft).toBeGreaterThan(beforeUnmountLeft);

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { bubbles: true, button: 0, clientX: 160, pointerId: 7 }),
      );
    });
    expect(Number.parseFloat(remountedDiamond.style.left)).toBeGreaterThan(remountedLeft);

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 160, pointerId: 7 }),
      );
    });
    expect(onMoveKeyframe).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 80);
    act(() => remountedRoot.unmount());
  });

  it("includes horizontal viewport scrolling in the retime destination", () => {
    const { diamond, host, onMoveKeyframe, root } = renderRetimeLane();

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      host.scrollLeft = 20;
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
    });

    expect(onMoveKeyframe).toHaveBeenCalledExactlyOnceWith(expect.any(Object), 60);
    act(() => root.unmount());
  });

  it("auto-scrolls horizontally without virtualizing the source row away", () => {
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { diamond, host, root } = renderRetimeLane();
    configureTimelineTestViewport(host, 10_000);

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointermove", {
          bubbles: true,
          button: 0,
          clientX: 790,
          clientY: 239,
          pointerId: 7,
        }),
      );
    });
    expect(frame).not.toBeNull();
    act(() => frame?.(0));
    expect(host.scrollLeft).toBeGreaterThan(0);
    expect(host.scrollTop).toBe(0);

    act(() => {
      window.dispatchEvent(pointerEvent("pointercancel", { bubbles: true, pointerId: 7 }));
      root.unmount();
    });
  });

  it("ignores another pointer and lets the owning pointer finish", () => {
    const { diamond, onMoveKeyframe, root } = renderRetimeLane();

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 140, pointerId: 8 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 7 }),
      );
    });

    expect(onMoveKeyframe).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("cancels without mutation on pointer cancel or Escape and allows the next retime", () => {
    const { diamond, onMoveKeyframe, root } = renderRetimeLane();

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      window.dispatchEvent(
        pointerEvent("pointercancel", {
          bubbles: true,
          button: 0,
          clientX: 120,
          pointerId: 7,
        }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 7 }),
      );

      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 9 }),
      );
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 9 }),
      );

      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 11 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 11 }),
      );
    });

    expect(onMoveKeyframe).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("cancels on project switch or source removal without poisoning the next gesture", () => {
    const { diamond, onMoveKeyframe, root } = renderRetimeLane();

    act(() => {
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 7 }),
      );
      usePlayerStore.setState({ timelineSessionEpoch: 1 });
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 7 }),
      );

      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 9 }),
      );
      usePlayerStore.setState({ elements: [] });
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 9 }),
      );

      usePlayerStore.setState({ elements: [RETIME_ELEMENT] });
      diamond.dispatchEvent(
        pointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 100, pointerId: 11 }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", { bubbles: true, button: 0, clientX: 120, pointerId: 11 }),
      );
    });

    expect(onMoveKeyframe).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  // Regression: onClickKeyframe's state updates can re-render the diamond
  // button out from under the gesture before the browser auto-synthesizes the
  // "click" event that follows a button's pointerdown+pointerup. That orphaned
  // click then bubbles to the ancestor clip's onClick. That stray click can
  // replace keyframe focus or collapse a marquee selection, so suppressClickRef
  // lets the ancestor ignore it.
  it("arms suppressClickRef synchronously on a keyframe click", () => {
    const suppressClickRef = { current: false };
    const host = createTimelineHost();
    const root = createRoot(host);
    act(() => {
      root.render(
        <TimelineClipDiamonds
          keyframesData={{
            format: "percentage",
            keyframes: [{ percentage: 50, properties: { x: 100 } }],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          clipDuration={10}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onClickKeyframe={vi.fn()}
          suppressClickRef={suppressClickRef}
        />,
      );
    });
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');
    expect(diamond).not.toBeNull();

    act(() => {
      diamond!.dispatchEvent(pointerEvent("pointerup", { bubbles: true, button: 0 }));
    });

    expect(suppressClickRef.current).toBe(true);
    act(() => root.unmount());
  });

  const renderSegmentLane = (lastAmbiguous: boolean, clipWidthPx = 200) => {
    const host = createTimelineHost();
    const root = createRoot(host);
    const onSelectSegment = vi.fn();
    const kf = (percentage: number, extra: Record<string, unknown> = {}) => ({
      percentage,
      tweenPercentage: percentage,
      propertyGroup: "position",
      animationId: "anim-1",
      properties: { x: percentage },
      ...extra,
    });
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [
              kf(0),
              kf(50),
              kf(100, {
                collidingAnimationTargets: lastAmbiguous
                  ? [
                      { animationId: "anim-1", tweenPercentage: 100 },
                      { animationId: "anim-2", tweenPercentage: 75 },
                    ]
                  : undefined,
              }),
            ],
          }}
          clipWidthPx={clipWidthPx}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          clipStart={10}
          clipDuration={10}
          selectedKeyframes={new Set()}
          onSelectSegment={onSelectSegment}
          groupAware
        />,
      );
    });
    return { host, onSelectSegment, root };
  };

  it("shows the inline ease button on a colliding merged segment (bulk edit)", () => {
    // Both segments (0->50, 50->100) render their ease button; the 50->100
    // segment ends on a keyframe shared by two animations and the button now
    // bulk-edits both rather than being hidden.
    const { host, root } = renderSegmentLane(true);
    expect(host.querySelectorAll("[data-keyframe-ease-segment]").length).toBe(2);
    act(() => root.unmount());
  });

  it("shows the inline ease button on single-animation merged segments", () => {
    const { host, onSelectSegment, root } = renderSegmentLane(false);
    expect(host.querySelectorAll("[data-keyframe-ease-segment]").length).toBe(2);
    const ease = host.querySelector<HTMLButtonElement>("[data-keyframe-ease-button]")!;
    expect(ease.getAttribute("aria-label")).toBe("Edit none easing after 10s");
    expect(ease.getAttribute("title")).toBe("Edit none easing");
    expect(ease.classList.contains("opacity-40")).toBe(true);
    act(() => ease.click());
    expect(onSelectSegment).toHaveBeenCalledOnce();
    expect(usePlayerStore.getState().requestedSeekTime).toBeNull();
    act(() => root.unmount());
  });

  it("ends connectors at the diamond boundaries", () => {
    const { host, root } = renderSegmentLane(false);
    const connectors = host.querySelectorAll<HTMLElement>("[data-keyframe-connector]");

    expect(Array.from(connectors, (connector) => connector.style.left)).toEqual(["11px", "111px"]);
    expect(Array.from(connectors, (connector) => connector.style.width)).toEqual(["78px", "78px"]);
    act(() => root.unmount());
  });

  it("keeps the ease button above nearby diamonds without blocking the segment", () => {
    const { host, root } = renderSegmentLane(false);
    const segment = host.querySelector<HTMLElement>("[data-keyframe-ease-segment]");
    const ease = segment?.querySelector<HTMLButtonElement>("[data-keyframe-ease-button]");
    const diamond = host.querySelector<HTMLButtonElement>('button[title="50%"]');

    expect(segment?.style.pointerEvents).toBe("none");
    expect(ease?.style.pointerEvents).toBe("auto");
    expect(Number(segment?.style.zIndex)).toBeGreaterThan(Number(diamond?.style.zIndex));
    // Room to spare here, so the button carries the 24x24 WCAG 2.5.8 overlay.
    expect(ease?.className).toContain("before:h-6");
    act(() => root.unmount());
  });

  it("drops the 24x24 ease overlay when the segment is too narrow to hold it", () => {
    // The segment wrapper outranks the diamonds, so an overlay wider than the
    // clear span between them would steal their clicks at fit zoom. 40px of clip
    // across three keyframes leaves well under 24px of clear span per segment.
    const { host, root } = renderSegmentLane(false, 40);
    const ease = host.querySelector<HTMLButtonElement>("[data-keyframe-ease-button]");

    expect(ease).not.toBeNull();
    expect(ease?.className).not.toContain("before:h-6");
    expect(ease?.style.width).toBe("16px");
    act(() => root.unmount());
  });

  it("keeps the ease button hover-only on a segment too narrow to show it at rest", () => {
    // Same narrow clip as above: showing the button at rest here would sit on
    // top of both diamonds instead of clear of them.
    const { host, root } = renderSegmentLane(false, 40);
    const ease = host.querySelector<HTMLButtonElement>("[data-keyframe-ease-button]");

    expect(ease?.classList.contains("opacity-0")).toBe(true);
    expect(ease?.classList.contains("opacity-40")).toBe(false);
    act(() => root.unmount());
  });

  it("hides the inline ease button on a segment with no source animation id", () => {
    // A runtime-scanned keyframe has no animationId, so there is no tween to
    // target; the segment ending on it must not render a (dead) ease button.
    const host = createTimelineHost();
    const root = createRoot(host);
    const kf = (percentage: number, animationId?: string) => ({
      percentage,
      tweenPercentage: percentage,
      propertyGroup: "position",
      ...(animationId ? { animationId } : {}),
      properties: { x: percentage },
    });
    act(() => {
      root.render(
        <TimelineDiamondLane
          keyframesData={{
            format: "percentage",
            keyframes: [kf(0, "anim-1"), kf(50, "anim-1"), kf(100)],
          }}
          clipWidthPx={200}
          clipHeightPx={48}
          accentColor="#4ba3d2"
          isSelected
          currentPercentage={0}
          elementId="clip-1"
          selectedKeyframes={new Set()}
          onSelectSegment={vi.fn()}
          groupAware
        />,
      );
    });
    expect(host.querySelectorAll("[data-keyframe-ease-segment]").length).toBe(1);
    act(() => root.unmount());
  });
});
