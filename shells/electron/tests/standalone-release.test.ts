import { describe, expect, it } from "vitest";

import { resolvePackagedStandaloneReleaseIntent } from "../src/standalone-release.js";

describe("packaged Standalone release intent", () => {
  it("preserves an explicit immutable launch transaction", () => {
    expect(resolvePackagedStandaloneReleaseIntent({
      configuredVersion: " 0.19.4-beta.3 ",
      metadataUrl: "https://releases.example/beta/latest/metadata.json",
    })).toEqual({ kind: "exact", releaseVersion: "0.19.4-beta.3" });
  });

  it("derives exact acceptance intent from an immutable metadata endpoint", () => {
    expect(resolvePackagedStandaloneReleaseIntent({
      configuredVersion: null,
      metadataUrl: "https://releases.example/beta/versions/0.19.4-beta.2/metadata.json",
    })).toEqual({ kind: "exact", releaseVersion: "0.19.4-beta.2" });
  });

  it("delegates persisted state and mutable first-install discovery to Standalone", () => {
    expect(resolvePackagedStandaloneReleaseIntent({
      configuredVersion: null,
      metadataUrl: "https://releases.example/beta/latest/metadata.json",
    })).toEqual({ kind: "resume-or-bootstrap" });
    expect(resolvePackagedStandaloneReleaseIntent({
      configuredVersion: null,
      metadataUrl: null,
    })).toEqual({ kind: "resume-or-bootstrap" });
  });
});
