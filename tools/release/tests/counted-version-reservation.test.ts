import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { reserveVersion } from "../src/storage/counted-version-reservation.js";
import type { StorageConfig } from "../src/storage/s3-upload.js";

const temporaryRoots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve, reject) => {
    server.close((error) => error == null ? resolve() : reject(error));
  })));
  await Promise.all(temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function storageFixture(initial: Record<string, string> = {}): Promise<{
  objects: Map<string, Buffer>;
  puts: string[];
  storage: StorageConfig;
}> {
  const objects = new Map(Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]));
  const puts: string[] = [];
  const server = createServer(async (request, response) => {
    const key = decodeURIComponent((request.url ?? "").replace(/^\/bucket\//u, ""));
    if (request.method === "GET") {
      const body = objects.get(key);
      if (body == null) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.statusCode = 200;
      response.setHeader("etag", `"${createHash("md5").update(body).digest("hex")}"`);
      response.end(body);
      return;
    }
    if (request.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (request.headers["if-none-match"] === "*" && objects.has(key)) {
        response.statusCode = 412;
        response.end();
        return;
      }
      puts.push(key);
      objects.set(key, Buffer.concat(chunks));
      response.statusCode = 200;
      response.end();
      return;
    }
    response.statusCode = 405;
    response.end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("test storage server did not bind");
  return {
    objects,
    puts,
    storage: {
      accessKeyId: "test",
      bucket: "bucket",
      endpointUrl: `http://127.0.0.1:${address.port}`,
      region: "auto",
      secretAccessKey: "test",
    },
  };
}

async function metadataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-version-reservation-"));
  temporaryRoots.push(root);
  return root;
}

describe("counted version reservation", () => {
  it("skips immutable metadata left without a version lock", async () => {
    const publishedKey = "beta/versions/0.19.1-beta.7/metadata.json";
    const fixture = await storageFixture({ [publishedKey]: '{"releaseVersion":"0.19.1-beta.7"}\n' });

    const result = await reserveVersion({
      baseVersion: "0.19.1",
      candidateVersion: "0.19.1-beta.7",
      channel: "beta",
      lane: "exact",
      manualOverride: false,
      maxAttempts: 3,
      metadataDir: await metadataRoot(),
      publicOrigin: "https://releases.example",
      storage: fixture.storage,
    });

    expect(result.reservation.releaseVersion).toBe("0.19.1-beta.8");
    expect(fixture.puts).toEqual(["beta/versions/0.19.1-beta.8/version.lock.json"]);
    expect(fixture.objects.has("beta/versions/0.19.1-beta.7/version.lock.json")).toBe(false);
  });

  it("rejects an explicit version whose immutable metadata already exists", async () => {
    const publishedKey = "qa2/versions/0.19.1-qa2.4/metadata.json";
    const fixture = await storageFixture({ [publishedKey]: '{"releaseVersion":"0.19.1-qa2.4"}\n' });

    await expect(reserveVersion({
      baseVersion: "0.19.1",
      candidateVersion: "0.19.1-qa2.4",
      channel: "qa2",
      lane: "exact",
      manualOverride: true,
      maxAttempts: 1,
      metadataDir: await metadataRoot(),
      publicOrigin: "https://releases.example",
      storage: fixture.storage,
    })).rejects.toThrow(/already published.*metadata\.json/u);
    expect(fixture.puts).toEqual([]);
  });
});
