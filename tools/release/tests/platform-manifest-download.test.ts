import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getStorageObjectText: vi.fn() }));
vi.mock("@/storage/s3-upload.ts", () => storage);

describe("platform manifest download", () => {
  let root: string;

  beforeEach(() => {
    vi.resetModules();
    storage.getStorageObjectText.mockReset();
    root = mkdtempSync(join(tmpdir(), "platform-manifest-download-"));
    for (const [key, value] of Object.entries({
      RELEASE_ASSET_SUFFIX: ".signed",
      RELEASE_CHANNEL: "beta",
      RELEASE_MANIFEST_DIR: root,
      RELEASE_STORAGE_ACCESS_KEY_ID: "fixture",
      RELEASE_STORAGE_BUCKET: "fixture",
      RELEASE_STORAGE_ENDPOINT: "https://fixture.invalid",
      RELEASE_STORAGE_REGION: "auto",
      RELEASE_STORAGE_SECRET_ACCESS_KEY: "fixture",
      RELEASE_TARGET: "mac_arm64",
      RELEASE_VERSION: "0.22.3-beta.99",
    })) vi.stubEnv(key, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { force: true, recursive: true });
  });

  it("reads the immutable version manifest directly from release storage", async () => {
    const manifest = JSON.stringify({ channel: "beta", platformKey: "mac_arm64" });
    storage.getStorageObjectText.mockResolvedValue(manifest);
    vi.stubEnv(
      "RELEASE_PLATFORM_MANIFEST_KEY",
      "beta/versions/0.22.3-beta.99.signed/platforms/mac_arm64.json",
    );

    await import("@/storage/download-platform-manifest.ts");

    expect(storage.getStorageObjectText).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: "beta/versions/0.22.3-beta.99.signed/platforms/mac_arm64.json",
    }));
    expect(readFileSync(join(root, "mac_arm64.json"), "utf8")).toBe(`${manifest}\n`);
  });

  it("rejects a producer key outside the requested release identity", async () => {
    vi.stubEnv(
      "RELEASE_PLATFORM_MANIFEST_KEY",
      "beta/versions/0.22.3-beta.98.signed/platforms/mac_arm64.json",
    );

    await expect(import("@/storage/download-platform-manifest.ts")).rejects.toThrow(
      "platform manifest key does not match beta 0.22.3-beta.99 mac_arm64",
    );
    expect(storage.getStorageObjectText).not.toHaveBeenCalled();
  });

  it("fails instead of synthesizing a missing manifest", async () => {
    storage.getStorageObjectText.mockResolvedValue(null);

    await expect(import("@/storage/download-platform-manifest.ts")).rejects.toThrow(
      "platform manifest not found in release storage",
    );
  });
});
