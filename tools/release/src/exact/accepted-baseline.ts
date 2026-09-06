import { createHash } from "node:crypto";

import { canonicalMetadataJson, metadataDigest } from "@open-design/metatool";

import type { ExactTarget } from "./plan.js";

const SHA256_IDENTITY = /^sha256:[a-f0-9]{64}$/u;
const SHA256_DIGEST = /^[a-f0-9]{64}$/u;

export const ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION = 1 as const;

type FileBinding = Readonly<{
  sha256: string;
  size: number;
}>;

type AcceptedShell = Readonly<{
  buildHash: string;
  type: "electron";
  version: string;
}>;

export type AcceptedShellBaselinePayload = Readonly<{
  artifact: FileBinding;
  channel: string;
  seed: Readonly<{
    closure: FileBinding;
    standalone: FileBinding;
  }>;
  shell: AcceptedShell;
  target: ExactTarget;
}>;

export type AcceptedShellBaselineReceipt = Readonly<{
  acceptance: Readonly<Record<string, unknown>>;
  acceptedIdentities: readonly `sha256:${string}`[];
  baseline: AcceptedShellBaselinePayload;
  baselineIdentity: `sha256:${string}`;
  channel: string;
  operation: "electron.shell-baseline.accepted";
  releaseVersion: string;
  schemaVersion: typeof ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION;
  sourceCommit: string;
  target: ExactTarget;
}>;

export type AcceptedShellBaselineResolution = Readonly<{
  acceptance?: Readonly<Record<string, unknown>>;
  acceptedIdentities: readonly `sha256:${string}`[];
  acceptedReceiptSha256?: `sha256:${string}`;
  baseline: AcceptedShellBaselinePayload | Readonly<{
    channel: string;
    seed: Readonly<{ closureIdentity: `sha256:${string}` }>;
    target: ExactTarget;
  }>;
  baselineIdentity: `sha256:${string}`;
  mode: "accepted" | "bootstrap";
  requiredAcceptance: "full" | "hot";
  schemaVersion: typeof ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION;
}>;

