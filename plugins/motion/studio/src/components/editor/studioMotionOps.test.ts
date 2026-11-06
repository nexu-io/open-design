import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import {
  readStudioMotionFromElement,
  writeStudioMotionToElement,
  clearStudioMotionFromElement,
} from "./studioMotionOps";
import {
  STUDIO_MOTION_ATTR,
  STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR,
  STUDIO_MOTION_ORIGINAL_OPACITY_ATTR,
  STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR,
} from "./studioMotionTypes";
import { buildMotionPatches, buildClearMotionPatches } from "./manualEditsDomPatches";
import { applyPatchByTarget, readAttributeByTarget } from "../../utils/sourcePatcher";

function createElement(markup: string): HTMLElement {
  const window = new Window();
  window.document.body.innerHTML = markup;
  return window.document.body.firstElementChild as HTMLElement;
}

// ── readStudioMotionFromElement semantics ──

describe("readStudioMotionFromElement", () => {
  it("returns null for element with no attribute", () => {
    const el = createElement(`<div id="test"></div>`);
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null for legacy marker value 'true'", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(STUDIO_MOTION_ATTR, "true");
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(STUDIO_MOTION_ATTR, "{not valid json");
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(STUDIO_MOTION_ATTR, '"just a string"');
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null when start < 0", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: -0.5,
        duration: 1,
        ease: "none",
        from: { opacity: 0 },
        to: { opacity: 1 },
      }),
    );
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null when duration <= 0", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: 0,
        ease: "none",
        from: { opacity: 0 },
        to: { opacity: 1 },
      }),
    );
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null when duration is negative", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: -1,
        ease: "none",
        from: { opacity: 0 },
        to: { opacity: 1 },
      }),
    );
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null when from is missing", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: 1,
        ease: "none",
        to: { opacity: 1 },
      }),
    );
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null when to is missing", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: 1,
        ease: "none",
        from: { opacity: 0 },
      }),
    );
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns null when from/to have no recognized motion properties", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: 1,
        ease: "none",
        from: { color: "red" },
        to: { color: "blue" },
      }),
    );
    expect(readStudioMotionFromElement(el)).toBeNull();
  });

  it("returns parsed motion for valid JSON", () => {
    const el = createElement(`<div id="test"></div>`);
    const motion = {
      start: 0.5,
      duration: 1,
      ease: "power3.out",
      from: { opacity: 0, y: 40 },
      to: { opacity: 1, y: 0 },
    };
    el.setAttribute(STUDIO_MOTION_ATTR, JSON.stringify(motion));

    const result = readStudioMotionFromElement(el);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      start: 0.5,
      duration: 1,
      ease: "power3.out",
      customEase: undefined,
      from: { opacity: 0, y: 40 },
      to: { opacity: 1, y: 0 },
    });
  });

  it("returns parsed motion with customEase", () => {
    const el = createElement(`<div id="test"></div>`);
    const motion = {
      start: 0,
      duration: 0.6,
      ease: "studio-custom",
      customEase: { id: "studio-custom", data: "M0,0 C0.2,0.9 0.28,1 1,1" },
      from: { scale: 0.88, autoAlpha: 0 },
      to: { scale: 1, autoAlpha: 1 },
    };
    el.setAttribute(STUDIO_MOTION_ATTR, JSON.stringify(motion));

    const result = readStudioMotionFromElement(el);
    expect(result).not.toBeNull();
    expect(result!.customEase).toEqual({ id: "studio-custom", data: "M0,0 C0.2,0.9 0.28,1 1,1" });
  });

  it("defaults ease to 'none' when ease is empty string", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: 1,
        ease: "",
        from: { y: 40 },
        to: { y: 0 },
      }),
    );

    const result = readStudioMotionFromElement(el);
    expect(result).not.toBeNull();
    expect(result!.ease).toBe("none");
  });

  it("accepts start = 0 as valid", () => {
    const el = createElement(`<div id="test"></div>`);
    el.setAttribute(
      STUDIO_MOTION_ATTR,
      JSON.stringify({
        start: 0,
        duration: 0.5,
        ease: "none",
        from: { opacity: 0 },
        to: { opacity: 1 },
      }),
    );

    const result = readStudioMotionFromElement(el);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(0);
  });
});

