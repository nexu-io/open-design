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

  it("binds a first install from an immutable exact metadata endpoint", () => {
    expect(selectPackagedStandaloneReleaseVersion(null, {
      activationAuthorized: false,
      active: null,
      lastSuccessful: null,
      prepared: null,
    }, "https://releases.example/beta/versions/0.19.4-beta.2/metadata.json"))
      .toBe("0.19.4-beta.2");
  });

  it("never derives first-install authority from mutable latest metadata", () => {
    expect(() => selectPackagedStandaloneReleaseVersion(null, {
      activationAuthorized: false,
      active: null,
      lastSuccessful: null,
      prepared: null,
    }, "https://releases.example/beta/latest/metadata.json"))
      .toThrow("requires an immutable");
  });
});
