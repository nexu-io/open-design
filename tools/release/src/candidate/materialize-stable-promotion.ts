import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { normalizePublicUrl, optional, required, writeJson } from "../storage/common.ts";
import { releaseCandidateId, validateReleaseCandidateSpec } from "./identity.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonRecord;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const normalized = normalizePublicUrl(url);
  const response = await fetch(normalized);
  if (!response.ok) throw new Error(`${normalized} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchJson(url: string, label: string): Promise<JsonRecord> {
  return record(JSON.parse((await fetchBytes(url)).toString("utf8")) as unknown, label);
}

const candidateUrl = normalizePublicUrl(required("RELEASE_CANDIDATE_MANIFEST_URL"));
const root = required("RELEASE_PROMOTION_ROOT");
const candidate = await fetchJson(candidateUrl, "stable candidate manifest");
const spec = validateReleaseCandidateSpec(candidate.spec);
if (spec.channel !== "stable" || candidate.state !== "candidate" || candidate.candidateId !== releaseCandidateId(spec)) {
  throw new Error("stable candidate manifest identity mismatch");
}
const metadataUrl = normalizePublicUrl(string(candidate.versionMetadataUrl, "candidate versionMetadataUrl"));
const metadataBytes = await fetchBytes(metadataUrl);
const metadata = record(JSON.parse(metadataBytes.toString("utf8")) as unknown, "stable version metadata");
if (metadata.channel !== "stable" || metadata.releaseState !== "complete" || metadata.releaseVersion !== spec.releaseVersion) {
  throw new Error("stable version metadata identity mismatch");
}
const github = record(metadata.github, "stable metadata github");
if (github.commit !== spec.commit) throw new Error("stable candidate commit does not match version metadata");
const targets = record(metadata.releaseTargets, "stable metadata releaseTargets");
const metadataDir = join(root, "release-metadata");
const manifestDir = join(root, "release-platform-manifests");
const assetsDir = join(root, "release-assets");
mkdirSync(join(metadataDir, "latest-feeds"), { recursive: true });
mkdirSync(manifestDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });
writeFileSync(join(metadataDir, "metadata.json"), metadataBytes);

for (const target of ["mac_arm64", "mac_x64", "win_x64"] as const) {
  const manifest = record(targets[target], `stable release target ${target}`);
  if (manifest.status !== "published" || manifest.enabled !== true) throw new Error(`stable target ${target} is not published`);
  writeJson(join(manifestDir, `${target}.json`), manifest);
  const artifacts = record(manifest.artifacts, `stable target ${target} artifacts`);
  const artifactName = target === "win_x64" ? "installer" : "dmg";
  const artifact = record(artifacts[artifactName], `stable target ${target} ${artifactName}`);
  const url = normalizePublicUrl(string(artifact.url, `stable target ${target} artifact URL`));
  const bytes = await fetchBytes(url);
  const checksumUrl = `${url}.sha256`;
  const checksumBytes = await fetchBytes(checksumUrl);
  const expected = checksumBytes.toString("utf8").trim().split(/\s+/u)[0];
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (expected !== actual) throw new Error(`stable target ${target} checksum mismatch`);
  const targetDir = join(assetsDir, target);
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, basename(new URL(url).pathname)), bytes);
  writeFileSync(join(targetDir, basename(new URL(checksumUrl).pathname)), checksumBytes);
  if (manifest.feed != null) {
    const feed = record(manifest.feed, `stable target ${target} feed`);
    const name = string(feed.name, `stable target ${target} feed name`);
    writeFileSync(join(metadataDir, "latest-feeds", name), await fetchBytes(string(feed.url, `stable target ${target} feed URL`)));
  }
}

const outputs = {
  candidate_id: string(candidate.candidateId, "candidate id"),
  commit: spec.commit,
  mac_arm64_sign_mode: spec.macArm64SignMode,
  mac_x64_sign_mode: spec.macX64SignMode,
  metadata_url: metadataUrl,
  release_version: spec.releaseVersion,
  version_tag: `v${spec.releaseVersion}`,
  win_x64_sign_mode: spec.winX64SignMode,
};
const githubOutput = optional("GITHUB_OUTPUT");
if (githubOutput.length > 0) appendFileSync(githubOutput, Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", "utf8");
process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
