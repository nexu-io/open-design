// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import { BeatStrip } from "./BeatStrip";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const requestSeek = vi.fn();
const commitBeatEdits = usePlayerStore.getState().commitBeatEdits;
const commitBeatEditsSpy = vi.fn((...args: Parameters<typeof commitBeatEdits>) =>
  commitBeatEdits(...args),
);
const MUSIC_ELEMENT: TimelineElement = {
  id: "background-music",
  label: "Music",
  tag: "audio",
  src: "music.mp3",
  start: 0,
  duration: 10,
  track: 0,
  timelineRole: "music",
};
const BEAT_ANALYSIS = {
  beatTimes: [1, 3],
  beatStrengths: [0.5, 0.8],
  bpm: 120,
  bpmConfidence: "high" as const,
  channelData: null,
  sampleRate: 48_000,
  peak: 1,
};

function pointerEvent(type: string, init: PointerEventInit): Event {
  if (typeof PointerEvent === "function") return new PointerEvent(type, init);
  const event = new MouseEvent(type, init);
  Object.defineProperty(event, "pointerId", { value: init.pointerId ?? 0 });
  return event;
}

function mountBeatStrip(renderTimeRange?: { start: number; end: number }) {
  const viewport = document.createElement("div");
  viewport.dataset.timelineScrollViewport = "";
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 500 },
    clientHeight: { configurable: true, value: 300 },
    scrollWidth: { configurable: true, value: 2_000 },
    scrollHeight: { configurable: true, value: 2_000 },
  });
  viewport.getBoundingClientRect = () => new DOMRect(0, 0, 1_000, 500);
  Object.assign(viewport, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  document.body.appendChild(viewport);
  const root = createRoot(viewport);
  roots.push(root);
  act(() => {
    root.render(
      <BeatStrip
        beatTimes={[1, 3]}
        beatStrengths={[0.5, 0.8]}
        pps={100}
        renderTimeRange={renderTimeRange}
      />,
    );
  });
  return { root, viewport };
}

function firstBeat(): HTMLDivElement {
  const beat = document.querySelector<HTMLDivElement>('[title="Drag to move · ⌥-click to delete"]');
  if (!beat) throw new Error("Expected a beat handle");
  return beat;
}

function startBeatDrag(clientX = 100, pointerId = 1): void {
  act(() => {
    firstBeat().dispatchEvent(
      pointerEvent("pointerdown", { bubbles: true, button: 0, clientX, clientY: 100, pointerId }),
    );
  });
  expect(usePlayerStore.getState().beatDragging).toBe(true);
}

function releaseBeatDrag(clientX = 140, pointerId = 1): void {
  act(() => {
    window.dispatchEvent(
      pointerEvent("pointerup", { bubbles: true, clientX, clientY: 100, pointerId }),
    );
  });
}

function expectCancelledBeatDrag(): void {
  expect(commitBeatEditsSpy).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().beatDragging).toBe(false);
}

function expectCommittedBeatAt(time: number): void {
  expect(commitBeatEditsSpy).toHaveBeenCalledExactlyOnceWith(expect.anything(), "move beat");
  expect(usePlayerStore.getState().beatEdits?.added[0]?.time).toBe(time);
}

beforeEach(() => {
  commitBeatEditsSpy.mockClear();
  requestSeek.mockReset();
  usePlayerStore.setState({
    timelineSessionEpoch: 1,
    timelineProjectId: "project-a",
    beatDragging: false,
    requestSeek,
    elements: [MUSIC_ELEMENT],
    beatAnalysis: BEAT_ANALYSIS,
    beatEdits: null,
    commitBeatEdits: commitBeatEditsSpy,
  });
});

