import { createHash } from "node:crypto";

import { parseReleaseVersion, releaseChannelDescriptor, type ReleaseChannel } from "@open-design/release";

export const RELEASE_CANDIDATE_SCHEMA_VERSION = 1 as const;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;

export type ReleaseCandidateSpec = Readonly<{
  amrProfile: string;
  channel: ReleaseChannel;
  closureMinShellVersion: string;
  commit: string;
  macArm64SignMode: string;
  macX64SignMode: string;
  releaseVersion: string;
  schemaVersion: typeof RELEASE_CANDIDATE_SCHEMA_VERSION;
  targets: readonly string[];
  winX64SignMode: string;
}>;

function token(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`candidate ${label} must be a non-empty trimmed string`);
  }
  return value;
}

export function validateReleaseCandidateSpec(value: unknown): ReleaseCandidateSpec {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("candidate spec must be an object");
  }
  const raw = value as Record<string, unknown>;
  const expectedKeys = [
    "amrProfile", "channel", "closureMinShellVersion", "commit", "macArm64SignMode",
    "macX64SignMode", "releaseVersion", "schemaVersion", "targets", "winX64SignMode",
  ];
  if (JSON.stringify(Object.keys(raw).sort()) !== JSON.stringify(expectedKeys.sort())) {
    throw new Error(`candidate spec fields must be exactly: ${expectedKeys.sort().join(", ")}`);
  }
  if (raw.schemaVersion !== RELEASE_CANDIDATE_SCHEMA_VERSION) {
    throw new Error(`unsupported candidate spec schemaVersion: ${String(raw.schemaVersion)}`);
  }
  const channel = releaseChannelDescriptor(token(raw.channel, "channel")).channel;
  const releaseVersion = token(raw.releaseVersion, "releaseVersion");
  parseReleaseVersion(releaseVersion, channel);
  if (!Array.isArray(raw.targets) || raw.targets.length === 0 || raw.targets.some((target) => typeof target !== "string")) {
    throw new Error("candidate targets must be a non-empty string array");
  }
  const targets = [...new Set(raw.targets.map((target) => token(target, "target")))].sort();
  if (targets.length !== raw.targets.length) throw new Error("candidate targets must be unique");
  return Object.freeze({
    amrProfile: token(raw.amrProfile, "amrProfile"),
    channel,
    closureMinShellVersion: token(raw.closureMinShellVersion, "closureMinShellVersion"),
    commit: token(raw.commit, "commit"),
    macArm64SignMode: token(raw.macArm64SignMode, "macArm64SignMode"),
    macX64SignMode: token(raw.macX64SignMode, "macX64SignMode"),
    releaseVersion,
    schemaVersion: RELEASE_CANDIDATE_SCHEMA_VERSION,
    targets: Object.freeze(targets),
    winX64SignMode: token(raw.winX64SignMode, "winX64SignMode"),
  });
}

export function releaseCandidateId(value: unknown): `sha256:${string}` {
  const spec = validateReleaseCandidateSpec(value);
  return `sha256:${createHash("sha256").update(JSON.stringify(spec)).digest("hex")}`;
}

export function validateReleaseCandidateId(value: string): `sha256:${string}` {
  if (!digestPattern.test(value)) throw new Error(`candidate id must be a lowercase sha256 digest: ${value}`);
  return value as `sha256:${string}`;
}

export function releaseCandidatePrefix(input: Readonly<{
  candidateId: string;
  channel: string;
  releaseVersion: string;
}>): string {
  const channel = releaseChannelDescriptor(input.channel).channel;
  parseReleaseVersion(input.releaseVersion, channel);
  const candidateId = validateReleaseCandidateId(input.candidateId);
  return `candidates/${channel}/${input.releaseVersion}/${candidateId.slice("sha256:".length)}`;
}
