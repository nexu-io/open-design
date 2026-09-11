import { createHash } from "node:crypto";
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
  const verify = async (name: string, expected: Readonly<{ sha256: string; size: number }>) => {
    if (!/^[a-f0-9]{64}$/u.test(expected.sha256) || !Number.isSafeInteger(expected.size) || expected.size < 0) {
      throw new Error("Invalid release object digest descriptor");
    }
    const response = await requestStorageObject(storage, key(name), { method: "HEAD" });
    if (!response.ok || response.headers.get("x-amz-meta-sha256") !== expected.sha256
      || response.headers.get("content-length") !== String(expected.size)) {
      throw new Error("Published release object binding mismatch");
    }
    return { etag: response.headers.get("etag") ?? "" };
  };
  return { read, verify, create: async (name: string, bytes: Buffer, contentType: string) => {
    const response = await requestStorageObject(storage, key(name), { method: "PUT", body: bytes,
      headers: { "If-None-Match": "*", "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable",
        "x-amz-meta-sha256": createHash("sha256").update(bytes).digest("hex") } });
    if (![200, 201, 412].includes(response.status)) throw new Error(`Release object creation failed (${response.status})`);
    const stored = await read(name);
    if (stored == null || !stored.equals(bytes)) throw new Error("Immutable release object collision or readback mismatch");
  } };
}
