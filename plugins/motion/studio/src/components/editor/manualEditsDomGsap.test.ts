// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStudioPathOffset, applyStudioPathOffsetDraft } from "./manualEditsDom";

/**
 * Regression: dragging a GSAP-animated element (e.g. a flat `to(#el, {x})` tween)
 * must NOT fold the offset into a CSS `translate`. GSAP owns `style.transform`, so
 * a CSS translate composes on top of it and the strip/reapply math compounds into
 * a runaway matrix that flings the element off-canvas. Both the live draft and the
 * commit must instead push the offset into GSAP's x/y via gsap.set and keep
 * `translate: none`. Before the fix, the commit (applyStudioPathOffset) skipped the
 * GSAP branch the draft already had — that asymmetry caused the off-canvas jump.
 */

function makeGsapWindow(
  el: HTMLElement,
  gsapSet: (e: Element, v: Record<string, unknown>) => void,
) {
  const win = el.ownerDocument.defaultView as unknown as {
    __timelines?: Record<string, unknown>;
    gsap?: unknown;
  };
  win.__timelines = {
    playground: {
      getChildren: () => [{ targets: () => [el], vars: { x: -260 } }],
    },
  };
  win.gsap = {
    set: gsapSet,
    getProperty: () => 0,
  };
}

afterEach(() => {
  const win = window as unknown as { __timelines?: unknown; gsap?: unknown };
  delete win.__timelines;
  delete win.gsap;
});

describe("applyStudioPathOffset — GSAP-owned transform", () => {
  it("non-GSAP element folds the offset into a CSS translate var()", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    applyStudioPathOffset(el, { x: -120, y: 40 });

    expect(el.style.translate).toContain("var(--hf-studio-offset-x");
    expect(el.style.getPropertyValue("--hf-studio-offset-x")).toBe("-120px");
    expect(el.style.getPropertyValue("--hf-studio-offset-y")).toBe("40px");
  });

  it("GSAP element keeps translate:none and routes the offset through gsap.set", () => {
    const el = document.createElement("div");
    el.id = "puck-a";
    document.body.appendChild(el);
    const gsapSet = vi.fn();
    makeGsapWindow(el, gsapSet);

    applyStudioPathOffset(el, { x: -409, y: 398 });

    // No CSS translate to collide with GSAP's transform.
    expect(el.style.translate).toBe("none");
    expect(el.style.translate).not.toContain("var(");
    // Offset pushed into GSAP's x/y (gsapBase 0 + delta = the offset itself here).
    expect(gsapSet).toHaveBeenCalledWith(el, { x: -409, y: 398 });
  });

  it("draft and commit treat a GSAP element identically (translate:none)", () => {
    const el = document.createElement("div");
    el.id = "puck-a";
    document.body.appendChild(el);
    makeGsapWindow(el, vi.fn());

    applyStudioPathOffsetDraft(el, { x: -50, y: 10 });
    const draftTranslate = el.style.translate;
    applyStudioPathOffset(el, { x: -50, y: 10 });
    const commitTranslate = el.style.translate;

    expect(draftTranslate).toBe("none");
    expect(commitTranslate).toBe("none");
  });
});
