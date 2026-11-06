import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { applyRotationDraft, readCssRotationTarget, readRotationBase } from "./rotationDraft";

describe("rotate in a composition without GSAP", () => {
  it("starts from the authored CSS rotation and drafts the absolute angle the commit writes", () => {
    const window = new Window();
    window.document.head.innerHTML = "<style>#title { rotate: 30deg; }</style>";
    const element = window.document.createElement("h1");
    element.id = "title";
    window.document.body.append(element);
    const base = readRotationBase(element, true);
    expect(base).toBeCloseTo(30);
    applyRotationDraft(element, 55, readCssRotationTarget(element));
    expect(element.style.getPropertyValue("rotate")).toBe("55deg");
  });

  it("drafts only the part of the angle the CSS rotate owns, leaving transform and scale theirs", () => {
    const cases: Array<[string, number, number]> = [
      ["transform: rotate(30deg);", 30, 25],
      ["rotate: 20deg; transform: rotate(10deg);", 30, 45],
      ["scale: -1 1;", 180, 25],
      ["transform: scaleX(-1);", 180, 25],
    ];
    for (const [css, base, drafted] of cases) {
      const window = new Window();
      window.document.head.innerHTML = `<style>#title { ${css} }</style>`;
      const element = window.document.createElement("h1");
      element.id = "title";
      window.document.body.append(element);
      expect({ css, base: readRotationBase(element, true) }).toEqual({
        css,
        base: expect.closeTo(base),
      });
      applyRotationDraft(element, base + 25, readCssRotationTarget(element));
      const rotate = Number.parseFloat(element.style.getPropertyValue("rotate"));
      expect({ css, rotate }).toEqual({ css, rotate: expect.closeTo(drafted) });
    }
  });

  it("never asks GSAP, nor restyles per frame, when GSAP turns nothing on the element", () => {
    const window = new Window();
    const gsap = { set: vi.fn(), getProperty: vi.fn(() => 0) };
    Object.assign(window, { gsap });
    window.document.head.innerHTML = "<style>#title { rotate: 30deg; }</style>";
    const element = window.document.createElement("h1");
    element.id = "title";
    window.document.body.append(element);
    expect(readRotationBase(element, true)).toBeCloseTo(30);
    const target = readCssRotationTarget(element);
    const styleReads = vi.spyOn(window, "getComputedStyle");
    applyRotationDraft(element, 55, target);
    expect(styleReads).not.toHaveBeenCalled();
    expect(element.style.getPropertyValue("rotate")).toBe("55deg");
    expect(gsap.set).not.toHaveBeenCalled();
    expect(gsap.getProperty).not.toHaveBeenCalled();
    applyRotationDraft(element, 55, null);
    expect(element.style.getPropertyValue("rotate")).toBe("none");
    expect(gsap.set).toHaveBeenCalledWith(element, { rotation: 55 });
  });

  it("turns a transform-centred element inside its transform, after the translate, so it stays put", () => {
    const window = new Window();
    window.document.head.innerHTML =
      "<style>#title { rotate: 30deg; transform: translate(-120px, -80px); }</style>";
    const element = window.document.createElement("h1");
    element.id = "title";
    window.document.body.append(element);
    const target = readCssRotationTarget(element);
    expect(target).toEqual({
      property: "transform",
      before: "translate(-120px, -80px)",
      after: "",
      share: expect.closeTo(30),
      sign: 1,
      inline: false,
    });
    applyRotationDraft(element, 55, target);
    expect(element.style.getPropertyValue("transform")).toBe(
      "translate(-120px, -80px) rotate(25deg)",
    );
    expect(element.style.getPropertyValue("rotate")).toBe("");
    // The next rotate replaces its own turn instead of stacking a second one.
    applyRotationDraft(element, 70, readCssRotationTarget(element));
    expect(element.style.getPropertyValue("transform")).toBe(
      "translate(-120px, -80px) rotate(40deg)",
    );
  });

  // Each case turns 25 deg with the cursor: the fold GSAP and the outline read goes up by 25, unsheared.
  it.each([
    ["a mirrored transform", "transform: translate(-120px, -80px) scaleX(-1);", 180],
    ["a stretched transform", "transform: translate(-120px, -80px) scale(2, 1);", 0],
    ["a mirroring scale property", "scale: -1 1; transform: translate(-120px, -80px);", 180],
  ])("turns %s centred element with the cursor, in place", (_, css, base) => {
    const window = new Window();
    window.document.head.innerHTML = `<style>#title { ${css} }</style>`;
    const element = window.document.createElement("h1");
    element.id = "title";
    window.document.body.append(element);
    const turned = (angle: number) => (((angle % 360) + 360) % 360) % 360;
    expect(turned(readRotationBase(element, true))).toBeCloseTo(base);
    applyRotationDraft(element, base + 25, readCssRotationTarget(element));
    const transform = element.style.getPropertyValue("transform");
    expect(transform.startsWith("translate(-120px, -80px) rotate(")).toBe(true);
    expect(turned(readRotationBase(element, true))).toBeCloseTo(base + 25);
    const m = new window.DOMMatrix(window.getComputedStyle(element).transform);
    expect(m.a * m.c + m.b * m.d).toBeCloseTo(0);
    expect([m.e, m.f]).toEqual([-120, -80]);
  });
});
