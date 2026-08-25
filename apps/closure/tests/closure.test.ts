import { describe, expect, it } from "vitest";

import { CLOSURE_FIXTURE_COMPONENT, createClosureFixtureContribution } from "../src/index.js";
import closureFixture from "../src/fixture.js";

describe("Closure cold-start fixture", () => {
  it("declares an intentionally Web/daemon-free content slot", () => {
    expect(closureFixture).toEqual({ schemaVersion: 1, capability: "cold-start-lifecycle-fixture", web: false, daemon: false });
    const bytes = Buffer.from("fixture");
    expect(createClosureFixtureContribution({ artifactUrl: "https://example.invalid/fixture.mjs", artifactBytes: bytes })).toMatchObject({
      name: CLOSURE_FIXTURE_COMPONENT,
      mode: "required",
      artifact: { size: bytes.byteLength, entrypoint: "fixture.mjs" },
    });
  });
});
