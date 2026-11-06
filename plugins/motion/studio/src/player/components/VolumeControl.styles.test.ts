import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studioCss = readFileSync(new URL("../../styles/components.css", import.meta.url), "utf8");

describe("preview volume range styles", () => {
  it("uses the same compact thumb in Chromium and Firefox", () => {
    const selectors = [
      ".hf-preview-volume-range::-webkit-slider-thumb",
      ".hf-preview-volume-range::-moz-range-thumb",
    ];

    for (const selector of selectors) {
      const start = studioCss.indexOf(`${selector} {`);
      const rule = studioCss.slice(start, studioCss.indexOf("}", start));

      expect(start).toBeGreaterThanOrEqual(0);
      expect(rule).toContain("width: 0.5rem");
      expect(rule).toContain("height: 0.5rem");
    }
  });
});
