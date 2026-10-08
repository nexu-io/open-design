import { contentType } from "./common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

const POINTER_CACHE_CONTROL = "public, max-age=60";
const MAX_VERSION_PROBE = 100;
export const DSH_BOOTSTRAP_POINTER_KEY = "bootstrap/dsh/latest.json";

export type DshBootstrapLatestPointer = {
  files: Record<string, string>;
  github: Record<string, unknown>;
  publishedAt: string;
  version: string;
};

export type DshBootstrapChecksumsForVersion = Buffer | ((version: string) => Buffer);

function checksumsForVersion(
  checksums: DshBootstrapChecksumsForVersion,
  version: string,
): Buffer {
  return typeof checksums === "function" ? checksums(version) : checksums;
}

function versionNumber(version: string): number {
  const match = /^v([1-9]\d*)$/.exec(version);
  if (match == null) {
    throw new Error(`DeepSeek Harness bootstrap version must look like v1 or v2; got ${version}`);
  }
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`DeepSeek Harness bootstrap version is too large: ${version}`);
  }
  return number;
}

function parseLatestPointer(text: string): DshBootstrapLatestPointer {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new Error(
      `DeepSeek Harness bootstrap latest pointer is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (value == null || typeof value !== "object") {
    throw new Error("DeepSeek Harness bootstrap latest pointer must be an object");
  }
  const pointer = value as DshBootstrapLatestPointer;
  versionNumber(pointer.version);
  return pointer;
}

/**
 * Resolve installer bytes to the current version or to a version newer than
 * latest. Historical bytes must never reuse an older version: latest.json is
 * monotonic, so an intentional content revert needs a fresh version that can
 * move the pointer forward.
 */
export async function resolveDshBootstrapVersion(
  storage: StorageConfig,
  checksums: DshBootstrapChecksumsForVersion,
): Promise<string> {
  const latestObject = await getStorageObject({
    ...storage,
    objectKey: DSH_BOOTSTRAP_POINTER_KEY,
  });
  let firstCandidate = 1;

  if (latestObject != null) {
    const latest = parseLatestPointer(latestObject.text);
    const latestNumber = versionNumber(latest.version);
    const latestChecksums = await getStorageObject({
      ...storage,
      objectKey: `bootstrap/dsh/${latest.version}/SHA256SUMS`,
    });
    if (latestChecksums == null) {
      throw new Error(
        `DeepSeek Harness bootstrap latest pointer references missing ${latest.version}/SHA256SUMS`,
      );
    }
    if (latestChecksums.bytes.equals(checksumsForVersion(checksums, latest.version))) {
      console.log(`reusing current immutable bootstrap version ${latest.version}`);
      return latest.version;
    }
    firstCandidate = latestNumber + 1;
  }

  for (let offset = 0; offset < MAX_VERSION_PROBE; offset += 1) {
    const candidate = firstCandidate + offset;
    if (!Number.isSafeInteger(candidate)) {
      throw new Error("DeepSeek Harness bootstrap version exceeds the safe integer range");
    }
    const version = `v${candidate}`;
    const published = await getStorageObject({
      ...storage,
      objectKey: `bootstrap/dsh/${version}/SHA256SUMS`,
    });
    if (published == null) {
      console.log(`minting new immutable bootstrap version ${version}`);
      return version;
    }
    if (published.bytes.equals(checksumsForVersion(checksums, version))) {
      console.log(`reusing unpublished immutable bootstrap version ${version}`);
      return version;
    }
  }

  throw new Error(
    `no free DeepSeek Harness bootstrap version in the ${MAX_VERSION_PROBE} slots starting at v${firstCandidate}`,
  );
}

/**
 * Move latest.json forward by immutable bootstrap version. The conditional PUT
 * prevents concurrent publishers from winning with a stale read, while the
 * version comparison prevents a rerun that reused older installer bytes from
 * rewinding the pointer after a newer version has shipped.
 */
export async function updateDshBootstrapLatestPointer(
  storage: StorageConfig,
  pointer: DshBootstrapLatestPointer,
): Promise<boolean> {
  const candidateVersion = versionNumber(pointer.version);
  const body = Buffer.from(`${JSON.stringify(pointer, null, 2)}\n`, "utf8");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const currentObject = await getStorageObject({
      ...storage,
      objectKey: DSH_BOOTSTRAP_POINTER_KEY,
    });
    const headers: Record<string, string> = {};
    if (currentObject == null) {
      headers["if-none-match"] = "*";
    } else {
      const current = parseLatestPointer(currentObject.text);
      if (versionNumber(current.version) >= candidateVersion) {
        return false;
      }
      if (!currentObject.etag) {
        throw new Error(
          "DeepSeek Harness bootstrap latest pointer GET did not return an ETag for CAS update",
        );
      }
      headers["if-match"] = currentObject.etag;
    }

    const result = await putStorageObjectWithStatus({
      ...storage,
      body,
      cacheControl: POINTER_CACHE_CONTROL,
      contentType: contentType("latest.json"),
      headers,
      objectKey: DSH_BOOTSTRAP_POINTER_KEY,
    });
    if (result.ok) return true;
    if (result.status !== 412) {
      throw new Error(
        `DeepSeek Harness bootstrap latest pointer PUT failed with HTTP ${result.status}${result.body.length > 0 ? `: ${result.body}` : ""}`,
      );
    }
    console.log(
      `DeepSeek Harness bootstrap latest pointer CAS conflict on attempt ${attempt}; retrying`,
    );
  }

  throw new Error("failed to update DeepSeek Harness bootstrap latest pointer after 5 CAS attempts");
}
