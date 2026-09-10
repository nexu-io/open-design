import { storageConfigFromEnv } from "../storage/common.ts";
import { requestStorageObject } from "../storage/s3-upload.ts";
import type { ReleasePolicyReceipt } from "../policy/release-profile.ts";

/** Release-owned immutable objects. Workload cache policy and credentials never
 * enter this transport. Every write is create-only and checked at the origin. */
export function releaseObjects(policy: ReleasePolicyReceipt) {
  const storage = storageConfigFromEnv();
  if (storage.bucket !== policy.target.bucket || storage.endpointUrl.replace(/\/$/u, "") !== policy.target.endpointUrl.replace(/\/$/u, "")) {
    throw new Error("Release object storage differs from release policy");
  }
  const key = (name: string) => {
    if (!name || name.split("/").some(part => !part || part === "." || part === "..") || /[\\\0]/u.test(name)) throw new Error("Invalid release object name");
    return `${policy.channel}/${policy.releaseVersion}/${name}`;
  };
  const read = async (name: string) => {
    const response = await requestStorageObject(storage, key(name), { method: "GET" });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Release object read failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  };
  return { read, create: async (name: string, bytes: Buffer, contentType: string) => {
    const response = await requestStorageObject(storage, key(name), { method: "PUT", body: bytes,
      headers: { "If-None-Match": "*", "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" } });
    if (![200, 201, 412].includes(response.status)) throw new Error(`Release object creation failed (${response.status})`);
    const stored = await read(name);
    if (stored == null || !stored.equals(bytes)) throw new Error("Immutable release object collision or readback mismatch");
  } };
}
