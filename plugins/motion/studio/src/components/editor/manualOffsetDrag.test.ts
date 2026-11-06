import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import {
  applyManualOffsetDragCommit,
  resumeGsapTimelines,
  applyManualOffsetDragDraft,
  applyManualOffsetDragMatrix,
  applyManualOffsetNudgeDraft,
  createManualOffsetDragMember,
  endManualOffsetDragMembers,
  invertManualOffsetDragMatrix,
  measureManualOffsetDragScreenToOffsetMatrix,
  resolveManualOffsetForPointerDelta,
  type ManualOffsetDragMatrix,
} from "./manualOffsetDrag";
import { UNREADABLE_TRANSLATE } from "./plainTranslate";
import { STUDIO_OFFSET_X_PROP, STUDIO_OFFSET_Y_PROP } from "./manualEdits";
import { computeDraggedGsapPosition } from "../../hooks/draggedGsapPosition";

function expectMatrixClose(actual: ManualOffsetDragMatrix, expected: ManualOffsetDragMatrix): void {
  expect(actual.a).toBeCloseTo(expected.a, 6);
  expect(actual.b).toBeCloseTo(expected.b, 6);
  expect(actual.c).toBeCloseTo(expected.c, 6);
  expect(actual.d).toBeCloseTo(expected.d, 6);
}

describe("manual offset drag matrix helpers", () => {
  it("inverts identity movement", () => {
    const inverse = invertManualOffsetDragMatrix({ a: 1, b: 0, c: 0, d: 1 });
    if (!inverse) throw new Error("identity matrix should be invertible");

    expectMatrixClose(inverse, { a: 1, b: 0, c: 0, d: 1 });
  });

  it("maps screen movement through a rotated coordinate system", () => {
    const screenToOffset = invertManualOffsetDragMatrix({ a: 0, b: 1, c: -1, d: 0 });
    if (!screenToOffset) throw new Error("rotation matrix should be invertible");

    const offsetDelta = applyManualOffsetDragMatrix(screenToOffset, { x: 0, y: 10 });

    expect(offsetDelta.x).toBeCloseTo(10, 6);
    expect(offsetDelta.y).toBeCloseTo(0, 6);
  });

  it("rejects singular movement matrices", () => {
    expect(invertManualOffsetDragMatrix({ a: 1, b: 1, c: 2, d: 2 })).toBeNull();
  });

  it("resolves final offsets from the measured inverse matrix", () => {
    const offsetToScreen = { a: 2, b: 3, c: -1, d: 4 };
    const screenToOffset = invertManualOffsetDragMatrix(offsetToScreen);
    if (!screenToOffset) throw new Error("fixture matrix should be invertible");

    const nextOffset = resolveManualOffsetForPointerDelta({
      initialOffset: { x: 5, y: -2 },
      screenToOffset,
      dx: 7,
      dy: 11,
    });
    const screenDelta = applyManualOffsetDragMatrix(offsetToScreen, {
      x: nextOffset.x - 5,
      y: nextOffset.y + 2,
    });

    expect(screenDelta.x).toBeCloseTo(7, 6);
    expect(screenDelta.y).toBeCloseTo(11, 6);
  });
});

