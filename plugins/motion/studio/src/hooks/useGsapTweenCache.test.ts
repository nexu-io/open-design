import { describe, it, expect } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { getAnimationsForElement, resolveSelectorElementIds } from "./useGsapTweenCache";

// Minimal Document stub: querySelectorAll returns the elements mapped per selector.
function fakeDoc(map: Record<string, { id: string }[]>): Document {
  return {
    querySelectorAll: (sel: string) => (map[sel] ?? []) as unknown as NodeListOf<Element>,
  } as unknown as Document;
}

function anim(targetSelector: string): GsapAnimation {
  return {
    id: `${targetSelector}-to-0`,
    targetSelector,
    method: "to",
    position: 0,
    properties: {},
  };
}

describe("getAnimationsForElement", () => {
  const animations = [anim("#hero"), anim(".kicker"), anim(".kicker"), anim(".co-new")];

  it("matches tweens by element id", () => {
    const result = getAnimationsForElement(animations, { id: "hero" });
    expect(result.map((a) => a.targetSelector)).toEqual(["#hero"]);
  });

  it("matches class-targeted tweens by the element's selector", () => {
    // Real compositions target tweens by class (querySelector(".kicker")); the
    // selected element has no id, so id-only matching would miss these.
    const result = getAnimationsForElement(animations, { id: null, selector: ".kicker" });
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.targetSelector === ".kicker")).toBe(true);
  });

  it("matches by id or selector when both are present", () => {
    const result = getAnimationsForElement(animations, { id: "hero", selector: ".co-new" });
    expect(result.map((a) => a.targetSelector).sort()).toEqual(["#hero", ".co-new"]);
  });

  it("returns nothing when neither id nor selector is provided", () => {
    expect(getAnimationsForElement(animations, {})).toEqual([]);
    expect(getAnimationsForElement(animations, { id: null, selector: null })).toEqual([]);
  });

  it("matches an element that is one member of a group-selector tween", () => {
    // Array/toArray targets serialize as a CSS group selector; selecting either
    // member element should surface the shared tween.
    const grouped = [anim(".clock-face, .clock-hand")];
    expect(getAnimationsForElement(grouped, { selector: ".clock-face" })).toHaveLength(1);
    expect(getAnimationsForElement(grouped, { selector: ".clock-hand" })).toHaveLength(1);
    expect(getAnimationsForElement(grouped, { selector: ".unrelated" })).toHaveLength(0);
  });

  it("attributes a class tween to an id-selected element via element.matches", () => {
    // gsap.from(".dot", {stagger}) — the element is selected by id (#dot-a), so
    // its selector string never equals ".dot", but the live element matches it.
    const dots = [anim(".dot")];
    const el = { matches: (s: string) => s === ".dot" || s === "#dot-a" } as unknown as Element;
    expect(getAnimationsForElement(dots, { id: "dot-a", selector: "#dot-a" }, el)).toHaveLength(1);
    // Without the live element the class tween is still missed (legacy behavior).
    expect(getAnimationsForElement(dots, { id: "dot-a", selector: "#dot-a" })).toHaveLength(0);
  });

  it("element.matches gates attribution — no over-matching", () => {
    const dots = [anim(".dot")];
    const el = { matches: () => false } as unknown as Element;
    expect(getAnimationsForElement(dots, { id: "other", selector: "#other" }, el)).toHaveLength(0);
  });
});

describe("resolveSelectorElementIds", () => {
  it("resolves a bare #id without touching the DOM", () => {
    expect(resolveSelectorElementIds("#hero", null)).toEqual(["hero"]);
  });

  it("resolves a class selector to every matching element id (the .dot+stagger case)", () => {
    const doc = fakeDoc({ ".dot": [{ id: "dot-a" }, { id: "dot-b" }] });
    expect(resolveSelectorElementIds(".dot", doc)).toEqual(["dot-a", "dot-b"]);
  });

  it("resolves a group selector across its parts (deduped)", () => {
    const doc = fakeDoc({ ".a": [{ id: "x" }], ".b": [{ id: "y" }, { id: "x" }] });
    expect(resolveSelectorElementIds(".a, .b", doc).sort()).toEqual(["x", "y"]);
  });

  // A DOM-less LEADING-id fallback attributed `#card .label` to `#card`, the
  // ancestor it merely scopes to. Without a DOM there is nothing to resolve the
  // descendant against, so the honest answer is no element at all.
  it("resolves nothing for a compound selector when there is no DOM", () => {
    expect(resolveSelectorElementIds("#card .label", null)).toEqual([]);
    expect(resolveSelectorElementIds(".dot", null)).toEqual([]);
  });

  it("still resolves every whole-id part of a group selector without a DOM", () => {
    expect(resolveSelectorElementIds("#a, #b", null)).toEqual(["a", "b"]);
  });

  // The `[id="…"]` form is what writers emit for a CSS-unsafe id (digit-leading,
  // dotted). The old local `#id`-only regex read no id at all for those, so they
  // silently dropped out of both DOM-less paths.
  it("falls back to a bracketed id when there is no DOM", () => {
    expect(resolveSelectorElementIds('[id="01-hook"]', null)).toEqual(["01-hook"]);
    expect(resolveSelectorElementIds('[id="01-hook"] .label', null)).toEqual([]);
  });

  it("falls back to a bracketed id when querySelectorAll rejects the selector", () => {
    const doc = {
      querySelectorAll: () => {
        throw new SyntaxError("bad selector");
      },
    } as unknown as Document;
    expect(resolveSelectorElementIds('[id="01-hook"]:has(>*)', doc)).toEqual(["01-hook"]);
  });
});
