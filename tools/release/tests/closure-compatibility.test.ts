import { describe, expect, it } from "vitest";

import { resolveExactClosureMinShellVersion } from "../src/channel/closure-compatibility.js";

describe("exact Closure Shell compatibility epoch", () => {
  it("starts at the candidate when no current shallow control exists", () => {
    expect(resolveExactClosureMinShellVersion({
      channel: "beta",
      latestMetadataJson: JSON.stringify({
        closure: { compatibility: { shell: { electron: { version: { min: "0.19.0-beta.4" } } } } },
      }),
      releaseVersion: "0.19.1-beta.17",
    })).toBe("0.19.1-beta.17");
  });

  it("preserves the first floor throughout the current shallow-control epoch", () => {
    expect(resolveExactClosureMinShellVersion({
      channel: "beta",
      latestMetadataJson: JSON.stringify({
        closureControl: {
          schemaVersion: 1,
          shellCompatibility: { electron: { version: { min: "0.19.1-beta.17" } } },
        },
      }),
      releaseVersion: "0.19.1-beta.23",
    })).toBe("0.19.1-beta.17");
  });

  it("starts a new floor for an unknown shallow-control schema", () => {
    expect(resolveExactClosureMinShellVersion({
      channel: "qa2",
      latestMetadataJson: JSON.stringify({
        closureControl: {
          schemaVersion: 999,
          shellCompatibility: { electron: { version: { min: "0.19.1-qa2.1" } } },
        },
      }),
      releaseVersion: "0.19.1-qa2.4",
    })).toBe("0.19.1-qa2.4");
  });
});