// ── writeStudioMotionToElement / readStudioMotionFromElement round-trip ──

describe("write → read round-trip via DOM", () => {
  it("round-trips motion through write and read", () => {
    const el = createElement(`<div id="hero" style="transform: rotate(5deg); opacity: 0.8"></div>`);
    const motion = {
      start: 0.5,
      duration: 1,
      ease: "power3.out",
      from: { opacity: 0, y: 40 },
      to: { opacity: 1, y: 0 },
    };

    writeStudioMotionToElement(el, motion);
    const result = readStudioMotionFromElement(el);

    expect(result).not.toBeNull();
    expect(result!.start).toBe(0.5);
    expect(result!.duration).toBe(1);
    expect(result!.ease).toBe("power3.out");
    expect(result!.from).toEqual({ opacity: 0, y: 40 });
    expect(result!.to).toEqual({ opacity: 1, y: 0 });
  });

  it("captures original styles on first write", () => {
    const el = createElement(
      `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: hidden"></div>`,
    );
    const motion = {
      start: 0,
      duration: 0.6,
      ease: "none",
      from: { autoAlpha: 0 },
      to: { autoAlpha: 1 },
    };

    writeStudioMotionToElement(el, motion);

    expect(el.getAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR)).toBe("rotate(5deg)");
    expect(el.getAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR)).toBe("0.8");
    expect(el.getAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR)).toBe("hidden");
  });

  it("does not overwrite original styles on subsequent writes", () => {
    const el = createElement(
      `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: visible"></div>`,
    );
    const first = { start: 0, duration: 0.6, ease: "none", from: { y: 40 }, to: { y: 0 } };
    const second = { start: 0.2, duration: 1, ease: "power2.out", from: { y: 60 }, to: { y: 0 } };

    writeStudioMotionToElement(el, first);
    // Simulate GSAP modifying styles
    el.style.transform = "matrix(1, 0, 0, 1, 0, 20)";
    el.style.opacity = "0.3";

    writeStudioMotionToElement(el, second);

    // Original capture should be preserved from the first write
    expect(el.getAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR)).toBe("rotate(5deg)");
    expect(el.getAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR)).toBe("0.8");
  });
});

// ── clearStudioMotionFromElement ──

describe("clearStudioMotionFromElement", () => {
  it("removes all four motion-related attributes", () => {
    const el = createElement(
      `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: visible"></div>`,
    );
    const motion = {
      start: 0,
      duration: 0.6,
      ease: "none",
      from: { autoAlpha: 0 },
      to: { autoAlpha: 1 },
    };
    writeStudioMotionToElement(el, motion);

    expect(el.hasAttribute(STUDIO_MOTION_ATTR)).toBe(true);
    expect(el.hasAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR)).toBe(true);
    expect(el.hasAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR)).toBe(true);
    expect(el.hasAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR)).toBe(true);

    clearStudioMotionFromElement(el);

    expect(el.hasAttribute(STUDIO_MOTION_ATTR)).toBe(false);
    expect(el.hasAttribute(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR)).toBe(false);
    expect(el.hasAttribute(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR)).toBe(false);
    expect(el.hasAttribute(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR)).toBe(false);
  });

  it("restores original inline styles after clearing", () => {
    const el = createElement(
      `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: hidden"></div>`,
    );
    writeStudioMotionToElement(el, {
      start: 0,
      duration: 0.6,
      ease: "none",
      from: { autoAlpha: 0, y: 32 },
      to: { autoAlpha: 1, y: 0 },
    });

    // Simulate GSAP overwriting styles
    el.style.transform = "matrix(1, 0, 0, 1, 0, 16)";
    el.style.opacity = "0.5";
    el.style.visibility = "visible";

    clearStudioMotionFromElement(el);

    expect(el.style.transform).toBe("rotate(5deg)");
    expect(el.style.opacity).toBe("0.8");
    expect(el.style.visibility).toBe("hidden");
  });

  it("is a no-op when element has no motion attribute", () => {
    const el = createElement(`<div id="hero" style="opacity: 1"></div>`);

    clearStudioMotionFromElement(el);

    expect(el.style.opacity).toBe("1");
    expect(el.hasAttribute(STUDIO_MOTION_ATTR)).toBe(false);
  });
});

