// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";
import { installTimelineMountEnv } from "./timelineMountTestEnv";
import { usePlayerStore } from "../store/playerStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

afterEach(() => {
  document.body.innerHTML = "";
});

async function mountKeyframed(showKeyframes?: boolean, withLanes = true) {
  usePlayerStore.setState({
    duration: 10,
    currentTime: 0,
    timelineReady: true,
    selectedElementId: "card",
    elements: [{ id: "card", label: "Hero card", tag: "div", start: 0, duration: 4, track: 0 }],
    gsapAnimations: withLanes
      ? new Map([
          [
            "card",
            [
              {
                id: "card-position",
                targetSelector: "#card",
                method: "to",
                position: 0,
                duration: 2,
                properties: {},
                propertyGroup: "position",
                keyframes: {
                  format: "percentage",
                  keyframes: [
                    { percentage: 0, properties: { x: 0 } },
                    { percentage: 50, properties: { x: 100 } },
                  ],
                },
              },
            ],
          ],
        ])
      : new Map(),
    keyframeCache: new Map([
      [
        "card",
        {
          format: "percentage",
          keyframes: [{ percentage: 50, properties: { x: 100 }, tweenPercentage: 50 }],
        },
      ],
    ]),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Timeline showKeyframes={showKeyframes} />));
  const diamonds = host.querySelectorAll('button[title="50%"]').length;
  const named = Array.from(host.querySelectorAll("[role=rowheader]")).some((h) =>
    h.textContent?.includes("Hero card"),
  );
  const lanes = host.textContent?.includes("Position") ?? false;
  act(() => root.unmount());
  return { diamonds, named, lanes };
}

describe("Timeline showKeyframes", () => {
  it("draws a keyframed clip's diamonds by default", async () => {
    expect((await mountKeyframed(undefined, false)).diamonds).toBeGreaterThan(0);
  });

  it("draws no keyframe diamonds when the host turns keyframes off", async () => {
    expect((await mountKeyframed(false, false)).diamonds).toBe(0);
  });

  it("draws the keyframe lanes by default and none when keyframes are off", async () => {
    expect((await mountKeyframed()).lanes).toBe(true);
    expect((await mountKeyframed(false)).lanes).toBe(false);
  });

  it("opens the track-name column for a keyframed clip only while keyframes are shown", async () => {
    expect((await mountKeyframed()).named).toBe(true);
    expect((await mountKeyframed(false)).named).toBe(false);
  });

  it("still opens the column for an audio group when keyframes are off", async () => {
    usePlayerStore.setState({
      duration: 10,
      timelineReady: true,
      gsapAnimations: new Map(),
      elements: [
        {
          id: "vo",
          label: "Voice",
          tag: "audio",
          start: 0,
          duration: 4,
          track: 0,
          audioGroup: "g",
        },
      ],
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Timeline showKeyframes={false} />));
    const corner = host.querySelector<HTMLElement>(".sticky.top-0.flex > div");
    expect(corner?.style.width).toBe("264px");
    act(() => root.unmount());
  });
});
