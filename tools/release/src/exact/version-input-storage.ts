import { storageConfigFromEnv } from "../storage/common.ts";
import { requestStorageObject } from "../storage/s3-upload.ts";
import type { ReleasePolicyReceipt } from "../policy/release-profile.ts";
import { canonicalBytes, type JsonObject } from "./control-common.ts";
import type { VersionInputStore } from "./version-input.ts";

/** Version preparation is an immutable release object, not a workload result.
 * Use authenticated origin reads, including on retry, never a cached latest URL. */
export function versionInputStorage(policy: ReleasePolicyReceipt): VersionInputStore {
  const storage = storageConfigFromEnv();
  if (storage.bucket !== policy.target.bucket || storage.endpointUrl.replace(/\/$/u, "") !== policy.target.endpointUrl.replace(/\/$/u, "")) {
    throw new Error("Version input storage differs from release policy");
  }
  const objectKey = `${policy.channel}/${policy.releaseVersion}/version-input.json`;
  const read = async () => {
    const response = await requestStorageObject(storage, objectKey, { method: "GET" });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Version input read failed (${response.status})`);
    return await response.json() as JsonObject;
  };
  return { read, create: async snapshot => {
    const bytes = canonicalBytes(snapshot);
    const response = await requestStorageObject(storage, objectKey, { method: "PUT", body: bytes,
      headers: { "If-None-Match": "*", "Content-Type": "application/json", "Cache-Control": "public, max-age=31536000, immutable" } });
    if (![200, 201, 412].includes(response.status)) throw new Error(`Version input freeze failed (${response.status})`);
    const stored = await read();
    if (stored == null || !canonicalBytes(stored).equals(bytes)) throw new Error("Immutable version input collision or readback mismatch");
  } };
}
