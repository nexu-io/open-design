import { compareLauncherVersions } from "@open-design/launcher-proto";
import { releaseChannelDescriptor } from "@open-design/release";
import {
  contentType,
  githubInfo,
  optional,
  publicUrl,
  required,
  storageConfigFromEnv,
  writeJson,
  writeText,
} from "./common.ts";
import {
  assertLauncherVersionFloorSatisfiable,
  resolveLauncherVersionFloor,
  type LauncherVersionFloor,
} from "./launcher-version-floor.ts";
import { getStorageObject, putStorageObject, type StorageConfig } from "./s3-upload.ts";

/**
 * Repoint a channel's `latest` pointer at a release that is already published.
 *
 * A release publishes twice: once to an immutable `<channel>/versions/<version>`
 * prefix, and once as a copy of those same objects under `<channel>/latest`.
 * `latest` is therefore derived state, and rolling back is copying an older
 * version prefix over it again — no rebuild, no new artifacts, no new version.
 *
 * What this does NOT do, and cannot: pull back clients that already updated.
 * The desktop updater refuses any candidate that is not strictly newer than the
 * running version (`apps/desktop/src/main/updater.ts`), so a rollback stops the
 * rollout and nothing more. Users already on the bad version need a roll-forward
 * patch release.
 */

// Must match the cache policy publish-metadata.ts writes for the same objects,
// or a rollback would leave `latest` with a different TTL than a release does.
const LATEST_CACHE_CONTROL = "public, max-age=60, must-revalidate";

// RELEASE_ASSET_SUFFIX is "" for every current lane, but historical prefixes
// carry the signed/unsigned suffix publish-metadata.ts can still resolve. Probe
// in the order the publisher would have preferred.
const ASSET_SUFFIXES = ["", ".signed", ".unsigned"] as const;

type PublishedMetadata = Record<string, unknown> & {
  channel?: unknown;
  dryRun?: unknown;
  r2?: { versionPrefix?: unknown };
  readyTargets?: unknown;
  releaseState?: unknown;
};

type PlatformManifest = {
  channel?: unknown;
  feed?: { name?: unknown } | null;
  platformKey?: unknown;
  releaseVersion?: unknown;
  status?: unknown;
};

export type RollbackProvenance = {
  at: string;
  from: string;
  github?: Record<string, unknown>;
  to: string;
};

export type RollbackObject = {
  bytes: Buffer;
  contentType: string;
  /** Where the bytes came from: an object key, or a description for rewritten JSON. */
  source: string;
  targetKey: string;
};

export type RollbackPlan = {
  channel: string;
  fromVersion: string;
  latestPrefix: string;
  objects: RollbackObject[];
  targets: string[];
  toVersion: string;
  versionPrefix: string;
};

