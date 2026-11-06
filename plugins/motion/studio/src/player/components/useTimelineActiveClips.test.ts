// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { liveTime, type TimelineElement } from "../store/playerStore";
import {
  isTimelineClipActive,
  updateTimelineActiveClipClasses,
  useTimelineActiveClips,
} from "./useTimelineActiveClips";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function clip(id: string, start: number, duration: number, hidden = false): TimelineElement {
  return { id, tag: "div", start, duration, track: 1, hidden };
}

function appendClip(container: HTMLElement, id: string, start: string, end: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.clip = "true";
  element.dataset.elId = id;
  element.dataset.clipStart = start;
  element.dataset.clipEnd = end;
  container.append(element);
  return element;
}

function Harness({ version, heroStart = 2 }: { version: number; heroStart?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useTimelineActiveClips({
    scrollRef,
    currentTime: 0,
    clipStateVersion: 0,
    elementStateVersion: version,
  });
  return React.createElement(
    "div",
    { ref: scrollRef },
    React.createElement("div", {
      "data-clip": "true",
      "data-el-id": "intro",
      "data-clip-start": "0",
      "data-clip-end": "1",
    }),
    React.createElement("div", {
      "data-clip": "true",
      "data-el-id": "hero",
      "data-clip-start": String(heroStart),
      "data-clip-end": String(heroStart + 1),
    }),
  );
}

describe("timeline active clips", () => {
  it("uses model timing and keeps the end boundary inclusive", () => {
    const element = clip("hero", 2, 3);
    expect(isTimelineClipActive(element, 2)).toBe(true);
    expect(isTimelineClipActive(element, 5)).toBe(true);
    expect(isTimelineClipActive(element, 5.001)).toBe(false);
  });

  it("never activates hidden or invalid clips", () => {
    expect(isTimelineClipActive(clip("hidden", 0, 5, true), 2)).toBe(false);
    expect(isTimelineClipActive(clip("invalid", Number.NaN, 5), 2)).toBe(false);
  });

  it("synchronizes mounted clip attributes", () => {
    const container = document.createElement("div");
    const intro = appendClip(container, "intro", "0", "2");
    const hero = appendClip(container, "hero", "2", "5");
    const previous = new Set<string>();

    updateTimelineActiveClipClasses(container, previous, 2.25);

    expect(intro.hasAttribute("data-active")).toBe(false);
    expect(hero.hasAttribute("data-active")).toBe(true);
    expect(previous).toEqual(new Set(["hero"]));
  });

  it("re-applies active state when a clip remounts inside the current window", () => {
    const container = document.createElement("div");
    appendClip(container, "hero", "0", "5");
    const previous = new Set<string>();
    updateTimelineActiveClipClasses(container, previous, 2);

    container.replaceChildren();
    const remounted = appendClip(container, "hero", "0", "5");
    updateTimelineActiveClipClasses(container, previous, 2, true);

    expect(remounted.hasAttribute("data-active")).toBe(true);
  });

  it("moves active state with live playback without changing store time", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(React.createElement(Harness, { version: 0 })));

    const intro = host.querySelector<HTMLElement>('[data-el-id="intro"]');
    const hero = host.querySelector<HTMLElement>('[data-el-id="hero"]');
    expect(intro?.hasAttribute("data-active")).toBe(true);
    expect(hero?.hasAttribute("data-active")).toBe(false);

    act(() => liveTime.notify(2.5));
    expect(intro?.hasAttribute("data-active")).toBe(false);
    expect(hero?.hasAttribute("data-active")).toBe(true);

    await act(async () => root.render(React.createElement(Harness, { version: 1, heroStart: 4 })));
    act(() => liveTime.notify(2.5));
    expect(host.querySelector('[data-el-id="hero"]')?.hasAttribute("data-active")).toBe(false);

    await act(async () => root.unmount());
    host.remove();
  });
});
