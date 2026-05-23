import { describe, expect, it } from "vitest";

import { releaseAppVersionArgs } from "@/vitest/packaged-release-version";

describe("packaged release version tools-pack args", () => {
  it("passes nightly release versions through to smoke lifecycle actions", () => {
    expect(releaseAppVersionArgs("0.8.0.nightly.3")).toEqual(["--app-version", "0.8.0.nightly.3"]);
  });

  it("omits empty release versions for local smoke defaults", () => {
    expect(releaseAppVersionArgs(undefined)).toEqual([]);
    expect(releaseAppVersionArgs("   ")).toEqual([]);
  });
});