export type RollbackOptions = {
  /**
   * Permit repointing `latest` at a NEWER published version, which is undoing a
   * rollback rather than performing one. Off by default: moving a channel
   * forward is the release workflow's job, and doing it here would skip every
   * gate that stands in front of a real publish.
   */
  allowForward?: boolean;
  channel: string;
  /** The version the operator believes `latest` currently serves. */
  fromVersion: string;
  github?: Record<string, unknown>;
  now?: Date;
  toVersion: string;
};

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/u, ""));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function stringField(source: Record<string, unknown>, field: string, label: string): string {
  const value = source[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is missing a ${field} string`);
  }
  return value;
}

async function readPublishedVersion(
  storage: StorageConfig,
  storagePrefix: string,
  version: string,
): Promise<{ metadata: PublishedMetadata; versionPrefix: string }> {
  const attempted: string[] = [];
  for (const suffix of ASSET_SUFFIXES) {
    const versionPrefix = `${storagePrefix}/versions/${version}${suffix}`;
    const objectKey = `${versionPrefix}/metadata.json`;
    attempted.push(objectKey);
    const object = await getStorageObject({ ...storage, objectKey });
    if (object == null) continue;
    return { metadata: parseJsonObject(object.text, objectKey) as PublishedMetadata, versionPrefix };
  }
  throw new Error(
    `no published ${storagePrefix} release metadata for ${version}; looked for ${attempted.join(", ")}`,
  );
}

/**
 * A rollback target must be a release that actually completed. A partial or
 * dry-run version prefix exists on storage but was never served as `latest`;
 * copying one over the live pointer would ship a half-published release under
 * the guise of recovering from one.
 */
function assertRollbackTargetIsComplete(
  metadata: PublishedMetadata,
  expected: { channel: string; versionField: string; versionPrefix: string; version: string },
): string[] {
  const label = `${expected.versionPrefix}/metadata.json`;
  if (metadata.channel !== expected.channel) {
    throw new Error(`${label} is channel ${String(metadata.channel)}, not ${expected.channel}`);
  }
  const version = stringField(metadata, expected.versionField, label);
  if (version !== expected.version) {
    throw new Error(`${label} is ${expected.versionField} ${version}, not ${expected.version}`);
  }
  if (metadata.releaseState !== "complete") {
    throw new Error(`${label} has releaseState ${String(metadata.releaseState)}; only a complete release can become latest`);
  }
  if (metadata.dryRun === true) {
    throw new Error(`${label} was written by a dry run and was never published`);
  }
  if (metadata.r2?.versionPrefix !== expected.versionPrefix) {
    throw new Error(
      `${label} records versionPrefix ${String(metadata.r2?.versionPrefix)} but was read from ${expected.versionPrefix}`,
    );
  }
  const readyTargets = metadata.readyTargets;
  if (!Array.isArray(readyTargets) || readyTargets.length === 0 || readyTargets.some((target) => typeof target !== "string")) {
    throw new Error(`${label} has no readyTargets to restore`);
  }
  return readyTargets as string[];
}

/**
 * Rewrite the immutable version metadata into what `latest` should serve.
 *
 * Two deliberate differences from a byte copy. `control.launcher.version` is
 * re-resolved from the CURRENT channel policy rather than restored from the
 * snapshot, because the installer floor is a live operator lever and a rollback
 * must not silently retract one set after the target version shipped. And a
 * `rollback` block records that this pointer is not where the newest release
 * left it — the desktop updater reads named fields and ignores the rest, so the
 * extra block is inert to clients and legible to whoever looks next.
 */
export function rollbackLatestMetadata(
  source: PublishedMetadata,
  floor: LauncherVersionFloor | null,
  provenance: RollbackProvenance,
): Record<string, unknown> {
  const { control: _replaced, ...rest } = source;
  return {
    ...rest,
    ...(floor == null
      ? {}
      : { control: { launcher: { version: { min: floor.min, ...(floor.url == null ? {} : { url: floor.url }) } } } }),
    rollback: provenance,
  };
}

export async function planLatestRollback(
  storage: StorageConfig,
  options: RollbackOptions,
): Promise<RollbackPlan> {
  const descriptor = releaseChannelDescriptor(options.channel);
  const channel = descriptor.channel;
  const versionField = descriptor.releaseVersionField;
  const storagePrefix = descriptor.storagePrefix;
  const latestPrefix = `${storagePrefix}/latest`;
  const latestKey = `${latestPrefix}/metadata.json`;

  // The live pointer must be exactly what the operator thinks it is. If a
  // release landed between the decision and the dispatch, the version they
  // meant to retract is no longer the one being replaced.
  const latestObject = await getStorageObject({ ...storage, objectKey: latestKey });
  if (latestObject == null) {
    throw new Error(`${channel} has no published ${latestKey} to roll back`);
  }
  const currentVersion = stringField(parseJsonObject(latestObject.text, latestKey), versionField, latestKey);
  if (currentVersion !== options.fromVersion) {
    throw new Error(
      `${channel} latest currently serves ${currentVersion}, not the expected ${options.fromVersion}; refusing to roll back a pointer that moved`,
    );
  }

  const direction = compareLauncherVersions(options.toVersion, currentVersion);
  if (direction === 0) {
    throw new Error(`${channel} latest already serves ${options.toVersion}`);
  }
  if (direction > 0 && options.allowForward !== true) {
    throw new Error(
      `${options.toVersion} is newer than the live ${currentVersion}; moving a channel forward is the release workflow's job, not a rollback`,
    );
  }

  const { metadata, versionPrefix } = await readPublishedVersion(storage, storagePrefix, options.toVersion);
  const targets = assertRollbackTargetIsComplete(metadata, {
    channel,
    version: options.toVersion,
    versionField,
    versionPrefix,
  });

  // A floor above the rollback target would leave every client being told to
  // reinstall an outer package the release it is being pointed at cannot
  // satisfy. Refuse rather than publish an unsatisfiable pointer.
  const floor = resolveLauncherVersionFloor(channel);
  if (floor != null) {
    assertLauncherVersionFloorSatisfiable(floor, options.toVersion);
  }

  // Keyed by destination so two targets that share one updater feed resolve the
  // same way publish-metadata.ts resolves them: last writer wins.
  const staged = new Map<string, RollbackObject>();
  for (const target of targets) {
    const manifestKey = `${versionPrefix}/platforms/${target}.json`;
    const manifestObject = await getStorageObject({ ...storage, objectKey: manifestKey });
    if (manifestObject == null) {
      throw new Error(`published ${options.toVersion} is missing ${manifestKey}`);
    }
    const manifest = parseJsonObject(manifestObject.text, manifestKey) as PlatformManifest;
    if (
      manifest.channel !== channel
      || manifest.releaseVersion !== options.toVersion
      || manifest.platformKey !== target
      || manifest.status !== "published"
    ) {
      throw new Error(`${manifestKey} does not describe a published ${channel} ${options.toVersion} ${target}`);
    }
    staged.set(`${latestPrefix}/platforms/${target}.json`, {
      bytes: manifestObject.bytes,
      contentType: contentType("platforms.json"),
      source: manifestKey,
      targetKey: `${latestPrefix}/platforms/${target}.json`,
    });

    const feedName = manifest.feed?.name;
    if (typeof feedName !== "string" || feedName.length === 0) continue;
    const feedKey = `${versionPrefix}/${feedName}`;
    const feedObject = await getStorageObject({ ...storage, objectKey: feedKey });
    if (feedObject == null) {
      throw new Error(`published ${options.toVersion} is missing updater feed ${feedKey}`);
    }
    staged.set(`${latestPrefix}/${feedName}`, {
      bytes: feedObject.bytes,
      contentType: contentType(feedName),
      source: feedKey,
      targetKey: `${latestPrefix}/${feedName}`,
    });
  }

  const provenance: RollbackProvenance = {
    at: (options.now ?? new Date()).toISOString(),
    from: currentVersion,
    ...(options.github == null ? {} : { github: options.github }),
    to: options.toVersion,
  };
  const rewritten = rollbackLatestMetadata(metadata, floor, provenance);

  return {
    channel,
    fromVersion: currentVersion,
    latestPrefix,
    // metadata.json goes last on purpose. It is the object the desktop updater
    // reads to pick a version, so until it flips clients keep seeing the state
    // they already had; once it flips, every artifact underneath it is already
    // the rolled-back one. The reverse order would publish a window in which
    // latest advertises one version and serves another's feeds.
    objects: [
      ...staged.values(),
      {
        bytes: Buffer.from(`${JSON.stringify(rewritten, null, 2)}\n`, "utf8"),
        contentType: contentType("metadata.json"),
        source: `${versionPrefix}/metadata.json (control re-resolved, rollback provenance added)`,
        targetKey: latestKey,
      },
    ],
    targets,
    toVersion: options.toVersion,
    versionPrefix,
  };
}