// ── buildMotionPatches / buildClearMotionPatches ──

describe("buildMotionPatches", () => {
  it("produces patches for all motion-related attributes present on the element", () => {
    const el = createElement(
      `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: visible"></div>`,
    );
    const motion = {
      start: 0.5,
      duration: 1,
      ease: "power3.out",
      from: { opacity: 0, y: 40 },
      to: { opacity: 1, y: 0 },
    };
    writeStudioMotionToElement(el, motion);

    const patches = buildMotionPatches(el);

    // Should have at least the motion attribute patch
    const motionPatch = patches.find((p) => p.property === STUDIO_MOTION_ATTR);
    expect(motionPatch).toBeDefined();
    expect(motionPatch!.type).toBe("attribute");
    expect(JSON.parse(motionPatch!.value!)).toMatchObject(motion);

    // Should include original style capture patches
    expect(patches.find((p) => p.property === STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR)).toBeDefined();
    expect(patches.find((p) => p.property === STUDIO_MOTION_ORIGINAL_OPACITY_ATTR)).toBeDefined();
    expect(
      patches.find((p) => p.property === STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR),
    ).toBeDefined();
  });

  it("returns empty when element has no motion attribute", () => {
    const el = createElement(`<div id="hero"></div>`);
    expect(buildMotionPatches(el)).toEqual([]);
  });
});

describe("buildClearMotionPatches round-trip", () => {
  it("applying clear patches removes all four motion attributes from HTML", () => {
    const el = createElement(
      `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: visible"></div>`,
    );
    writeStudioMotionToElement(el, {
      start: 0,
      duration: 0.6,
      ease: "power2.out",
      from: { autoAlpha: 0, y: 32 },
      to: { autoAlpha: 1, y: 0 },
    });

    // First, apply the motion patches to an HTML string
    const motionPatches = buildMotionPatches(el);
    let html = `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: visible"></div>`;
    for (const patch of motionPatches) {
      html = applyPatchByTarget(html, { id: "hero" }, patch);
    }

    // Verify all four attributes are present
    expect(readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ATTR)).toBeDefined();
    expect(
      readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR),
    ).toBeDefined();
    expect(
      readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ORIGINAL_OPACITY_ATTR),
    ).toBeDefined();
    expect(
      readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR),
    ).toBeDefined();

    // Now apply clear patches
    const clearPatches = buildClearMotionPatches(el);
    for (const patch of clearPatches) {
      html = applyPatchByTarget(html, { id: "hero" }, patch);
    }

    // All four should be gone
    expect(readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ATTR)).toBeUndefined();
    expect(
      readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR),
    ).toBeUndefined();
    expect(
      readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ORIGINAL_OPACITY_ATTR),
    ).toBeUndefined();
    expect(
      readAttributeByTarget(html, { id: "hero" }, STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR),
    ).toBeUndefined();
  });

  it("clear patches produce exactly four null-value attribute operations", () => {
    const el = createElement(`<div id="hero"></div>`);
    const clearPatches = buildClearMotionPatches(el);

    expect(clearPatches).toHaveLength(4);
    for (const patch of clearPatches) {
      expect(patch.type).toBe("attribute");
      expect(patch.value).toBeNull();
    }

    const properties = clearPatches.map((p) => p.property);
    expect(properties).toContain(STUDIO_MOTION_ATTR);
    expect(properties).toContain(STUDIO_MOTION_ORIGINAL_TRANSFORM_ATTR);
    expect(properties).toContain(STUDIO_MOTION_ORIGINAL_OPACITY_ATTR);
    expect(properties).toContain(STUDIO_MOTION_ORIGINAL_VISIBILITY_ATTR);
  });
});
