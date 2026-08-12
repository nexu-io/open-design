import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  validateClosureDistributionManifest,
  type ClosureDistributionBlob,
} from "@open-design/closure-proto";
import { releaseChannelFromVersion } from "@open-design/release";
import { compareStandaloneVersions } from "@open-design/standalone-proto";

import { hashPath } from "./cache.js";
import type { ToolPackConfig } from "./config.js";

export type StandaloneSeedInspection = Readonly<{
  channel: string;
  digest: `sha256:${string}`;
  presentBlobs: readonly `sha256:${string}`[];
  releaseVersion: string;
  standaloneVersion: string;
  target: string;
}>;

function sha256Canonical(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function targetForConfig(config: ToolPackConfig): string {
  if (config.platform === "win") return "win32-x64";
  if (process.arch === "arm64") return "darwin-arm64";
  if (process.arch === "x64") return "darwin-x64";
  throw new Error(`Standalone seed is unsupported on macOS ${process.arch}`);
}

async function inspectBlob(path: string, artifact: ClosureDistributionBlob): Promise<void> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size !== artifact.size) {
    throw new Error(`Standalone seed blob size does not match ${artifact.digest}`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  if (`sha256:${hash.digest("hex")}` !== artifact.digest) {
    throw new Error(`Standalone seed blob digest does not match ${artifact.digest}`);
  }
}

export async function inspectStandaloneSeed(
  config: ToolPackConfig,
): Promise<StandaloneSeedInspection | null> {
  const root = config.standaloneSeedRoot;
  if (root == null) return null;
  const rootMetadata = await lstat(root).catch(() => null);
  if (rootMetadata == null || rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error("Standalone seed root must be a regular directory");
  }
  const channel = releaseChannelFromVersion(config.releaseVersion);
  if (channel == null) throw new Error("Standalone seed requires a channel release version");
  const shellVersion = config.shellVersion;
  if (shellVersion == null) throw new Error("Standalone seed requires an explicit Shell version");
  const target = targetForConfig(config);
  const channelRoot = join(root, channel);
  const indexBytes = await readFile(join(channelRoot, "baseline.json"));
  if (indexBytes.byteLength > 4 * 1024 * 1024) throw new Error("Standalone seed baseline index exceeds 4 MiB");
  const index = JSON.parse(indexBytes.toString("utf8")) as Record<string, unknown>;
  if (index.channel !== channel || index.releaseState !== "complete" || typeof index.releaseVersion !== "string") {
    throw new Error("Standalone seed baseline index does not match the Shell channel");
  }
  const manifest = validateClosureDistributionManifest(index.closure, sha256Canonical);
  if (manifest.identity.channel !== channel || manifest.required.targets[target] == null) {
    throw new Error(`Standalone seed does not contain ${channel}/${target}`);
  }
  const minimum = manifest.compatibility.shell[config.shell]?.version.min;
  if (minimum == null || compareStandaloneVersions(shellVersion, minimum) < 0) {
    throw new Error(`Standalone seed is incompatible with ${config.shell} Shell ${shellVersion}`);
  }
  const blobsRoot = join(channelRoot, "blobs");
  const blobNames = await readdir(blobsRoot).catch(() => []);
  const presentBlobs: `sha256:${string}`[] = [];
  for (const name of blobNames.sort()) {
    if (!/^[0-9a-f]{64}$/u.test(name)) throw new Error(`Standalone seed blob name is invalid: ${name}`);
    const digest = `sha256:${name}` as const;
    const artifact = manifest.blobs[digest];
    if (artifact == null) throw new Error(`Standalone seed contains an unlocked blob: ${digest}`);
    await inspectBlob(join(blobsRoot, name), artifact);
    presentBlobs.push(digest);
  }
  return Object.freeze({
    channel,
    digest: `sha256:${await hashPath(root)}`,
    presentBlobs: Object.freeze(presentBlobs),
    releaseVersion: index.releaseVersion,
    standaloneVersion: manifest.identity.version,
    target,
  });
}
