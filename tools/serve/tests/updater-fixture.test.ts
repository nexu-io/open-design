import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("serves a local artifact file as the updater installer", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-updater-fixture-"));
    const artifactPath = join(root, "Open Design-release-beta-win-setup.exe");
    await writeFile(artifactPath, "real local installer bytes");
    const server = await startUpdaterFixtureServer({
      artifactPath,
      channel: "beta",
      platform: "win",
      version: "2.0.0-beta.2",
    });
    try {
      const metadataResponse = await fetch(server.info.metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      const metadata = await metadataResponse.json() as {
        platforms?: { win?: { artifacts?: { installer?: { name?: string; sha256Url?: string; size?: number; url?: string } } } };
      };
      expect(server.info.artifactPath).toBe(artifactPath);
      expect(metadata.platforms?.win?.artifacts?.installer?.name).toBe("Open Design-release-beta-win-setup.exe");
      expect(metadata.platforms?.win?.artifacts?.installer?.size).toBe(26);
      expect(metadata.platforms?.win?.artifacts?.installer?.url).toBe(server.info.artifactUrl);
      expect(metadata.platforms?.win?.artifacts?.installer?.sha256Url).toBe(server.info.checksumUrl);

      const artifact = await fetch(server.info.artifactUrl);
      expect(await artifact.text()).toBe("real local installer bytes");
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("optionally serves launcher payload metadata without replacing the installer artifact", async () => {
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture installer",
      channel: "beta",
      includePayload: true,
      payloadBody: "fixture payload",
      platform: "win",
      version: "2.0.0-beta-nightly.1",
    });
    try {
      const metadataResponse = await fetch(server.info.metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      const metadata = await metadataResponse.json() as {
        platforms?: {
          win?: {
            artifacts?: {
              installer?: { url?: string };
              payload?: { contentType?: string; sha256Url?: string; url?: string };
            };
          };
        };
      };
      expect(metadata.platforms?.win?.artifacts?.installer?.url).toBe(server.info.artifactUrl);
      expect(metadata.platforms?.win?.artifacts?.payload?.url).toBe(server.info.payloadUrl);
      expect(metadata.platforms?.win?.artifacts?.payload?.sha256Url).toBe(server.info.payloadChecksumUrl);
      expect(metadata.platforms?.win?.artifacts?.payload?.contentType).toBe("application/x-7z-compressed");

      const payload = await fetch(server.info.payloadUrl ?? "");
      expect(await payload.text()).toBe("fixture payload");

      const checksum = await fetch(server.info.payloadChecksumUrl ?? "");
      expect(await checksum.text()).toContain(server.info.payloadSha256);
    } finally {
      await server.close();
    }
  });

  it("serves launcher payload bytes from a real archive path", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-serve-payload-"));
    const payloadPath = join(root, "Open Design-release-preview-payload.zip");
    await writeFile(payloadPath, "real payload bytes", "utf8");
    const server = await startUpdaterFixtureServer({
      channel: "preview",
      payloadPath,
      version: "2.0.0-preview.4",
    });
    try {
      const metadataResponse = await fetch(server.info.metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      const metadata = await metadataResponse.json() as {
        platforms?: {
          mac?: {
            artifacts?: {
              payload?: { name?: string; sha256Url?: string; size?: number; url?: string };
            };
          };
        };
      };
      expect(metadata.platforms?.mac?.artifacts?.payload?.name).toBe("Open Design-release-preview-payload.zip");
      expect(metadata.platforms?.mac?.artifacts?.payload?.size).toBe("real payload bytes".length);
      expect(metadata.platforms?.mac?.artifacts?.payload?.url).toBe(server.info.payloadUrl);
      expect(metadata.platforms?.mac?.artifacts?.payload?.sha256Url).toBe(server.info.payloadChecksumUrl);

      const payload = await fetch(server.info.payloadUrl ?? "", {
        headers: { range: "bytes=5-11" },
      });
      expect(payload.status).toBe(206);
      expect(payload.headers.get("content-range")).toBe("bytes 5-11/18");
      expect(await payload.text()).toBe("payload");

      const checksum = await fetch(server.info.payloadChecksumUrl ?? "");
      expect(await checksum.text()).toContain(server.info.payloadSha256);
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("serves a local launcher payload artifact file", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-updater-payload-fixture-"));
    const payloadPath = join(root, "Open Design-release-beta-win-payload.7z");
    await writeFile(payloadPath, "real local payload bytes");
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture installer",
      channel: "beta",
      payloadPath,
      platform: "win",
      version: "2.0.0-beta.2",
    });
    try {
      const metadataResponse = await fetch(server.info.metadataUrl);
      expect(metadataResponse.ok).toBe(true);
      const metadata = await metadataResponse.json() as {
        platforms?: {
          win?: {
            artifacts?: {
              installer?: { url?: string };
              payload?: { contentType?: string; sha256Url?: string; size?: number; url?: string };
            };
          };
        };
      };
      expect(server.info.payloadPath).toBe(payloadPath);
      expect(metadata.platforms?.win?.artifacts?.installer?.url).toBe(server.info.artifactUrl);
      expect(metadata.platforms?.win?.artifacts?.payload?.url).toBe(server.info.payloadUrl);
      expect(metadata.platforms?.win?.artifacts?.payload?.sha256Url).toBe(server.info.payloadChecksumUrl);
      expect(metadata.platforms?.win?.artifacts?.payload?.contentType).toBe("application/x-7z-compressed");
      expect(metadata.platforms?.win?.artifacts?.payload?.size).toBe(24);

      const payload = await fetch(server.info.payloadUrl ?? "");
      expect(await payload.text()).toBe("real local payload bytes");

      const checksum = await fetch(server.info.payloadChecksumUrl ?? "");
      expect(checksum.ok).toBe(true);
      expect(await checksum.text()).toContain(server.info.payloadSha256);
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
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
