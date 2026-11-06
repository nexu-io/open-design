/** Guards the split between Studio's app sheet and the component rules an embedder imports. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { loadStylesheet, STYLES_DIR } from "./styleSources";

/** Class names in a stylesheet's selectors, at any nesting depth (inside @layer or @media too). */
function selectorClasses(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@(?:import|source)[^;]*;/g, "");
  return [...source.matchAll(/([^{};]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((prelude) => !prelude.startsWith("@"))
    .flatMap((selector) => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

describe("studio component styles", () => {
  it("keeps class rules out of the app sheet, where an embedder never sees them", () => {
    const appSheet = readFileSync(path.join(STYLES_DIR, "studio.css"), "utf8");

    expect(selectorClasses(appSheet), "move these rules to components.css").toEqual([]);
    expect(
      selectorClasses(readFileSync(path.join(STYLES_DIR, "components.css"), "utf8")),
    ).toContain("timeline-clip__label");
  });

  it("gives an embedder the timeline rules from theme.css and components.css alone", async () => {
    const entry = '@import "tailwindcss";\n@import "./theme.css";\n@import "./components.css";';
    const css = (await compile(entry, { base: STYLES_DIR, loadStylesheet })).build([]);

    expect(css).toMatch(/^\s*\.timeline-clip__label \{/m);
    expect(css).not.toContain("#root");
  });
});
