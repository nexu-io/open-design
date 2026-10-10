import { describe, expect, it } from "vitest";
import { createExistingSourceIdentity } from "@/workspace/source.js";
describe("existing source identity", () => {
  it("carries both the verified producer identity and legacy source determinants", () => {
    const key = createExistingSourceIdentity("a".repeat(64), "legacy-source-inputs");
    expect(createExistingSourceIdentity("b".repeat(64), "legacy-source-inputs")).not.toBe(key);
    expect(createExistingSourceIdentity("a".repeat(64), "changed-legacy-inputs")).not.toBe(key);
    expect(key).not.toBe("legacy-source-inputs");
    expect(createExistingSourceIdentity("a".repeat(64), "legacy-source-inputs")).toBe(key);
  });
  it.each(["", "run-123", "https://products.example/bundle", "g".repeat(64)])("refuses a non-source identity %s", (value) => {
    expect(() => createExistingSourceIdentity(value,"legacy")).toThrow("SHA-256 source identity");
  });
});
