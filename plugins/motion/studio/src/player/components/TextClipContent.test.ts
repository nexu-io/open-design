import { describe, expect, it } from "vitest";
import { textClipBackground } from "./TextClipContent";

describe("textClipBackground", () => {
  it("puts dark text on a light strip and light text on a dark one", () => {
    expect(textClipBackground({ value: "a", color: "rgb(16, 20, 24)" })).toBe(
      "var(--timeline-text-clip-light-bg)",
    );
    expect(textClipBackground({ value: "a", color: "rgb(255, 255, 255)" })).toBe(
      "var(--timeline-text-clip-dark-bg)",
    );
  });

  it("uses the layer's own background when it paints one", () => {
    expect(
      textClipBackground({ value: "a", color: "rgb(16, 20, 24)", background: "rgb(230, 57, 70)" }),
    ).toBe("rgb(230, 57, 70)");
  });
});
