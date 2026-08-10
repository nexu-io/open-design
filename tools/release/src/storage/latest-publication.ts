import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseCountedReleaseVersion,
  parseReleaseBaseVersion,
  type CountedReleaseChannel,
  type ReleaseChannel,
} from "@open-design/release";

import { contentType } from "./common.ts";
import {
  getStorageObject,
  putStorageObject,
  putStorageObjectWithStatus,
  type StorageConfig,
} from "./s3-upload.ts";

export type LatestPlatformManifest = {
  feed?: {
    name?: string;
  } | null;
  r2?: {
    artifactPrefix?: string;
    versionPrefix?: string;
  };
};

type LatestPlatformInput = {
  manifest: LatestPlatformManifest;
  path: string;
};

function parseCountedVersion(
  value: string,
  channel: CountedReleaseChannel,
): { base: [number, number, number]; releaseNumber: number } | null {
  const parsed = parseCountedReleaseVersion(value, channel);
  if (parsed == null) return null;
  const base = parseReleaseBaseVersion(parsed.baseVersion);
  if (base == null) return null;
  return { base: [...base], releaseNumber: parsed.number };
}

export function compareCountedReleaseVersions(
  left: string,
  right: string,
  channel: CountedReleaseChannel,
): number {
  const parsedLeft = parseCountedVersion(left, channel);
  const parsedRight = parseCountedVersion(right, channel);
  if (parsedLeft == null || parsedRight == null) {
    throw new Error(`invalid ${channel} version comparison: ${left} vs ${right}`);
  }
  for (let index = 0; index < parsedLeft.base.length; index += 1) {
    if (parsedLeft.base[index] > parsedRight.base[index]) return 1;
    if (parsedLeft.base[index] < parsedRight.base[index]) return -1;
  }
  if (parsedLeft.releaseNumber > parsedRight.releaseNumber) return 1;
  if (parsedLeft.releaseNumber < parsedRight.releaseNumber) return -1;
  return 0;
}

async function latestReleaseVersion(input: {
  channel: CountedReleaseChannel;
  storage: StorageConfig;
}): Promise<string | null> {
  const latest = await getStorageObject({
    ...input.storage,
    objectKey: `${input.channel}/latest/metadata.json`,
  });
  if (latest == null) return null;
  try {
    const parsed = JSON.parse(latest.text.replace(/^\uFEFF/u, "")) as { releaseVersion?: unknown };
    if (typeof parsed.releaseVersion !== "string" || parsed.releaseVersion.length === 0) {
      throw new Error("releaseVersion is missing");
    }
    return parsed.releaseVersion;
  } catch (error) {
    throw new Error(`latest metadata is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function assertLatestReleaseCanAdvance(input: {
  channel: CountedReleaseChannel;
  releaseVersion: string;
  storage: StorageConfig;
}): Promise<void> {
  const current = await latestReleaseVersion(input);
  if (
    current != null
    && compareCountedReleaseVersions(current, input.releaseVersion, input.channel) > 0
  ) {
    throw new Error(
      `refusing to move ${input.channel} latest backward from ${current} to ${input.releaseVersion}`,
    );
  }
}

async function upload(
  storage: StorageConfig,
  path: string,
  objectKey: string,
  cacheControl: string,
  type = "application/json; charset=utf-8",
): Promise<void> {
  await putStorageObject({
    ...storage,
    bodyPath: path,
    cacheControl,
    contentType: type,
    objectKey,
  });
}

export async function publishLatestMetadataWithCas(input: {
  channel: CountedReleaseChannel;
  metadataPath: string;
  releaseVersion: string;
  storage: StorageConfig;
}): Promise<void> {
  const objectKey = `${input.channel}/latest/metadata.json`;
  if (parseCountedVersion(input.releaseVersion, input.channel) == null) {
    throw new Error(`invalid ${input.channel} version for latest CAS: ${input.releaseVersion}`);
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const latest = await getStorageObject({ ...input.storage, objectKey });
    const headers: Record<string, string> = {};
    if (latest == null) {
      headers["if-none-match"] = "*";
    } else {
      let latestReleaseVersion = "";
      try {
        const parsed = JSON.parse(latest.text.replace(/^\uFEFF/u, "")) as { releaseVersion?: unknown };
        latestReleaseVersion = typeof parsed.releaseVersion === "string" ? parsed.releaseVersion : "";
      } catch (error) {
        throw new Error(`latest metadata is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (
        latestReleaseVersion.length > 0
        && compareCountedReleaseVersions(latestReleaseVersion, input.releaseVersion, input.channel) > 0
      ) {
        throw new Error(
          `refusing to move ${input.channel} latest backward from ${latestReleaseVersion} to ${input.releaseVersion}`,
        );
      }
      if (latest.etag.length === 0) {
        throw new Error("latest metadata GET did not return an ETag for CAS update");
      }
      headers["if-match"] = latest.etag;
    }

    const result = await putStorageObjectWithStatus({
      ...input.storage,
      bodyPath: input.metadataPath,
      cacheControl: "public, max-age=60, must-revalidate",
      contentType: "application/json; charset=utf-8",
      headers,
      objectKey,
    });
    if (result.ok) return;
    if (result.status !== 412) {
      throw new Error(
        `latest metadata CAS PUT ${objectKey} failed with HTTP ${result.status}`
        + `${result.body.length > 0 ? `: ${result.body}` : ""}`,
      );
    }
    console.log(`latest metadata CAS conflict on attempt ${attempt}; retrying`);
  }

  throw new Error(`failed to update latest metadata with CAS after 5 attempts: ${objectKey}`);
}

