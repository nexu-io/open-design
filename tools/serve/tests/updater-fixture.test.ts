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
        platforms?: {
          mac?: { artifacts?: { dmg?: { sha256Url?: string; url?: string } } };
          win?: { artifacts?: { installer?: { sha256Url?: string; url?: string } } };
        };
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

  it("serves Windows installer metadata for the updater flow", async () => {
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture installer",
      channel: "beta",
      platform: "win",
      version: "2.0.0-beta-nightly.1",
    });
    try {
      const metadataResponse = await fetch(server.info.metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      const metadata = await metadataResponse.json() as {
        platforms?: { win?: { arch?: string; artifacts?: { installer?: { sha256Url?: string; url?: string } } } };
      };
      expect(server.info.platform).toBe("win");
      expect(metadata.platforms?.win?.arch).toBe("x64");
      expect(metadata.platforms?.win?.artifacts?.installer?.url).toBe(server.info.artifactUrl);
      expect(metadata.platforms?.win?.artifacts?.installer?.sha256Url).toBe(server.info.checksumUrl);

      const artifact = await fetch(server.info.artifactUrl);
      expect(await artifact.text()).toBe("fixture installer");

      const checksum = await fetch(server.info.checksumUrl);
      expect(await checksum.text()).toContain(server.info.sha256);
    } finally {
      await server.close();
    }
  });

  it("serves artifact byte ranges for resumable download validation", async () => {
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture artifact",
      channel: "beta",
      version: "2.0.0-beta-nightly.1",
    });
    try {
      const rangedArtifact = await fetch(server.info.artifactUrl, {
        headers: { range: "bytes=8-15" },
      });
      expect(rangedArtifact.status).toBe(206);
      expect(rangedArtifact.headers.get("accept-ranges")).toBe("bytes");
      expect(rangedArtifact.headers.get("content-range")).toBe("bytes 8-15/16");
      expect(await rangedArtifact.text()).toBe("artifact");

      const suffixArtifact = await fetch(server.info.artifactUrl, {
        headers: { range: "bytes=-8" },
      });
      expect(suffixArtifact.status).toBe(206);
      expect(suffixArtifact.headers.get("content-range")).toBe("bytes 8-15/16");
      expect(await suffixArtifact.text()).toBe("artifact");
    } finally {
      await server.close();
    }
  });

  it("rejects unsatisfiable artifact byte ranges", async () => {
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture artifact",
      channel: "beta",
      version: "2.0.0-beta-nightly.1",
    });
    try {
      const artifact = await fetch(server.info.artifactUrl, {
        headers: { range: "bytes=100-120" },
      });
      expect(artifact.status).toBe(416);
      expect(artifact.headers.get("accept-ranges")).toBe("bytes");
      expect(artifact.headers.get("content-range")).toBe("bytes */16");
    } finally {
      await server.close();
    }
  });

  it("serves nightly and preview channel-specific release versions", async () => {
    const nightly = await startUpdaterFixtureServer({
      channel: "nightly",
      version: "2.0.0.nightly.3",
    });
    const preview = await startUpdaterFixtureServer({
      channel: "preview",
      version: "2.0.0-preview.4",
    });
    try {
      const nightlyMetadata = await (await fetch(nightly.info.metadataUrl)).json() as {
        channel?: string;
        nightlyNumber?: number;
        nightlyVersion?: string;
        releaseVersion?: string;
        stableVersion?: string;
      };
      expect(nightlyMetadata.channel).toBe("nightly");
      expect(nightlyMetadata.nightlyNumber).toBe(3);
      expect(nightlyMetadata.nightlyVersion).toBe("2.0.0.nightly.3");
      expect(nightlyMetadata.releaseVersion).toBe("2.0.0.nightly.3");
      expect(nightlyMetadata.stableVersion).toBe("2.0.0");

      const previewMetadata = await (await fetch(preview.info.metadataUrl)).json() as {
        channel?: string;
        previewNumber?: number;
        previewVersion?: string;
        releaseVersion?: string;
      };
      expect(previewMetadata.channel).toBe("preview");
      expect(previewMetadata.previewNumber).toBe(4);
      expect(previewMetadata.previewVersion).toBe("2.0.0-preview.4");
      expect(previewMetadata.releaseVersion).toBe("2.0.0-preview.4");
    } finally {
      await nightly.close();
      await preview.close();
    }
  });
});
