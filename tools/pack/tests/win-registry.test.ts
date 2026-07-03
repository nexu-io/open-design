import { describe, expect, it } from "vitest";

import { stripRegistryQuotedValue } from "../src/win/registry.js";

describe("stripRegistryQuotedValue", () => {
  it("returns the quoted body when the value is fully quoted", () => {
    expect(stripRegistryQuotedValue('"C:\\Program Files\\Open Design\\Uninstall.exe"')).toBe(
      "C:\\Program Files\\Open Design\\Uninstall.exe",
    );
  });

  it("returns the inner segment when the quoted region carries trailing flags", () => {
    expect(stripRegistryQuotedValue('"C:\\Program Files\\Open Design\\Uninstall.exe" /S')).toBe(
      "C:\\Program Files\\Open Design\\Uninstall.exe",
    );
  });

  it("trims unquoted values and leaves them otherwise unchanged", () => {
    expect(stripRegistryQuotedValue("  C:\\Open Design\\Uninstall.exe  ")).toBe(
      "C:\\Open Design\\Uninstall.exe",
    );
  });

  it("returns an empty string for null or undefined input", () => {
    expect(stripRegistryQuotedValue(null)).toBe("");
    expect(stripRegistryQuotedValue(undefined)).toBe("");
  });

  it("returns the trimmed value when only a leading quote is present", () => {
    expect(stripRegistryQuotedValue('"unterminated')).toBe('"unterminated');
  });
});
