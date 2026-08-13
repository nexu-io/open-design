import { execFile as execFileCallback } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { assertLatestReleaseCanAdvance, publishLatestRelease, type LatestPlatformManifest } from "./latest-publication.ts";
import {
  deleteStorageObjectWithStatus,
  getStorageObject,
  putStorageObjectWithStatus,
  type StorageConfig,
} from "./s3-upload.ts";

const execFile = promisify(execFileCallback);

type Snapshot = { bytes: Buffer; etag: string } | null;

function strongEtag(etag: string): string {
  const value = etag.trim().replace(/^W\/(?=")/iu, "");
  if (!value.startsWith('"') || !value.endsWith('"')) {
    throw new Error(`activation object returned an invalid ETag: ${etag}`);
  }
  return value;
}

function latestObjectPaths(input: {
  manifestDir: string;
  metadataDir: string;
  metadataPath: string;
}): {
  desiredPath: (objectKey: string) => string;
  platforms: Record<string, { manifest: LatestPlatformManifest; path: string }>;
  keys: string[];
} {
  const platforms: Record<string, { manifest: LatestPlatformManifest; path: string }> = {};
  const desiredPaths = new Map<string, string>();
  for (const target of ["mac_arm64", "mac_x64", "win_x64"]) {
    const path = join(input.manifestDir, `${target}.json`);
    const manifest = JSON.parse(readFileSync(path, "utf8")) as LatestPlatformManifest;
    platforms[target] = { manifest, path };
    desiredPaths.set(`stable/latest/platforms/${target}.json`, path);
    const feedName = manifest.feed?.name;
    if (feedName != null && feedName.length > 0) {
      desiredPaths.set(`stable/latest/${feedName}`, join(input.metadataDir, "latest-feeds", feedName));
    }
  }
  desiredPaths.set("stable/latest/metadata.json", input.metadataPath);
  return {
    desiredPath(objectKey) {
      const path = desiredPaths.get(objectKey);
      if (path == null) throw new Error(`activation has no desired path for ${objectKey}`);
      return path;
    },
    keys: [...desiredPaths.keys()],
    platforms,
  };
}

async function snapshotObjects(storage: StorageConfig, keys: string[]): Promise<Map<string, Snapshot>> {
  const snapshots = new Map<string, Snapshot>();
  for (const objectKey of keys) {
    const current = await getStorageObject({ ...storage, objectKey });
    snapshots.set(objectKey, current == null ? null : { bytes: current.bytes, etag: current.etag });
  }
  return snapshots;
}

async function compensateLatestObjects(input: {
  desiredPath: (objectKey: string) => string;
  keys: string[];
  snapshots: Map<string, Snapshot>;
  storage: StorageConfig;
}): Promise<void> {
  const errors: string[] = [];
  for (const objectKey of [...input.keys].reverse()) {
    try {
      const snapshot = input.snapshots.get(objectKey) ?? null;
      const current = await getStorageObject({ ...input.storage, objectKey });
      if (snapshot == null && current == null) continue;
      if (snapshot != null && current != null && current.bytes.equals(snapshot.bytes)) continue;
      const desired = readFileSync(input.desiredPath(objectKey));
      if (current == null || !current.bytes.equals(desired)) {
        throw new Error(`${objectKey} changed outside this activation transaction`);
      }
      if (current.etag.length === 0) throw new Error(`${objectKey} has no ETag for compensation`);
      if (snapshot == null) {
        const deleted = await deleteStorageObjectWithStatus({
          ...input.storage,
          headers: { "if-match": strongEtag(current.etag) },
          objectKey,
        });
        if (!deleted.ok) throw new Error(`DELETE failed with HTTP ${deleted.status}: ${deleted.body}`);
      } else {
        const restored = await putStorageObjectWithStatus({
          ...input.storage,
          body: snapshot.bytes,
          cacheControl: "public, max-age=60, must-revalidate",
          contentType: objectKey.endsWith(".json")
            ? "application/json; charset=utf-8"
            : "application/x-yaml; charset=utf-8",
          headers: { "if-match": strongEtag(current.etag) },
          objectKey,
        });
        if (!restored.ok) throw new Error(`PUT restore failed with HTTP ${restored.status}: ${restored.body}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0) throw new Error(`stable activation compensation failed: ${errors.join("; ")}`);
}

async function execGh(args: string[]): Promise<string> {
  const nodeScript = process.env.OPEN_DESIGN_GH_NODE_SCRIPT;
  const result = nodeScript == null || nodeScript.length === 0
    ? await execFile(process.env.OPEN_DESIGN_GH_BIN ?? "gh", args)
    : await execFile(process.execPath, [nodeScript, ...args]);
  return result.stdout;
}

export async function activateStableRelease(input: {
  manifestDir: string;
  metadataDir: string;
  metadataPath: string;
  releaseVersion: string;
  repository: string;
  storage: StorageConfig;
  versionTag: string;
}): Promise<{ latestMetadataKey: string; releaseVersion: string; state: "activated"; versionTag: string }> {
  await assertLatestReleaseCanAdvance({
    channel: "stable",
    releaseVersion: input.releaseVersion,
    storage: input.storage,
  });
  const objects = latestObjectPaths(input);
  const snapshots = await snapshotObjects(input.storage, objects.keys);
  let projectionAttempted = false;
  try {
    await publishLatestRelease({
      channel: "stable",
      metadataDir: input.metadataDir,
      metadataPath: input.metadataPath,
      platforms: objects.platforms,
      releaseVersion: input.releaseVersion,
      storage: input.storage,
    });
    const activated = await getStorageObject({ ...input.storage, objectKey: "stable/latest/metadata.json" });
    if (activated == null || !activated.bytes.equals(readFileSync(input.metadataPath))) {
      throw new Error("stable latest metadata readback did not match the staged release");
    }
    projectionAttempted = true;
    await execGh(["release", "edit", input.versionTag, "--draft=false", "--latest", "--repo", input.repository]);
    const projection = JSON.parse(await execGh([
      "release", "view", input.versionTag, "--repo", input.repository, "--json", "isDraft,tagName",
    ])) as { isDraft?: boolean; tagName?: string };
    const latestTag = (await execGh([
      "api", `repos/${input.repository}/releases/latest`, "--jq", ".tag_name",
    ])).trim();
    if (projection.isDraft !== false || projection.tagName !== input.versionTag || latestTag !== input.versionTag) {
      throw new Error("GitHub Release projection readback did not confirm a published latest release");
    }
    return {
      latestMetadataKey: "stable/latest/metadata.json",
      releaseVersion: input.releaseVersion,
      state: "activated",
      versionTag: input.versionTag,
    };
  } catch (error) {
    const compensationErrors: string[] = [];
    try {
      await compensateLatestObjects({ ...objects, snapshots, storage: input.storage });
    } catch (compensationError) {
      compensationErrors.push(compensationError instanceof Error ? compensationError.message : String(compensationError));
    }
    if (projectionAttempted) {
      try {
        await execGh(["release", "delete", input.versionTag, "--cleanup-tag", "--yes", "--repo", input.repository]);
      } catch (compensationError) {
        compensationErrors.push(`GitHub projection cleanup failed: ${compensationError instanceof Error ? compensationError.message : String(compensationError)}`);
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}${compensationErrors.length === 0 ? "" : `; ${compensationErrors.join("; ")}`}`);
  }
}
