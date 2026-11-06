import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getStorageObject: vi.fn(),
  putStorageObject: vi.fn(),
}));

vi.mock("../src/storage/s3-upload.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/storage/s3-upload.ts")>()),
  getStorageObject: storageMocks.getStorageObject,
  putStorageObject: storageMocks.putStorageObject,
}));

import {
  applyLatestRollback,
  planLatestRollback,
  verifyLatestRollback,
} from "../src/storage/rollback-latest.ts";
import type { StorageConfig } from "../src/storage/s3-upload.ts";

const storage: StorageConfig = {
  accessKeyId: "ak",
  bucket: "releases",
  endpointUrl: "https://storage.example.test",
  region: "auto",
  secretAccessKey: "sk",
};

type Manifest = {
  channel: string;
  feed: { name: string } | null;
  platformKey: string;
  releaseVersion: string;
  status: string;
};

function versionMetadata(version: string, targets: string[], overrides: Record<string, unknown> = {}) {
  return {
    channel: "stable",
    generatedAt: "2026-09-24T09:48:47.421Z",
    platforms: {},
    r2: { versionPrefix: `stable/versions/${version}` },
    readyTargets: targets,
    releaseState: "complete",
    releaseVersion: version,
    ...overrides,
  };
}

function manifest(version: string, target: string, feedName: string | null, overrides: Partial<Manifest> = {}) {
  return {
    channel: "stable",
    feed: feedName == null ? null : { name: feedName },
    platformKey: target,
    releaseVersion: version,
    status: "published",
    ...overrides,
  };
}

/** A published 0.24.1 plus a live latest pointing at 0.25.0, as storage would hold them. */
function defaultObjects(): Record<string, string> {
  return {
    "stable/latest/metadata.json": JSON.stringify(versionMetadata("0.25.0", ["mac_arm64", "win_x64"])),
    "stable/versions/0.24.1/metadata.json": JSON.stringify(versionMetadata("0.24.1", ["mac_arm64", "win_x64"])),
    "stable/versions/0.24.1/platforms/mac_arm64.json": JSON.stringify(manifest("0.24.1", "mac_arm64", "latest-mac.yml")),
    "stable/versions/0.24.1/platforms/win_x64.json": JSON.stringify(manifest("0.24.1", "win_x64", "latest.yml")),
    "stable/versions/0.24.1/latest-mac.yml": "version: 0.24.1\n",
    "stable/versions/0.24.1/latest.yml": "version: 0.24.1\n",
  };
}

let objects: Record<string, string>;

/** Back both mocks with the same in-memory bucket so writes are readable again. */
function serve(): void {
  storageMocks.getStorageObject.mockImplementation(async ({ objectKey }: { objectKey: string }) => {
    const text = objects[objectKey];
    if (text == null) return null;
    const bytes = Buffer.from(text, "utf8");
    return { bytes, etag: `"etag-${objectKey}"`, text };
  });
  storageMocks.putStorageObject.mockImplementation(async ({ body, objectKey }: { body: Buffer; objectKey: string }) => {
    objects[objectKey] = Buffer.from(body).toString("utf8");
  });
}

const FLOOR_VARS = ["RELEASE_LAUNCHER_VERSION_MIN_STABLE", "RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE"];

