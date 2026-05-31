import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  MANAGED_DOWNLOAD_ERROR_CODES,
  downloadCopyAndClear,
  inspectManagedDownload,
  managedDownload,
  pruneManagedDownloads,
  removeManagedDownload,
  type ManagedDownloadProgress,
} from "../src/index.js";

type FixtureRequest = {
  range?: string;
};

type FixtureServer = {
  close(): Promise<void>;
  requests: FixtureRequest[];
  url: string;
};

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tmpRoot(label: string): string {
  const root = mkdtempSync(join(tmpdir(), `od-download-${label}-`));
  roots.push(root);
  return root;
}

function sha256(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

function targetKey(bucket: string, fileName: string): string {
  return createHash("sha256").update(`${bucket}\0${fileName}`).digest("hex");
}

function lockPath(basePath: string, bucket: string, fileName: string): string {
  return join(basePath, ".locks", `${targetKey(bucket, fileName)}.lock`);
}

function exitedPid(): number {
  const child = spawnSync(process.execPath, ["-e", ""], { stdio: "ignore" });
  if (child.error != null) throw child.error;
  if (typeof child.pid !== "number") throw new Error("spawnSync did not expose a pid");
  return child.pid;
}

function sendBody(response: ServerResponse, body: Buffer, options: { delayMs?: number } = {}): void {
  const send = () => {
    response.end(body);
  };
  if (options.delayMs == null) send();
  else setTimeout(send, options.delayMs);
}

async function startFixture(
  body: Buffer | string,
  options: {
    delayMs?: number;
    failFirstBytes?: number;
    range?: boolean;
  } = {},
): Promise<FixtureServer> {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const requests: FixtureRequest[] = [];
  let requestCount = 0;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requestCount += 1;
    const range = typeof request.headers.range === "string" ? request.headers.range : undefined;
    requests.push({ ...(range == null ? {} : { range }) });

    if (options.failFirstBytes != null && requestCount === 1) {
      response.writeHead(200, {
        "content-length": payload.byteLength,
        "content-type": "application/octet-stream",
        etag: '"fixture-etag"',
      });
      response.write(payload.subarray(0, options.failFirstBytes));
      setTimeout(() => response.destroy(), 5);
      return;
    }

    if (range != null && options.range !== false) {
      const match = /^bytes=(\d+)-$/.exec(range);
      const start = match?.[1] == null ? Number.NaN : Number(match[1]);
      if (Number.isInteger(start) && start >= 0 && start < payload.byteLength) {
        const chunk = payload.subarray(start);
        response.writeHead(206, {
          "content-length": chunk.byteLength,
          "content-range": `bytes ${start}-${payload.byteLength - 1}/${payload.byteLength}`,
          "content-type": "application/octet-stream",
          etag: '"fixture-etag"',
        });
        sendBody(response, chunk, { delayMs: options.delayMs });
        return;
      }
    }

    response.writeHead(200, {
      "content-length": payload.byteLength,
      "content-type": "application/octet-stream",
      etag: '"fixture-etag"',
    });
    sendBody(response, payload, { delayMs: options.delayMs });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("fixture did not listen on tcp");
  return {
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close((error) => (error == null ? resolveClose() : rejectClose(error)))),
    requests,
    url: `http://127.0.0.1:${address.port}/artifact.bin`,
  };
}

