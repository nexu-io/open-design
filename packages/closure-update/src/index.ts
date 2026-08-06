import {
  validateClosureCandidateManifest,
  type ClosureCandidateManifest,
} from "@open-design/closure-proto";
import type {
  ClosureAttemptDescriptor,
  ClosureRuntimeDescriptor,
} from "@open-design/closure-store";
import {
  compareReleaseVersions,
  isReleaseChannel,
  type ReleaseChannel,
} from "@open-design/release";

export type ClosureReleaseAssetUrls = {
  archive: string;
  inventory: string;
  manifest: string;
  provenance: string | null;
};

export type ClosureReleaseCandidate = {
  assets: ClosureReleaseAssetUrls;
  manifest: ClosureCandidateManifest;
  releaseTarget: string;
};

export type ClosureUpdateDecision =
  | {
      action: "activate";
      candidate: ClosureReleaseCandidate;
      reason: "newer-closure" | "no-active-closure";
    }
  | {
      action: "retain";
      candidate: ClosureReleaseCandidate;
      reason:
        | "already-active"
        | "candidate-not-newer"
        | "runtime-attempt-pending"
        | "shell-incompatible";
    };

export class ClosureUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureUpdateError";
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ClosureUpdateError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new ClosureUpdateError(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function requireHttpUrl(value: unknown, label: string): string {
  const normalized = requireString(value, label);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.toString();
  } catch {
    throw new ClosureUpdateError(`${label} must be an absolute http(s) URL`);
  }
}

function assetUrl(assets: Record<string, unknown>, name: string, required = true): string | null {
  const asset = assets[name];
  if (asset == null && !required) return null;
  const record = requireRecord(asset, `Closure ${name} asset`);
  return requireHttpUrl(record.url, `Closure ${name} asset URL`);
}

export function selectClosureReleaseCandidate(
  metadata: unknown,
  input: {
    channel: string;
    platform: string;
    releaseTarget: string;
  },
): ClosureReleaseCandidate {
  if (!isReleaseChannel(input.channel)) {
    throw new ClosureUpdateError(`unsupported Closure update channel: ${input.channel}`);
  }
  const root = requireRecord(metadata, "release metadata");
  if (root.channel !== input.channel) {
    throw new ClosureUpdateError(
      `release metadata channel ${String(root.channel)} does not match ${input.channel}`,
    );
  }
  if (root.releaseState !== "complete") {
    throw new ClosureUpdateError(`release metadata is not complete: ${String(root.releaseState)}`);
  }
  const releaseVersion = requireString(root.releaseVersion, "release metadata version");
  const targets = requireRecord(root.releaseTargets, "release metadata targets");
  const target = requireRecord(targets[input.releaseTarget], `release target ${input.releaseTarget}`);
  if (target.status !== "published" || target.enabled !== true) {
    throw new ClosureUpdateError(`release target ${input.releaseTarget} is not published and enabled`);
  }
  const closure = requireRecord(target.closure, `release target ${input.releaseTarget} Closure`);
  let manifest: ClosureCandidateManifest;
  try {
    manifest = validateClosureCandidateManifest(closure.manifest);
  } catch (error) {
    throw new ClosureUpdateError(
      `release target ${input.releaseTarget} Closure manifest is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (manifest.identity.channel !== input.channel) {
    throw new ClosureUpdateError("Closure candidate channel does not match its release metadata");
  }
  if (manifest.identity.platform !== input.platform) {
    throw new ClosureUpdateError(
      `Closure candidate platform ${manifest.identity.platform} does not match ${input.platform}`,
    );
  }
  if (manifest.identity.version !== releaseVersion) {
    throw new ClosureUpdateError("Closure candidate version does not match its release metadata");
  }
  const assets = requireRecord(closure.assets, "Closure release assets");
  const archive = assetUrl(assets, "archive")!;
  if (archive !== new URL(manifest.artifact.url).toString()) {
    throw new ClosureUpdateError("Closure archive asset URL does not match the candidate manifest");
  }
  return {
    assets: {
      archive,
      inventory: assetUrl(assets, "inventory")!,
      manifest: assetUrl(assets, "manifest")!,
      provenance: assetUrl(assets, "provenance", false),
    },
    manifest,
    releaseTarget: input.releaseTarget,
  };
}

type ComparableVersion = {
  core: readonly [number, number, number];
  prerelease: string[];
};

function comparableVersion(value: string): ComparableVersion {
  const normalized = value.trim().replace(/^v/iu, "").split("+", 1)[0] ?? "";
  const prereleaseSeparator = normalized.indexOf("-");
  const core = prereleaseSeparator === -1 ? normalized : normalized.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : normalized.slice(prereleaseSeparator + 1);
  const parts = core.split(".");
  const numbers = parts.map((part) => Number(part));
  if (
    parts.length !== 3
    || numbers.some((part) => !Number.isSafeInteger(part) || part < 0)
  ) {
    throw new ClosureUpdateError(`shell version is not comparable: ${value}`);
  }
  return {
    core: [numbers[0]!, numbers[1]!, numbers[2]!],
    prerelease: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/u.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/u.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

export function compareClosureShellVersions(left: string, right: string): number {
  const a = comparableVersion(left);
  const b = comparableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const comparison = Math.sign((a.core[index] ?? 0) - (b.core[index] ?? 0));
    if (comparison !== 0) return comparison;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    const comparison = compareIdentifier(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function decideClosureUpdate(input: {
  attempt: ClosureAttemptDescriptor | null;
  candidate: ClosureReleaseCandidate;
  runtime: ClosureRuntimeDescriptor;
  shellVersion: string;
}): ClosureUpdateDecision {
  const { candidate } = input;
  if (candidate.manifest.identity.channel !== input.runtime.channel) {
    throw new ClosureUpdateError("Closure candidate channel does not match the local Store");
  }
  if (input.attempt != null) {
    return { action: "retain", candidate, reason: "runtime-attempt-pending" };
  }
  if (
    compareClosureShellVersions(
      input.shellVersion,
      candidate.manifest.compatibility.shell.minVersion,
    ) < 0
  ) {
    return { action: "retain", candidate, reason: "shell-incompatible" };
  }
  const active = input.runtime.active;
  if (active == null) {
    return { action: "activate", candidate, reason: "no-active-closure" };
  }
  if (
    active.version === candidate.manifest.identity.version
    && active.digest === candidate.manifest.identity.digest
  ) {
    return { action: "retain", candidate, reason: "already-active" };
  }
  const channel = candidate.manifest.identity.channel as ReleaseChannel;
  const comparison = compareReleaseVersions(candidate.manifest.identity.version, active.version, channel);
  if (comparison === 0) {
    throw new ClosureUpdateError(
      `Closure version ${active.version} has conflicting immutable digests`,
    );
  }
  return comparison > 0
    ? { action: "activate", candidate, reason: "newer-closure" }
    : { action: "retain", candidate, reason: "candidate-not-newer" };
}