export async function applyLatestRollback(storage: StorageConfig, plan: RollbackPlan): Promise<void> {
  for (const object of plan.objects) {
    await putStorageObject({
      ...storage,
      body: object.bytes,
      cacheControl: LATEST_CACHE_CONTROL,
      contentType: object.contentType,
      objectKey: object.targetKey,
    });
    console.log(`rolled back ${object.targetKey} <- ${object.source}`);
  }
}

/**
 * Read every object back from the origin and compare bytes. A PUT that returns
 * 200 to the wrong key, or a partial write, would otherwise leave `latest`
 * mixing two releases and still look like a green run.
 */
export async function verifyLatestRollback(storage: StorageConfig, plan: RollbackPlan): Promise<void> {
  for (const object of plan.objects) {
    const readBack = await getStorageObject({ ...storage, objectKey: object.targetKey });
    if (readBack == null) {
      throw new Error(`rolled back object is missing after the write: ${object.targetKey}`);
    }
    if (!readBack.bytes.equals(object.bytes)) {
      throw new Error(`rolled back object does not match what was written: ${object.targetKey}`);
    }
  }
}

/**
 * The origin can be correct while the edge still serves the retracted release,
 * so confirm through the public URL clients actually fetch.
 */
export async function verifyPublicLatest(
  publicOrigin: string,
  plan: RollbackPlan,
  cacheBuster: string,
): Promise<void> {
  const url = `${publicUrl(publicOrigin, plan.latestPrefix, "metadata.json")}?rollback=${encodeURIComponent(cacheBuster)}`;
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) {
    throw new Error(`public latest metadata fetch failed with HTTP ${response.status}: ${url}`);
  }
  const metadata = parseJsonObject(await response.text(), url);
  const descriptor = releaseChannelDescriptor(plan.channel);
  const served = stringField(metadata, descriptor.releaseVersionField, url);
  if (served !== plan.toVersion) {
    throw new Error(`public latest metadata still serves ${served}, expected ${plan.toVersion}`);
  }
}

