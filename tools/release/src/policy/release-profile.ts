import { spawnSync } from "node:child_process";

import { parseReleaseBaseVersion, parseReleaseVersion } from "@open-design/release";

import { readObject, writeObject, type JsonObject } from "../exact/control-common.ts";

export const RELEASE_PROFILE_NAMES = Object.freeze([
  "exact-validation",
  "prerelease-distribution",
  "stable-distribution",
] as const);

export const RELEASE_CAPABILITIES = Object.freeze([
  "plan",
  "prepare",
  "finalize",
  "publish",
  "acceptance",
  "activate",
  "promote",
  "reuse",
] as const);

export type ReleaseProfileName = typeof RELEASE_PROFILE_NAMES[number];
export type ReleaseCapability = typeof RELEASE_CAPABILITIES[number];

type ReleaseSwitches = Readonly<{
  endUserDistribution: boolean;
  stableAuthorized: boolean;
}>;

export type ReleaseTarget = Readonly<{
  endpointUrl: string;
  bucket: string;
  latestChannelHeadUrl: string;
  publicBaseUrl: string;
}>;

export type ReleasePolicyRequest = Readonly<{
  schemaVersion: 1;
  operation: "release.policy.resolve";
  profile: ReleaseProfileName;
  channel: string;
  releaseVersion: string;
  sourceCommit: string;
  sourceRef: string;
  switches: ReleaseSwitches;
  target: ReleaseTarget;
}>;

export type ReleasePolicyReceipt = Readonly<{
  schemaVersion: 1;
  operation: "release.policy";
  profile: ReleaseProfileName;
  channel: string;
  releaseVersion: string;
  sourceCommit: string;
  sourceRef: string;
  capabilities: readonly ReleaseCapability[];
  switches: ReleaseSwitches;
  target: ReleaseTarget;
}>;

export type ReleaseAuthorizationReceipt = Readonly<{
  schemaVersion: 1;
  operation: "release.authorized";
  profile: ReleaseProfileName;
  capability: ReleaseCapability;
  channel: string;
  releaseVersion: string;
  sourceCommit: string;
}>;

export function releaseTargetsEqual(left: unknown, right: ReleaseTarget): boolean {
  if (left == null || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as JsonObject;
  return Object.keys(candidate).sort().join("\0") === ["bucket", "endpointUrl", "latestChannelHeadUrl", "publicBaseUrl"].sort().join("\0")
    && candidate.endpointUrl === right.endpointUrl
    && candidate.bucket === right.bucket
    && candidate.latestChannelHeadUrl === right.latestChannelHeadUrl
    && candidate.publicBaseUrl === right.publicBaseUrl;
}

const SHA = /^[0-9a-f]{40}$/u;
const RELEASE_REF = /^refs\/heads\/release\/v(\d+\.\d+\.\d+)$/u;
// Publication policy, not a restriction on the fossil metadata reader grammar.
const CUSTOM_CHANNEL = /^[a-z]{3,10}$/u;
const profileRegistry = Object.freeze({
  "exact-validation": Object.freeze({ channel: "betahyx", switches: Object.freeze({ endUserDistribution: false, stableAuthorized: false }) }),
  "prerelease-distribution": Object.freeze({ channel: "prerelease", switches: Object.freeze({ endUserDistribution: false, stableAuthorized: false }) }),
  "stable-distribution": Object.freeze({ channel: "stable", switches: Object.freeze({ endUserDistribution: true, stableAuthorized: true }) }),
} as const satisfies Record<ReleaseProfileName, Readonly<{ channel: string; switches: ReleaseSwitches }>>);

function object(value: unknown, label: string): JsonObject {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function exactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw new Error(`${label} fields are invalid`);
  }
}

function profileName(value: unknown): ReleaseProfileName {
  if (typeof value !== "string" || !RELEASE_PROFILE_NAMES.includes(value as ReleaseProfileName)) {
    throw new Error("release profile is unsupported");
  }
  return value as ReleaseProfileName;
}

function switches(value: unknown): ReleaseSwitches {
  const candidate = object(value, "release policy switches");
  exactKeys(candidate, ["endUserDistribution", "stableAuthorized"], "release policy switches");
  if (typeof candidate.endUserDistribution !== "boolean" || typeof candidate.stableAuthorized !== "boolean") {
    throw new Error("release policy switches must be boolean");
  }
  return Object.freeze({
    endUserDistribution: candidate.endUserDistribution,
    stableAuthorized: candidate.stableAuthorized,
  });
}