export function createAcceptedShellBaselineReceipt(value: unknown, acceptedIdentities: readonly `sha256:${string}`[]): AcceptedShellBaselineReceipt {
  const credential = record(value, "Electron installed acceptance credential");
  const shell = record(credential.shell, "Electron installed acceptance Shell");
  const artifact = record(credential.artifact, "Electron installed acceptance artifact");
  const installed = record(credential.installed, "Electron installed acceptance proof");
  const proof = record(installed.proof, "Electron installed acceptance physical proof");
  const files = record(proof.files, "Electron installed acceptance files");
  const installedShell = record(installed.shell, "installed Electron Shell identity");
  if (credential.schemaVersion !== 1 || credential.operation !== "exact.acceptance" || credential.status !== "accepted"
      || shell.type !== "electron" || installed.target !== credential.target
      || installedShell.type !== shell.type || installedShell.version !== shell.version || installedShell.buildHash !== shell.buildHash
      || typeof credential.channel !== "string" || typeof credential.releaseVersion !== "string"
      || typeof credential.sourceCommit !== "string" || !/^[a-f0-9]{40}$/u.test(credential.sourceCommit)) {
    throw new Error("Electron installed acceptance credential identity is invalid");
  }
  if (!Array.isArray(files.seeds)) throw new Error("Electron installed acceptance seeds are invalid");
  const seeds = new Map(files.seeds.map((seed) => {
    const candidate = record(seed, "Electron installed acceptance seed");
    if (typeof candidate.file !== "string") throw new Error("Electron installed acceptance seed file is invalid");
    return [candidate.file, candidate] as const;
  }));
  const baseline = payload({
    artifact: { sha256: artifact.sha256, size: artifact.size },
    channel: credential.channel,
    seed: {
      closure: { sha256: seeds.get("closure.mjs")?.sha256, size: seeds.get("closure.mjs")?.size },
      standalone: { sha256: seeds.get("standalone-launcher.mjs")?.sha256, size: seeds.get("standalone-launcher.mjs")?.size },
    },
    shell,
    target: credential.target,
  });
  if (acceptedIdentities.length === 0 || new Set(acceptedIdentities).size !== acceptedIdentities.length
      || acceptedIdentities.some((identity) => !SHA256_IDENTITY.test(identity))) {
    throw new Error("Electron installed acceptance exact identities are invalid");
  }
  return Object.freeze({
    acceptance: Object.freeze(structuredClone(credential)),
    acceptedIdentities: Object.freeze([...acceptedIdentities].sort()),
    baseline,
    baselineIdentity: acceptedShellBaselineIdentity(baseline),
    channel: baseline.channel,
    operation: "electron.shell-baseline.accepted",
    releaseVersion: credential.releaseVersion,
    schemaVersion: ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION,
    sourceCommit: credential.sourceCommit,
    target: baseline.target,
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields are invalid`);
}

function fileBinding(value: unknown, label: string): FileBinding {
  const binding = record(value, label);
  exactKeys(binding, ["sha256", "size"], label);
  if (typeof binding.sha256 !== "string" || !SHA256_DIGEST.test(binding.sha256)) throw new Error(`${label} digest is invalid`);
  if (!Number.isSafeInteger(binding.size) || (binding.size as number) < 0) throw new Error(`${label} size is invalid`);
  return Object.freeze({ sha256: binding.sha256, size: binding.size as number });
}

function target(value: unknown): ExactTarget {
  if (value !== "darwin-arm64" && value !== "darwin-x64" && value !== "win32-x64") throw new Error("accepted Shell baseline target is invalid");
  return value;
}

function payload(value: unknown): AcceptedShellBaselinePayload {
  const input = record(value, "accepted Shell baseline payload");
  exactKeys(input, ["artifact", "channel", "seed", "shell", "target"], "accepted Shell baseline payload");
  if (typeof input.channel !== "string" || !/^[a-z][a-z0-9-]{0,31}$/u.test(input.channel)) throw new Error("accepted Shell baseline channel is invalid");
  const shell = record(input.shell, "accepted Shell baseline identity");
  exactKeys(shell, ["buildHash", "type", "version"], "accepted Shell baseline identity");
  if (shell.type !== "electron" || typeof shell.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/u.test(shell.version)
      || typeof shell.buildHash !== "string" || !SHA256_DIGEST.test(shell.buildHash)) {
    throw new Error("accepted Shell baseline identity is invalid");
  }
  const seed = record(input.seed, "accepted Shell baseline seed");
  exactKeys(seed, ["closure", "standalone"], "accepted Shell baseline seed");
  return Object.freeze({
    artifact: fileBinding(input.artifact, "accepted Shell baseline artifact"),
    channel: input.channel,
    seed: Object.freeze({
      closure: fileBinding(seed.closure, "accepted Shell Closure seed"),
      standalone: fileBinding(seed.standalone, "accepted Shell Standalone seed"),
    }),
    shell: Object.freeze({ buildHash: shell.buildHash, type: "electron", version: shell.version }),
    target: target(input.target),
  });
}

export function acceptedShellBaselineIdentity(value: AcceptedShellBaselinePayload): `sha256:${string}` {
  return metadataDigest(canonicalMetadataJson({
    baseline: value,
    schemaVersion: ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION,
  }));
}

export function resolveAcceptedShellBaseline(input: Readonly<{
  acceptedReceipt?: Readonly<{ bytes: Uint8Array; sha256: `sha256:${string}` }>;
  channel: string;
  currentClosureIdentity: `sha256:${string}`;
  target: ExactTarget;
}>): AcceptedShellBaselineResolution {
  if (!/^[a-z][a-z0-9-]{0,31}$/u.test(input.channel)) throw new Error("accepted Shell baseline channel is invalid");
  if (!SHA256_IDENTITY.test(input.currentClosureIdentity)) throw new Error("current Closure identity is invalid");
  if (input.acceptedReceipt == null) {
    const baseline = Object.freeze({
      channel: input.channel,
      seed: Object.freeze({ closureIdentity: input.currentClosureIdentity }),
      target: input.target,
    });
    return Object.freeze({
      acceptedIdentities: Object.freeze([]),
      baseline,
      baselineIdentity: metadataDigest(canonicalMetadataJson({ bootstrap: baseline, schemaVersion: ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION })),
      mode: "bootstrap",
      requiredAcceptance: "full",
      schemaVersion: ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION,
    });
  }

  if (!SHA256_IDENTITY.test(input.acceptedReceipt.sha256)) throw new Error("accepted Shell baseline receipt binding is invalid");
  const actualReceiptSha256 = `sha256:${createHash("sha256").update(input.acceptedReceipt.bytes).digest("hex")}` as const;
  if (actualReceiptSha256 !== input.acceptedReceipt.sha256) throw new Error("accepted Shell baseline receipt digest mismatch");
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(input.acceptedReceipt.bytes).toString("utf8"));
  } catch {
    throw new Error("accepted Shell baseline receipt JSON is invalid");
  }
  const receipt = record(decoded, "accepted Shell baseline receipt");
  exactKeys(receipt, ["acceptance", "acceptedIdentities", "baseline", "baselineIdentity", "channel", "operation", "releaseVersion", "schemaVersion", "sourceCommit", "target"], "accepted Shell baseline receipt");
  if (receipt.schemaVersion !== ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION || receipt.operation !== "electron.shell-baseline.accepted"
      || typeof receipt.baselineIdentity !== "string" || !SHA256_IDENTITY.test(receipt.baselineIdentity)
      || typeof receipt.releaseVersion !== "string" || typeof receipt.sourceCommit !== "string") {
    throw new Error("accepted Shell baseline receipt identity is invalid");
  }
  const baseline = payload(receipt.baseline);
  if (!Array.isArray(receipt.acceptedIdentities) || receipt.acceptedIdentities.length === 0
      || new Set(receipt.acceptedIdentities).size !== receipt.acceptedIdentities.length
      || receipt.acceptedIdentities.some((identity) => typeof identity !== "string" || !SHA256_IDENTITY.test(identity))) {
    throw new Error("accepted Shell baseline exact identities are invalid");
  }
  if (baseline.channel !== input.channel || baseline.target !== input.target) throw new Error("accepted Shell baseline scope mismatch");
  if (acceptedShellBaselineIdentity(baseline) !== receipt.baselineIdentity) throw new Error("accepted Shell baseline payload digest mismatch");
  const reconstructed = createAcceptedShellBaselineReceipt(receipt.acceptance, receipt.acceptedIdentities as `sha256:${string}`[]);
  if (canonicalMetadataJson(reconstructed) !== canonicalMetadataJson(receipt)) throw new Error("accepted Shell baseline snapshot binding mismatch");
  return Object.freeze({
    acceptance: reconstructed.acceptance,
    acceptedIdentities: Object.freeze([...(receipt.acceptedIdentities as `sha256:${string}`[])].sort()),
    acceptedReceiptSha256: actualReceiptSha256,
    baseline,
    baselineIdentity: receipt.baselineIdentity as `sha256:${string}`,
    mode: "accepted",
    requiredAcceptance: "hot",
    schemaVersion: ACCEPTED_SHELL_BASELINE_SCHEMA_VERSION,
  });
}