function summaryMarkdown(plan: RollbackPlan, dryRun: boolean): string {
  const heading = dryRun ? "Rollback plan (dry run — nothing was written)" : "Rolled back";
  const lines = [
    `## ${heading}`,
    "",
    `- Channel: \`${plan.channel}\``,
    `- \`latest\` moved: \`${plan.fromVersion}\` → \`${plan.toVersion}\``,
    `- Restored from: \`${plan.versionPrefix}\``,
    `- Platforms: ${plan.targets.map((target) => `\`${target}\``).join(", ")}`,
    "",
    "| Object | Source |",
    "| --- | --- |",
    ...plan.objects.map((object) => `| \`${object.targetKey}\` | \`${object.source}\` |`),
    "",
    "Clients already running the retracted version are **not** brought back: the",
    "updater never offers a version that is not strictly newer than the running",
    "one. This stops the rollout; recovering those installs needs a roll-forward",
    "patch release.",
  ];
  return lines.join("\n");
}

export async function rollbackLatestFromEnv(): Promise<void> {
  const channel = required("RELEASE_CHANNEL");
  const toVersion = required("RELEASE_ROLLBACK_TO_VERSION");
  const fromVersion = required("RELEASE_ROLLBACK_FROM_VERSION");
  const allowForward = optional("RELEASE_ROLLBACK_ALLOW_FORWARD") === "true";
  const dryRun = optional("RELEASE_DRY_RUN") === "true";
  const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
  const outputsPath = optional("RELEASE_OUTPUTS_PATH");
  const summaryPath = optional("RELEASE_SUMMARY_PATH");
  const storage = storageConfigFromEnv();

  const plan = await planLatestRollback(storage, {
    allowForward,
    channel,
    fromVersion,
    github: githubInfo(),
    toVersion,
  });

  if (dryRun) {
    for (const object of plan.objects) {
      console.log(`[dry-run] would write ${object.targetKey} (${object.bytes.length} bytes) <- ${object.source}`);
    }
    console.log(`[dry-run] ${plan.channel} latest would move ${plan.fromVersion} -> ${plan.toVersion}`);
  } else {
    await applyLatestRollback(storage, plan);
    await verifyLatestRollback(storage, plan);
    await verifyPublicLatest(publicOrigin, plan, optional("RELEASE_RUN_ID", "local"));
    console.log(`${plan.channel} latest now serves ${plan.toVersion} (was ${plan.fromVersion})`);
  }

  if (outputsPath.length > 0) {
    writeJson(outputsPath, {
      channel: plan.channel,
      dry_run: String(dryRun),
      from_version: plan.fromVersion,
      latest_metadata_url: publicUrl(publicOrigin, plan.latestPrefix, "metadata.json"),
      object_count: String(plan.objects.length),
      rolled_back: String(!dryRun),
      targets: plan.targets.join(","),
      to_version: plan.toVersion,
      version_prefix: plan.versionPrefix,
    });
  }
  if (summaryPath.length > 0) {
    writeText(summaryPath, summaryMarkdown(plan, dryRun));
  }
}