export async function publishLatestPlatformObjects(input: {
  channel: ReleaseChannel;
  metadataDir: string;
  platforms: Record<string, LatestPlatformInput>;
  storage: StorageConfig;
}): Promise<void> {
  const latestPrefix = `${input.channel}/latest`;
  for (const [target, platform] of Object.entries(input.platforms)) {
    await upload(
      input.storage,
      platform.path,
      `${latestPrefix}/platforms/${target}.json`,
      "public, max-age=60, must-revalidate",
    );

    const feedName = platform.manifest.feed?.name;
    if (feedName == null || feedName.length === 0) continue;
    const feedVersionPrefix = platform.manifest.r2?.artifactPrefix ?? platform.manifest.r2?.versionPrefix;
    if (feedVersionPrefix == null || feedVersionPrefix.length === 0) {
      throw new Error(`published ${target} platform manifest is missing r2.versionPrefix for ${feedName}`);
    }
    const versionFeed = await getStorageObject({
      ...input.storage,
      objectKey: `${feedVersionPrefix}/${feedName}`,
    });
    if (versionFeed == null) {
      throw new Error(`expected versioned feed object not found: ${feedVersionPrefix}/${feedName}`);
    }
    const feedPath = join(input.metadataDir, "latest-feeds", feedName);
    mkdirSync(join(input.metadataDir, "latest-feeds"), { recursive: true });
    writeFileSync(feedPath, versionFeed.bytes);
    await upload(
      input.storage,
      feedPath,
      `${latestPrefix}/${feedName}`,
      "public, max-age=60, must-revalidate",
      contentType(feedName),
    );
  }
}

export async function publishLatestRelease(input: {
  channel: CountedReleaseChannel;
  metadataDir: string;
  metadataPath: string;
  platforms: Record<string, LatestPlatformInput>;
  releaseVersion: string;
  storage: StorageConfig;
}): Promise<void> {
  // Reject an already-newer latest before touching compatibility objects. The
  // workflow-level release concurrency serializes the remaining support-object
  // preparation and metadata CAS window; the CAS still detects any external
  // writer that ignores that serialization.
  await assertLatestReleaseCanAdvance(input);
  // Materialize support objects first. The metadata CAS below is the only
  // activation point consumers use to discover this release.
  await publishLatestPlatformObjects(input);
  await publishLatestMetadataWithCas(input);
}

export function sha256Digest(bytes: Buffer | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
