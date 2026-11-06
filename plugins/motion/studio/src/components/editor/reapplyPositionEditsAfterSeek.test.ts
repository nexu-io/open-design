// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { reapplyPositionEditsAfterSeek } from "./manualEditsSeekReapply";
import {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_PATH_OFFSET_ATTR,
  STUDIO_ROTATION_ATTR,
  STUDIO_ROTATION_PROP,
} from "./manualEditsTypes";
import { STUDIO_MOTION_TIMELINE_ID } from "./studioMotionTypes";

describe("reapplyPositionEditsAfterSeek", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps an old offset off an element GSAP moves by object-of-arrays keyframes, not off its neighbour", () => {
    const offset = `${STUDIO_OFFSET_X_PROP}: 300px; ${STUDIO_OFFSET_Y_PROP}: 100px; translate: none`;
    document.body.innerHTML = ["moved", "still"]
      .map((id) => `<div id="${id}" ${STUDIO_PATH_OFFSET_ATTR}="true" style="${offset}"></div>`)
      .join("");
    const moved = document.getElementById("moved") as HTMLElement;
    const tween = { targets: () => [moved], vars: { keyframes: { x: [0, 200] } } };
    const win = window as unknown as { __timelines?: unknown; gsap?: unknown };
    const gsap = { set: vi.fn(), getProperty: () => 0 };
    Object.assign(win, { __timelines: { main: { getChildren: () => [tween] } }, gsap });
    try {
      reapplyPositionEditsAfterSeek(document);
    } finally {
      delete win.__timelines;
      delete win.gsap;
    }

    expect(moved.style.getPropertyValue("translate")).toBe("none");
    expect(gsap.set).not.toHaveBeenCalled();
    const still = document.getElementById("still") as HTMLElement;
    expect(still.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
  });

  it("does no per-edit work on a film Studio never edited", () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const queryAll = vi.spyOn(document, "querySelectorAll");

    reapplyPositionEditsAfterSeek(document);

    expect(queryAll).not.toHaveBeenCalled();
  });

  it("looks nothing up on later seeks of a film Studio never edited", () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const query = vi.spyOn(document, "querySelector");
    reapplyPositionEditsAfterSeek(document);
    // A comma selector list walks the whole DOM in Chrome; lone attribute selectors do not.
    for (const [selector] of query.mock.calls) expect(selector).not.toContain(",");
    query.mockClear();
    const queryAll = vi.spyOn(document, "querySelectorAll");

    reapplyPositionEditsAfterSeek(document);

    expect(query).not.toHaveBeenCalled();
    expect(queryAll).not.toHaveBeenCalled();
  });

  it("looks up no more on a film with an edit than the reapply itself does", () => {
    document.body.innerHTML = `<div id="a" ${STUDIO_ROTATION_ATTR}="true" style="${STUDIO_ROTATION_PROP}: 8deg"></div>`;
    reapplyPositionEditsAfterSeek(document);
    const query = vi.spyOn(document, "querySelector");
    const queryAll = vi.spyOn(document, "querySelectorAll");

    reapplyPositionEditsAfterSeek(document);

    // Three edit kinds, each with a legacy mark, plus motion: seven, as before the skip.
    expect(query.mock.calls.length + queryAll.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it("reapplies an edit made after the last seek, in the same task", () => {
    document.body.innerHTML = '<div id="a"></div>';
    reapplyPositionEditsAfterSeek(document);
    const el = document.getElementById("a") as HTMLElement;
    el.setAttribute(STUDIO_ROTATION_ATTR, "true");
    el.style.setProperty(STUDIO_ROTATION_PROP, "8deg");

    reapplyPositionEditsAfterSeek(document);

    expect(el.style.getPropertyValue("rotate")).toContain(STUDIO_ROTATION_PROP);
  });

  it("reapplies an edited element inserted after the last seek", async () => {
    document.body.innerHTML = '<div id="a"></div>';
    reapplyPositionEditsAfterSeek(document);
    const queryAll = vi.spyOn(document, "querySelectorAll");
    reapplyPositionEditsAfterSeek(document);
    expect(queryAll).not.toHaveBeenCalled(); // the film reads as unedited
    queryAll.mockRestore();
    // A paste, scene swap or undo puts back a node that already carries its mark.
    const el = document.createElement("div");
    el.setAttribute(STUDIO_ROTATION_ATTR, "true");
    el.style.setProperty(STUDIO_ROTATION_PROP, "8deg");
    document.body.append(el);
    await Promise.resolve();

    reapplyPositionEditsAfterSeek(document);

    expect(el.style.getPropertyValue("rotate")).toContain(STUDIO_ROTATION_PROP);
  });

  it("does not rescan after a style write, the one GSAP makes every frame", async () => {
    document.body.innerHTML = '<div id="a"></div>';
    reapplyPositionEditsAfterSeek(document);
    (document.getElementById("a") as HTMLElement).style.setProperty("opacity", "0.5");
    await Promise.resolve();
    const query = vi.spyOn(document, "querySelector");

    reapplyPositionEditsAfterSeek(document);

    expect(query).not.toHaveBeenCalled();
  });

  it("still clears a motion timeline whose marks an undo removed", () => {
    document.body.innerHTML = '<div id="a"></div>';
    const kill = vi.fn();
    const win = window as unknown as { __timelines?: Record<string, unknown> };
    win.__timelines = { [STUDIO_MOTION_TIMELINE_ID]: { kill } };

    reapplyPositionEditsAfterSeek(document);

    expect(kill).toHaveBeenCalledTimes(1);
    delete win.__timelines;
  });

  it("reapplies and migrates marks in the preview, whichever window built its node", () => {
    const frame = document.body.appendChild(document.createElement("iframe"));
    const doc = frame.contentDocument!;
    // The frame builds one node; the editor builds the other, as on loads where they differ.
    const nodes = [doc.createElement("div"), document.createElement("div")];
    for (const el of nodes) {
      el.setAttribute(`data-${STUDIO_PATH_OFFSET_ATTR}`, "true");
      el.setAttribute(STUDIO_ROTATION_ATTR, "true");
      el.style.setProperty(STUDIO_ROTATION_PROP, "8deg");
      doc.body.append(el);
    }

    reapplyPositionEditsAfterSeek(doc);

    for (const el of nodes) {
      expect(el.getAttribute(STUDIO_PATH_OFFSET_ATTR)).toBe("true");
      expect(el.style.getPropertyValue("rotate")).toContain(STUDIO_ROTATION_PROP);
    }
  });

  it("still migrates a legacy double-prefixed edit mark", () => {
    document.body.innerHTML = `<div id="a" data-${STUDIO_PATH_OFFSET_ATTR}="true"></div>`;

    reapplyPositionEditsAfterSeek(document);

    const el = document.getElementById("a");
    expect(el?.getAttribute(STUDIO_PATH_OFFSET_ATTR)).toBe("true");
    expect(el?.hasAttribute(`data-${STUDIO_PATH_OFFSET_ATTR}`)).toBe(false);
  });
});