describe("measureManualOffsetDragScreenToOffsetMatrix", () => {
  it("measures the element center response and restores probe styles", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    element.setAttribute("data-hf-studio-path-offset", "true");
    window.document.body.append(element);

    element.getBoundingClientRect = () => {
      const offsetX = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const offsetY = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      return new window.DOMRect(10 + 2 * offsetX - offsetY, 20 + 3 * offsetX + 4 * offsetY, 12, 8);
    };

    const measured = measureManualOffsetDragScreenToOffsetMatrix(element, { x: 0, y: 0 });
    if (!measured.ok) throw new Error(measured.reason);

    const expected = invertManualOffsetDragMatrix({ a: 2, b: 3, c: -1, d: 4 });
    if (!expected) throw new Error("fixture matrix should be invertible");

    expectMatrixClose(measured.matrix, expected);
    expect(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("");
    expect(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("");
    expect(element.style.getPropertyValue("translate")).toBe("");
  });

  /**
   * The element that has never been offset is the common case, and it used to skip
   * the measurement and assume the canvas zoom was the whole story. Any transform
   * above the element makes that assumption wrong: the mirrored parent here sends a
   * rightward drag left, so the overlay followed the pointer while the element went
   * the other way, and only on drop did the overlay jump to where the element really
   * was. The fixture mirrors x and scales both axes by 1.2, as a `rotationY: 180`
   * card at `scale: 1.2` does.
   */
  it("measures a mirrored parent even when the element carries no offset yet", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    element.getBoundingClientRect = () => {
      const offsetX = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const offsetY = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      return new window.DOMRect(100 - 1.2 * offsetX, 200 + 1.2 * offsetY, 40, 20);
    };

    const measured = measureManualOffsetDragScreenToOffsetMatrix(element, { x: 0, y: 0 });
    if (!measured.ok) throw new Error(measured.reason);

    // Dragging one screen px right must move the element one screen px right, which
    // on a mirrored parent means writing a NEGATIVE offset.
    const offset = resolveManualOffsetForPointerDelta({
      initialOffset: { x: 0, y: 0 },
      screenToOffset: measured.matrix,
      dx: 60,
      dy: 60,
    });
    expect(offset.x).toBeCloseTo(-50, 6);
    expect(offset.y).toBeCloseTo(50, 6);
  });

  it("measures movement in parent viewport pixels when the element is inside a scaled iframe", () => {
    const window = new Window({ settings: { enableIframePageLoading: true } });
    const iframe = window.document.createElement("iframe");
    window.document.body.append(iframe);
    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument;
    if (!iframeWindow || !iframeDocument) throw new Error("iframe fixture failed to initialize");

    Object.defineProperty(iframeWindow, "frameElement", {
      configurable: true,
      value: iframe,
    });
    Object.defineProperty(iframeWindow, "innerWidth", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(iframeWindow, "innerHeight", {
      configurable: true,
      value: 100,
    });
    iframe.getBoundingClientRect = () => new window.DOMRect(50, 40, 100, 50);

    const element = iframeDocument.createElement("div");
    element.setAttribute("data-hf-studio-path-offset", "true");
    iframeDocument.body.append(element);
    element.getBoundingClientRect = () => {
      const offsetX = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const offsetY = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      return new iframeWindow.DOMRect(20 + offsetX, 30 + offsetY, 40, 20);
    };

    const measured = measureManualOffsetDragScreenToOffsetMatrix(element, { x: 0, y: 0 });
    if (!measured.ok) throw new Error(measured.reason);

    expectMatrixClose(measured.matrix, { a: 2, b: -0, c: -0, d: 2 });

    const nextOffset = resolveManualOffsetForPointerDelta({
      initialOffset: { x: 0, y: 0 },
      screenToOffset: measured.matrix,
      dx: 50,
      dy: 25,
    });
    expect(nextOffset).toEqual({ x: 100, y: 50 });
  });

  // Carrying no path offset used to be taken as permission to assume the response
  // instead of measuring it. It is not a signal about the transforms above the
  // element, so it no longer changes the answer: an element that does not move is
  // unmeasurable either way, and the caller falls back rather than being handed a
  // matrix that was never checked.
  it("does not treat a missing path offset as a measurable response", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);
    element.getBoundingClientRect = () => new window.DOMRect(10, 20, 12, 8);

    const measured = measureManualOffsetDragScreenToOffsetMatrix(element, { x: 0, y: 0 });

    expect(measured.ok).toBe(false);
  });

  it("rejects path-offset elements whose movement response cannot be measured", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    element.setAttribute("data-hf-studio-path-offset", "true");
    window.document.body.append(element);
    element.getBoundingClientRect = () => new window.DOMRect(10, 20, 12, 8);

    const measured = measureManualOffsetDragScreenToOffsetMatrix(element, { x: 0, y: 0 });

    expect(measured.ok).toBe(false);
  });
});

