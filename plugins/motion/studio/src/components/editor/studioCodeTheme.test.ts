import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const source = read("./studioCodeTheme.ts");
const themeCss = read("../../styles/theme.css");

describe("the code editor theme", () => {
  it("takes every colour from a token theme.css declares", () => {
    const used = [...source.matchAll(/var\((--color-[\w-]+)\)/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(20);
    for (const token of new Set(used)) expect(themeCss, token).toContain(`${token}:`);
  });

  it("paints no literal colour of its own", () => {
    expect(source).not.toMatch(
      /#[\da-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|"(white|black|red|orange|yellow|green|blue|purple|pink|gray|grey|silver|lime|cyan|magenta)"/i,
    );
  });
});