describe("managed download package", () => {
  it("downloads, copies to caller output, verifies, and clears managed state", async () => {
    const body = "copy and clear payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("copy-clear");
    const outputPath = join(root, "out", "artifact.bin");
    try {
      const result = await downloadCopyAndClear({
        basePath: join(root, "downloads"),
        bucket: "artifacts",
        fileName: "payload.bin",
        outputPath,
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      expect(result.cleanup).toBe("removed");
      expect(readFileSync(outputPath, "utf8")).toBe(body);
      const inspected = await inspectManagedDownload({ basePath: join(root, "downloads"), bucket: "artifacts", fileName: "payload.bin" });
      expect(inspected.complete).toBe(false);
      expect(inspected.manifest).toBe("missing");
    } finally {
      await fixture.close();
    }
  });

  it("resumes a partial download when the server supports Range", async () => {
    const body = "resumable payload from a flaky connection";
    const fixture = await startFixture(body, { failFirstBytes: 9, range: true });
    const root = tmpRoot("resume");
    try {
      const result = await managedDownload({
        basePath: join(root, "downloads"),
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      expect(result.resumed).toBe(true);
      expect(readFileSync(result.path, "utf8")).toBe(body);
      expect(fixture.requests.some((request) => request.range?.startsWith("bytes="))).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("falls back to a full download when Range is not honored", async () => {
    const body = "fallback payload from a server without range support";
    const fixture = await startFixture(body, { failFirstBytes: 8, range: false });
    const root = tmpRoot("range-fallback");
    try {
      const result = await managedDownload({
        basePath: join(root, "downloads"),
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      expect(result.resumed).toBe(false);
      expect(readFileSync(result.path, "utf8")).toBe(body);
      expect(fixture.requests.some((request) => request.range?.startsWith("bytes="))).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("quick-fails a checksum mismatch after resetting owned state", async () => {
    const fixture = await startFixture("wrong bytes");
    const root = tmpRoot("checksum-mismatch");
    await expect(
      managedDownload({
        basePath: join(root, "downloads"),
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256("expected bytes") }, url: fixture.url },
      }),
    ).rejects.toMatchObject({ code: MANAGED_DOWNLOAD_ERROR_CODES.CHECKSUM_MISMATCH });
    await fixture.close();
  });

  it("dedupes same-process callers and fans out progress", async () => {
    const body = "dedupe payload";
    const fixture = await startFixture(body, { delayMs: 40 });
    const root = tmpRoot("dedupe");
    const firstProgress: ManagedDownloadProgress[] = [];
    const secondProgress: ManagedDownloadProgress[] = [];
    try {
      const input = {
        basePath: join(root, "downloads"),
        bucket: "shared",
        fileName: "payload.bin",
        payload: { checksum: { algorithm: "sha256" as const, value: sha256(body) }, url: fixture.url },
      };
      const [first, second] = await Promise.all([
        managedDownload({ ...input, onProgress: (progress) => firstProgress.push(progress) }),
        managedDownload({ ...input, onProgress: (progress) => secondProgress.push(progress) }),
      ]);

      expect(first.path).toBe(second.path);
      expect(fixture.requests).toHaveLength(1);
      expect(firstProgress.length).toBeGreaterThan(0);
      expect(secondProgress.length).toBeGreaterThan(0);
    } finally {
      await fixture.close();
    }
  });

  it("aborts only the caller wait while the shared transfer continues", async () => {
    const body = "abort subscriber payload";
    const fixture = await startFixture(body, { delayMs: 60 });
    const root = tmpRoot("abort");
    const controller = new AbortController();
    try {
      const input = {
        basePath: join(root, "downloads"),
        bucket: "shared",
        fileName: "payload.bin",
        payload: { checksum: { algorithm: "sha256" as const, value: sha256(body) }, url: fixture.url },
      };
      const aborted = managedDownload({ ...input, signal: controller.signal });
      const keeper = managedDownload(input);
      await sleep(5);
      controller.abort();

      await expect(aborted).rejects.toMatchObject({ code: MANAGED_DOWNLOAD_ERROR_CODES.ABORTED });
      const result = await keeper;
      expect(readFileSync(result.path, "utf8")).toBe(body);
      expect(fixture.requests).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });

  it("clears a stale pid lock before acquiring the target", async () => {
    const body = "stale lock payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("stale-lock");
    const basePath = join(root, "downloads");
    try {
      await inspectManagedDownload({ basePath, bucket: "updates", fileName: "installer.bin" });
      writeFileSync(lockPath(basePath, "updates", "installer.bin"), JSON.stringify({
        createdAt: new Date().toISOString(),
        pid: exitedPid(),
      }));

      const result = await managedDownload({
        basePath,
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      expect(readFileSync(result.path, "utf8")).toBe(body);
      expect(existsSync(lockPath(basePath, "updates", "installer.bin"))).toBe(false);
      expect(fixture.requests).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });

  it("clears a stale lock when Windows reuses the old owner pid for this process", async () => {
    const body = "pid reuse lock payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("pid-reuse-lock");
    const basePath = join(root, "downloads");
    try {
      await inspectManagedDownload({ basePath, bucket: "updates", fileName: "installer.bin" });
      writeFileSync(lockPath(basePath, "updates", "installer.bin"), JSON.stringify({
        createdAt: new Date(Date.now() - (process.uptime() + 60) * 1000).toISOString(),
        pid: process.pid,
      }));

      const result = await managedDownload({
        basePath,
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      expect(readFileSync(result.path, "utf8")).toBe(body);
      expect(existsSync(lockPath(basePath, "updates", "installer.bin"))).toBe(false);
      expect(fixture.requests).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });

  it("quick-fails when the target lock pid is still alive", async () => {
    const body = "alive lock payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("alive-lock");
    const basePath = join(root, "downloads");
    try {
      await inspectManagedDownload({ basePath, bucket: "updates", fileName: "installer.bin" });
      writeFileSync(lockPath(basePath, "updates", "installer.bin"), JSON.stringify({
        createdAt: new Date().toISOString(),
        pid: process.pid,
      }));

      await expect(
        managedDownload({
          basePath,
          bucket: "updates",
          fileName: "installer.bin",
          payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
        }),
      ).rejects.toMatchObject({ code: MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED });
      expect(fixture.requests).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  it("refuses to overwrite caller output when bytes differ", async () => {
    const body = "output conflict payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("output-conflict");
    const outputPath = join(root, "artifact.bin");
    writeFileSync(outputPath, "existing");
    try {
      await expect(
        downloadCopyAndClear({
          basePath: join(root, "downloads"),
          bucket: "updates",
          fileName: "installer.bin",
          outputPath,
          payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
        }),
      ).rejects.toMatchObject({ code: MANAGED_DOWNLOAD_ERROR_CODES.OUTPUT_CONFLICT });
      expect(readFileSync(outputPath, "utf8")).toBe("existing");
    } finally {
      await fixture.close();
    }
  });

  it("exposes explicit remove for managed targets", async () => {
    const body = "remove payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("remove");
    const basePath = join(root, "downloads");
    try {
      const result = await managedDownload({
        basePath,
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });
      expect(existsSync(result.path)).toBe(true);

      await removeManagedDownload({ basePath, bucket: "updates", fileName: "installer.bin" });
      expect((await inspectManagedDownload({ basePath, bucket: "updates", fileName: "installer.bin" })).complete).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it("prunes managed data older than the default one-day window", async () => {
    const body = "old payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("prune");
    const basePath = join(root, "downloads");
    try {
      await managedDownload({
        basePath,
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      const pruned = await pruneManagedDownloads({ basePath, now: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) });

      expect(pruned.removed).toBeGreaterThan(0);
      expect((await inspectManagedDownload({ basePath, bucket: "updates", fileName: "installer.bin" })).complete).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  it("resets suspicious complete state and redownloads from a clean base", async () => {
    const body = "fresh payload";
    const fixture = await startFixture(body);
    const root = tmpRoot("suspicious-reset");
    const basePath = join(root, "downloads");
    try {
      const first = await managedDownload({
        basePath,
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });
      writeFileSync(first.path, "tampered bytes");

      const second = await managedDownload({
        basePath,
        bucket: "updates",
        fileName: "installer.bin",
        payload: { checksum: { algorithm: "sha256", value: sha256(body) }, url: fixture.url },
      });

      expect(readFileSync(second.path, "utf8")).toBe(body);
      expect(fixture.requests.length).toBeGreaterThanOrEqual(2);
    } finally {
      await fixture.close();
    }
  });
});
