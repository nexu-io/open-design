import { describe, expect, it } from "vitest";
import {
  formatCssColor,
  hsvToRgb,
  mergeColorWithExistingAlpha,
  parseCssColor,
  rgbToHsv,
  toColorPickerValue,
  toHexColor,
} from "./colorValue";

describe("parseCssColor", () => {
  it("parses rgb values", () => {
    expect(parseCssColor("rgb(12, 34, 56)")).toEqual({
      red: 12,
      green: 34,
      blue: 56,
      alpha: 1,
    });
  });

  it("parses rgba values", () => {
    expect(parseCssColor("rgba(15, 23, 42, 0.64)")).toEqual({
      red: 15,
      green: 23,
      blue: 42,
      alpha: 0.64,
    });
  });

  it.each([
    ["#0f172acc", { red: 15, green: 23, blue: 42, alpha: 0.8 }],
    ["#f008", { red: 255, green: 0, blue: 0, alpha: 136 / 255 }],
    ["rgb(255 0 0 / 50%)", { red: 255, green: 0, blue: 0, alpha: 0.5 }],
    ["rgb(100% 0% 0% / 0.001)", { red: 255, green: 0, blue: 0, alpha: 0.001 }],
  ])("parses %s without a browser", (input, expected) => {
    expect(parseCssColor(input)).toEqual(expected);
  });

  it.each(["", "#12", "notacolor", "currentcolor", "none", "rgb(1..2, 3, 4)", "rgb(1. 2 3)"])(
    "rejects %s without a browser",
    (input) => {
      expect(parseCssColor(input)).toBeNull();
    },
  );

  it("parses transparent", () => {
    expect(parseCssColor("transparent")).toEqual({
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0,
    });
  });
});

describe("toColorPickerValue", () => {
  it("converts css color to hex", () => {
    expect(toColorPickerValue("rgba(15, 23, 42, 0.64)")).toBe("#0f172a");
  });
});

describe("toHexColor", () => {
  it("formats rgb channels as hex", () => {
    expect(toHexColor({ red: 15, green: 23, blue: 42 })).toBe("#0f172a");
  });
});

describe("formatCssColor", () => {
  it("formats opaque colors as rgb", () => {
    expect(formatCssColor({ red: 18, green: 52, blue: 86, alpha: 1 })).toBe("rgb(18, 52, 86)");
  });

  it("formats translucent colors as rgba", () => {
    expect(formatCssColor({ red: 18, green: 52, blue: 86, alpha: 0.64 })).toBe(
      "rgba(18, 52, 86, 0.64)",
    );
  });
});

describe("rgb hsv conversion", () => {
  it("round-trips primary color values", () => {
    const hsv = rgbToHsv({ red: 47, green: 198, blue: 127 });
    expect(hsvToRgb(hsv)).toEqual({ red: 47, green: 198, blue: 127 });
  });
});

describe("mergeColorWithExistingAlpha", () => {
  it("preserves alpha when the previous color was translucent", () => {
    expect(mergeColorWithExistingAlpha("#123456", "rgba(15, 23, 42, 0.64)")).toBe(
      "rgba(18, 52, 86, 0.64)",
    );
  });

  it("returns rgb when the previous color was opaque", () => {
    expect(mergeColorWithExistingAlpha("#123456", "rgb(15, 23, 42)")).toBe("rgb(18, 52, 86)");
  });
});
