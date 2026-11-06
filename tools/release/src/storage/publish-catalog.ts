import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  catalogRecordCounts,
  catalogSnapshotPrefix,
  CATALOG_LATEST_KEY,
  type CatalogDocument,
  type CatalogLatestPointer,
} from "../catalog/schema.ts";
import { verifyCatalogChecksums } from "../catalog/pack.ts";
import { commitGeneration } from "../catalog/git-meta.ts";
import { resolveRepoRoot } from "../catalog/export-catalog.ts";
import { assertValidCatalogProvenance } from "../catalog/validate.ts";
import { contentType, githubInfo, optional, publicUrl, required, storageConfigFromEnv } from "./common.ts";
import {
  getStorageObject,
  putStorageObjectWithStatus,
  type StorageConfig,
} from "./s3-upload.ts";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const POINTER_CACHE_CONTROL = "public, max-age=60";
const DEFAULT_IMMUTABLE_PUBLISH_CONCURRENCY = 16;

export type PublishCatalogOptions = {
  stagingDir: string;
  sourceCommit: string;
  publicOrigin: string;
  storage: StorageConfig;
  sourceCommitGeneration: number;
  github?: Record<string, unknown>;
  /** Test/operations seam. Defaults to bounded parallel immutable uploads. */
  immutablePublishConcurrency?: number;
};

export type PublishCatalogResult = {
  prefix: string;
  bundleUrl: string;
  latestUrl: string;
  bundleSha256: string;
  reused: string[];
  uploaded: string[];
  latestUpdated: boolean;
};