function releaseTarget(value: unknown, channel: string): ReleaseTarget {
  const candidate = object(value, "release policy target");
  exactKeys(candidate, ["bucket", "endpointUrl", "latestChannelHeadUrl", "publicBaseUrl"], "release policy target");
  if (typeof candidate.endpointUrl !== "string" || typeof candidate.bucket !== "string"
    || typeof candidate.latestChannelHeadUrl !== "string" || typeof candidate.publicBaseUrl !== "string") {
    throw new Error("release policy target fields must be strings");
  }
  let endpoint: URL;
  try { endpoint = new URL(candidate.endpointUrl); }
  catch { throw new Error("release policy target endpoint URL is invalid"); }
  const canonicalEndpointUrl = `${endpoint.origin}${endpoint.pathname === "/" ? "" : endpoint.pathname}`;
  if ((endpoint.protocol !== "https:" && endpoint.protocol !== "http:") || endpoint.username.length > 0
    || endpoint.password.length > 0 || endpoint.search.length > 0 || endpoint.hash.length > 0
    || canonicalEndpointUrl !== candidate.endpointUrl || candidate.endpointUrl.endsWith("/")) {
    throw new Error("release policy target endpoint URL is not canonical");
  }
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/u.test(candidate.bucket)) {
    throw new Error("release policy target bucket is invalid");
  }
  let publicBase: URL;
  try { publicBase = new URL(candidate.publicBaseUrl); }
  catch { throw new Error("release policy target public base URL is invalid"); }
  const canonicalPublicBaseUrl = `${publicBase.origin}${publicBase.pathname === "/" ? "" : publicBase.pathname}`;
  if ((publicBase.protocol !== "https:" && publicBase.protocol !== "http:") || publicBase.username.length > 0
    || publicBase.password.length > 0 || publicBase.search.length > 0 || publicBase.hash.length > 0
    || canonicalPublicBaseUrl !== candidate.publicBaseUrl || candidate.publicBaseUrl.endsWith("/")) {
    throw new Error("release policy target public base URL is not canonical");
  }
  const latestChannelHeadUrl = `${candidate.endpointUrl}/${candidate.bucket}/${channel}/latest/channel-head.json`;
  if (candidate.latestChannelHeadUrl !== latestChannelHeadUrl) {
    throw new Error("release policy latest channel head URL differs from its endpoint, bucket, or channel");
  }
  return Object.freeze({
    endpointUrl: candidate.endpointUrl,
    bucket: candidate.bucket,
    latestChannelHeadUrl,
    publicBaseUrl: candidate.publicBaseUrl,
  });
}

export function resolveReleasePolicy(value: unknown): ReleasePolicyReceipt {
  const request = object(value, "release policy request");
  exactKeys(request, ["channel", "operation", "profile", "releaseVersion", "schemaVersion", "sourceCommit", "sourceRef", "switches", "target"], "release policy request");
  if (request.schemaVersion !== 1 || request.operation !== "release.policy.resolve") throw new Error("release policy request schema or operation is unsupported");
  const profile = profileName(request.profile);
  const definition = profileRegistry[profile];
  if (typeof request.channel !== "string"
    || (request.channel !== "stable" && request.channel !== "prerelease" && !CUSTOM_CHANNEL.test(request.channel))) {
    throw new Error("custom release channel must contain 3–10 lowercase letters");
  }
  if (request.channel !== definition.channel) throw new Error(`${profile} does not permit channel ${String(request.channel)}`);
  if (typeof request.releaseVersion !== "string") throw new Error("release version must be a string");
  const parsedVersion = parseReleaseVersion(request.releaseVersion, definition.channel);
  const baseVersion = parseReleaseBaseVersion(parsedVersion.baseVersion);
  if (baseVersion == null || baseVersion.join(".") !== parsedVersion.baseVersion) {
    throw new Error("release version base exceeds the safe canonical integer boundary");
  }
  if (typeof request.sourceCommit !== "string" || !SHA.test(request.sourceCommit)) throw new Error("release source commit must be a full lowercase SHA");
  if (typeof request.sourceRef !== "string") throw new Error("release source ref must be a string");
  if (!request.sourceRef.startsWith("refs/heads/")
    || spawnSync("git", ["check-ref-format", request.sourceRef], { stdio: "ignore" }).status !== 0) {
    throw new Error("release source ref must be a valid refs/heads branch");
  }
  if (profile !== "exact-validation") {
    const match = RELEASE_REF.exec(request.sourceRef);
    if (match?.[1] !== parsedVersion.baseVersion) throw new Error(`${profile} requires the matching release/vX.Y.Z ref`);
  }
  const selected = switches(request.switches);
  if (selected.endUserDistribution !== definition.switches.endUserDistribution
    || selected.stableAuthorized !== definition.switches.stableAuthorized) {
    throw new Error(`${profile} switches do not match its tools-release policy`);
  }
  const target = releaseTarget(request.target, definition.channel);
  return Object.freeze({
    schemaVersion: 1,
    operation: "release.policy",
    profile,
    channel: definition.channel,
    releaseVersion: request.releaseVersion,
    sourceCommit: request.sourceCommit,
    sourceRef: request.sourceRef,
    capabilities: RELEASE_CAPABILITIES,
    switches: selected,
    target,
  });
}

