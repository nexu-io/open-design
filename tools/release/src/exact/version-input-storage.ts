import type { ReleasePolicyReceipt } from "../policy/release-profile.ts";
import { canonicalBytes, type JsonObject } from "./control-common.ts";
import type { VersionInputStore } from "./version-input.ts";
import { releaseObjects } from "./release-object.ts";

/** Version preparation is an immutable release object, not a workload result.
 * Use authenticated origin reads, including on retry, never a cached latest URL. */
export function versionInputStorage(policy: ReleasePolicyReceipt): VersionInputStore {
  const objects = releaseObjects(policy), name = "version-input.json";
  return { read: async () => {
    const bytes = await objects.read(name);
    return bytes == null ? undefined : JSON.parse(bytes.toString("utf8")) as JsonObject;
  }, create: snapshot => objects.create(name, canonicalBytes(snapshot), "application/json") };
}
