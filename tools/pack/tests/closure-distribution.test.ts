import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  type ClosureDigest,
  type ClosureDistributionManifest,
  type ClosureDistributionManifestDraft,
} from "@open-design/closure-proto";
import { describe, expect, it } from "vitest";

import { sealClosureDistributionManifest } from "../src/closure-distribution.js";

const fixturePath = fileURLToPath(
  new URL("../../../packages/closure-proto/fixtures/distribution-v2.json", import.meta.url),
);

describe("tools-pack layered Closure producer", () => {
  it("reproduces the protocol fixture from unordered build inputs", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as ClosureDistributionManifest;
    const draft: ClosureDistributionManifestDraft = {
      blobs: Object.fromEntries(Object.entries(fixture.blobs).reverse()),
      compatibility: fixture.compatibility,
      identity: {
        channel: fixture.identity.channel,
        protocolVersion: CLOSURE_PROTOCOL_VERSION,
        version: fixture.identity.version,
      },
      required: {
        ...fixture.required,
        targets: Object.fromEntries(Object.entries(fixture.required.targets).reverse()),
      },
      resources: [...fixture.resources].reverse(),
      schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
    };

    expect(sealClosureDistributionManifest(draft)).toEqual(fixture);
  });

  it("changes release identity without changing a reused resource blob", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as ClosureDistributionManifest;
    const next = sealClosureDistributionManifest({
      ...fixture,
      identity: {
        channel: fixture.identity.channel,
        protocolVersion: fixture.identity.protocolVersion,
        version: "0.19.1-beta.1",
      },
    });

    expect(next.identity.digest).not.toBe(fixture.identity.digest);
    expect(next.resources[0]?.blob).toBe(fixture.resources[0]?.blob as ClosureDigest);
  });
});
