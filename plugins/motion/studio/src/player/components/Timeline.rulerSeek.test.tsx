// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { installTimelineMountEnv, KEYFRAMED_CARD as KEYFRAMED } from "./timelineMountTestEnv";
import { usePlayerStore } from "../store/playerStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = "";
});

/** Presses the ruler exactly on the first drawn tick after 0 and returns its time and the seek. */
async function seekOnFirstTick(
  props: { showKeyframes?: boolean },
  keyframesLate: boolean,
  animations: typeof KEYFRAMED | Map<string, never[]> = KEYFRAMED,
) {
  usePlayerStore.setState({
    duration: 10,
    currentTime: 0,
    timelineReady: true,
    elements: [{ id: "card", label: "Hero card", tag: "div", start: 0, duration: 10, track: 0 }],
    gsapAnimations: keyframesLate ? new Map() : animations,
  });
  const onSeek = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Timeline {...props} onSeek={onSeek} />));
  if (keyframesLate) await act(async () => usePlayerStore.setState({ gsapAnimations: animations }));

  const viewport = host.querySelector<HTMLElement>("[data-timeline-scroll-viewport]")!;
  viewport.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 900, bottom: 400, width: 900, height: 400 }) as DOMRect;
  const label = host.querySelector<HTMLElement>('[data-timeline-grid-cell="major"] span')!;
  const band = label.parentElement!.parentElement!;
  const tick = band.querySelectorAll<HTMLElement>('[data-timeline-grid-cell="major"]')[1]!;
  const [, mm, ss] = /(\d+):(\d+)/.exec(tick.textContent ?? "")!;
  const tickTime = Number(mm) * 60 + Number(ss);
  // The ruler's corner block is as wide as the origin the ruler draws 0 s at.
  const origin = (band.previousElementSibling as HTMLElement).style.width;
  const clientX = parseFloat(origin) + parseFloat(tick.style.left) + 0.5;
  const at = { bubbles: true, clientX, clientY: 4, button: 0, pointerId: 1 };
  await act(async () => tick.dispatchEvent(new PointerEvent("pointerdown", at)));
  await act(async () => tick.dispatchEvent(new PointerEvent("pointerup", at)));
  act(() => root.unmount());
  return {
    time: onSeek.mock.calls.at(-1)?.[0] as number | undefined,
    tickTime,
    origin,
    published: viewport.getAttribute("data-timeline-content-origin"),
  };
}

describe("Timeline ruler origin", () => {
  it.each([
    ["keyframes shown", { showKeyframes: true }, false, 264],
    ["keyframes hidden", { showKeyframes: false }, false, 80],
    ["keyframes shown, arriving after mount", { showKeyframes: true }, true, 264],
    ["keyframes hidden, arriving after mount", { showKeyframes: false }, true, 80],
  ])(
    "publishes where the ruler draws 0 s, and a press seeks by it (%s)",
    async (_case, props, late, expected) => {
      const { time, tickTime, origin, published } = await seekOnFirstTick(props, late);
      expect(origin).toBe(`${expected}px`);
      expect(published).toBe(String(expected));
      expect(time).toBeCloseTo(tickTime, 1);
    },
  );

  it("publishes the narrow origin when no clip needs the label column", async () => {
    const { origin, published } = await seekOnFirstTick({}, false, new Map());
    expect(origin).toBe("80px");
    expect(published).toBe("80");
  });

  it("seeks on a press when the host omits sessionEpoch after a session began", async () => {
    usePlayerStore.getState().beginTimelineSession("host-project");
    expect(usePlayerStore.getState().timelineSessionEpoch).toBeGreaterThan(0);
    const { time, tickTime } = await seekOnFirstTick({}, false);
    expect(time).toBeCloseTo(tickTime, 1);
  });
});
