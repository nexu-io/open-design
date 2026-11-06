import { afterEach, describe, expect, it, vi } from "vitest";

const CHROME_147_FILL_STYLE: Record<string, string> = {
  transparent: "rgba(0, 0, 0, 0)",
  white: "#ffffff",
  red: "#ff0000",
  currentcolor: "#000000",
  "hsl(210 40% 50%)": "#4d80b3",
  "rgb(100%, 0%, 0%)": "#ff0000",
  "hsl(0 100% 50% / 0.001)": "rgba(255, 0, 0, 0)",
  "oklch(0.7 0.15 200)": "oklch(0.7 0.15 200)",
  "oklch(0.7 0.15 200 / 0.25)": "oklch(0.7 0.15 200 / 0.25)",
  "color-mix(in oklab, oklch(0.7 0.15 200), red 50%)": "oklab(0.663983 0.0419629 0.0372782)",
  "color-mix(in srgb, #ff000000, #0000ffff 50%)": "color(srgb 0 0 1 / 0.5)",
};

const CHROME_147_RELATIVE_SRGB: Record<string, string> = {
  currentcolor: "color(srgb 0 0 0)",
  "hsl(0 100% 50% / 0.001)": "color(srgb 1 0 0 / 0.001)",
  "oklch(0.7 0.15 200)": "color(srgb -0.316663 0.724435 0.764448)",
  "oklch(0.7 0.15 200 / 0.25)": "color(srgb -0.316663 0.724435 0.764448 / 0.25)",
  "color-mix(in oklab, oklch(0.7 0.15 200), red 50%)": "color(srgb 0.698277 0.535308 0.473819)",
  "color-mix(in srgb, #ff000000, #0000ffff 50%)": "color(srgb 0 0 1 / 0.5)",
  "color-mix(in srgb, hwb(0 0% 0%), hwb(240 0% 0%) 50%)": "color(srgb 0.5 0 0.5)",
  "color-mix(in oklab, red, blue 50%)": "color(srgb 0.550402 0.325634 0.636508)",
  "color-mix(in srgb, red, blue 50%)": "color(srgb 0.5 0 0.5)",
  "light-dark(white, red)": "color(srgb 1 1 1)",
};

async function loadColorModulesWithChromeCanvas() {
  let fillStyle = "#000000";
  const context = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(next: string) {
      const relative = /^color\(from (.+) srgb r g b \/ alpha\)$/.exec(next);
      fillStyle =
        (relative ? CHROME_147_RELATIVE_SRGB[relative[1]] : CHROME_147_FILL_STYLE[next]) ??
        fillStyle;
    },
  };
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
  vi.resetModules();
  return { ...(await import("./colorValue")), ...(await import("./gradientValue")) };
}

describe("parseCssColor with a browser canvas", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([
    ["red", { red: 255, green: 0, blue: 0, alpha: 1 }],
    ["hsl(210 40% 50%)", { red: 77, green: 128, blue: 179, alpha: 1 }],
    ["rgb(100%, 0%, 0%)", { red: 255, green: 0, blue: 0, alpha: 1 }],
    ["oklch(0.7 0.15 200)", { red: 0, green: 185, blue: 195, alpha: 1 }],
    ["oklch(0.7 0.15 200 / 0.25)", { red: 0, green: 185, blue: 195, alpha: 0.25 }],
    ["hsl(0 100% 50% / 0.001)", { red: 255, green: 0, blue: 0, alpha: 0.001 }],
    ["inherit", null],
    ["currentcolor", null],
    ["light-dark(white, red)", null],
  ])("resolves %s through the canvas, or null if it must not", async (input, expected) => {
    const { parseCssColor: parseFresh } = await loadColorModulesWithChromeCanvas();
    expect(parseFresh(input)).toEqual(expected);
  });
});

describe("insertGradientStop with a browser canvas", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([
    ["oklch(0.7 0.15 200)", "red", "#B28979"],
    ["#ff000000", "#0000ffff", "rgba(0, 0, 255, 0.5)"],
  ])("gives %s to %s the midpoint the browser paints", async (left, right, expected) => {
    const { parseGradient: parse, insertGradientStop: insert } =
      await loadColorModulesWithChromeCanvas();
    const model = parse(`linear-gradient(90deg, ${left} 0%, ${right} 100%)`);
    expect(model).not.toBeNull();
    expect(insert(model!, 50).stops[1].color).toBe(expected);
  });

  it.each([
    ["hwb stops mix in sRGB like rgb()", "hwb(0 0% 0%) 0%, hwb(240 0% 0%) 100%", 50, "#800080"],
    [
      "one modern stop moves every interval to Oklab",
      "red 0%, blue 50%, oklch(0.7 0.15 200) 100%",
      25,
      "#8C53A2",
    ],
    [
      "an unresolved var() stop leaves a legacy interval in sRGB",
      "red 0%, blue 50%, var(--third, red) 100%",
      25,
      "#800080",
    ],
    [
      "a modern stop with a var() inside still moves every interval to Oklab",
      "red 0%, blue 50%, oklch(var(--l, 0.7) 0.1 200) 100%",
      25,
      "#8C53A2",
    ],
  ])("%s", async (_case, stops, position, expected) => {
    const { parseGradient: parse, insertGradientStop: insert } =
      await loadColorModulesWithChromeCanvas();
    const model = parse(`linear-gradient(90deg, ${stops})`);
    expect(model).not.toBeNull();
    const inserted = insert(model!, position).stops.find((stop) => stop.position === position);
    expect(inserted?.color).toBe(expected);
  });
});
