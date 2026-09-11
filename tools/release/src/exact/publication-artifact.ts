import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ReleasePolicyReceipt } from "../policy/release-profile.ts";
import { checkedFile, type JsonObject } from "./control-common.ts";
import { releaseObjects } from "./release-object.ts";

/** A reference to final version bytes, not a transport/cache location. The
 * receiving process authenticates the object at the policy-bound origin. */
export type PublishedArtifact = Readonly<{
  schemaVersion: 1; channel: string; releaseVersion: string; sourceCommit: string;
  name: string; sha256: string; size: number;
}>;

export async function publishArtifact(policy: ReleasePolicyReceipt, descriptor: JsonObject, file?: string): Promise<PublishedArtifact> {
  if (!policy.capabilities.includes("publish")) throw new Error("Release policy does not permit publish");
  const path = await checkedFile(descriptor, "Publication artifact", file), name = basename(path);
  const bytes = await readFile(path);
  await releaseObjects(policy).create(name, bytes, descriptor.mediaType ?? "application/octet-stream");
  return { schemaVersion: 1, channel: policy.channel, releaseVersion: policy.releaseVersion,
    sourceCommit: policy.sourceCommit, name, sha256: descriptor.sha256, size: descriptor.size };
}

export async function verifyPublishedArtifact(policy: ReleasePolicyReceipt, descriptor: JsonObject) {
  const reference = descriptor.publication as PublishedArtifact | undefined;
  if (reference == null || reference.schemaVersion !== 1 || reference.channel !== policy.channel
    || reference.releaseVersion !== policy.releaseVersion || reference.sourceCommit !== policy.sourceCommit
    || typeof reference.name !== "string" || reference.name !== basename(String(descriptor.file))
    || /[\\/\0]/u.test(reference.name) || ["", ".", ".."].includes(reference.name)
    || reference.sha256 !== descriptor.sha256 || reference.size !== descriptor.size) {
    throw new Error("Invalid published artifact binding");
  }
  return releaseObjects(policy).verify(reference.name, reference);
}
