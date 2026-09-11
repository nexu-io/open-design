import { describe, expect, it } from "vitest";

import { resolvePackagedWindowTitle } from "../src/window-title.js";

describe("resolvePackagedWindowTitle", () => {
  it("keeps stable windows on the public display name", () => {
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0", namespace: "release-stable-win" })).toBe("OpenDesign");
  });

  it("uses channel display names for non-stable release versions", () => {
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0-beta.1", namespace: "release-beta-win" })).toBe("OpenDesign Beta");
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0-prerelease.1", namespace: "release-prerelease-win" })).toBe("OpenDesign Prerelease");
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0-preview.1", namespace: "release-preview-win" })).toBe("OpenDesign Preview");
  });

  it("falls back to official release namespaces when app version is unavailable", () => {
    expect(resolvePackagedWindowTitle({ appVersion: null, namespace: "release-beta-win" })).toBe("OpenDesign Beta");
    expect(resolvePackagedWindowTitle({ appVersion: null, namespace: "release-prerelease-win" })).toBe("OpenDesign Prerelease");
    expect(resolvePackagedWindowTitle({ appVersion: null, namespace: "release-preview-win" })).toBe("OpenDesign Preview");
  });

  it("keeps ad hoc namespaces on the default window title", () => {
    expect(resolvePackagedWindowTitle({ appVersion: null, namespace: "beta-local-flow" })).toBe("OpenDesign");
  });
});