/**
 * A group drag is rigid: every member is handed the SAME pointer delta and must
 * travel the same distance on screen, or the group visibly comes apart mid-drag.
 * Members do not share a mapping though — each measures its own, because each can
 * sit under different ancestor transforms. A member whose movement cannot be
 * measured falls back to a guess, and this pins what that guess costs the group.
 */
describe("group drag stays rigid", () => {
  function member(key: string, response: number, measurable: boolean) {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);
    element.getBoundingClientRect = () => {
      const ox = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const oy = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      const move = measurable ? response : 0;
      return new window.DOMRect(100 + move * ox, 200 + move * oy, 40, 20);
    };
    const result = createManualOffsetDragMember({
      key,
      selection: { element } as never,
      element,
      rect: { left: 100, top: 200, width: 40, height: 20, editScaleX: 1, editScaleY: 1 },
    });
    if (!result.ok) throw new Error(result.reason);
    return { member: result.member, response };
  }

  /** Screen distance this member travels for a pointer delta of `d`. */
  function screenTravel(entry: ReturnType<typeof member>, d: number): number {
    const offset = resolveManualOffsetForPointerDelta({
      initialOffset: entry.member.initialOffset,
      screenToOffset: entry.member.screenToOffset,
      dx: d,
      dy: 0,
    });
    return offset.x * entry.response;
  }

  it("moves every measurable member the same distance for one pointer delta", () => {
    // Two members under different ancestor scales: one 1:1, one inside a half-scale
    // parent. Different offsets, identical screen travel — that is what rigid means.
    const a = member("a", 1, true);
    const b = member("b", 0.5, true);

    expect(screenTravel(a, 60)).toBeCloseTo(60, 6);
    expect(screenTravel(b, 60)).toBeCloseTo(60, 6);
  });
});

describe("createManualOffsetDragMember uses raw CSS var offset", () => {
  it("ignores GSAP transform — initialOffset comes from CSS vars only", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    element.style.setProperty("transform", "translate(0px, -20px)");

    element.getBoundingClientRect = () => {
      const offsetX = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const offsetY = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      return new window.DOMRect(10 + offsetX, 20 + offsetY, 100, 50);
    };

    const result = createManualOffsetDragMember({
      key: "test",
      selection: { element } as never,
      element,
      rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member.initialOffset.x).toBe(0);
    expect(result.member.initialOffset.y).toBe(0);
  });

  it("reads only the CSS var offset, not GSAP transform", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    element.style.setProperty(STUDIO_OFFSET_X_PROP, "30px");
    element.style.setProperty(STUDIO_OFFSET_Y_PROP, "10px");
    // Old projects bake the offset by referencing the vars in the inline
    // `translate` longhand — that's what makes the offset "applied" and thus the
    // valid drag base (readAppliedStudioPathOffset). A raw var with no applied
    // translate is dormant and reads as zero. Assign the typed `.translate`
    // accessor (happy-dom doesn't surface it via setProperty).
    element.style.translate = `var(${STUDIO_OFFSET_X_PROP}, 0px) var(${STUDIO_OFFSET_Y_PROP}, 0px)`;
    element.style.setProperty("transform", "translate(50px, -15px)");

    element.getBoundingClientRect = () => {
      const offsetX = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const offsetY = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      return new window.DOMRect(10 + offsetX, 20 + offsetY, 100, 50);
    };

    const result = createManualOffsetDragMember({
      key: "test",
      selection: { element } as never,
      element,
      rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member.initialOffset.x).toBe(30);
    expect(result.member.initialOffset.y).toBe(10);
  });

  it("does not accumulate drift across multiple drag cycles", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);

    element.getBoundingClientRect = () => {
      const offsetX = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      const offsetY = Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)) || 0;
      return new window.DOMRect(10 + offsetX, 20 + offsetY, 100, 50);
    };

    // Simulate GSAP baking a translate into transform each cycle
    for (let cycle = 0; cycle < 3; cycle++) {
      element.style.setProperty("transform", `translate(${50 * (cycle + 1)}px, 0px)`);
      // Mark the offset as APPLIED (the inline translate references the studio
      // vars, the form an old project bakes) so readAppliedStudioPathOffset reads
      // the var, not zero. Without this the var is dormant and reads as zero.
      // Assign the typed `.translate` accessor (happy-dom doesn't surface it via
      // setProperty).
      element.style.translate = `var(${STUDIO_OFFSET_X_PROP}, 0px) var(${STUDIO_OFFSET_Y_PROP}, 0px)`;

      const result = createManualOffsetDragMember({
        key: "test",
        selection: { element } as never,
        element,
        rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // initialOffset should always be the CSS var value, never inflated by GSAP transform
      const currentRawX =
        Number.parseFloat(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)) || 0;
      expect(result.member.initialOffset.x).toBe(currentRawX);

      // Simulate drag commit: apply a small offset
      applyManualOffsetDragCommit(result.member, 10, 0);
      endManualOffsetDragMembers([result.member]);
    }
  });
});

