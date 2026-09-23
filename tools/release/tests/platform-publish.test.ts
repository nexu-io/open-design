import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "@/storage/concurrency.ts";

const storage = vi.hoisted(() => ({ putStorageObject: vi.fn() }));
vi.mock("@/storage/s3-upload.ts", () => storage);

describe("platform publication barrier", () => {
  let root: string;
  beforeEach(() => {
    vi.resetModules();
    storage.putStorageObject.mockReset();
    root = mkdtempSync(join(tmpdir(), "platform-publish-"));
    for (const [key, value] of Object.entries({
      RELEASE_TARGET: "mac_arm64", RELEASE_CHANNEL: "beta", RELEASE_VERSION: "0.22.3-beta.99",
      RELEASE_PUBLIC_ORIGIN: "https://fixture.invalid", RELEASE_ASSETS_DIR: root,
      RELEASE_MANIFEST_DIR: join(root, "manifests"), RELEASE_OUTPUTS_PATH: join(root, "outputs.json"),
      RELEASE_STORAGE_ACCESS_KEY_ID: "fixture", RELEASE_STORAGE_SECRET_ACCESS_KEY: "fixture",
      RELEASE_STORAGE_BUCKET: "fixture", RELEASE_STORAGE_ENDPOINT: "https://fixture.invalid",
      RELEASE_STORAGE_REGION: "auto", RELEASE_VERSION_LOCK_REQUIRED: "false",
      RELEASE_ARTIFACT_MODE: "all", RELEASE_PUBLISH_SIDE_EFFECTS: "true",
      RELEASE_REPORT_DIR: "", RELEASE_ASSET_SUFFIX: "",
    })) vi.stubEnv(key, value);
    for (const suffix of [".dmg", ".dmg.sha256", ".zip", ".zip.sha256", "-payload.zip", "-payload.zip.sha256"]) {
      writeFileSync(join(root, `open-design-0.22.3-beta.99-mac-arm64${suffix}`), "fixture");
    }
    writeFileSync(join(root, "latest-mac.yml"), "fixture");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("uploads two independent objects while withholding the manifest and outputs", async () => {
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    let active = 0;
    let maximum = 0;
    const completed: string[] = [];
    storage.putStorageObject.mockImplementation(async ({ objectKey }: { objectKey: string }) => {
      active++;
      maximum = Math.max(maximum, active);
      if (active === 2) started.resolve();
      if (!objectKey.includes("/platforms/")) await gate.promise;
      else expect(completed).toHaveLength(7);
      completed.push(objectKey);
      active--;
    });
    const publication = import("@/storage/publish-platform.ts");
    await started.promise;
    expect(storage.putStorageObject).toHaveBeenCalledTimes(2);
    expect(existsSync(join(root, "outputs.json"))).toBe(false);
    expect(existsSync(join(root, "manifests/mac_arm64.json"))).toBe(false);
    gate.resolve();
    await publication;
    expect(maximum).toBe(2);
    expect(completed.at(-1)).toMatch(/\/platforms\/mac_arm64.json$/);
    expect(existsSync(join(root, "outputs.json"))).toBe(true);
    const outputs = JSON.parse(readFileSync(join(root, "outputs.json"), "utf8")) as Record<string, string>;
    expect(outputs).toMatchObject({
      platform_manifest_key: "beta/versions/0.22.3-beta.99/platforms/mac_arm64.json",
    });
    const timings = JSON.parse(outputs.publish_timings_json ?? "[]") as Array<Record<string, unknown>>;
    expect(timings).toHaveLength(8);
    expect(timings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectKey: "beta/versions/0.22.3-beta.99/platforms/mac_arm64.json",
        status: "success",
      }),
    ]));
    expect(timings.every((timing) => typeof timing.durationMs === "number" && Number(timing.durationMs) >= 0)).toBe(true);
  });

  it("fails without publishing a manifest or success outputs when an upload fails", async () => {
    storage.putStorageObject.mockRejectedValue(new Error("upload failed"));
    await expect(import("@/storage/publish-platform.ts")).rejects.toThrow("upload failed");
    expect(storage.putStorageObject).toHaveBeenCalledTimes(2);
    expect(existsSync(join(root, "outputs.json"))).toBe(false);
    expect(existsSync(join(root, "manifests/mac_arm64.json"))).toBe(false);
  });

  it("drains started writes and stops scheduling after the first failure", async () => {
    const gate = Promise.withResolvers<void>();
    const failed = Promise.withResolvers<void>();
    const calls: number[] = [];
    const work = mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
      calls.push(value);
      if (value === 0) { failed.resolve(); throw new Error("first failure"); }
      await gate.promise;
    });
    const outcome = expect(work).rejects.toThrow("first failure");
    let settled = false;
    void work.then(() => { settled = true; }, () => { settled = true; });
    await failed.promise;
    expect(settled).toBe(false);
    gate.resolve();
    await outcome;
    expect(calls).toEqual([0, 1]);
  });

  it("rejects invalid concurrency rather than silently omitting uploads", async () => {
    for (const value of [0, -1, 1.5, NaN, Infinity]) {
      await expect(mapWithConcurrency([1], value, async (item) => item)).rejects.toThrow("positive integer");
    }
  });
});
