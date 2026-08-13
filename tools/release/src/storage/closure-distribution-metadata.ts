import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  validateClosureDistributionManifest,
  type ClosureDistributionManifest,
} from "@open-design/closure/protocol";
import {
  compareReleaseVersions,
  parseReleaseVersion,
  releaseClosureBlobObjectKey,
  type ReleaseChannel,
} from "@open-design/release";

function digestCanonical(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function expectedBlobUrl(
  publicOrigin: string,
  channel: ReleaseChannel,
  releaseVersion: string,
  digest: `sha256:${string}`,
): string {
  const base = new URL(publicOrigin);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return new URL(releaseClosureBlobObjectKey(channel, releaseVersion, digest), base).toString();
}

/** Validate the sole version-wide graph before it becomes release truth. */
export function validateClosureDistributionPublication(input: Readonly<{
  channel: ReleaseChannel;
  expectedTargets: readonly string[];
  publicOrigin: string;
  releaseVersion: string;
  selectedShells?: readonly Readonly<{ type: string; version: string }>[];
  value: unknown;
}>): ClosureDistributionManifest {
  const manifest = validateClosureDistributionManifest(input.value, digestCanonical);
  if (manifest.identity.channel !== input.channel) {
    throw new Error(
      `Closure distribution channel ${manifest.identity.channel} does not match ${input.channel}`,
    );
  }
  parseReleaseVersion(manifest.identity.version, input.channel);
  if (manifest.identity.version !== input.releaseVersion) {
    throw new Error(
      `Closure distribution version ${manifest.identity.version} does not match release ${input.releaseVersion}`,
    );
  }
  for (const [type, compatibility] of Object.entries(manifest.compatibility.shell)) {
    try {
      parseReleaseVersion(compatibility.version.min, input.channel);
    } catch {
      throw new Error(
        `Closure distribution ${type} minVersion is invalid for ${input.channel}: ${compatibility.version.min}`,
      );
    }
  }
  for (const shell of input.selectedShells ?? []) {
    const floor = manifest.compatibility.shell[shell.type]?.version.min;
    if (floor == null) {
      throw new Error(`Closure distribution does not declare ${shell.type} Shell compatibility`);
    }
    parseReleaseVersion(shell.version, input.channel);
    if (compareReleaseVersions(floor, shell.version, input.channel) > 0) {
      throw new Error(
        `Closure distribution ${shell.type} minVersion ${floor} exceeds selected Shell ${shell.version}`,
      );
    }
  }
  for (const target of input.expectedTargets) {
    if (manifest.required.targets[target] == null) {
      throw new Error(`Closure distribution is missing enabled target ${target}`);
    }
  }
  for (const artifact of Object.values(manifest.blobs)) {
    const expected = expectedBlobUrl(
      input.publicOrigin,
      input.channel,
      input.releaseVersion,
      artifact.digest,
    );
    if (artifact.url !== expected) {
      throw new Error(
        `Closure distribution blob ${artifact.digest} URL must be ${expected}; got ${artifact.url}`,
      );
    }
  }
  return manifest;
}

export function readClosureDistributionPublication(input: Readonly<{
  channel: ReleaseChannel;
  expectedTargets: readonly string[];
  path: string;
  publicOrigin: string;
  releaseVersion: string;
  selectedShells?: readonly Readonly<{ type: string; version: string }>[];
}>): ClosureDistributionManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(input.path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`failed to read Closure distribution manifest ${input.path}`, { cause: error });
  }
  return validateClosureDistributionPublication({
    channel: input.channel,
    expectedTargets: input.expectedTargets,
    publicOrigin: input.publicOrigin,
    releaseVersion: input.releaseVersion,
    selectedShells: input.selectedShells,
    value,
  });
}
