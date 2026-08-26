import { describe, expect, it } from "vitest";

import {
  ELECTRON_DISTRIBUTION_PROJECTION_SCHEMA_VERSION,
  type ElectronDistributionProjectionRequest,
} from "@/distribution/projection/index.js";

describe("Electron distribution projection contract", () => {
  it("keeps verified source bytes distinct from release build information", () => {
    const request = {
      schemaVersion: ELECTRON_DISTRIBUTION_PROJECTION_SCHEMA_VERSION,
      operation: "electron.distribution.project",
      sourceArtifacts: [{
        kind: "dmg",
        path: "/immutable/example.dmg",
        digest: `sha256:${"a".repeat(64)}`,
        size: 1024,
        verificationReceiptDigest: `sha256:${"b".repeat(64)}`,
      }],
      build: {
        releaseVersion: "1.2.3",
        channel: "stable",
        sourceCommit: "0123456789abcdef",
        buildId: "release-42",
        publishedAt: "2026-08-26T00:00:00.000Z",
        artifactBaseUrl: "https://downloads.example.test/stable/1.2.3",
      },
      outputRoot: "/projection",
    } satisfies ElectronDistributionProjectionRequest;

    expect(request.operation).toBe("electron.distribution.project");
    expect(request.sourceArtifacts[0]?.digest).not.toBe(request.sourceArtifacts[0]?.verificationReceiptDigest);
    expect(request.build.releaseVersion).toBe("1.2.3");
  });
});