// ── GSAP-element drag: the dot-a "flies" regressions ────────────────────────
// A static element positioned via the legacy `--hf-studio-offset` CSS var, dragged
// in a GSAP composition. Three independent failure modes, each fixed:
//   1. live drag integrated off-screen (base read from the live transform)
//   2. commit re-added the delta (stamped base wiped by a mid-drag re-render)
//   3. drop left the element offset (stale --hf-studio-offset var composing with
//      the committed GSAP transform until a full reload)
function makeGsapDot(offsetX = 94, offsetY = 2) {
  const window = new Window();
  const element = window.document.createElement("div");
  element.id = "dot-a";
  element.setAttribute("data-hf-studio-path-offset", "true");
  element.style.setProperty(STUDIO_OFFSET_X_PROP, `${offsetX}px`);
  element.style.setProperty(STUDIO_OFFSET_Y_PROP, `${offsetY}px`);
  element.style.translate = `var(${STUDIO_OFFSET_X_PROP}, 0px) var(${STUDIO_OFFSET_Y_PROP}, 0px)`;
  window.document.body.append(element);
  // Constant rect → the screen-to-offset probe can't measure movement → member
  // uses the deterministic preview-scale fallback matrix. Both branches set baseGsap.
  element.getBoundingClientRect = () => new window.DOMRect(10, 20, 100, 50);
  const sets: Array<Record<string, unknown>> = [];
  const win = element.ownerDocument.defaultView as unknown as {
    gsap?: unknown;
    __timelines?: unknown;
  };
  win.gsap = {
    set: (el: HTMLElement, vars: Record<string, unknown>) => {
      sets.push({ ...vars });
      if (typeof vars.x === "number") {
        el.style.setProperty("transform", `translate(${vars.x}px, ${(vars.y as number) ?? 0}px)`);
      }
    },
    // getProperty reads the LIVE transform — the exact value the old code fed back
    // into `base + delta`, integrating the element off-screen.
    getProperty: (el: HTMLElement, prop: string) => {
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
        el.style.getPropertyValue("transform") || "",
      );
      if (!m) return 0;
      return prop === "x" ? Number.parseFloat(m[1]!) : Number.parseFloat(m[2]!);
    },
  };
  const member = () => {
    const result = createManualOffsetDragMember({
      key: "dot",
      selection: { element } as never,
      element,
      rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
    });
    if (!result.ok) throw new Error("member not created");
    return result.member;
  };
  return { element, sets, member };
}

