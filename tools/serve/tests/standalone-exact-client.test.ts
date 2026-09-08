import { createServer } from "node:http";
import { createHash, createPublicKey } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { verifyDocument } from "@open-design/standalone";

import { withStandaloneExactFixture } from "../src/standalone-exact-client.js";
import { startStandaloneExactFixtureServer } from "../src/standalone-exact-fixture.js";

it("acquires fixture bytes through the download primitive and disposes only its own stage", async () => {
  const root = await mkdtemp(join(tmpdir(), "fixture-client-"));
  const launcherPath = join(root, "launcher.mjs"), closurePath = join(root, "closure.mjs");
  await writeFile(launcherPath, "launcher");
  await writeFile(closurePath, "closure");
  const capsule = { contentFile: join(root, "capsule-content.json"), archiveFile: join(root, "capsule.zip") };
  const capsuleBytes = Buffer.from("Capsule fixture bytes");
  await writeFile(capsule.archiveFile, capsuleBytes);
  await writeFile(capsule.contentFile, JSON.stringify({ schemaVersion: 1, protocol: "electron-capsule-v3", target: "darwin-arm64", entrypoint: "capsule.cjs",
    archive: { sha256: createHash("sha256").update(capsuleBytes).digest("hex"), size: capsuleBytes.byteLength, treeSha256: "b".repeat(64) } }));
  const server = await startStandaloneExactFixtureServer({ channel: "dev", releaseVersion: "0.1.0-dev.1", launcherPath, closurePath,
    capsule,
    shell: { type: "electron", version: "0.1.0", buildHash: "a".repeat(64) },
  });
  try {
    const input = { bootstrapUrl: server.info.bootstrapUrl, scratchRoot: join(root, "scratch") };
    let first = "";
    await withStandaloneExactFixture(input, async files => {
      first = files.contentFile;
      expect(files).toMatchObject({ channel: "dev", releaseVersion: "0.1.0-dev.1" });
      expect(JSON.parse(await readFile(files.contentFile, "utf8")).metadata.channel).toBe("dev");
      expect(await Promise.all(files.seedFiles.map(path => readFile(path, "utf8")))).toEqual(["launcher", "closure"]);
      expect(files.capsule).toBeDefined();
      expect(await readFile(files.capsule!.archiveFile)).toEqual(capsuleBytes);
      const trust = JSON.parse(await readFile(files.trustFile, "utf8"));
      const ring = new Map<string, ReturnType<typeof createPublicKey>>(trust.keys.map((key: { keyId: string; publicKey: string }) => [key.keyId, createPublicKey(key.publicKey)]));
      const manifest = JSON.parse(await readFile(files.capsule!.manifestFile, "utf8"));
      expect(verifyDocument(manifest, ring)).toBe("local-exact");
      expect(manifest.document).toMatchObject({ protocol: "electron-capsule-v3", provides: { shellVersion: "0.1.0" } });
      await withStandaloneExactFixture(input, async second => {
        expect(second.contentFile).not.toBe(first);
        expect(await readFile(first, "utf8")).not.toBe("");
      });
      expect(await readFile(first, "utf8")).not.toBe("");
    });
    expect(await readdir(input.scratchRoot)).toEqual([]);
    await expect(withStandaloneExactFixture(input, async () => { throw new Error("consumer failed"); })).rejects.toThrow("consumer failed");
    expect(await readdir(input.scratchRoot)).toEqual([]);
    expect(await readFile(launcherPath, "utf8")).toBe("launcher");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses remote fixture origins and redirects before exposing local inputs", async () => {
  const consume = async () => { throw new Error("must not consume"); };
  await expect(withStandaloneExactFixture({ bootstrapUrl: "https://example.com/bootstrap.json", scratchRoot: tmpdir() }, consume)).rejects.toThrow("loopback");
  const server = createServer((_request, response) => { response.writeHead(302, { location: "https://example.com/" }); response.end(); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    if (address == null || typeof address === "string") throw new Error("fixture address missing");
    await expect(withStandaloneExactFixture({ bootstrapUrl: `http://127.0.0.1:${address.port}/bootstrap.json`, scratchRoot: tmpdir() }, consume)).rejects.toThrow();
  } finally { await new Promise<void>(done => server.close(() => done())); }
});
