// @vitest-environment jsdom
// Happy DOM 21 drops -webkit-text-fill-color; jsdom preserves this browser CSS property.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyInlineStyle } from "./inlineTextStyleRange";
import { mount, rangeOver } from "./inlineTextStyleTestHelpers";
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

/**
 * A colour that does not paint is the same to the user as one that did not save.
 *
 * `-webkit-text-fill-color` inherits and paints the glyph fill, so a composition
 * that sets it on a text element wins over any `color` the editor puts on a run
 * inside it. The run saved correctly and rendered in someone else's colour,
 * which reads as the colour picker being broken.
 */
describe("applyInlineStyle when something else is painting the glyphs", () => {
  function stubFill(fill: string | null | ((element: HTMLElement) => string | null)) {
    const view = document.defaultView!;
    const real = view.getComputedStyle.bind(view);
    vi.spyOn(view, "getComputedStyle").mockImplementation(((element: Element) => {
      const computed = real(element as HTMLElement);
      const resolvedFill = typeof fill === "function" ? fill(element as HTMLElement) : fill;
      return new Proxy(computed, {
        get: (target, key) => {
          if (key === "webkitTextFillColor") return resolvedFill ?? undefined;
          if (key === "color") return (element as HTMLElement).style.color || "rgb(0, 0, 0)";
          return Reflect.get(target, key);
        },
      });
    }) as typeof window.getComputedStyle);
  }

  it("mirrors the colour into the fill when an ancestor is overpainting", () => {
    const host = mount("Hello world");
    stubFill("rgb(255, 255, 255)");
    applyInlineStyle(rangeOver(host, 6, 11), { color: "rgb(255, 0, 149)" });

    expect(host.innerHTML).toContain("-webkit-text-fill-color: rgb(255, 0, 149)");
    expect(host.innerHTML).toContain("color: rgb(255, 0, 149)");
  });

  it("leaves the markup alone when nothing is overpainting", () => {
    const host = mount("Hello world");
    stubFill("rgb(255, 0, 149)");
    applyInlineStyle(rangeOver(host, 6, 11), { color: "rgb(255, 0, 149)" });

    expect(host.innerHTML).not.toContain("-webkit-text-fill-color");
    expect(host.innerHTML).toContain("color: rgb(255, 0, 149)");
  });

  it("says nothing about a run that carries no colour", () => {
    const host = mount("Hello world");
    stubFill("rgb(255, 255, 255)");
    applyInlineStyle(rangeOver(host, 6, 11), { "font-weight": "700" });

    expect(host.innerHTML).not.toContain("-webkit-text-fill-color");
  });

  it("mirrors only the run whose own ancestor path is overpainting", () => {
    const host = mount(
      '<span data-hf-text-key="child:0" style="color: blue">left</span>' +
        '<span data-hf-text-key="child:1" style="color: green">right</span>',
    );
    stubFill((element) =>
      element.textContent === "left" ? "rgb(255, 255, 255)" : element.style.color,
    );

    applyInlineStyle(rangeOver(host, 4, 9), { color: "red" });

    const [left, right] = Array.from(host.querySelectorAll<HTMLElement>("span"));
    expect(left?.style.getPropertyValue("-webkit-text-fill-color")).toBe("blue");
    expect(right?.style.getPropertyValue("-webkit-text-fill-color")).toBe("");
  });

  it("drops a generated mirror when the ancestor stops overpainting", () => {
    const host = mount("Hello world");
    let overpainted = true;
    stubFill((element) => (overpainted ? "rgb(255, 255, 255)" : element.style.color));
    applyInlineStyle(rangeOver(host, 6, 11), { color: "red" });
    expect(host.innerHTML).toContain("-webkit-text-fill-color");

    overpainted = false;
    const live = document.getSelection()?.getRangeAt(0);
    if (live) applyInlineStyle(live, { "font-weight": "700" });

    expect(host.innerHTML).not.toContain("-webkit-text-fill-color");
  });
});
