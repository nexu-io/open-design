import { describe, expect, it } from "vitest";
import { shouldOpenInspector } from "./StudioHeader";

describe("shouldOpenInspector", () => {
  it("opens when the panel is hidden", () => {
    expect(shouldOpenInspector(true, false)).toBe(true);
  });

  it("opens when a non-inspector tab is showing", () => {
    expect(shouldOpenInspector(false, false)).toBe(true);
  });

  it("closes when the inspector is genuinely on screen", () => {
    expect(shouldOpenInspector(false, true)).toBe(false);
  });
});
