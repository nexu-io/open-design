import { describe, expect, it } from "vitest";

import { startUpdaterFixtureServer } from "../src/updater-fixture.js";

describe("updater fixture server", () => {
  it("serves metadata, artifact bytes, and checksum for the updater flow", async () => {
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture artifact",
      channel: "beta",
      version: "2.0.0-beta-nightly.1",
    });
    try {
      const metadataResponse = await fetch(server.info.metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      const metadata = await metadataResponse.json() as {
        baseVersion?: string;
        betaNumber?: number;
        betaVersion?: string;
        channel?: string;
        platforms?: { mac?: { artifacts?: { dmg?: { sha256Url?: string; url?: string } } } };
        releaseVersion?: string;
      };
      expect(metadata.channel).toBe("beta");
      expect(metadata.baseVersion).toBe("2.0.0");
      expect(metadata.betaNumber).toBe(1);
      expect(metadata.betaVersion).toBe("2.0.0-beta-nightly.1");
      expect(metadata.releaseVersion).toBeUndefined();
      expect(metadata.platforms?.mac?.artifacts?.dmg?.url).toBe(server.info.artifactUrl);
      expect(metadata.platforms?.mac?.artifacts?.dmg?.sha256Url).toBe(server.info.checksumUrl);

      const artifact = await fetch(server.info.artifactUrl);
      expect(await artifact.text()).toBe("fixture artifact");

      const checksum = await fetch(server.info.checksumUrl);
      expect(await checksum.text()).toContain(server.info.sha256);
    } finally {
      await server.close();
    }
  });
});
