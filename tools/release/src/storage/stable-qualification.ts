import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { writeJson } from "./common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

type JsonRecord = Record<string, unknown>;

export const stableQualificationPolicy = "stable-promotion-v1" as const;
export const stableQualificationTargets = ["mac_arm64", "mac_x64", "win_x64"] as const;

export type StableQualificationTarget = typeof stableQualificationTargets[number];

export type StableQualification = {
  amrProfile: "prod";
  baseVersion: string;
  channel: "prerelease";
  github: JsonRecord;
  metadata: {
    digest: `sha256:${string}`;
    url: string;
  };
  parameterMatrix: JsonRecord;
  policy: typeof stableQualificationPolicy;
  qualifiedAt: string;
  releaseVersion: string;
  schemaVersion: 1;
  smoke: {
    profile: "core";
    targets: Record<StableQualificationTarget, { result: "success" }>;
  };
  status: "qualified";
  targets: Record<StableQualificationTarget, {
    artifacts: Record<string, string>;
    manifest: {
      digest: `sha256:${string}`;
      url: string;
    };
  }>;
};

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function recordField(record: JsonRecord, field: string, label: string): JsonRecord {
  const value = record[field];
  assertRecord(value, `${label}.${field}`);
  return value;
}

function stringField(record: JsonRecord, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${field} must be a non-empty string`);
  }
  return value;
}

function sha256(bytes: Buffer | string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseJson(bytes: Buffer | string, label: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString("utf8") : bytes) as unknown;
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertRecord(value, label);
  return value;
}

function artifactDigests(manifest: JsonRecord, label: string): Record<string, string> {
  const artifacts = recordField(manifest, "artifacts", label);
  return Object.fromEntries(Object.entries(artifacts).map(([name, value]) => {
    assertRecord(value, `${label}.artifacts.${name}`);
    const digest = stringField(value, "digest", `${label}.artifacts.${name}`);
    if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
      throw new Error(`${label}.artifacts.${name}.digest must be a lowercase sha256 digest`);
    }
    return [name, digest];
  }));
}

function qualificationTarget(input: {
  manifestDir: string;
  metadata: JsonRecord;
  target: StableQualificationTarget;
}): StableQualification["targets"][StableQualificationTarget] {
  const manifestPath = join(input.manifestDir, `${input.target}.json`);
  const bytes = readFileSync(manifestPath);
  const manifest = parseJson(bytes, `${input.target} platform manifest`);
  if (stringField(manifest, "platformKey", `${input.target} platform manifest`) !== input.target) {
    throw new Error(`${input.target} platform manifest identity mismatch`);
  }
  const releaseTargets = recordField(input.metadata, "releaseTargets", "metadata");
  const metadataTarget = recordField(releaseTargets, input.target, "metadata.releaseTargets");
  if (!isDeepStrictEqual(artifactDigests(manifest, `${input.target} platform manifest`), artifactDigests(metadataTarget, `metadata.releaseTargets.${input.target}`))) {
    throw new Error(`${input.target} platform artifact digests do not match metadata`);
  }
  const r2 = recordField(manifest, "r2", `${input.target} platform manifest`);
  return {
    artifacts: artifactDigests(manifest, `${input.target} platform manifest`),
    manifest: {
      digest: sha256(bytes),
      url: stringField(r2, "versionManifestUrl", `${input.target} platform manifest.r2`),
    },
  };
}

export function createStableQualification(input: {
  manifestDir: string;
  metadataBytes: Buffer;
  metadataUrl: string;
  smokeResults: Record<StableQualificationTarget, string>;
}): StableQualification | null {
  const metadata = parseJson(input.metadataBytes, "prerelease metadata");
  if (stringField(metadata, "amrProfile", "prerelease metadata") !== "prod") return null;
  if (stableQualificationTargets.some((target) => input.smokeResults[target] !== "success")) return null;
  if (stringField(metadata, "channel", "prerelease metadata") !== "prerelease") {
    throw new Error("stable qualification requires prerelease metadata");
  }
  if (stringField(metadata, "releaseState", "prerelease metadata") !== "complete") {
    throw new Error("stable qualification requires complete prerelease metadata");
  }
  const parameterMatrix = recordField(metadata, "parameterMatrix", "prerelease metadata");
  const macArm64 = recordField(parameterMatrix, "mac_arm64", "prerelease metadata.parameterMatrix");
  const macX64 = recordField(parameterMatrix, "mac_x64", "prerelease metadata.parameterMatrix");
  if (
    stringField(macArm64, "signMode", "prerelease metadata.parameterMatrix.mac_arm64") !== "notarized"
    || stringField(macX64, "signMode", "prerelease metadata.parameterMatrix.mac_x64") !== "notarized"
  ) return null;
  const github = recordField(metadata, "github", "prerelease metadata");
  const targets = Object.fromEntries(stableQualificationTargets.map((target) => [
    target,
    qualificationTarget({ manifestDir: input.manifestDir, metadata, target }),
  ])) as StableQualification["targets"];
  return {
    amrProfile: "prod",
    baseVersion: stringField(metadata, "baseVersion", "prerelease metadata"),
    channel: "prerelease",
    github,
    metadata: { digest: sha256(input.metadataBytes), url: input.metadataUrl },
    parameterMatrix,
    policy: stableQualificationPolicy,
    qualifiedAt: stringField(metadata, "generatedAt", "prerelease metadata"),
    releaseVersion: stringField(metadata, "releaseVersion", "prerelease metadata"),
    schemaVersion: 1,
    smoke: {
      profile: "core",
      targets: {
        mac_arm64: { result: "success" },
        mac_x64: { result: "success" },
        win_x64: { result: "success" },
      },
    },
    status: "qualified",
    targets,
  };
}

export function validateStableQualification(input: {
  metadataBytes: Buffer;
  metadataUrl: string;
  qualification: unknown;
}): StableQualification {
  const expectedMetadata = parseJson(input.metadataBytes, "prerelease metadata");
  assertRecord(input.qualification, "stable qualification");
  const actual = input.qualification as unknown as StableQualification;
  const expectedFields: Array<[unknown, unknown, string]> = [
    [actual.schemaVersion, 1, "schemaVersion"],
    [actual.policy, stableQualificationPolicy, "policy"],
    [actual.status, "qualified", "status"],
    [actual.channel, "prerelease", "channel"],
    [actual.releaseVersion, expectedMetadata.releaseVersion, "releaseVersion"],
    [actual.baseVersion, expectedMetadata.baseVersion, "baseVersion"],
    [actual.amrProfile, "prod", "amrProfile"],
    [actual.metadata?.url, input.metadataUrl, "metadata.url"],
    [actual.metadata?.digest, sha256(input.metadataBytes), "metadata.digest"],
    [actual.smoke?.profile, "core", "smoke.profile"],
  ];
  for (const [value, expected, label] of expectedFields) {
    if (value !== expected) throw new Error(`stable qualification ${label} mismatch`);
  }
  if (!isDeepStrictEqual(actual.github, expectedMetadata.github)) {
    throw new Error("stable qualification github identity mismatch");
  }
  if (!isDeepStrictEqual(actual.parameterMatrix, expectedMetadata.parameterMatrix)) {
    throw new Error("stable qualification parameter matrix mismatch");
  }
  const releaseTargets = recordField(expectedMetadata, "releaseTargets", "prerelease metadata");
  for (const target of stableQualificationTargets) {
    if (actual.smoke?.targets?.[target]?.result !== "success") {
      throw new Error(`stable qualification ${target} smoke must be successful`);
    }
    const metadataTarget = recordField(releaseTargets, target, "prerelease metadata.releaseTargets");
    if (!isDeepStrictEqual(actual.targets?.[target]?.artifacts, artifactDigests(metadataTarget, `prerelease metadata.releaseTargets.${target}`))) {
      throw new Error(`stable qualification ${target} artifact binding mismatch`);
    }
    const targetManifest = actual.targets?.[target]?.manifest;
    if (!/^sha256:[0-9a-f]{64}$/u.test(String(targetManifest?.digest))) {
      throw new Error(`stable qualification ${target} manifest digest is invalid`);
    }
    const targetR2 = recordField(metadataTarget, "r2", `prerelease metadata.releaseTargets.${target}`);
    if (targetManifest?.url !== stringField(targetR2, "versionManifestUrl", `prerelease metadata.releaseTargets.${target}.r2`)) {
      throw new Error(`stable qualification ${target} manifest URL mismatch`);
    }
  }
  return actual;
}

export async function issueStableQualification(input: {
  manifestDir: string;
  metadataPath: string;
  metadataUrl: string;
  outputsPath: string;
  publicOrigin: string;
  smokeResults: Record<StableQualificationTarget, string>;
  storage: StorageConfig;
  workDir: string;
}): Promise<{ qualificationUrl: string; state: "issued" | "ineligible" }> {
  const metadataBytes = readFileSync(input.metadataPath);
  const qualification = createStableQualification({
    manifestDir: input.manifestDir,
    metadataBytes,
    metadataUrl: input.metadataUrl,
    smokeResults: input.smokeResults,
  });
  if (qualification == null) {
    const result = { qualificationUrl: "", state: "ineligible" as const };
    writeJson(input.outputsPath, result);
    return result;
  }
  const qualificationPath = join(input.workDir, "qualification.json");
  writeJson(qualificationPath, qualification);
  const objectKey = `prerelease/versions/${qualification.releaseVersion}/qualification.json`;
  const result = await putStorageObjectWithStatus({
    ...input.storage,
    bodyPath: qualificationPath,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (!result.ok && result.status !== 412) {
    throw new Error(`stable qualification PUT failed with HTTP ${result.status}: ${result.body}`);
  }
  if (result.status === 412) {
    const existing = await getStorageObject({ ...input.storage, objectKey });
    if (existing == null || !existing.bytes.equals(readFileSync(qualificationPath))) {
      throw new Error(`immutable stable qualification conflicts: ${objectKey}`);
    }
  }
  const qualificationUrl = `${input.publicOrigin.replace(/\/+$/u, "")}/${objectKey}`;
  const issued = { qualificationUrl, state: "issued" as const };
  writeJson(input.outputsPath, issued);
  return issued;
}
