// @vitest-environment happy-dom

import type { DockviewApi } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applySideMinimums,
  buildEditLayout,
  defaultSideWidths,
  sideMinimumWidth,
} from "./dockLayout";
import { mountBareDockview } from "./dockTestHarness";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

// Expected values are hand-derived from the old fitPanels rule: the preview keeps 360 first,
// then each side column takes half of what remains, never above 200 or below 120.
describe("sideMinimumWidth", () => {
  it.each([
    [1680, 200],
    [1200, 200],
    [860, 200],
    [760, 200],
    [700, 170],
    [600, 120],
    [560, 120],
    [400, 120],
  ])("is %ipx wide -> sides shrink to %ipx at most", (viewport, expected) => {
    expect(sideMinimumWidth(viewport)).toBe(expected);
  });
});

describe("defaultSideWidths", () => {
  it.each([
    [1680, 384, 424],
    [1280, 329, 364],
    [860, 221, 244],
    [560, 120, 120],
  ])("at %ipx gives %i / %i", (viewport, left, right) => {
    expect(defaultSideWidths(viewport)).toEqual({ left, right });
  });

  it.each([1680, 1280, 1000, 860, 760, 700, 600, 560, 480])(
    "leaves the preview its 360px floor at %ipx whenever the sides can shrink enough",
    (viewport) => {
      const { left, right } = defaultSideWidths(viewport);
      const floor = sideMinimumWidth(viewport);
      const overflow = left + right + 360 - viewport;
      expect(overflow <= 0 || (left === floor && right === floor)).toBe(true);
    },
  );
});

describe("applySideMinimums", () => {
  let api: DockviewApi;
  beforeEach(() => {
    ({ api } = mountBareDockview());
  });
  afterEach(() => {
    api.dispose();
    document.body.innerHTML = "";
  });

  it("lowers side groups' minimum on a narrow window and shrinks them, never touching the preview", () => {
    api.layout(1200, 700);
    buildEditLayout(api, 1200);
    applySideMinimums(api, 560);
    expect(api.getPanel("compositions")?.group.minimumWidth).toBe(120);
    expect(api.getPanel("design")?.group.minimumWidth).toBe(120);
    expect(api.getPanel("compositions")?.group.width).toBe(120);
    expect(api.getPanel("design")?.group.width).toBe(120);
    expect(api.getPanel("preview")?.group.minimumWidth).toBe(360);
  });

  it("leaves a wide window's user-chosen widths alone", () => {
    api.layout(1200, 700);
    buildEditLayout(api, 1200);
    api.getPanel("compositions")?.group.api.setSize({ width: 300 });
    applySideMinimums(api, 1200);
    expect(api.getPanel("compositions")?.group.width).toBe(300);
  });

  it("keeps the preview's floor when a side panel is tabbed into the preview group", () => {
    api.layout(1200, 700);
    buildEditLayout(api, 1200);
    const preview = api.getPanel("preview");
    const design = api.getPanel("design");
    if (!preview || !design) throw new Error("default layout is missing panels");
    design.api.moveTo({ group: preview.group, position: "center", index: 0 });
    preview.api.setActive();
    applySideMinimums(api, 560);
    expect(preview.group.minimumWidth).toBe(360);
  });

  it("pins the preview floor when a side panel that was showing gets the preview dragged in", () => {
    api.layout(1200, 700);
    buildEditLayout(api, 1200);
    applySideMinimums(api, 560);
    const preview = api.getPanel("preview");
    const design = api.getPanel("design");
    if (!preview || !design) throw new Error("default layout is missing panels");
    preview.api.moveTo({ group: design.group });
    applySideMinimums(api, 560);
    expect(preview.group.minimumWidth).toBe(360);
  });

  it("rewrites the minimum of a group that is neither the preview nor side-only", () => {
    api.layout(1200, 700);
    buildEditLayout(api, 1200);
    const timeline = api.getPanel("timeline");
    const compositions = api.getPanel("compositions");
    if (!timeline || !compositions) throw new Error("default layout is missing panels");
    timeline.api.moveTo({ group: compositions.group });
    applySideMinimums(api, 560);
    expect(compositions.group.minimumWidth).toBe(120);
  });

  it("drops the preview floor from a group the preview has left", () => {
    api.layout(1200, 700);
    buildEditLayout(api, 1200);
    const preview = api.getPanel("preview");
    const timeline = api.getPanel("timeline");
    if (!preview || !timeline) throw new Error("default layout is missing panels");
    preview.api.moveTo({ group: timeline.group });
    applySideMinimums(api, 560);
    preview.api.moveTo({ position: "right", group: api.getPanel("design")?.group });
    applySideMinimums(api, 560);
    expect(timeline.group.minimumWidth).toBe(120);
  });
});
