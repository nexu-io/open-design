import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { startUpdaterFixtureServer } from "../src/updater-fixture.js";

describe("updater fixture server", () => {
  it("serves installer metadata, bytes, and checksum", async () => {
    const server = await startUpdaterFixtureServer({
      artifactBody: "fixture artifact",
      channel: "beta",
      version: "2.0.0-beta.1",
    });
    try {
      const metadata = await (await fetch(server.info.metadataUrl)).json() as {
        baseVersion?: string;
        channel?: string;
        platforms?: { mac?: { artifacts?: { dmg?: { sha256Url?: string; url?: string } } } };
        releaseNumber?: number;
        releaseVersion?: string;
      };
      expect(metadata).toMatchObject({
        baseVersion: "2.0.0",
        channel: "beta",
        releaseNumber: 1,
        releaseVersion: "2.0.0-beta.1",
      });
      expect(metadata.platforms?.mac?.artifacts?.dmg?.url).toBe(server.info.artifactUrl);
      expect(metadata.platforms?.mac?.artifacts?.dmg?.sha256Url).toBe(server.info.checksumUrl);
      expect(await (await fetch(server.info.artifactUrl)).text()).toBe("fixture artifact");
      expect(await (await fetch(server.info.checksumUrl)).text()).toContain(server.info.sha256);
    } finally {
      await server.close();
    }
  });

  it("serves a real local installer with resumable byte ranges", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-tools-serve-installer-"));
    const artifactPath = join(root, "Open Design Beta.dmg");
    await writeFile(artifactPath, "real local installer bytes");
    const server = await startUpdaterFixtureServer({ artifactPath, channel: "beta", version: "2.0.0-beta.2" });
    try {
      expect(server.info.artifactPath).toBe(artifactPath);
      const response = await fetch(server.info.artifactUrl, { headers: { range: "bytes=5-9" } });
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe("bytes 5-9/26");
      expect(await response.text()).toBe("local");
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});
