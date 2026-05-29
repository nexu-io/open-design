import { describe, expect, it } from "vitest";

import { electronBuilderVersionForAppVersion } from "../src/versions.js";

describe("tools-pack version helpers", () => {
  it("keeps runtime app versions intact except when adapting dotted nightly for electron-builder", () => {
    expect(electronBuilderVersionForAppVersion("0.8.0")).toBe("0.8.0");
    expect(electronBuilderVersionForAppVersion("0.8.0-beta.6")).toBe("0.8.0-beta.6");
    expect(electronBuilderVersionForAppVersion("0.8.0-preview.1")).toBe("0.8.0-preview.1");
    expect(electronBuilderVersionForAppVersion("0.8.0.nightly.2")).toBe("0.8.0-nightly.2");
  });
});
