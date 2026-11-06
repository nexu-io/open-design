import { describe, expect, it } from "vitest";
import {
  STUDIO_SDK_OPERATION_FAMILIES,
  isSdkFamilyEnabled,
  renderStudioSdkCutoverReport,
  resolveEnabledSdkFamilies,
} from "./sdkCutoverPolicy";

describe("Studio SDK operation-family policy", () => {
  it("enables every family when the master switch is on and no family list is set", () => {
    const all = new Set(STUDIO_SDK_OPERATION_FAMILIES);
    expect(resolveEnabledSdkFamilies({}, true)).toEqual(all);
    expect(resolveEnabledSdkFamilies({ VITE_STUDIO_SDK_CUTOVER_FAMILIES: "" }, true)).toEqual(all);
    expect(resolveEnabledSdkFamilies({ VITE_STUDIO_SDK_CUTOVER_FAMILIES: "  " }, true)).toEqual(
      all,
    );
  });

  it("enables no family when the master switch is off, regardless of the family list", () => {
    expect(resolveEnabledSdkFamilies({}, false).size).toBe(0);
    expect(resolveEnabledSdkFamilies({ VITE_STUDIO_SDK_CUTOVER_FAMILIES: "dom" }, false).size).toBe(
      0,
    );
  });

  it("enables only explicitly selected families", () => {
    const enabled = resolveEnabledSdkFamilies(
      { VITE_STUDIO_SDK_CUTOVER_FAMILIES: "dom, gsap-keyframe" },
      true,
    );
    expect(isSdkFamilyEnabled(true, enabled, "dom")).toBe(true);
    expect(isSdkFamilyEnabled(true, enabled, "gsap-keyframe")).toBe(true);
    expect(isSdkFamilyEnabled(true, enabled, "timing")).toBe(false);
  });

  it("rejects misspelled family configuration", () => {
    expect(() =>
      resolveEnabledSdkFamilies({ VITE_STUDIO_SDK_CUTOVER_FAMILIES: "dom,gsap-twen" }, true),
    ).toThrow("Unknown Studio SDK cutover families: gsap-twen");
  });

  it("reports every family with owner, deadline, evidence, and graduation state", () => {
    const report = renderStudioSdkCutoverReport();
    for (const family of STUDIO_SDK_OPERATION_FAMILIES) expect(report).toContain(`| ${family} |`);
    expect(report).toContain("Graduated");
  });
});
