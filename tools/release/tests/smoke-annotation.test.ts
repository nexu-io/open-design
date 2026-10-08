import { describe, expect, it } from "vitest";

import { announceSwallowedSmoke, smokeFailed } from "../src/report/smoke-annotation.js";

const base = {
  exempt: true,
  outcome: "failure",
  reportPath: "/tmp/release-report/mac_arm64",
  suiteStatus: "failed",
  target: "mac_arm64",
  title: "mac_arm64 beta build",
  version: "0.21.6-beta.7",
};

describe("swallowed smoke detection", () => {
  it("treats a failed step outcome or a failed suite result as a failure", () => {
    expect(smokeFailed("failure", "unknown")).toBe(true);
    expect(smokeFailed("", "failed")).toBe(true);
    expect(smokeFailed("success", "success")).toBe(false);
    expect(smokeFailed("skipped", "unknown")).toBe(false);
    expect(smokeFailed("", "")).toBe(false);
  });
});

describe("swallowed smoke announcement", () => {
  it("stays silent when the smoke passed or never ran", () => {
    expect(announceSwallowedSmoke({ ...base, outcome: "success", suiteStatus: "success" }))
      .toEqual({ annotation: null, banner: [], failed: false });
    expect(announceSwallowedSmoke({ ...base, outcome: "skipped", suiteStatus: "unknown" }))
      .toEqual({ annotation: null, banner: [], failed: false });
  });

  it("emits a run annotation and a leading banner when the failure was exempted", () => {
    const announcement = announceSwallowedSmoke(base);

    expect(announcement.failed).toBe(true);
    expect(announcement.annotation).toContain("::error title=mac_arm64 packaged smoke failed::");
    expect(announcement.annotation).toContain("continue-on-error kept the job green");
    expect(announcement.banner[0]).toBe("> [!CAUTION]");
    expect(announcement.banner.join("\n")).toContain("packaged smoke FAILED");
    expect(announcement.banner.join("\n")).toContain("0.21.6-beta.7");
    // The exemption is the whole reason this signal exists: a reader who sees a
    // green job must be told, in the summary itself, that green is not a pass.
    expect(announcement.banner.join("\n")).toContain("a green check on this job is not a pass");
    expect(announcement.banner.join("\n")).toContain("/tmp/release-report/mac_arm64");
  });

  it("does not claim the job stayed green when the smoke was a blocking gate", () => {
    const announcement = announceSwallowedSmoke({ ...base, exempt: false });

    expect(announcement.failed).toBe(true);
    expect(announcement.banner.join("\n")).toContain("blocking gate");
    expect(announcement.banner.join("\n")).not.toContain("continue-on-error");
    expect(announcement.annotation).not.toContain("continue-on-error");
  });

  it("escapes workflow-command delimiters so the annotation cannot be truncated", () => {
    const announcement = announceSwallowedSmoke({
      ...base,
      target: "mac:arm64,x64",
      version: "1.0.0\nsecond line",
    });

    expect(announcement.annotation).toContain("title=mac%3Aarm64%2Cx64 packaged smoke failed::");
    expect(announcement.annotation).toContain("1.0.0%0Asecond line");
    expect(announcement.annotation).not.toContain("\n");
  });

  it("falls back to the target when no report title is configured", () => {
    const announcement = announceSwallowedSmoke({ ...base, reportPath: "", title: "  " });

    expect(announcement.banner.join("\n")).toContain("mac_arm64 packaged smoke");
    expect(announcement.banner.join("\n")).not.toContain("Evidence:");
  });
});
