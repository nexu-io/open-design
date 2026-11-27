import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, it } from "vitest";

import {
  MANAGED_DOWNLOAD_ERROR_CODES,
  downloadCopyAndClear,
  inspectManagedDownload,
  managedDownload,
  type DownloadCopyAndClearOptions,
} from "../src/index.js";

const roots: string[] = [];
const body = "verified output must survive managed cleanup";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Create a real filesystem fixture with an in-memory HTTP response. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "od-copy-output-"));
  roots.push(root);
  let requests = 0;
  const options: DownloadCopyAndClearOptions = {
    basePath: join(root, "downloads"),
    bucket: "artifacts",
    fileName: "payload.bin",
    outputPath: join(root, "staging", "payload.bin"),
    payload: {
      checksum: { algorithm: "sha256", value: createHash("sha256").update(body).digest("hex") },
      url: "https://example.invalid/payload.bin",
    },
    fetch: async () => {
      requests += 1;
      return new Response(body);
    },
  };
  return { root, options, requests: () => requests };
}

/** Directory junctions do not require symlink privileges on Windows. */
function aliasDirectory(target: string, alias: string): void {
  symlinkSync(target, alias, process.platform === "win32" ? "junction" : "dir");
}

describe("copy output ownership", () => {
  for (const segments of [[], ["artifacts", "payload.bin"], ["other", "kept.bin"], [".partial", "kept.bin"], ["..retained", "kept.bin"]]) {
    it(`rejects output inside the managed base before downloading: ${segments.join("/") || "base itself"}`, async () => {
      const { options, requests } = fixture();
      options.outputPath = join(options.basePath, ...segments);

      await assert.rejects(downloadCopyAndClear(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET });

      assert.equal(requests(), 0);
      assert.equal(existsSync(options.basePath), false);
    });
  }

  it("preserves an existing verified managed output and its state when refusing it", async () => {
    const { options, requests } = fixture();
    const downloaded = await managedDownload(options);
    options.outputPath = downloaded.path;
    const requestsBeforeCopy = requests();

    await assert.rejects(downloadCopyAndClear(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET });

    assert.equal(requests(), requestsBeforeCopy);
    assert.equal(readFileSync(downloaded.path, "utf8"), body);
    const inspected = await inspectManagedDownload(options);
    assert.equal(inspected.complete, true);
    assert.equal(inspected.manifest, "complete");
  });

  it("rejects a nonexistent output reached through an alias of the managed base", async () => {
    const { root, options, requests } = fixture();
    mkdirSync(options.basePath);
    const alias = join(root, "output-alias");
    aliasDirectory(options.basePath, alias);
    options.outputPath = join(alias, "artifacts", "payload.bin");

    await assert.rejects(downloadCopyAndClear(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET });

    assert.equal(requests(), 0);
    assert.deepEqual(readdirSync(options.basePath), []);
  });

  it("does not discard a dangling alias that would become internal after the download", async () => {
    const { root, options, requests } = fixture();
    const alias = join(root, "output-alias");
    aliasDirectory(options.basePath, alias);
    options.outputPath = join(alias, "artifacts", "payload.bin");

    await assert.rejects(downloadCopyAndClear(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET });

    assert.equal(requests(), 0);
    assert.equal(existsSync(options.basePath), false);
  });

  it("resolves the base's existing parent even when the managed directory does not exist yet", async () => {
    const { root, options, requests } = fixture();
    const realParent = join(root, "shared");
    const alias = join(root, "base-alias");
    mkdirSync(realParent);
    aliasDirectory(realParent, alias);
    options.basePath = join(alias, "downloads");
    options.outputPath = join(realParent, "downloads", "artifacts", "payload.bin");

    await assert.rejects(downloadCopyAndClear(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET });

    assert.equal(requests(), 0);
    assert.deepEqual(readdirSync(realParent), []);
  });

  it("retains an output in a sibling directory with the same path prefix", async () => {
    const { root, options, requests } = fixture();
    options.outputPath = join(root, "downloads-kept", "new", "payload.bin");

    const result = await downloadCopyAndClear(options);

    assert.equal(result.outputPath, options.outputPath);
    assert.equal(result.bytes, Buffer.byteLength(body));
    assert.equal(result.cleanup, "removed");
    assert.equal(requests(), 1);
    assert.equal(readFileSync(options.outputPath, "utf8"), body);
    assert.equal(existsSync(join(options.basePath, options.bucket, options.fileName)), false);
  });

  it("allows an external alias with multiple nonexistent output parents", async () => {
    const { root, options } = fixture();
    const external = join(root, "external");
    const alias = join(root, "output-alias");
    mkdirSync(external);
    aliasDirectory(external, alias);
    options.outputPath = join(alias, "new", "nested", "payload.bin");

    const result = await downloadCopyAndClear(options);

    assert.equal(result.cleanup, "removed");
    assert.equal(readFileSync(join(external, "new", "nested", "payload.bin"), "utf8"), body);
  });

  it("still accepts an identical existing external output", async () => {
    const { root, options } = fixture();
    mkdirSync(join(root, "staging"));
    writeFileSync(options.outputPath, body);

    const result = await downloadCopyAndClear(options);

    assert.equal(result.cleanup, "removed");
    assert.equal(readFileSync(options.outputPath, "utf8"), body);
  });

  it("still preserves a conflicting existing external output", async () => {
    const { root, options } = fixture();
    mkdirSync(join(root, "staging"));
    writeFileSync(options.outputPath, "caller-owned bytes");

    await assert.rejects(downloadCopyAndClear(options), { code: MANAGED_DOWNLOAD_ERROR_CODES.OUTPUT_CONFLICT });

    assert.equal(readFileSync(options.outputPath, "utf8"), "caller-owned bytes");
  });
});
