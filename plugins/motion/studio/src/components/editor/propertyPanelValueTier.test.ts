import { describe, expect, it } from "vitest";
import {
  resolveValueTier,
  VALUE_TIER_LABEL_CLASS,
  VALUE_TIER_VALUE_CLASS,
} from "./propertyPanelValueTier";

describe("resolveValueTier", () => {
  it("is 'default' when there is no explicit declaration", () => {
    expect(resolveValueTier(undefined, "400")).toBe("default");
    expect(resolveValueTier("", "400")).toBe("default");
  });

  it("is 'explicitDefault' when the explicit value equals the default", () => {
    expect(resolveValueTier("400", "400")).toBe("explicitDefault");
    expect(resolveValueTier(" normal ", "normal")).toBe("explicitDefault");
  });

  it("is 'explicitCustom' when the explicit value differs from the default", () => {
    expect(resolveValueTier("3.96px", "0px")).toBe("explicitCustom");
  });
});

describe("value tier class maps", () => {
  it("covers all three tiers for both label and value", () => {
    for (const tier of ["default", "explicitDefault", "explicitCustom"] as const) {
      expect(VALUE_TIER_LABEL_CLASS[tier]).toBeTruthy();
      expect(VALUE_TIER_VALUE_CLASS[tier]).toBeTruthy();
    }
    expect(VALUE_TIER_VALUE_CLASS.explicitCustom).toBe("text-accent-ink");
  });
});