describe("stable latest rollback", () => {
  beforeEach(() => {
    storageMocks.getStorageObject.mockReset();
    storageMocks.putStorageObject.mockReset();
    objects = defaultObjects();
    for (const name of FLOOR_VARS) delete process.env[name];
    serve();
  });

  afterEach(() => {
    for (const name of FLOOR_VARS) delete process.env[name];
  });

  it("[P0] restores every latest object from the target version prefix", async () => {
    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });

    expect(plan.objects.map((object) => object.targetKey)).toEqual([
      "stable/latest/platforms/mac_arm64.json",
      "stable/latest/latest-mac.yml",
      "stable/latest/platforms/win_x64.json",
      "stable/latest/latest.yml",
      "stable/latest/metadata.json",
    ]);
    expect(plan.fromVersion).toBe("0.25.0");
    expect(plan.versionPrefix).toBe("stable/versions/0.24.1");
  });

  it("[P0] writes metadata.json last so latest never advertises a version it does not serve", async () => {
    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });
    await applyLatestRollback(storage, plan);

    const written = storageMocks.putStorageObject.mock.calls.map(([call]) => call.objectKey as string);
    expect(written.at(-1)).toBe("stable/latest/metadata.json");
    expect(written).toHaveLength(plan.objects.length);
    for (const [call] of storageMocks.putStorageObject.mock.calls) {
      expect(call.cacheControl).toBe("public, max-age=60, must-revalidate");
    }
  });

  it("[P0] republishes the target version as the served release version", async () => {
    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      github: { runId: 42 },
      now: new Date("2026-09-29T02:00:00.000Z"),
      toVersion: "0.24.1",
    });

    const metadata = JSON.parse(plan.objects.at(-1)!.bytes.toString("utf8"));
    expect(metadata.releaseVersion).toBe("0.24.1");
    expect(metadata.releaseState).toBe("complete");
    expect(metadata.rollback).toEqual({
      at: "2026-09-29T02:00:00.000Z",
      from: "0.25.0",
      github: { runId: 42 },
      to: "0.24.1",
    });
  });

  it("[P0] refuses when latest no longer serves the version the operator meant to retract", async () => {
    objects["stable/latest/metadata.json"] = JSON.stringify(versionMetadata("0.25.1", ["mac_arm64", "win_x64"]));

    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.24.1" }),
    ).rejects.toThrow(/currently serves 0\.25\.1, not the expected 0\.25\.0/);
    expect(storageMocks.putStorageObject).not.toHaveBeenCalled();
  });

  it("[P0] refuses to move the channel forward unless that is explicitly requested", async () => {
    objects["stable/versions/0.26.0/metadata.json"] = JSON.stringify(versionMetadata("0.26.0", ["mac_arm64"]));
    objects["stable/versions/0.26.0/platforms/mac_arm64.json"] = JSON.stringify(
      manifest("0.26.0", "mac_arm64", "latest-mac.yml"),
    );
    objects["stable/versions/0.26.0/latest-mac.yml"] = "version: 0.26.0\n";

    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.26.0" }),
    ).rejects.toThrow(/newer than the live 0\.25\.0/);

    const forward = await planLatestRollback(storage, {
      allowForward: true,
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.26.0",
    });
    expect(forward.toVersion).toBe("0.26.0");
  });

  it("[P0] refuses a target version that never completed publication", async () => {
    objects["stable/versions/0.24.1/metadata.json"] = JSON.stringify(
      versionMetadata("0.24.1", ["mac_arm64", "win_x64"], { releaseState: "partial" }),
    );

    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.24.1" }),
    ).rejects.toThrow(/releaseState partial/);
  });

  it("[P0] refuses a target version written by a dry run", async () => {
    objects["stable/versions/0.24.1/metadata.json"] = JSON.stringify(
      versionMetadata("0.24.1", ["mac_arm64", "win_x64"], { dryRun: true }),
    );

    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.24.1" }),
    ).rejects.toThrow(/dry run/);
  });

  it("[P0] refuses when a ready platform's manifest or updater feed is missing", async () => {
    delete objects["stable/versions/0.24.1/latest.yml"];
    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.24.1" }),
    ).rejects.toThrow(/missing updater feed stable\/versions\/0\.24\.1\/latest\.yml/);

    objects = defaultObjects();
    delete objects["stable/versions/0.24.1/platforms/win_x64.json"];
    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.24.1" }),
    ).rejects.toThrow(/missing stable\/versions\/0\.24\.1\/platforms\/win_x64\.json/);
  });

  it("[P0] refuses a version with no published metadata at all", async () => {
    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.20.0" }),
    ).rejects.toThrow(/no published stable release metadata for 0\.20\.0/);
  });

  it("[P1] resolves the signed version prefix when the plain one was never published", async () => {
    objects = {
      "stable/latest/metadata.json": JSON.stringify(versionMetadata("0.25.0", ["mac_arm64"])),
      "stable/versions/0.24.1.signed/metadata.json": JSON.stringify(
        versionMetadata("0.24.1", ["mac_arm64"], { r2: { versionPrefix: "stable/versions/0.24.1.signed" } }),
      ),
      "stable/versions/0.24.1.signed/platforms/mac_arm64.json": JSON.stringify(
        manifest("0.24.1", "mac_arm64", "latest-mac.yml"),
      ),
      "stable/versions/0.24.1.signed/latest-mac.yml": "version: 0.24.1\n",
    };

    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });
    expect(plan.versionPrefix).toBe("stable/versions/0.24.1.signed");
  });

  it("[P1] collapses two platforms that share one updater feed into a single write", async () => {
    objects["stable/versions/0.24.1/metadata.json"] = JSON.stringify(
      versionMetadata("0.24.1", ["mac_arm64", "mac_x64"]),
    );
    objects["stable/versions/0.24.1/platforms/mac_x64.json"] = JSON.stringify(
      manifest("0.24.1", "mac_x64", "latest-mac.yml"),
    );

    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });

    expect(plan.objects.filter((object) => object.targetKey === "stable/latest/latest-mac.yml")).toHaveLength(1);
  });

  it("[P0] republishes the current installer floor policy rather than the snapshot's", async () => {
    objects["stable/versions/0.24.1/metadata.json"] = JSON.stringify(
      versionMetadata("0.24.1", ["mac_arm64", "win_x64"], {
        control: { launcher: { version: { min: "0.19.0" } } },
      }),
    );
    process.env.RELEASE_LAUNCHER_VERSION_MIN_STABLE = "0.22.0";

    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });

    const metadata = JSON.parse(plan.objects.at(-1)!.bytes.toString("utf8"));
    expect(metadata.control).toEqual({ launcher: { version: { min: "0.22.0" } } });
  });

  it("[P0] drops a stale control block when the channel no longer sets a floor", async () => {
    objects["stable/versions/0.24.1/metadata.json"] = JSON.stringify(
      versionMetadata("0.24.1", ["mac_arm64", "win_x64"], {
        control: { launcher: { version: { min: "0.19.0" } } },
      }),
    );

    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });

    const metadata = JSON.parse(plan.objects.at(-1)!.bytes.toString("utf8"));
    expect(metadata.control).toBeUndefined();
  });

  it("[P0] refuses a rollback below the channel's installer floor", async () => {
    process.env.RELEASE_LAUNCHER_VERSION_MIN_STABLE = "0.25.0";

    await expect(
      planLatestRollback(storage, { channel: "stable", fromVersion: "0.25.0", toVersion: "0.24.1" }),
    ).rejects.toThrow(/launcher version floor 0\.25\.0 exceeds release version 0\.24\.1/);
  });

  it("[P0] fails verification when a rolled back object does not match what was written", async () => {
    const plan = await planLatestRollback(storage, {
      channel: "stable",
      fromVersion: "0.25.0",
      toVersion: "0.24.1",
    });
    await applyLatestRollback(storage, plan);
    await expect(verifyLatestRollback(storage, plan)).resolves.toBeUndefined();

    objects["stable/latest/latest.yml"] = "version: 0.25.0\n";
    await expect(verifyLatestRollback(storage, plan)).rejects.toThrow(
      /does not match what was written: stable\/latest\/latest\.yml/,
    );
  });
});
