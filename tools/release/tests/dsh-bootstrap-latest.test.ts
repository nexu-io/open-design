import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getStorageObject: vi.fn(),
  putStorageObjectWithStatus: vi.fn(),
}));

vi.mock("../src/storage/s3-upload.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/storage/s3-upload.ts")>()),
  getStorageObject: storageMocks.getStorageObject,
  putStorageObjectWithStatus: storageMocks.putStorageObjectWithStatus,
}));

import {
  resolveDshBootstrapVersion,
  updateDshBootstrapLatestPointer,
  type DshBootstrapLatestPointer,
} from "../src/storage/dsh-bootstrap-latest.ts";
import type { StorageConfig } from "../src/storage/s3-upload.ts";

const storage: StorageConfig = {
  accessKeyId: "ak",
  bucket: "releases",
  endpointUrl: "https://storage.example.test",
  region: "auto",
  secretAccessKey: "sk",
};

function pointer(version: string): DshBootstrapLatestPointer {
  return {
    files: { "install-dsh.sh": `${version}-sha256` },
    github: { commit: `${version}-commit` },
    publishedAt: "2026-08-31T00:00:00.000Z",
    version,
  };
}

function storedPointer(version: string, etag = `etag-${version}`) {
  const text = `${JSON.stringify(pointer(version), null, 2)}\n`;
  return { bytes: Buffer.from(text), etag, text };
}

describe("DeepSeek Harness bootstrap latest pointer", () => {
  beforeEach(() => {
    storageMocks.getStorageObject.mockReset();
    storageMocks.putStorageObjectWithStatus.mockReset();
  });

  it("does not let a stale publisher rewind latest", async () => {
    storageMocks.getStorageObject.mockResolvedValue(storedPointer("v2"));

    await expect(updateDshBootstrapLatestPointer(storage, pointer("v1"))).resolves.toBe(false);
    expect(storageMocks.putStorageObjectWithStatus).not.toHaveBeenCalled();
  });

  it("advances latest with an ETag conditional write", async () => {
    storageMocks.getStorageObject.mockResolvedValue(storedPointer("v1", "current-etag"));
    storageMocks.putStorageObjectWithStatus.mockResolvedValue({
      body: "ok",
      ok: true,
      status: 200,
      url: "https://storage.example.test/releases/bootstrap/dsh/latest.json",
    });

    await expect(updateDshBootstrapLatestPointer(storage, pointer("v2"))).resolves.toBe(true);
    expect(storageMocks.putStorageObjectWithStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "if-match": "current-etag" },
        objectKey: "bootstrap/dsh/latest.json",
      }),
    );
  });

  it("rechecks the version after a concurrent update wins", async () => {
    storageMocks.getStorageObject
      .mockResolvedValueOnce(storedPointer("v1"))
      .mockResolvedValueOnce(storedPointer("v3"));
    storageMocks.putStorageObjectWithStatus.mockResolvedValue({
      body: "precondition failed",
      ok: false,
      status: 412,
      url: "https://storage.example.test/releases/bootstrap/dsh/latest.json",
    });

    await expect(updateDshBootstrapLatestPointer(storage, pointer("v2"))).resolves.toBe(false);
    expect(storageMocks.putStorageObjectWithStatus).toHaveBeenCalledTimes(1);
  });

  it("reuses the current version when latest already has these bytes", async () => {
    const checksums = Buffer.from("current checksums");
    storageMocks.getStorageObject.mockImplementation(async ({ objectKey }) => {
      if (objectKey === "bootstrap/dsh/latest.json") return storedPointer("v2");
      if (objectKey === "bootstrap/dsh/v2/SHA256SUMS") {
        return { bytes: checksums, etag: "v2-etag", text: checksums.toString("utf8") };
      }
      throw new Error(`unexpected object key ${objectKey}`);
    });

    await expect(resolveDshBootstrapVersion(storage, checksums)).resolves.toBe("v2");
  });

  it("mints above latest when installer bytes intentionally return to an older version", async () => {
    const revertedChecksums = Buffer.from("v1 checksums");
    const requested: string[] = [];
    storageMocks.getStorageObject.mockImplementation(async ({ objectKey }) => {
      requested.push(objectKey);
      if (objectKey === "bootstrap/dsh/latest.json") return storedPointer("v2");
      if (objectKey === "bootstrap/dsh/v2/SHA256SUMS") {
        return {
          bytes: Buffer.from("v2 checksums"),
          etag: "v2-etag",
          text: "v2 checksums",
        };
      }
      if (objectKey === "bootstrap/dsh/v3/SHA256SUMS") return null;
      throw new Error(`unexpected object key ${objectKey}`);
    });

    await expect(resolveDshBootstrapVersion(storage, revertedChecksums)).resolves.toBe("v3");
    expect(requested).not.toContain("bootstrap/dsh/v1/SHA256SUMS");
  });

  it("reuses a matching unpublished version above latest after an interrupted publish", async () => {
    const checksums = Buffer.from("new checksums");
    storageMocks.getStorageObject.mockImplementation(async ({ objectKey }) => {
      if (objectKey === "bootstrap/dsh/latest.json") return storedPointer("v2");
      if (objectKey === "bootstrap/dsh/v2/SHA256SUMS") {
        return { bytes: Buffer.from("old checksums"), etag: "v2-etag", text: "old checksums" };
      }
      if (objectKey === "bootstrap/dsh/v3/SHA256SUMS") {
        return { bytes: checksums, etag: "v3-etag", text: checksums.toString("utf8") };
      }
      throw new Error(`unexpected object key ${objectKey}`);
    });

    await expect(resolveDshBootstrapVersion(storage, checksums)).resolves.toBe("v3");
  });

  it("compares candidate-specific checksums for version-materialized installers", async () => {
    storageMocks.getStorageObject.mockImplementation(async ({ objectKey }) => {
      if (objectKey === "bootstrap/dsh/latest.json") return storedPointer("v2");
      if (objectKey === "bootstrap/dsh/v2/SHA256SUMS") {
        const checksums = Buffer.from("materialized-v2");
        return { bytes: checksums, etag: "v2-etag", text: checksums.toString("utf8") };
      }
      throw new Error(`unexpected object key ${objectKey}`);
    });

    await expect(
      resolveDshBootstrapVersion(storage, (version) => Buffer.from(`materialized-${version}`)),
    ).resolves.toBe("v2");
  });
});
