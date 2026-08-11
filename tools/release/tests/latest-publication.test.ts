import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { publishLatestMetadataWithCas } from "../src/storage/latest-publication.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("latest metadata CAS", () => {
  it("uses the strong form of a weak storage ETag for If-Match", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-latest-publication-"));
    temporaryRoots.push(root);
    const metadataPath = join(root, "metadata.json");
    const previousBytes = Buffer.from(`${JSON.stringify({ releaseVersion: "0.19.0-beta.9" })}\n`);
    const nextBytes = Buffer.from(`${JSON.stringify({ releaseVersion: "0.19.0-beta.21" })}\n`);
    await writeFile(metadataPath, nextBytes);
    let storedBytes = previousBytes;
    let observedIfMatch = "";

    const server = createServer(async (request, response) => {
      if (request.method === "GET") {
        const etag = createHash("md5").update(storedBytes).digest("hex");
        response.statusCode = 200;
        response.setHeader("etag", `W/\"${etag}\"`);
        response.end(storedBytes);
        return;
      }
      if (request.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        observedIfMatch = String(request.headers["if-match"] ?? "");
        const expected = `\"${createHash("md5").update(storedBytes).digest("hex")}\"`;
        if (observedIfMatch !== expected) {
          response.statusCode = 412;
          response.end("PreconditionFailed");
          return;
        }
        storedBytes = Buffer.concat(chunks);
        response.statusCode = 200;
        response.end();
        return;
      }
      response.statusCode = 405;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("test server did not bind");
      await publishLatestMetadataWithCas({
        channel: "beta",
        metadataPath,
        releaseVersion: "0.19.0-beta.21",
        storage: {
          accessKeyId: "test",
          bucket: "bucket",
          endpointUrl: `http://127.0.0.1:${address.port}`,
          region: "auto",
          secretAccessKey: "test",
        },
      });
      expect(observedIfMatch).toMatch(/^"[a-f0-9]{32}"$/u);
      expect(storedBytes).toEqual(await readFile(metadataPath));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error)));
    }
  });

  it("accepts an already-published byte-identical target without another PUT", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-latest-publication-"));
    temporaryRoots.push(root);
    const metadataPath = join(root, "metadata.json");
    const targetBytes = Buffer.from(`${JSON.stringify({ releaseVersion: "0.19.0-beta.21" })}\n`);
    await writeFile(metadataPath, targetBytes);
    let putCount = 0;

    const server = createServer(async (request, response) => {
      if (request.method === "GET") {
        response.statusCode = 200;
        response.setHeader("etag", `\"${createHash("md5").update(targetBytes).digest("hex")}\"`);
        response.end(targetBytes);
        return;
      }
      if (request.method === "PUT") {
        putCount += 1;
        response.statusCode = 500;
        response.end();
        return;
      }
      response.statusCode = 405;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("test server did not bind");
      await publishLatestMetadataWithCas({
        channel: "beta",
        metadataPath,
        releaseVersion: "0.19.0-beta.21",
        storage: {
          accessKeyId: "test",
          bucket: "bucket",
          endpointUrl: `http://127.0.0.1:${address.port}`,
          region: "auto",
          secretAccessKey: "test",
        },
      });
      expect(putCount).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error)));
    }
  });

  it("fails closed when latest already names the target version with different bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-latest-publication-"));
    temporaryRoots.push(root);
    const metadataPath = join(root, "metadata.json");
    const targetBytes = Buffer.from(`${JSON.stringify({ releaseVersion: "0.19.0-beta.21", source: "accepted" })}\n`);
    const conflictingBytes = Buffer.from(`${JSON.stringify({ releaseVersion: "0.19.0-beta.21", source: "other" })}\n`);
    await writeFile(metadataPath, targetBytes);

    const server = createServer((request, response) => {
      if (request.method === "GET") {
        response.statusCode = 200;
        response.setHeader("etag", `\"${createHash("md5").update(conflictingBytes).digest("hex")}\"`);
        response.end(conflictingBytes);
        return;
      }
      response.statusCode = 500;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("test server did not bind");
      await expect(publishLatestMetadataWithCas({
        channel: "beta",
        metadataPath,
        releaseVersion: "0.19.0-beta.21",
        storage: {
          accessKeyId: "test",
          bucket: "bucket",
          endpointUrl: `http://127.0.0.1:${address.port}`,
          region: "auto",
          secretAccessKey: "test",
        },
      })).rejects.toThrow(/same release|already names/u);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error)));
    }
  });
});
