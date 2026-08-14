import { describe, expect, it } from "vitest";
import type { ClosureRuntimeBinding } from "@open-design/closure/store";

import { selectPackagedStandaloneReleaseVersion } from "../src/standalone-release.js";

const active = { releaseVersion: "0.19.4-beta.1" } as ClosureRuntimeBinding;
const lastSuccessful = { releaseVersion: "0.19.3-beta.9" } as ClosureRuntimeBinding;
const prepared = { releaseVersion: "0.19.4-beta.2" } as ClosureRuntimeBinding;

describe("packaged Standalone release selection", () => {
  it("prefers the immutable launch transaction", () => {
    expect(selectPackagedStandaloneReleaseVersion("0.19.4-beta.3", {
      activationAuthorized: true,
      active,
      lastSuccessful,
      prepared,
    })).toBe("0.19.4-beta.3");
  });

  it("selects an authorized prepared Closure for restart activation", () => {
    expect(selectPackagedStandaloneReleaseVersion(null, {
      activationAuthorized: true,
      active,
      lastSuccessful,
      prepared,
    })).toBe("0.19.4-beta.2");
  });

  it("restores the active or last successful Closure on an ordinary cold start", () => {
    expect(selectPackagedStandaloneReleaseVersion(null, {
      activationAuthorized: false,
      active,
      lastSuccessful,
      prepared: null,
    })).toBe("0.19.4-beta.1");
    expect(selectPackagedStandaloneReleaseVersion(null, {
      activationAuthorized: false,
      active: null,
      lastSuccessful,
      prepared: null,
    })).toBe("0.19.3-beta.9");
  });
});
