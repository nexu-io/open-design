import { describe, expect, it } from "vitest";

import { resolvePackagedWindowTitle } from "../src/window-title.js";

describe("resolvePackagedWindowTitle", () => {
  it("always returns the xDesign fork window title", () => {
    // xDesign ships one identity; the upstream channel-derived "Open Design
    // <Channel>" name must never leak into the OS window title.
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0", namespace: "release-stable-win" })).toBe("xDesign");
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0-beta.1", namespace: "release-beta-win" })).toBe("xDesign");
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0-prerelease.1", namespace: "release-prerelease-win" })).toBe("xDesign");
    expect(resolvePackagedWindowTitle({ appVersion: "0.10.0-preview.1", namespace: "release-preview-win" })).toBe("xDesign");
    expect(resolvePackagedWindowTitle({ appVersion: null, namespace: "release-beta-win" })).toBe("xDesign");
    expect(resolvePackagedWindowTitle({ appVersion: null, namespace: "beta-local-flow" })).toBe("xDesign");
  });
});