function parseLatestPointer(text: string): CatalogLatestPointer {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new Error(
      `catalog latest pointer is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (value == null || typeof value !== "object") {
    throw new Error("catalog latest pointer must be an object");
  }
  const pointer = value as CatalogLatestPointer;
  if (!/^[0-9a-f]{40}$/i.test(pointer.sourceCommit ?? "")) {
    throw new Error("catalog latest pointer has an invalid sourceCommit");
  }
  if (
    typeof pointer.sourceCommittedAt !== "string" ||
    Number.isNaN(Date.parse(pointer.sourceCommittedAt))
  ) {
    throw new Error(
      "catalog latest pointer has no valid sourceCommittedAt; refusing an unsafe overwrite",
    );
  }
  if (!Number.isSafeInteger(pointer.sourceCommitGeneration) || pointer.sourceCommitGeneration < 1) {
    throw new Error(
      "catalog latest pointer has no valid sourceCommitGeneration; refusing an unsafe overwrite",
    );
  }
  return pointer;
}

async function updateLatestPointer(
  storage: StorageConfig,
  pointer: CatalogLatestPointer,
): Promise<boolean> {
  const body = Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const currentObject = await getStorageObject({ ...storage, objectKey: CATALOG_LATEST_KEY });
    const headers: Record<string, string> = {};
    if (currentObject == null) {
      headers["if-none-match"] = "*";
    } else {
      const current = parseLatestPointer(currentObject.text);
      if (current.sourceCommit === pointer.sourceCommit) {
        if (current.sha256 !== pointer.sha256 || current.bundleUrl !== pointer.bundleUrl) {
          throw new Error(
            `catalog latest pointer for ${pointer.sourceCommit} disagrees with immutable snapshot`,
          );
        }
        return false;
      }
      if (current.sourceCommitGeneration >= pointer.sourceCommitGeneration) {
        return false;
      }
      if (!currentObject.etag) {
        throw new Error("catalog latest pointer GET did not return an ETag for CAS update");
      }
      headers["if-match"] = currentObject.etag;
    }

    const result = await putStorageObjectWithStatus({
      ...storage,
      body,
      cacheControl: POINTER_CACHE_CONTROL,
      contentType: contentType("latest.json"),
      headers,
      objectKey: CATALOG_LATEST_KEY,
    });
    if (result.ok) return true;
    if (result.status !== 412) {
      throw new Error(
        `catalog latest pointer PUT failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`,
      );
    }
    console.log(
      `catalog latest pointer CAS conflict on attempt ${attempt} (etag=${headers["if-match"] ?? "none"}); retrying`,
    );
  }

  throw new Error("failed to update catalog latest pointer after 5 CAS attempts");
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (name === ".DS_Store") continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
    }
  }
  walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function publishImmutableObject(
  storage: StorageConfig,
  objectKey: string,
  body: Buffer,
  fileName: string,
): Promise<"uploaded" | "reused"> {
  const result = await putStorageObjectWithStatus({
    ...storage,
    body,
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    contentType: contentType(fileName),
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (result.ok) return "uploaded";
  if (result.status !== 412) {
    throw new Error(
      `PUT ${result.url} failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`,
    );
  }
  const existing = await getStorageObject({ ...storage, objectKey });
  if (existing == null) {
    throw new Error(`catalog object disappeared after immutable PUT conflict: ${objectKey}`);
  }
  if (!existing.bytes.equals(body)) {
    throw new Error(`immutable catalog object already exists with different content: ${objectKey}`);
  }
  return "reused";
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let failure: { error: unknown } | undefined;

  async function worker(): Promise<void> {
    while (failure == null) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      try {
        results[index] = await mapper(values[index]!, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failure != null) throw failure.error;
  return results;
}

/**
 * Publish a packed catalog snapshot under catalog/v1/<full-commit>/.
 * Updates catalog/v1/latest.json ONLY after every immutable object verifies.
 * Failures leave the previous latest.json untouched.
 */
export async function publishCatalogSnapshot(options: PublishCatalogOptions): Promise<PublishCatalogResult> {
  const stagingDir = resolve(options.stagingDir);
  const sourceCommit = options.sourceCommit.toLowerCase();
  const prefix = catalogSnapshotPrefix(sourceCommit);
  if (!Number.isSafeInteger(options.sourceCommitGeneration) || options.sourceCommitGeneration < 1) {
    throw new Error(`sourceCommitGeneration must be a positive integer; got ${options.sourceCommitGeneration}`);
  }
  const immutablePublishConcurrency =
    options.immutablePublishConcurrency ?? DEFAULT_IMMUTABLE_PUBLISH_CONCURRENCY;
  if (!Number.isSafeInteger(immutablePublishConcurrency) || immutablePublishConcurrency < 1) {
    throw new Error(
      `immutablePublishConcurrency must be a positive integer; got ${immutablePublishConcurrency}`,
    );
  }

  verifyCatalogChecksums(stagingDir);
  const catalog = JSON.parse(readFileSync(join(stagingDir, "catalog.json"), "utf8")) as CatalogDocument;
  if (catalog.sourceCommit.toLowerCase() !== sourceCommit) {
    throw new Error(
      `catalog sourceCommit ${catalog.sourceCommit} does not match publish sourceCommit ${sourceCommit}`,
    );
  }
  if (Number.isNaN(Date.parse(catalog.generatedAt))) {
    throw new Error(`catalog generatedAt is not a valid source commit timestamp: ${catalog.generatedAt}`);
  }

  const requiredNames = ["catalog.json", "provenance.json", "checksums.sha256", "bundle.tar.zst"];
  for (const name of requiredNames) {
    const full = join(stagingDir, name);
    if (!statSync(full).isFile()) {
      throw new Error(`cannot publish incomplete catalog snapshot: missing ${name}`);
    }
  }

  const localBundleDigest = createHash("sha256")
    .update(readFileSync(join(stagingDir, "bundle.tar.zst")))
    .digest("hex");
  const provenance: unknown = JSON.parse(readFileSync(join(stagingDir, "provenance.json"), "utf8"));
  assertValidCatalogProvenance(provenance, {
    sourceCommit,
    generatedAt: catalog.generatedAt,
    bundleSha256: localBundleDigest,
    recordCounts: catalogRecordCounts(catalog.records),
  });

  const files = walkFiles(stagingDir);
  const uploaded: string[] = [];
  const reused: string[] = [];

  // Publish every file under the immutable prefix first; never touch latest yet.
  // Bounded concurrency keeps same-commit reruns practical without flooding R2.
  const outcomes = await mapWithConcurrency(files, immutablePublishConcurrency, async (full) => {
    const rel = relative(stagingDir, full).split("\\").join("/");
    const body = readFileSync(full);
    const objectKey = `${prefix}/${rel}`;
    const outcome = await publishImmutableObject(options.storage, objectKey, body, rel);
    return { outcome, rel };
  });
  for (const { outcome, rel } of outcomes) {
    if (outcome === "uploaded") uploaded.push(rel);
    else reused.push(rel);
  }

  // Byte-verify required objects before moving the pointer.
  for (const name of requiredNames) {
    const objectKey = `${prefix}/${name}`;
    const local = readFileSync(join(stagingDir, name));
    const published = await getStorageObject({ ...options.storage, objectKey });
    if (published == null || !published.bytes.equals(local)) {
      throw new Error(`published catalog object failed byte-for-byte verification: ${objectKey}`);
    }
  }

  const publishedBundle = (
    await getStorageObject({ ...options.storage, objectKey: `${prefix}/bundle.tar.zst` })
  )!.bytes;
  const digest = createHash("sha256").update(publishedBundle).digest("hex");
  if (digest !== provenance.bundleSha256) {
    throw new Error(
      `provenance bundleSha256 ${provenance.bundleSha256} does not match published bundle ${digest}`,
    );
  }

  const bundleUrl = publicUrl(options.publicOrigin, prefix, "bundle.tar.zst");
  const pointer: CatalogLatestPointer = {
    schemaVersion: 1,
    sourceCommit,
    sourceCommittedAt: catalog.generatedAt,
    sourceCommitGeneration: options.sourceCommitGeneration,
    bundleUrl,
    sha256: digest,
    publishedAt: new Date().toISOString(),
    github: options.github ?? githubInfo(),
  };

  const latestUpdated = await updateLatestPointer(options.storage, pointer);

  const latestUrl = publicUrl(options.publicOrigin, "catalog/v1", "latest.json");
  console.log(bundleUrl);
  console.log(latestUrl);

  return {
    prefix,
    bundleUrl,
    latestUrl,
    bundleSha256: digest,
    reused,
    uploaded,
    latestUpdated,
  };
}

/** Env-driven entrypoint for `tools-release publish-catalog`. */
export async function publishCatalogFromEnv(): Promise<void> {
  const stagingDir = required("CATALOG_STAGING_DIR");
  const sourceCommit = required("CATALOG_SOURCE_COMMIT");
  const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
  const storage = storageConfigFromEnv();
  const generationOverride = optional("CATALOG_SOURCE_COMMIT_GENERATION");
  const sourceCommitGeneration = generationOverride.length > 0
    ? Number(generationOverride)
    : commitGeneration(resolveRepoRoot(), sourceCommit);
  if (!Number.isSafeInteger(sourceCommitGeneration) || sourceCommitGeneration < 1) {
    throw new Error(`CATALOG_SOURCE_COMMIT_GENERATION must be a positive integer; got ${generationOverride}`);
  }
  const result = await publishCatalogSnapshot({
    stagingDir,
    sourceCommit,
    publicOrigin,
    storage,
    sourceCommitGeneration,
    github: githubInfo(),
  });

  const githubOutput = optional("GITHUB_OUTPUT");
  if (githubOutput.length > 0) {
    appendFileSync(
      githubOutput,
      [
        `source_commit=${result.prefix.split("/").pop()}`,
        `bundle_url=${result.bundleUrl}`,
        `bundle_sha256=${result.bundleSha256}`,
        `latest_url=${result.latestUrl}`,
      ].join("\n") + "\n",
      "utf8",
    );
  }
}
