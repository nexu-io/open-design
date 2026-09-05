import { createPublicKey } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  verifyStandaloneChannelHead,
  verifyStandaloneMetadata,
  type SignedStandaloneChannelHead,
  type SignedStandaloneMetadata,
} from "@open-design/standalone";
import { describe, expect, it } from "vitest";

import { startStandaloneExactFixtureServer } from "../src/standalone-exact-fixture.js";

describe("Standalone exact fixture server", () => {
  it("serves one explicitly channel-bound signed bootstrap graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-standalone-exact-fixture-"));
    const launcherPath = join(root, "launcher.mjs");
    const closurePath = join(root, "closure.mjs");
    await Promise.all([
      writeFile(launcherPath, "export const standaloneGenerationHandoff = async () => undefined;\n"),
      writeFile(closurePath, "export const closure = 'local-exact';\n"),
    ]);
    const server = await startStandaloneExactFixtureServer({
      channel: "dev",
      closurePath,
      launcherPath,
      publishedAt: "2026-09-05T00:00:00.000Z",
      releaseVersion: "0.1.0-dev.1",
      shell: { buildHash: "a".repeat(64), type: "electron", version: "0.1.0" },
      sourceCommit: "b".repeat(40),
    });
    try {
      const bootstrapResponse = await fetch(server.info.bootstrapUrl);
      expect(bootstrapResponse.ok).toBe(true);
      const bootstrap = await bootstrapResponse.json() as {
        channel: string;
        channelHeadUrl: string;
        content: { sha256: string; size: number; url: string };
        releaseVersion: string;
        seeds: Array<{ blobSha256: string; component: string; sha256: string; url: string }>;
        trust: { url: string };
      };
      expect(bootstrap).toMatchObject({
        channel: "dev",
        channelHeadUrl: server.info.channelHeadUrl,
        releaseVersion: "0.1.0-dev.1",
      });
      expect(bootstrap.seeds.map(({ component }) => component)).toEqual(["standalone.launcher", "standalone.resource"]);
      expect(bootstrap.seeds.every(({ blobSha256, sha256 }) => blobSha256 === sha256)).toBe(true);

      const trust = await (await fetch(bootstrap.trust.url)).json() as {
        keys: Array<{ keyId: string; publicKey: string }>;
      };
      const ring = new Map(trust.keys.map(({ keyId, publicKey }) => [keyId, createPublicKey(publicKey)]));
      const contentResponse = await fetch(bootstrap.content.url);
      expect(Number(contentResponse.headers.get("content-length"))).toBe(bootstrap.content.size);
      const content = await contentResponse.json() as SignedStandaloneMetadata;
      expect(verifyStandaloneMetadata(content, ring)).toBe("local-exact");
      expect(content.metadata).toMatchObject({ channel: "dev", releaseVersion: "0.1.0-dev.1" });
      expect(content.metadata.shellRequirements).toEqual([{ buildHash: "a".repeat(64), minVersion: "0.1.0", type: "electron" }]);

      const head = await (await fetch(bootstrap.channelHeadUrl)).json() as SignedStandaloneChannelHead;
      expect(verifyStandaloneChannelHead(head, ring)).toBe("local-exact");
      expect(head.head.lanes.content).toMatchObject({ releaseVersion: "0.1.0-dev.1", sha256: bootstrap.content.sha256 });

      const seed = await fetch(bootstrap.seeds[0]!.url, { method: "HEAD" });
      expect(seed.ok).toBe(true);
      expect(seed.headers.get("etag")).toBe(`"${bootstrap.seeds[0]!.sha256}"`);
      expect(await fetch(server.info.bootstrapUrl, { method: "POST" })).toMatchObject({ status: 405 });
    } finally {
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a release version whose defensive suffix differs from its explicit channel", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-standalone-exact-fixture-"));
    const launcherPath = join(root, "launcher.mjs");
    const closurePath = join(root, "closure.mjs");
    await Promise.all([writeFile(launcherPath, "launcher\n"), writeFile(closurePath, "closure\n")]);
    await expect(startStandaloneExactFixtureServer({
      channel: "dev",
      closurePath,
      launcherPath,
      releaseVersion: "0.1.0-betahyx.1",
      shell: { buildHash: "a".repeat(64), type: "electron", version: "0.1.0" },
    })).rejects.toThrow("releaseVersion does not belong to dev");
    await rm(root, { force: true, recursive: true });
  });
});
