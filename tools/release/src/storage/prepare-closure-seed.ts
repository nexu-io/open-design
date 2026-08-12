import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  resolveClosureDistributionTarget,
  validateClosureDistributionManifest,
  type ClosureDigest,
  type ClosureDistributionBlob,
  type ClosureDistributionManifest,
} from "@open-design/closure-proto";
import { parseReleaseVersion, type ReleaseChannel } from "@open-design/release";

type ClosureSeedMode = "metadata" | "required";

export type PrepareClosureSeedOptions = Readonly<{
  channel: ReleaseChannel;
  manifestPath: string;
  mode: ClosureSeedMode;
  outputRoot: string;
  releaseVersion: string;
  sourceBlobRoot?: string;
  target: string;
}>;

export type PreparedClosureSeed = Readonly<{
  copiedBlobs: readonly ClosureDigest[];
  indexPath: string;
  manifest: ClosureDistributionManifest;
  outputRoot: string;
}>;

function sha256Canonical(value: string): ClosureDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function copyVerifiedBlob(
  source: string,
  target: string,
  artifact: ClosureDistributionBlob,
): Promise<void> {
  const before = await stat(source);
  if (!before.isFile() || before.size !== artifact.size) {
    throw new Error(`Closure seed source size does not match ${artifact.digest}`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(source)) hash.update(chunk as Buffer);
  if (`sha256:${hash.digest("hex")}` !== artifact.digest) {
    throw new Error(`Closure seed source digest does not match ${artifact.digest}`);
  }
  await copyFile(source, target);
}

export async function prepareClosureSeed(
  input: PrepareClosureSeedOptions,
): Promise<PreparedClosureSeed> {
  parseReleaseVersion(input.releaseVersion, input.channel);
  const manifest = validateClosureDistributionManifest(
    JSON.parse(await readFile(input.manifestPath, "utf8")) as unknown,
    sha256Canonical,
  );
  if (manifest.identity.channel !== input.channel) {
    throw new Error("Closure seed manifest channel does not match its release");
  }
  const target = resolveClosureDistributionTarget(manifest, input.target);
  const outputRoot = resolve(input.outputRoot);
  const channelRoot = join(outputRoot, input.channel);
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(join(channelRoot, "blobs"), { recursive: true });
  const copiedBlobs: ClosureDigest[] = [];
  if (input.mode === "required") {
    if (input.sourceBlobRoot == null) {
      throw new Error("required Closure seed mode needs --source-blob-dir");
    }
    for (const artifact of target.requiredBlobs) {
      const digest = artifact.digest.slice("sha256:".length);
      await copyVerifiedBlob(
        join(input.sourceBlobRoot, digest),
        join(channelRoot, "blobs", digest),
        artifact,
      );
      copiedBlobs.push(artifact.digest);
    }
  }
  const indexPath = join(channelRoot, "baseline.json");
  await writeFile(indexPath, `${JSON.stringify({
    channel: input.channel,
    closure: manifest,
    releaseState: "complete",
    releaseVersion: input.releaseVersion,
  }, null, 2)}\n`, "utf8");
  return Object.freeze({
    copiedBlobs: Object.freeze(copiedBlobs.sort()),
    indexPath,
    manifest,
    outputRoot,
  });
}
