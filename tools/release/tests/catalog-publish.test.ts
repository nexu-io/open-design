import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { exportCatalog } from "../src/catalog/export.ts";
import { packCatalogSnapshot, writeCatalogJson } from "../src/catalog/pack.ts";
import { createStubPreviewRenderer, renderCatalogPreviews } from "../src/catalog/render-previews.ts";
import { publishCatalogSnapshot } from "../src/storage/publish-catalog.ts";
import { strongQuotedEtag, type StorageConfig } from "../src/storage/s3-upload.ts";

const FIXTURE_ROOT = resolve(import.meta.dirname, "fixtures/catalog");
const SOURCE_COMMIT = "cccccccccccccccccccccccccccccccccccccccc";
const OLDER_COMMIT = "dddddddddddddddddddddddddddddddddddddddd";
const SAME_TIME_NEWER_COMMIT = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const BUCKET = "open-design-release-fixture";

type StoredObject = { body: Buffer; etag: string };
type EtagHeaderStyle = "quoted" | "unquoted" | "weak";

function etag(body: Buffer): string {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

function etagResponseHeader(stored: string, style: EtagHeaderStyle): string {
  const unquoted = stored.replaceAll('"', "");
  if (style === "unquoted") return unquoted;
  if (style === "weak") return `W/"${unquoted}"`;
  return `"${unquoted}"`;
}

async function startFixtureServer(options: { etagHeaderStyle?: EtagHeaderStyle; putDelayMs?: number } = {}): Promise<{
  close(): Promise<void>;
  getObject(key: string): Buffer | null;
  listObjectKeys(): string[];
  maxActivePutRequests(): number;
  resetPutMetrics(): void;
  info: { bucket: string; endpointUrl: string };
  storage: StorageConfig;
}> {
  const objects = new Map<string, StoredObject>();
  let activePutRequests = 0;
  let maxActivePutRequests = 0;

  function objectKeyFromRequest(request: IncomingMessage, response: ServerResponse): string | null {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    const segments = url.pathname
      .split("/")
      .filter((segment) => segment.length > 0)
      .map(decodeURIComponent);
    if (segments[0] !== BUCKET || segments.length < 2) {
      response.statusCode = 404;
      response.end("not found");
      return null;
    }
    return segments.slice(1).join("/");
  }

  function readBody(request: IncomingMessage): Promise<Buffer> {
    return new Promise((resolveRead, rejectRead) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("error", rejectRead);
      request.on("end", () => resolveRead(Buffer.concat(chunks)));
    });
  }

  const server: Server = createServer((request, response) => {
    void (async () => {
      const key = objectKeyFromRequest(request, response);
      if (key == null) return;

      if (request.method === "PUT") {
        activePutRequests += 1;
        maxActivePutRequests = Math.max(maxActivePutRequests, activePutRequests);
        try {
          if ((options.putDelayMs ?? 0) > 0) {
            await new Promise((resolveDelay) => setTimeout(resolveDelay, options.putDelayMs));
          }
          const current = objects.get(key);
          if (request.headers["if-none-match"] === "*" && current != null) {
            response.statusCode = 412;
            response.end("precondition failed");
            return;
          }
          if (
            typeof request.headers["if-match"] === "string" &&
            current?.etag !== request.headers["if-match"]
          ) {
            response.statusCode = 412;
            response.end("precondition failed");
            return;
          }
          const body = await readBody(request);
          const stored = { body, etag: etag(body) };
          objects.set(key, stored);
          response.statusCode = 200;
          response.setHeader("etag", stored.etag);
          response.end("ok");
          return;
        } finally {
          activePutRequests -= 1;
        }
      }

      if (request.method === "GET") {
        const current = objects.get(key);
        if (current == null) {
          response.statusCode = 404;
          response.end("missing");
          return;
        }
        response.statusCode = 200;
        response.setHeader("etag", etagResponseHeader(current.etag, options.etagHeaderStyle ?? "quoted"));
        response.end(current.body);
        return;
      }

      response.statusCode = 405;
      response.end("method not allowed");
    })();
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no port");
  const endpointUrl = `http://127.0.0.1:${address.port}`;

  return {
    info: { bucket: BUCKET, endpointUrl },
    storage: {
      accessKeyId: "ak",
      bucket: BUCKET,
      endpointUrl,
      region: "auto",
      secretAccessKey: "sk",
    },
    getObject(key) {
      return objects.get(key)?.body ?? null;
    },
    listObjectKeys() {
      return [...objects.keys()].sort();
    },
    maxActivePutRequests() {
      return maxActivePutRequests;
    },
    resetPutMetrics() {
      activePutRequests = 0;
      maxActivePutRequests = 0;
    },
    close() {
      return new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      });
    },
  };
}