describe("GSAP-element drag — dot-a flies regressions", () => {
  it("live draft uses the stable gesture-start base, so repeated moves don't integrate", () => {
    const { element, member } = makeGsapDot();
    const m = member();
    // Simulate a mid-drag re-render wiping the stamped base attr → the draft must
    // fall back to the in-memory member.baseGsap, NOT the live (mutating) transform.
    element.removeAttribute("data-hf-drag-gsap-base-x");
    element.removeAttribute("data-hf-drag-gsap-base-y");
    applyManualOffsetDragDraft(m, -50, 0);
    const first = element.style.getPropertyValue("transform");
    applyManualOffsetDragDraft(m, -50, 0);
    const second = element.style.getPropertyValue("transform");
    // Same pointer delta → same committed transform. The old bug integrated (the
    // second frame added the delta on top of the first frame's result).
    expect(second).toBe(first);
  });

  it("commit re-stamps the stable base/initial attrs even after they're wiped", () => {
    const { element, member } = makeGsapDot();
    const m = member();
    element.removeAttribute("data-hf-drag-gsap-base-x");
    element.removeAttribute("data-hf-drag-initial-offset-x");
    applyManualOffsetDragCommit(m, -50, 0);
    expect(element.getAttribute("data-hf-drag-gsap-base-x")).toBe(String(m.baseGsap.x));
    expect(element.getAttribute("data-hf-drag-initial-offset-x")).toBe(String(m.initialOffset.x));
  });

  it("a GSAP-committed drag migrates the element off --hf-studio-offset", () => {
    const { element, member } = makeGsapDot();
    expect(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("94px");
    const m = member();
    applyManualOffsetDragCommit(m, -160, 0);
    endManualOffsetDragMembers([m]);
    // The legacy CSS-offset channel is fully cleared (single-sourced in GSAP): the
    // var is removed, so any lingering `translate: var(--hf-studio-offset-x, 0px)`
    // resolves to its 0px fallback and can no longer compose with the GSAP transform.
    expect(element.style.getPropertyValue(STUDIO_OFFSET_X_PROP)).toBe("");
    expect(element.style.getPropertyValue(STUDIO_OFFSET_Y_PROP)).toBe("");
    expect(element.hasAttribute("data-hf-studio-path-offset")).toBe(false);
    // ...and the position survives in the GSAP transform (no stale var to compose).
    expect(element.style.getPropertyValue("transform")).toMatch(/translate\(/);
  });
});

describe("a drag that starts while an earlier gesture is still saving", () => {
  it("keeps the timelines paused until the later drag ends", () => {
    const { element, member } = makeGsapDot();
    let paused = false;
    const timeline = {
      pause: () => (paused = true),
      paused: (v?: boolean) => (paused = v ?? paused),
    };
    (element.ownerDocument.defaultView as unknown as { __timelines: unknown }).__timelines = {
      main: timeline,
    };
    const earlier = member();
    applyManualOffsetDragCommit(earlier, -50, 0);
    const later = member();

    endManualOffsetDragMembers([earlier]);

    expect(paused).toBe(true);
    endManualOffsetDragMembers([later]);
    expect(paused).toBe(false);
  });
});

describe("sub-pixel drags", () => {
  it("draft and commit both land the exact fractional position", () => {
    const { element, sets, member } = makeGsapDot();
    const m = member();
    applyManualOffsetDragDraft(m, 10.25, -3.5);
    const draft = sets.at(-1)!;
    expect(draft).toEqual({ x: m.baseGsap.x + 10.25, y: m.baseGsap.y - 3.5 });
    const offset = applyManualOffsetDragCommit(m, 10.25, -3.5);
    const { newX, newY } = computeDraggedGsapPosition(element, offset, m.baseGsap);
    expect({ x: newX, y: newY }).toEqual(draft);
  });
});

describe("a stylesheet translate after a committed GSAP drag", () => {
  function draggedTitle(css: string, oldOffsetChannel = false, withGsap = true) {
    const window = new Window();
    const style = window.document.createElement("style");
    style.textContent = css;
    window.document.head.append(style);
    const element = window.document.createElement("h1");
    element.id = "title";
    if (oldOffsetChannel) {
      element.setAttribute("data-hf-studio-path-offset", "true");
      element.style.setProperty(STUDIO_OFFSET_X_PROP, "30px");
      element.style.setProperty(STUDIO_OFFSET_Y_PROP, "0px");
      element.style.translate = `var(${STUDIO_OFFSET_X_PROP}, 0px) var(${STUDIO_OFFSET_Y_PROP}, 0px)`;
    }
    window.document.body.append(element);
    element.getBoundingClientRect = () => new window.DOMRect(10, 20, 100, 50);
    (window as unknown as { gsap: unknown }).gsap = withGsap && {
      set: (el: HTMLElement, vars: { x?: number; y?: number }) =>
        el.style.setProperty("transform", `translate(${vars.x ?? 0}px, ${vars.y ?? 0}px)`),
      getProperty: () => 0,
    };
    const result = createManualOffsetDragMember({
      key: "title",
      selection: { element } as never,
      element,
      rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
    });
    if (!result.ok) throw new Error("member not created");
    applyManualOffsetDragCommit(result.member, 40, 30);
    if (withGsap) expect(element.style.getPropertyValue("translate")).toBe("none");
    endManualOffsetDragMembers([result.member]);
    return element;
  }

  it("stays masked, so it is not applied on top of the committed transform", () => {
    expect(
      draggedTitle("#title { translate: 0 -200px; }").style.getPropertyValue("translate"),
    ).toBe("none");
  });

  it("stays masked for an element still on the old offset channel", () => {
    const element = draggedTitle("#title { translate: 0 -200px; }", true);
    expect(element.hasAttribute("data-hf-studio-path-offset")).toBe(false);
    expect(element.style.getPropertyValue("translate")).toBe("none");
  });

  it("is not masked when GSAP does not own the position", () => {
    const element = draggedTitle("#title { translate: 0 -200px; }", true, false);
    expect(element.style.getPropertyValue("translate")).toContain(STUDIO_OFFSET_X_PROP);
  });

  it("is not left behind when nothing sits under the draft's mask", () => {
    expect(draggedTitle("").style.getPropertyValue("translate")).toBe("");
  });
});

describe("resumeGsapTimelines", () => {
  it("unpauses exactly the timelines the drag start paused, then re-seeks the player", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    element.setAttribute("data-hf-drag-paused-timelines", "figma-demo-unlock,figma-demo-stagger");
    window.document.body.append(element);

    const pausedState: Record<string, boolean> = {
      "figma-demo-unlock": true,
      "figma-demo-stagger": true,
      main: true,
    };
    const makeTl = (id: string) => ({
      paused: (value?: boolean) => {
        if (value !== undefined) pausedState[id] = value;
        return pausedState[id]!;
      },
    });
    const seeks: number[] = [];
    const win = element.ownerDocument.defaultView as unknown as {
      __timelines?: Record<string, unknown>;
      __player?: { seek: (t: number) => void; getTime: () => number };
    };
    win.__timelines = {
      "figma-demo-unlock": makeTl("figma-demo-unlock"),
      "figma-demo-stagger": makeTl("figma-demo-stagger"),
      main: makeTl("main"),
    };
    win.__player = { seek: (t: number) => seeks.push(t), getTime: () => 3.5 };

    resumeGsapTimelines(element);

    expect(pausedState["figma-demo-unlock"]).toBe(false);
    expect(pausedState["figma-demo-stagger"]).toBe(false);
    // main was NOT paused by the drag — leave its state alone
    expect(pausedState["main"]).toBe(true);
    expect(seeks).toEqual([3.5]);
    expect(element.hasAttribute("data-hf-drag-paused-timelines")).toBe(false);
  });

  it("is a no-op without the paused-timelines attribute", () => {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);
    expect(() => resumeGsapTimelines(element)).not.toThrow();
  });
});

