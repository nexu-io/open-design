// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyElementPositionOffset } from "./elementPositionOffset";

// jsdom has no layout: offsets follow left/top unless the box is anchored elsewhere.
function word(style: string, anchoredRight = false): HTMLElement {
  const el = document.createElement("span");
  el.setAttribute("style", style);
  const px = (v: string) => Number.parseFloat(v) || 0;
  Object.defineProperties(el, {
    offsetLeft: { get: () => (anchoredRight ? 500 : 100 + px(el.style.left)) },
    offsetTop: { get: () => 200 + px(el.style.top) },
    offsetWidth: { get: () => 80 },
    offsetHeight: { get: () => 40 },
  });
  el.setAttribute("data-hf-drag-initial-offset-x", "0");
  el.setAttribute("data-hf-drag-initial-offset-y", "0");
  document.body.append(el);
  return el;
}

describe("applyElementPositionOffset", () => {
  it("persists position for a static word the Layers panel lifted to relative", () => {
    const el = word("position: relative");
    el.setAttribute("data-hf-reveal-prior-pos", "static");
    expect(applyElementPositionOffset(el, { x: 40, y: 20 })).toEqual([
      { type: "inline-style", property: "position", value: "relative" },
      { type: "inline-style", property: "left", value: "40px" },
      { type: "inline-style", property: "top", value: "20px" },
    ]);
    expect(el.hasAttribute("data-hf-reveal-prior-pos")).toBe(false);
  });

  it("names percent positioning as the reason it refuses", () => {
    const el = word("position: relative; left: 10%; top: 0px");
    expect(applyElementPositionOffset(el, { x: 40, y: 20 })).toBe("percent");
    expect(el.style.left).toBe("10%");
  });

  it("moves a static element by relative left/top", () => {
    const el = word("");
    expect(applyElementPositionOffset(el, { x: 40, y: 20 })).toEqual([
      { type: "inline-style", property: "position", value: "relative" },
      { type: "inline-style", property: "left", value: "40px" },
      { type: "inline-style", property: "top", value: "20px" },
    ]);
  });

  it("adds to left/top the element already has, so a second drag accumulates", () => {
    const el = word("position: relative; left: 40px; top: 20px");
    expect(applyElementPositionOffset(el, { x: 40, y: 20 })).toEqual([
      { type: "inline-style", property: "left", value: "80px" },
      { type: "inline-style", property: "top", value: "40px" },
    ]);
  });

  it("refuses, leaving the element untouched, when left does not move the box", () => {
    const el = word("position: absolute; right: 30px", true);
    expect(applyElementPositionOffset(el, { x: 40, y: 20 })).toBe("anchored");
    expect([el.style.left, el.style.top, el.style.right]).toEqual(["", "", "30px"]);
  });
});
