import { describe, expect, it } from "vitest";
import { hasRoomForRestingEase } from "./TimelineDiamondConnectors";

describe("hasRoomForRestingEase", () => {
  it("is false just under the threshold", () => {
    expect(hasRoomForRestingEase(23)).toBe(false);
  });

  it("is true exactly at the threshold", () => {
    expect(hasRoomForRestingEase(24)).toBe(true);
  });

  it("is true well above the threshold", () => {
    expect(hasRoomForRestingEase(78)).toBe(true);
  });
});