afterEach(() => {
  act(() => window.dispatchEvent(new Event("blur")));
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("BeatStrip gesture ownership", () => {
  it("commits once after its source row unmounts", () => {
    const { root } = mountBeatStrip();
    startBeatDrag();
    act(() => root.render(null));
    expect(usePlayerStore.getState().beatDragging).toBe(true);

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", {
          bubbles: true,
          clientX: 140,
          clientY: 100,
          pointerId: 1,
        }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", {
          bubbles: true,
          clientX: 140,
          clientY: 100,
          pointerId: 1,
        }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", {
          bubbles: true,
          clientX: 160,
          clientY: 100,
          pointerId: 1,
        }),
      );
    });

    expectCommittedBeatAt(1.4);
    expect(usePlayerStore.getState().beatDragging).toBe(false);
  });

  it("includes viewport scrolling in the final beat time", () => {
    const { viewport } = mountBeatStrip();
    startBeatDrag(100);
    viewport.scrollLeft = 50;

    releaseBeatDrag(110);
    expectCommittedBeatAt(1.6);
  });

  it("cancels without mutation on pointer cancel, Escape, and project switch", () => {
    mountBeatStrip();
    startBeatDrag();
    act(() => {
      window.dispatchEvent(pointerEvent("pointercancel", { pointerId: 1 }));
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 140, clientY: 100, pointerId: 1 }));
    });

    startBeatDrag();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    startBeatDrag();
    act(() => usePlayerStore.getState().beginTimelineSession("project-b"));
    releaseBeatDrag();
    expectCancelledBeatDrag();
  });

  it("cancels without mutation when the captured music source disappears", () => {
    mountBeatStrip();
    startBeatDrag();
    act(() => usePlayerStore.setState({ elements: [] }));
    releaseBeatDrag();
    expectCancelledBeatDrag();
  });

  it("cancels when the captured beat disappears during the gesture", () => {
    mountBeatStrip();
    startBeatDrag();
    act(() => {
      usePlayerStore.setState({
        beatAnalysis: { ...BEAT_ANALYSIS, beatTimes: [3], beatStrengths: [0.8] },
      });
    });
    releaseBeatDrag();
    expectCancelledBeatDrag();
  });

  it("releases the actor when the owning timeline viewport unmounts", async () => {
    const { viewport } = mountBeatStrip();
    startBeatDrag();

    await act(async () => {
      viewport.remove();
      await Promise.resolve();
    });
    releaseBeatDrag();
    expectCancelledBeatDrag();
  });

  it("ignores unrelated pointers and keeps the active beat rendered outside the time window", () => {
    const { root } = mountBeatStrip();
    startBeatDrag();
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", {
          bubbles: true,
          clientX: 150,
          clientY: 100,
          pointerId: 2,
        }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", {
          bubbles: true,
          clientX: 150,
          clientY: 100,
          pointerId: 2,
        }),
      );
      root.render(
        <BeatStrip
          beatTimes={[1, 3]}
          beatStrengths={[0.5, 0.8]}
          pps={100}
          renderTimeRange={{ start: 2.5, end: 3.5 }}
        />,
      );
    });

    expect(document.querySelectorAll('[title="Drag to move · ⌥-click to delete"]')).toHaveLength(2);
    expect(commitBeatEditsSpy).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointerup", {
          bubbles: true,
          clientX: 150,
          clientY: 100,
          pointerId: 1,
        }),
      );
    });
    expect(commitBeatEditsSpy).toHaveBeenCalledOnce();
  });

  it("keeps the dragged beat pinned by time when another beat is inserted before it", () => {
    const { root } = mountBeatStrip();
    startBeatDrag();
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", {
          bubbles: true,
          clientX: 140,
          clientY: 100,
          pointerId: 1,
        }),
      );
      usePlayerStore.setState({
        beatAnalysis: {
          ...BEAT_ANALYSIS,
          beatTimes: [0.5, 1, 3],
          beatStrengths: [0.3, 0.5, 0.8],
        },
      });
      root.render(<BeatStrip beatTimes={[0.5, 1, 3]} beatStrengths={[0.3, 0.5, 0.8]} pps={100} />);
    });

    const lefts = Array.from(
      document.querySelectorAll<HTMLDivElement>('[title="Drag to move · ⌥-click to delete"]'),
      (beat) => beat.style.left,
    );
    expect(lefts).toContain("128px");

    releaseBeatDrag(140);
    expectCommittedBeatAt(1.4);
  });

  it("keeps the first pointer in control when a second touch starts", () => {
    mountBeatStrip();
    startBeatDrag();
    const beats = document.querySelectorAll<HTMLDivElement>(
      '[title="Drag to move · ⌥-click to delete"]',
    );
    act(() => {
      beats[1]?.dispatchEvent(
        pointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 300,
          clientY: 100,
          pointerId: 2,
        }),
      );
    });

    releaseBeatDrag(140, 1);
    expectCommittedBeatAt(1.4);
  });

  it("lets Escape bubble before cancelling the active drag", () => {
    mountBeatStrip();
    startBeatDrag();
    const sawEscape = vi.fn();
    document.addEventListener("keydown", sawEscape, { once: true });

    act(() => {
      firstBeat().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(sawEscape).toHaveBeenCalledOnce();
    expectCancelledBeatDrag();
  });

  it("does not autoscroll or mutate below the drag threshold", () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mountBeatStrip();
    startBeatDrag(990);

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", {
          bubbles: true,
          clientX: 991,
          clientY: 100,
          pointerId: 1,
        }),
      );
      window.dispatchEvent(
        pointerEvent("pointerup", {
          bubbles: true,
          clientX: 991,
          clientY: 100,
          pointerId: 1,
        }),
      );
    });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(commitBeatEditsSpy).not.toHaveBeenCalled();
  });
});