describe("a move of an element GSAP does not position", () => {
  function plainBox(options: { gsapLoaded?: boolean } = {}) {
    const window = new Window();
    const element = window.document.createElement("div");
    window.document.body.append(element);
    element.style.setProperty("translate", "40px 30px");
    // A rect that never moves: the probe falls back to the 1:1 preview-scale mapping.
    element.getBoundingClientRect = () => new window.DOMRect(10, 20, 100, 50);
    const gsapCalls: string[] = [];
    if (options.gsapLoaded) {
      Object.assign(window, {
        gsap: { set: () => gsapCalls.push("set"), getProperty: () => gsapCalls.push("read") },
      });
    }
    const member = (gesture: "drag" | "nudge" = "drag") => {
      const result = createManualOffsetDragMember({
        key: "box",
        selection: { element } as never,
        element,
        rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
        gesture,
      });
      if (!result.ok) throw new Error(result.reason);
      return result.member;
    };
    return { window, element, gsapCalls, member };
  }

  it("refuses a translate it can't read instead of guessing, and leaves the element alone", () => {
    const { element } = plainBox();
    element.style.setProperty("translate", "abs(10% - 50px) 0px");
    const result = createManualOffsetDragMember({
      key: "box",
      selection: { element } as never,
      element,
      rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
      gesture: "drag",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toBe(UNREADABLE_TRANSLATE);
    expect(element.style.getPropertyValue("translate")).toBe("abs(10% - 50px) 0px");
  });

  it("drafts and drops the element's own translate in plain px, never touching GSAP", () => {
    const { element, gsapCalls, member } = plainBox({ gsapLoaded: true });
    const m = member();
    expect(m.plainTranslate).toBe(true);
    applyManualOffsetDragDraft(m, 90.25, 60);
    expect(element.style.getPropertyValue("translate")).toBe("130.25px 90px");
    expect(applyManualOffsetDragCommit(m, 90.25, 60)).toEqual({ x: 130.25, y: 90 });
    endManualOffsetDragMembers([m]);
    expect(element.style.getPropertyValue("translate")).toBe("130.25px 90px");
    expect(gsapCalls).toEqual([]);
    expect(element.hasAttribute("data-hf-drag-gsap-base-x")).toBe(false);
  });

  it("starts a second move where the first dropped, while the first save is still in flight", () => {
    const { member } = plainBox();
    const first = member();
    applyManualOffsetDragCommit(first, 90, 60);
    const second = member();
    expect(second.initialOffset).toEqual({ x: 130, y: 90 });
    expect(applyManualOffsetDragCommit(second, 40, 0)).toEqual({ x: 170, y: 90 });
  });

  it("nudges from the element's translate", () => {
    const { member } = plainBox();
    expect(applyManualOffsetNudgeDraft(member("nudge"), { x: 5, y: -1 })).toEqual({ x: 45, y: 29 });
  });

  it("keeps the GSAP writer once GSAP renders the element's transform", () => {
    const { element, member } = plainBox({ gsapLoaded: true });
    Object.assign(element, { _gsap: { renderTransform: () => {} } });
    expect(member().plainTranslate).toBe(false);
  });

  it("keeps the GSAP writer for an element a timeline hold positions", () => {
    const { window, element, member } = plainBox();
    const hold = { targets: () => [element], vars: { x: 40 }, duration: () => 0 };
    Object.assign(window, { __timelines: { main: { getChildren: () => [hold] } } });
    expect(member().plainTranslate).toBe(false);
  });
});

describe("a resize's anchor member", () => {
  function anchorMember(tweenVars?: Record<string, number>) {
    const window = new Window();
    const element = window.document.createElement("div");
    element.id = "box";
    window.document.body.append(element);
    const tweens = tweenVars ? [{ vars: tweenVars, targets: () => [element] }] : [];
    Object.assign(window, { __timelines: { main: { getChildren: () => tweens } } });
    element.getBoundingClientRect = () => {
      const [x = 0, y = 0] = element.style
        .getPropertyValue("translate")
        .split(" ")
        .map((v) => Number.parseFloat(v));
      return new window.DOMRect(10 + (x || 0), 20 + (y || 0), 100, 50);
    };
    const result = createManualOffsetDragMember({
      key: "box",
      selection: { element } as never,
      element,
      rect: { left: 10, top: 20, width: 100, height: 50, editScaleX: 1, editScaleY: 1 },
      gesture: "resize",
    });
    if (!result.ok) throw new Error("member");
    return result.member;
  }

  it("keeps the centre with the element's own plain translate when GSAP does not own the box", () => {
    const member = anchorMember();
    expect(member.plainTranslate).toBe(true);
    applyManualOffsetDragDraft(member, -10.25, 3.5);
    expect(member.element.style.getPropertyValue("translate")).toBe("-10.25px 3.5px");
  });

  it.each(["width", "maxWidth", "minHeight", "flexBasis", "scale", "scaleX"])(
    "leaves a box whose %s GSAP tweens, which the CSS box writer also sets, to the GSAP writer",
    (channel) => {
      expect(anchorMember({ [channel]: 300 }).plainTranslate).toBe(false);
    },
  );
});