async function stagePackedCatalog(
  sourceCommit: string,
  generatedAt = "2026-08-29T00:00:00.000Z",
): Promise<string> {
  const stagingDir = await mkdtemp(join(tmpdir(), "od-catalog-publish-"));
  const { catalog } = exportCatalog({
    repoRoot: FIXTURE_ROOT,
    sourceCommit,
    generatedAt,
  });
  writeCatalogJson(stagingDir, catalog);
  await renderCatalogPreviews({
    catalog,
    repoRoot: FIXTURE_ROOT,
    stagingDir,
    renderer: createStubPreviewRenderer(),
  });
  packCatalogSnapshot({
    stagingDir,
    sourceCommit,
    exporterVersion: "tools-release@test",
  });
  return stagingDir;
}

describe("strongQuotedEtag", () => {
  it("quotes a bare validator", () => {
    expect(strongQuotedEtag("abc")).toBe('"abc"');
  });

  it("keeps an already quoted validator", () => {
    expect(strongQuotedEtag('"abc"')).toBe('"abc"');
  });

  it("rejects a weak validator", () => {
    expect(() => strongQuotedEtag('W/"abc"')).toThrow(/weak/);
  });
});

describe("catalog publish", () => {
  it("reuses immutable snapshot objects with bounded concurrency on a workflow rerun", async () => {
    const server = await startFixtureServer({ putDelayMs: 15 });
    const stagingDir = await stagePackedCatalog(SOURCE_COMMIT);
    try {
      await publishCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
        immutablePublishConcurrency: 3,
      });
      server.resetPutMetrics();

      const rerun = await publishCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
        immutablePublishConcurrency: 3,
      });

      expect(server.maxActivePutRequests()).toBe(3);
      expect(rerun.reused.length).toBeGreaterThan(3);
      expect(rerun.latestUpdated).toBe(false);
    } finally {
      await server.close();
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("rejects incomplete provenance before uploading immutable objects", async () => {
    const server = await startFixtureServer();
    const stagingDir = await stagePackedCatalog(SOURCE_COMMIT);
    try {
      await writeFile(
        join(stagingDir, "provenance.json"),
        `${JSON.stringify({ schemaVersion: 1, sourceCommit: SOURCE_COMMIT })}\n`,
      );

      await expect(
        publishCatalogSnapshot({
          stagingDir,
          sourceCommit: SOURCE_COMMIT,
          sourceCommitGeneration: 42,
          publicOrigin: "https://releases.example.test",
          storage: server.storage,
        }),
      ).rejects.toThrow(/catalog provenance validation failed/);

      expect(server.listObjectKeys()).toEqual([]);
    } finally {
      await server.close();
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("rejects provenance recordCounts that do not match the catalog", async () => {
    const server = await startFixtureServer();
    const stagingDir = await stagePackedCatalog(SOURCE_COMMIT);
    try {
      const provenancePath = join(stagingDir, "provenance.json");
      const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
        recordCounts: Record<string, number>;
      };
      provenance.recordCounts = {};
      await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

      await expect(
        publishCatalogSnapshot({
          stagingDir,
          sourceCommit: SOURCE_COMMIT,
          sourceCommitGeneration: 42,
          publicOrigin: "https://releases.example.test",
          storage: server.storage,
        }),
      ).rejects.toThrow(/recordCounts .* do not match catalog/);

      expect(server.listObjectKeys()).toEqual([]);
    } finally {
      await server.close();
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("publishes immutable objects and latest.json", async () => {
    const server = await startFixtureServer();
    const stagingDir = await stagePackedCatalog(SOURCE_COMMIT);
    try {
      const result = await publishCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
      });

      expect(result.bundleUrl).toBe(
        `https://releases.example.test/catalog/v1/${SOURCE_COMMIT}/bundle.tar.zst`,
      );
      expect(result.latestUrl).toBe("https://releases.example.test/catalog/v1/latest.json");
      expect(result.latestUpdated).toBe(true);

      const keys = server.listObjectKeys();
      expect(keys).toContain(`catalog/v1/${SOURCE_COMMIT}/catalog.json`);
      expect(keys).toContain(`catalog/v1/${SOURCE_COMMIT}/bundle.tar.zst`);
      expect(keys).toContain(`catalog/v1/${SOURCE_COMMIT}/provenance.json`);
      expect(keys).toContain(`catalog/v1/${SOURCE_COMMIT}/checksums.sha256`);
      expect(keys).toContain("catalog/v1/latest.json");
      expect(keys).toContain(
        `catalog/v1/${SOURCE_COMMIT}/entries/plugins/examples/demo-plugin/example.html`,
      );

      const latest = JSON.parse(server.getObject("catalog/v1/latest.json")?.toString("utf8") ?? "{}") as {
        sourceCommit: string;
        sourceCommittedAt: string;
        sourceCommitGeneration: number;
        sha256: string;
        bundleUrl: string;
      };
      expect(latest.sourceCommit).toBe(SOURCE_COMMIT);
      expect(latest.sourceCommittedAt).toBe("2026-08-29T00:00:00.000Z");
      expect(latest.sourceCommitGeneration).toBe(42);
      expect(latest.sha256).toBe(result.bundleSha256);
      expect(latest.bundleUrl).toBe(result.bundleUrl);

      // Idempotent re-publish of identical bytes reuses objects.
      const again = await publishCatalogSnapshot({
        stagingDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
      });
      expect(again.reused.length).toBeGreaterThan(0);
      expect(again.latestUpdated).toBe(false);
    } finally {
      await server.close();
      await rm(stagingDir, { force: true, recursive: true });
    }
  });

  it("does not let an older workflow rerun replace the latest pointer", async () => {
    const server = await startFixtureServer();
    const newerDir = await stagePackedCatalog(SOURCE_COMMIT, "2026-08-29T00:00:00.000Z");
    const olderDir = await stagePackedCatalog(OLDER_COMMIT, "2026-08-28T00:00:00.000Z");
    try {
      await publishCatalogSnapshot({
        stagingDir: newerDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
      });
      const latestBefore = server.getObject("catalog/v1/latest.json")?.toString("utf8");

      const older = await publishCatalogSnapshot({
        stagingDir: olderDir,
        sourceCommit: OLDER_COMMIT,
        sourceCommitGeneration: 41,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
      });

      expect(older.latestUpdated).toBe(false);
      expect(server.getObject("catalog/v1/latest.json")?.toString("utf8")).toBe(latestBefore);
    } finally {
      await server.close();
      await Promise.all([
        rm(newerDir, { force: true, recursive: true }),
        rm(olderDir, { force: true, recursive: true }),
      ]);
    }
  });

  it.each(["quoted", "unquoted"] as const)(
    "advances to a newer commit generation when GET ETag is %s",
    async (etagHeaderStyle) => {
      const server = await startFixtureServer({ etagHeaderStyle });
      const firstDir = await stagePackedCatalog(SOURCE_COMMIT, "2026-08-29T00:00:00.000Z");
      const nextDir = await stagePackedCatalog(SAME_TIME_NEWER_COMMIT, "2026-08-29T00:00:00.000Z");
      try {
        await publishCatalogSnapshot({
          stagingDir: firstDir,
          sourceCommit: SOURCE_COMMIT,
          sourceCommitGeneration: 42,
          publicOrigin: "https://releases.example.test",
          storage: server.storage,
        });

        const next = await publishCatalogSnapshot({
          stagingDir: nextDir,
          sourceCommit: SAME_TIME_NEWER_COMMIT,
          sourceCommitGeneration: 43,
          publicOrigin: "https://releases.example.test",
          storage: server.storage,
        });
        const latest = JSON.parse(server.getObject("catalog/v1/latest.json")?.toString("utf8") ?? "{}") as {
          sourceCommit?: string;
          sourceCommitGeneration?: number;
        };

        expect(next.latestUpdated).toBe(true);
        expect(latest).toMatchObject({
          sourceCommit: SAME_TIME_NEWER_COMMIT,
          sourceCommitGeneration: 43,
        });
      } finally {
        await server.close();
        await Promise.all([
          rm(firstDir, { force: true, recursive: true }),
          rm(nextDir, { force: true, recursive: true }),
        ]);
      }
    },
  );

  it("refuses a weak GET ETag and leaves latest alone", async () => {
    const server = await startFixtureServer({ etagHeaderStyle: "weak" });
    const firstDir = await stagePackedCatalog(SOURCE_COMMIT, "2026-08-29T00:00:00.000Z");
    const nextDir = await stagePackedCatalog(SAME_TIME_NEWER_COMMIT, "2026-08-29T00:00:00.000Z");
    try {
      await publishCatalogSnapshot({
        stagingDir: firstDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
      });
      const latestBefore = server.getObject("catalog/v1/latest.json")?.toString("utf8");

      await expect(
        publishCatalogSnapshot({
          stagingDir: nextDir,
          sourceCommit: SAME_TIME_NEWER_COMMIT,
          sourceCommitGeneration: 43,
          publicOrigin: "https://releases.example.test",
          storage: server.storage,
        }),
      ).rejects.toThrow(/weak/);

      expect(server.getObject("catalog/v1/latest.json")?.toString("utf8")).toBe(latestBefore);
    } finally {
      await server.close();
      await Promise.all([
        rm(firstDir, { force: true, recursive: true }),
        rm(nextDir, { force: true, recursive: true }),
      ]);
    }
  });


  it("fails when different content targets the same commit prefix and leaves latest alone", async () => {
    const server = await startFixtureServer();
    const firstDir = await stagePackedCatalog(SOURCE_COMMIT);
    try {
      await publishCatalogSnapshot({
        stagingDir: firstDir,
        sourceCommit: SOURCE_COMMIT,
        sourceCommitGeneration: 42,
        publicOrigin: "https://releases.example.test",
        storage: server.storage,
      });
      const latestBefore = server.getObject("catalog/v1/latest.json")?.toString("utf8");

      // Build a second snapshot with different catalog bytes but same commit.
      const secondDir = await stagePackedCatalog(SOURCE_COMMIT);
      try {
        const catalogPath = join(secondDir, "catalog.json");
        const { readFileSync, writeFileSync } = await import("node:fs");
        const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
          records: Array<{ name?: string }>;
        };
        catalog.records[0]!.name = "Different Name";
        writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
        // Re-pack so checksums match the tampered catalog (still different from first publish).
        const { unlinkSync, existsSync } = await import("node:fs");
        for (const name of ["checksums.sha256", "provenance.json", "bundle.tar.zst"]) {
          const full = join(secondDir, name);
          if (existsSync(full)) unlinkSync(full);
        }
        packCatalogSnapshot({
          stagingDir: secondDir,
          sourceCommit: SOURCE_COMMIT,
          exporterVersion: "tools-release@test-2",
        });

        await expect(
          publishCatalogSnapshot({
            stagingDir: secondDir,
            sourceCommit: SOURCE_COMMIT,
            sourceCommitGeneration: 42,
            publicOrigin: "https://releases.example.test",
            storage: server.storage,
          }),
        ).rejects.toThrow(/immutable catalog object already exists with different content/);

        // latest.json must remain the first successful publish.
        expect(server.getObject("catalog/v1/latest.json")?.toString("utf8")).toBe(latestBefore);
      } finally {
        await rm(secondDir, { force: true, recursive: true });
      }
    } finally {
      await server.close();
      await rm(firstDir, { force: true, recursive: true });
    }
  });
});