export async function writeReleasePolicy(requestPath: string, receiptPath: string): Promise<void> {
  await writeObject(receiptPath, resolveReleasePolicy(await readObject(requestPath)));
}

export async function readReleasePolicyReceipt(
  path: unknown,
  expected: Readonly<{
    capability: ReleaseCapability;
    channel: string;
    releaseVersion: string;
    sourceCommit: string;
    target?: ReleaseTarget;
  }>,
): Promise<ReleasePolicyReceipt> {
  if (typeof path !== "string" || path.length === 0) throw new Error("release policy receipt is required");
  const receipt = await readObject(path);
  exactKeys(receipt, ["capabilities", "channel", "operation", "profile", "releaseVersion", "schemaVersion", "sourceCommit", "sourceRef", "switches", "target"], "release policy receipt");
  if (receipt.schemaVersion !== 1 || receipt.operation !== "release.policy" || !Array.isArray(receipt.capabilities)) {
    throw new Error("release policy receipt schema or operation is unsupported");
  }
  const resolved = resolveReleasePolicy({
    schemaVersion: 1,
    operation: "release.policy.resolve",
    profile: receipt.profile,
    channel: receipt.channel,
    releaseVersion: receipt.releaseVersion,
    sourceCommit: receipt.sourceCommit,
    sourceRef: receipt.sourceRef,
    switches: receipt.switches,
    target: receipt.target,
  });
  if (JSON.stringify(receipt.capabilities) !== JSON.stringify(resolved.capabilities)) throw new Error("release policy capability boundary differs from tools-release");
  for (const field of ["channel", "releaseVersion", "sourceCommit"] as const) {
    if (resolved[field] !== expected[field]) throw new Error(`release policy ${field} binding mismatch`);
  }
  if (expected.target != null && !releaseTargetsEqual(resolved.target, expected.target)) {
    throw new Error("release policy target binding mismatch");
  }
  if (!resolved.capabilities.includes(expected.capability)) throw new Error(`release policy does not permit ${expected.capability}`);
  return resolved;
}

export async function authorizeReleaseCapability(value: unknown): Promise<ReleaseAuthorizationReceipt> {
  const request = object(value, "release authorization request");
  exactKeys(request, ["capability", "channel", "operation", "policyReceipt", "releaseVersion", "schemaVersion", "sourceCommit"], "release authorization request");
  if (request.schemaVersion !== 1 || request.operation !== "release.authorize") {
    throw new Error("release authorization request schema or operation is unsupported");
  }
  if (typeof request.capability !== "string" || !RELEASE_CAPABILITIES.includes(request.capability as ReleaseCapability)) {
    throw new Error("release authorization capability is unsupported");
  }
  const capability = request.capability as ReleaseCapability;
  const policy = await readReleasePolicyReceipt(request.policyReceipt, {
    capability,
    channel: String(request.channel ?? ""),
    releaseVersion: String(request.releaseVersion ?? ""),
    sourceCommit: String(request.sourceCommit ?? ""),
  });
  return Object.freeze({
    schemaVersion: 1,
    operation: "release.authorized",
    profile: policy.profile,
    capability,
    channel: policy.channel,
    releaseVersion: policy.releaseVersion,
    sourceCommit: policy.sourceCommit,
  });
}
