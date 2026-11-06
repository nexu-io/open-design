import { describe, expect, it } from "vitest";
import { resolveOptimisticAttributeValue } from "./useDomEditAttributeCommits";

describe("resolveOptimisticAttributeValue", () => {
  it("removes an HTML boolean attribute when the value is the literal string false", () => {
    expect(resolveOptimisticAttributeValue("loop", "false")).toBeNull();
    expect(resolveOptimisticAttributeValue("muted", "false")).toBeNull();
  });

  it("keeps the literal string false for a non-boolean attribute, matching what persist() writes", () => {
    expect(resolveOptimisticAttributeValue("data-example", "false")).toBe("false");
  });

  it("always removes on null regardless of attribute", () => {
    expect(resolveOptimisticAttributeValue("loop", null)).toBeNull();
    expect(resolveOptimisticAttributeValue("data-example", null)).toBeNull();
  });

  it("passes any other value through unchanged", () => {
    expect(resolveOptimisticAttributeValue("data-example", "true")).toBe("true");
    expect(resolveOptimisticAttributeValue("loop", "true")).toBe("true");
  });
});
