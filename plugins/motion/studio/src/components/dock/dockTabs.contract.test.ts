import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dockCss = readFileSync(path.join(import.meta.dirname, "dock.css"), "utf8").replace(
  /@import[^;]*;/,
  "",
);

/** Each top-level rule's selector and body, with the reduced-motion block kept whole. */
function rules(css: string): { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = [];
  let depth = 0;
  let start = 0;
  let selector = "";
  for (let index = 0; index < css.length; index++) {
    if (css[index] === "{") {
      if (depth === 0) {
        selector = css
          .slice(start, index)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .trim();
        start = index + 1;
      }
      depth++;
    } else if (css[index] === "}") {
      depth--;
      if (depth === 0) {
        found.push({ selector, body: css.slice(start, index) });
        start = index + 1;
      }
    }
  }
  return found;
}

const bodyOf = (selector: string) =>
  rules(dockCss).find((rule) => rule.selector === selector)?.body;

describe("dock panel strip contract", () => {
  it("draws one border per surface: the card's, and no divider, separator or tab outline", () => {
    const bordered = rules(dockCss)
      .filter((rule) => /(^|[\s;{])border(-(top|right|bottom|left))?\s*:/.test(rule.body))
      .map((rule) => rule.selector);
    expect(bordered).toEqual([".hf-dock .dv-groupview"]);
    const dock = bodyOf(".hf-dock");
    expect(dock).toContain("--dv-tab-divider-color: transparent");
    expect(dock).toContain("--dv-separator-border: transparent");
  });

  it("slides only transform and width, 140ms ease-out, and reveals the icon in 80ms", () => {
    expect(bodyOf(".hf-dock-tab-fill[data-ready]")?.replace(/\s+/g, " ").trim()).toBe(
      "transition: transform 140ms ease-out, width 140ms ease-out;",
    );
    expect(bodyOf(".hf-dock-tab-icon")).toContain("animation: hf-dock-tab-icon-in 80ms ease-out");
    const animated = rules(dockCss).filter(
      (rule) => !rule.selector.startsWith("@") && /transition|animation/.test(rule.body),
    );
    expect(animated.map((rule) => rule.selector)).toEqual([
      ".hf-dock-tab-fill[data-ready]",
      ".hf-dock-tab-icon",
    ]);
  });

  it("turns the slide and the icon reveal off under reduced motion", () => {
    const reduced = bodyOf("@media (prefers-reduced-motion: reduce)")?.replace(/\s+/g, " ");
    expect(reduced).toContain(".hf-dock-tab-fill[data-ready] { transition: none; }");
    expect(reduced).toContain(".hf-dock-tab-icon { animation: none; }");
  });

  it("centres the tab's icon and label in the tab's full height", () => {
    const tab = bodyOf(".hf-dock-tab");
    expect(tab).toContain("height: 100%");
    expect(tab).toContain("align-items: center");
  });

  it("takes every colour from a token", () => {
    expect(dockCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});
