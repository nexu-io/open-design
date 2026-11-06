// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { renderClipChildren, resolveClipRenderContext } from "./timelineClipChildren";
import { getTrackStyle } from "./timelineIcons";
import type { TimelineElement } from "../store/playerStore";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const clip: TimelineElement = {
  id: "clip",
  tag: "video",
  start: 10,
  duration: 5,
  track: 0,
};

describe("resolveClipRenderContext", () => {
  it("prioritizes interactive clips without changing their thumbnail frames", () => {
    expect(resolveClipRenderContext(clip, { start: 0, end: 1 }, true)).toEqual({
      priority: "interaction",
      rich: false,
    });
  });

  it("distinguishes visible clips from overscan clips", () => {
    expect(resolveClipRenderContext(clip, { start: 14, end: 16 }, false)).toEqual({
      priority: "visible",
      rich: false,
    });
    expect(resolveClipRenderContext(clip, { start: 15, end: 20 }, false)).toEqual({
      priority: "overscan",
      rich: false,
    });
  });
});

describe("renderClipChildren", () => {
  // happy-dom cannot hit-test, so this pins what decides the hit: the picture takes no input.
  it("lets a press on a picture stacked above the trim handles fall through to them", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const picture = () =>
      createElement("div", { "data-picture": "", style: { position: "absolute", zIndex: 10 } });

    act(() => {
      root.render(renderClipChildren(clip, getTrackStyle("video"), picture, undefined));
    });

    // happy-dom does not inherit pointer-events, so walk up to the layer that turns input off.
    let node = host.querySelector<HTMLElement>("[data-picture]");
    expect(node).not.toBeNull();
    while (node && node !== host && node.style.pointerEvents !== "none") node = node.parentElement;
    expect(node?.style.pointerEvents).toBe("none");
    act(() => root.unmount());
    host.remove();
  });
});
