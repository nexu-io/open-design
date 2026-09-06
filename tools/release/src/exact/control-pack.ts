import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { canonicalBytes, checkedFile, describeFile, readObject, writeObject, type JsonObject } from "./control-common.ts";

const DIGEST = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[a-z][a-z0-9-]{0,31}$/u;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const TARGET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/u;

type SigningKey = { keyId: string; privateKey: string; publicKey: string };

async function signingKeys(): Promise<SigningKey[]> {
  const keys: SigningKey[] = [];
  for (const suffix of ["", "_NEXT"]) {
    const keyId = process.env[`OD_EXACT_SIGNING_KEY_ID${suffix}`] ?? "";
    let privateKey = process.env[`OD_EXACT_ED25519_PRIVATE_KEY${suffix}`] ?? "";
    const keyFile = process.env[`OD_EXACT_ED25519_PRIVATE_KEY_FILE${suffix}`] ?? "";
    if (privateKey.length === 0 && keyFile.length > 0) privateKey = await readFile(keyFile, "utf8");
    if (keyId.length > 0 || privateKey.length > 0) {
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(keyId) || privateKey.length === 0) throw new Error(`incomplete or invalid signing key pair: ${suffix || "primary"}`);
      const publicKey = createPublicKey(createPrivateKey(privateKey)).export({ type: "spki", format: "pem" }).toString();
      keys.push({ keyId, privateKey, publicKey });
    }
  }
  if (keys.length === 0 || new Set(keys.map(({ keyId }) => keyId)).size !== keys.length) throw new Error("at least one unique exact signing key is required");
  return keys;
}

function signatures(value: unknown, keys: readonly SigningKey[]) {
  const body = canonicalBytes(value);
  return keys.map(({ keyId, privateKey }) => ({ algorithm: "Ed25519", keyId, value: sign(null, body, privateKey).toString("base64") }));
}

function signed(field: string, value: JsonObject, keys: readonly SigningKey[]): JsonObject {
  return { [field]: value, signatures: signatures(value, keys) };
}

function validSignature(value: unknown, candidates: unknown, keys: readonly SigningKey[]): boolean {
  if (!Array.isArray(candidates)) return false;
  const body = canonicalBytes(value);
  return candidates.some((candidate) => {
    if (candidate == null || typeof candidate !== "object") return false;
    const entry = candidate as JsonObject;
    const key = keys.find(({ keyId }) => keyId === entry.keyId);
    return key != null && entry.algorithm === "Ed25519" && typeof entry.value === "string"
      && verify(null, body, key.publicKey, Buffer.from(entry.value, "base64"));
  });
}

function requireRelease(request: JsonObject): void {
  const channel = String(request.channel ?? "");
  if (!IDENTIFIER.test(channel)) throw new Error("invalid release channel");
  if (!new RegExp(`^\\d+\\.\\d+\\.\\d+-${channel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.\\d+$`, "u").test(String(request.releaseVersion ?? ""))) throw new Error("releaseVersion does not belong to channel");
  if (!SOURCE_COMMIT.test(String(request.sourceCommit ?? ""))) throw new Error("sourceCommit must be a full lowercase SHA");
  if (!VERSION.test(String(request.standaloneVersion ?? ""))) throw new Error("invalid standaloneVersion");
  if (typeof request.publishedAt !== "string" || !request.publishedAt.includes("T")) throw new Error("publishedAt must be an ISO timestamp");
  if (typeof request.artifactBaseUrl !== "string" || !/^https?:\/\/\S+$/u.test(request.artifactBaseUrl)) throw new Error("artifactBaseUrl must use HTTP(S)");
}

function semverCore(version: string): number[] {
  return version.split("-")[0]!.split(".").map(Number);
}

function compareCore(left: string, right: string): number {
  const a = semverCore(left), b = semverCore(right);
  return (a[0]! - b[0]!) || (a[1]! - b[1]!) || (a[2]! - b[2]!);
}

async function previousRequirements(path: unknown, channel: string, keys: readonly SigningKey[]): Promise<Map<string, JsonObject>> {
  if (typeof path !== "string") return new Map();
  try {
    const envelope = await readObject(path);
    const metadata = envelope.metadata;
    if (!validSignature(metadata, envelope.signatures, keys) || metadata?.schemaVersion !== 4 || metadata.channel !== channel || !Array.isArray(metadata.shellRequirements)) return new Map();
    return new Map(metadata.shellRequirements.map((item: JsonObject) => [String(item.type), item]));
  } catch { return new Map(); }
}

async function prepare(request: JsonObject, receiptPath: string): Promise<void> {
  requireRelease(request);
  const legacyTerminal = request.shells == null && request.shellVersion != null;
  const shells: unknown = legacyTerminal ? [{ type: "terminal", version: request.shellVersion, scenes: request.scenes }] : request.shells;
  if (!Array.isArray(shells) || shells.length === 0) throw new Error("exact.prepare requires at least one Shell");
  const shellRecords: JsonObject[] = [];
  const shellTypes = new Set<string>();
  let closureSceneDigest: string | undefined;
  let standaloneSceneDigest: string | undefined;
  for (const rawShell of shells) {
    if (rawShell == null || typeof rawShell !== "object" || Array.isArray(rawShell)) throw new Error("invalid Shell descriptor");
    const shell = rawShell as JsonObject;
    const shellType = String(shell.type ?? ""), shellVersion = String(shell.version ?? ""), scenes = shell.scenes;
    if (!IDENTIFIER.test(shellType) || shellTypes.has(shellType) || !VERSION.test(shellVersion)) throw new Error(`invalid or duplicate Shell identity: ${shellType}`);
    if (!Array.isArray(scenes) || scenes.length === 0) throw new Error(`${shellType} requires at least one scene`);
    shellTypes.add(shellType);
    const sceneRecords: JsonObject[] = [];
    const targets = new Set<string>();
    for (const rawScene of scenes) {
      if (rawScene == null || typeof rawScene !== "object" || Array.isArray(rawScene)) throw new Error(`invalid ${shellType} scene target`);
      const scene = rawScene as JsonObject, target = String(scene.target ?? "");
      if (!TARGET.test(target) || targets.has(target)) throw new Error(`invalid or duplicate ${shellType} scene target: ${target}`);
      targets.add(target);
      const directory = resolve(String(scene.sceneDirectory ?? ""));
      const manifestPath = join(directory, "scene.json");
      const binding = String(scene.sceneManifestSha256 ?? "");
      const bytes = await readFile(manifestPath);
      if (!DIGEST.test(binding) || createHash("sha256").update(bytes).digest("hex") !== binding) throw new Error(`${shellType} scene manifest binding failed: ${target}`);
      const manifest = await readObject(manifestPath);
      if (manifest.schemaVersion !== 1 || manifest.target !== target || manifest.shellVersion !== shellVersion) throw new Error(`${shellType} scene identity mismatch: ${target}`);
      const buildHash = String(manifest.shellBuildHash ?? "");
      const closureDigest = String(manifest.closure?.sha256 ?? ""), standaloneDigest = String(manifest.standalone?.sha256 ?? "");
      if (![buildHash, closureDigest, standaloneDigest].every((value) => DIGEST.test(value))) throw new Error(`${shellType} scene lacks a valid build, Closure, or Standalone binding: ${target}`);
      if (closureSceneDigest != null && closureDigest !== closureSceneDigest) throw new Error("Shell scenes contain different Closure seeds");
      if (standaloneSceneDigest != null && standaloneDigest !== standaloneSceneDigest) throw new Error("Shell scenes contain different Standalone launcher seeds");
      closureSceneDigest = closureDigest; standaloneSceneDigest = standaloneDigest;
      sceneRecords.push({ target, directory, sceneManifestSha256: binding, shellBuildHash: buildHash });
    }
    sceneRecords.sort((a, b) => String(a.target).localeCompare(String(b.target)));
    const buildHash = createHash("sha256").update(canonicalBytes(sceneRecords.map(({ target, shellBuildHash }) => ({ target, shellBuildHash })))).digest("hex");
    shellRecords.push({ type: shellType, version: shellVersion, buildHash, scenes: sceneRecords });
  }
  shellRecords.sort((a, b) => String(a.type).localeCompare(String(b.type)));
  const keys = await signingKeys();
  const old = await previousRequirements(request.previousContentMetadataFile, String(request.channel), keys);
  for (const shell of shellRecords) {
    shell.minimumVersion = shell.version;
    const prior = old.get(String(shell.type));
    if (prior != null && prior.buildHash === shell.buildHash && VERSION.test(String(prior.minVersion ?? "")) && compareCore(String(prior.minVersion), String(shell.version)) <= 0) shell.minimumVersion = prior.minVersion;
  }
  const output = resolve(String(request.outputDirectory ?? "")), artifacts = join(output, "artifacts"), documents = join(output, "documents"), trustFile = join(output, "trust/keys.json");
  await mkdir(artifacts, { recursive: true });
  const closureSource = resolve(String(request.closureArtifactFile ?? ""));
  const closureSourceDescription = await describeFile(closureSource);
  if (closureSourceDescription.sha256 !== closureSceneDigest) throw new Error("Closure promotion input differs from Shell scenes");
  const closureFile = join(artifacts, `closure-${closureSourceDescription.sha256}.mjs`);
  await copyFile(closureSource, closureFile);
  const closure = await describeFile(closureFile, "text/javascript");
  const standaloneSource = resolve(String(request.standaloneArtifactFile ?? ""));
  const standaloneSourceDescription = await describeFile(standaloneSource);
  if (standaloneSourceDescription.sha256 !== standaloneSceneDigest) throw new Error("Standalone launcher promotion input differs from Shell scenes");
  const standaloneFile = join(artifacts, `standalone-launcher-${standaloneSourceDescription.sha256}.mjs`);
  await copyFile(standaloneSource, standaloneFile);
  const standalone = await describeFile(standaloneFile, "text/javascript");
  const closureResources: Array<{ blob: JsonObject; entrypoint: string; id: string; treeSha256: string }> = [];
  if (typeof request.resourceReceiptFile === "string") {
    const resourceReceiptPath = resolve(request.resourceReceiptFile), resourceReceipt = await readObject(resourceReceiptPath);
    if (resourceReceipt.schemaVersion !== 1 || resourceReceipt.operation !== "closure.resources.build" || !Array.isArray(resourceReceipt.resources)) throw new Error("exact.prepare resource receipt is invalid");
    for (const raw of resourceReceipt.resources) {
      if (raw == null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("exact.prepare resource descriptor is invalid");
      const resource = raw as JsonObject;
      if (typeof resource.id !== "string" || typeof resource.file !== "string" || typeof resource.entrypoint !== "string" || typeof resource.treeSha256 !== "string" || !DIGEST.test(String(resource.sha256 ?? ""))) throw new Error("exact.prepare resource descriptor is incomplete");
      const source = typeof resource.path === "string"
        ? resolve(resource.path)
        : resolve(resourceReceiptPath, "..", basename(resource.file));
      const actual = await describeFile(source);
      if (actual.sha256 !== resource.sha256 || actual.size !== resource.size) throw new Error(`Closure resource receipt binding failed: ${resource.id}`);
      const destination = join(artifacts, basename(resource.file));
      await copyFile(source, destination);
      closureResources.push({ blob: await describeFile(destination, "application/zip"), entrypoint: resource.entrypoint, id: resource.id, treeSha256: resource.treeSha256 });
    }
  }
  const base = String(request.artifactBaseUrl).replace(/\/$/u, "");
  const blobs: JsonObject = {
    [closure.sha256]: { sha256: closure.sha256, size: closure.size, mediaType: "text/javascript", sources: [{ kind: "remote", url: `${base}/${basename(closureFile)}` }] },
    [standalone.sha256]: { sha256: standalone.sha256, size: standalone.size, mediaType: "text/javascript", sources: [{ kind: "remote", url: `${base}/${basename(standaloneFile)}` }] },
  };
  for (const resource of closureResources) blobs[resource.blob.sha256] = { sha256: resource.blob.sha256, size: resource.blob.size, mediaType: resource.blob.mediaType, sources: [{ kind: "remote", url: `${base}/${basename(resource.blob.file)}` }] };
  const metadata = { schemaVersion: 4, channel: request.channel, releaseVersion: request.releaseVersion, standaloneVersion: request.standaloneVersion, sourceCommit: request.sourceCommit, publishedAt: request.publishedAt,
    blobs,
    resources: [
      { id: "standalone-launcher", component: "standalone.launcher", blob: standalone.sha256, sync: true, materialization: { type: "file", entrypoint: "launcher.mjs" } },
      { id: "closure", component: "standalone.resource", blob: closure.sha256, sync: true, materialization: { type: "file", entrypoint: "closure.mjs" } },
      ...closureResources.map((resource) => ({ id: resource.id, component: "standalone.resource", blob: resource.blob.sha256, sync: true, materialization: { type: "zip", entrypoint: resource.entrypoint, treeSha256: resource.treeSha256 } })),
    ],
    shellRequirements: shellRecords.map((shell) => ({ type: shell.type, minVersion: shell.minimumVersion, buildHash: shell.buildHash })),
  };
  const contentFile = join(documents, "content-metadata.json");
  await writeObject(contentFile, signed("metadata", metadata, keys));
  await writeObject(trustFile, { schemaVersion: 1, keys: keys.map(({ keyId, publicKey }) => ({ keyId, publicKey })) });
  const receipt: JsonObject = { schemaVersion: 2, operation: "exact.prepare", channel: request.channel, releaseVersion: request.releaseVersion, sourceCommit: request.sourceCommit, publishedAt: request.publishedAt, artifactBaseUrl: base, standaloneVersion: request.standaloneVersion, shells: shellRecords, closureArtifact: closure, standaloneArtifact: standalone, resourceArtifacts: closureResources.map(({ blob }) => blob), contentMetadata: await describeFile(contentFile), trustFile: await describeFile(trustFile) };
  if (legacyTerminal) Object.assign(receipt, { shellVersion: shellRecords[0]!.version, shellBuildHash: shellRecords[0]!.buildHash, minimumShellVersion: shellRecords[0]!.minimumVersion, scenes: shellRecords[0]!.scenes });
  await writeObject(receiptPath, receipt);
}

async function finalize(request: JsonObject, receiptPath: string): Promise<void> {
  const prepared = await readObject(String(request.prepareReceipt ?? ""));
  if (prepared.schemaVersion !== 2 || prepared.operation !== "exact.prepare") throw new Error("invalid exact.prepare receipt");
  const contributions = request.contributions;
  if (!Array.isArray(contributions) || contributions.length === 0) throw new Error("exact.finalize requires Shell contributions");
  const preparedShells = new Map((prepared.shells as JsonObject[]).map((shell) => [String(shell.type), shell]));
  const expected = new Set<string>((prepared.shells as JsonObject[]).flatMap((shell) => (shell.scenes as JsonObject[]).map((scene) => `${shell.type}/${scene.target}`)));
  const seen = new Set<string>(), distributions = new Map<string, JsonObject[]>();
  for (const key of preparedShells.keys()) distributions.set(key, []);
  const closurePath = await checkedFile(prepared.closureArtifact, "Closure artifact", request.closureArtifactFile);
  const standalonePath = await checkedFile(prepared.standaloneArtifact, "Standalone launcher artifact", request.standaloneArtifactFile);
  const artifacts = [await describeFile(closurePath, prepared.closureArtifact.mediaType ?? "application/octet-stream"), await describeFile(standalonePath, prepared.standaloneArtifact.mediaType ?? "application/octet-stream")];
  for (const resource of (prepared.resourceArtifacts ?? []) as JsonObject[]) {
    const path = await checkedFile(resource, "Closure resource artifact", join(resolve(String(request.prepareReceipt), ".."), "artifacts", basename(String(resource.file))));
    artifacts.push(await describeFile(path, resource.mediaType ?? "application/zip"));
  }
  for (const raw of contributions) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid Shell contribution descriptor");
    const descriptor = raw as JsonObject, contribution = await readObject(String(descriptor.receipt ?? ""));
    const shellType = String(contribution.shell?.type ?? ""), target = String(contribution.target ?? ""), key = `${shellType}/${target}`;
    const shell = preparedShells.get(shellType), scene = (shell?.scenes as JsonObject[] | undefined)?.find((value) => value.target === target);
    if (contribution.schemaVersion !== 1 || contribution.operation !== "shell.distribution.contribute" || !expected.has(key) || seen.has(key)) throw new Error(`invalid or duplicate Shell contribution: ${key}`);
    if (contribution.shell?.version !== shell?.version || contribution.shell?.buildHash !== scene?.shellBuildHash) throw new Error(`Shell contribution identity mismatch: ${key}`);
    seen.add(key);
    const path = await checkedFile(contribution.artifact, `${key} distribution`, descriptor.archiveFile);
    const mediaType = String(contribution.artifact.mediaType ?? "application/octet-stream"), artifact = await describeFile(path, mediaType);
    artifacts.push(artifact);
    if (contribution.updater?.protocol !== "standalone-shell-updater-v3") throw new Error(`Shell contribution lacks updater contract: ${key}`);
    distributions.get(shellType)!.push({ shell: { type: shellType, version: shell!.version, buildHash: scene!.shellBuildHash }, target, artifact: { url: `${prepared.artifactBaseUrl}/${basename(path)}`, sha256: artifact.sha256, size: artifact.size, mediaType }, updater: contribution.updater });
  }
  if (seen.size !== expected.size || [...expected].some((key) => !seen.has(key))) throw new Error("Shell contributions do not cover prepared topology");
  const keys = await signingKeys(), output = resolve(String(request.outputDirectory ?? "")), documents = join(output, "documents");
  await mkdir(documents, { recursive: true });
  const contentSource = await checkedFile(prepared.contentMetadata, "content metadata", request.contentMetadataFile), contentFile = join(documents, "content-metadata.json");
  await copyFile(contentSource, contentFile);
  const content = await describeFile(contentFile), base = String(prepared.artifactBaseUrl);
  const lanes: JsonObject = { content: { releaseVersion: prepared.releaseVersion, url: `${base}/${basename(contentFile)}`, sha256: content.sha256, size: content.size } };
  const shellMetadata: JsonObject = {}, shellFiles: string[] = [], requiredAcceptances: JsonObject[] = [];
  for (const shellType of [...distributions.keys()].sort()) {
    const values = distributions.get(shellType)!.sort((a, b) => String(a.target).localeCompare(String(b.target)));
    const shellDocument = { schemaVersion: 1, channel: prepared.channel, releaseVersion: prepared.releaseVersion, sourceCommit: prepared.sourceCommit, publishedAt: prepared.publishedAt, distributions: values };
    const shellFile = join(documents, `${shellType}-metadata.json`);
    await writeObject(shellFile, signed("document", shellDocument, keys));
    shellFiles.push(shellFile);
    const description = await describeFile(shellFile); shellMetadata[shellType] = description;
    lanes[shellType] = { releaseVersion: prepared.releaseVersion, url: `${base}/${basename(shellFile)}`, sha256: description.sha256, size: description.size };
    for (const value of values) requiredAcceptances.push({ shell: value.shell, target: value.target, artifact: value.artifact, shellMetadata: { url: lanes[shellType].url, sha256: description.sha256, size: description.size } });
  }
  const headFile = join(documents, "channel-head.json");
  await writeObject(headFile, signed("head", { schemaVersion: 1, channel: prepared.channel, publishedAt: prepared.publishedAt, lanes }, keys));
  const receipt: JsonObject = { schemaVersion: 2, operation: "exact.pack", channel: prepared.channel, releaseVersion: prepared.releaseVersion, sourceCommit: prepared.sourceCommit, shells: (prepared.shells as JsonObject[]).map(({ type, version, buildHash, minimumVersion }) => ({ type, version, buildHash, minimumVersion })), artifacts, documents: await Promise.all([contentFile, ...shellFiles, headFile].map((path) => describeFile(path))), contentMetadataFile: contentFile, shellMetadataFiles: Object.fromEntries(Object.entries(shellMetadata).map(([key, value]) => [key, value.file])), channelHeadFile: headFile, requiredAcceptances };
  if (shellMetadata.terminal != null) Object.assign(receipt, { terminalMetadataFile: shellMetadata.terminal.file, shellBuildHash: preparedShells.get("terminal")!.buildHash, minimumShellVersion: preparedShells.get("terminal")!.minimumVersion });
  await writeObject(receiptPath, receipt);
}

export async function executeExactPackControl(request: JsonObject, receiptPath: string): Promise<void> {
  if (request.schemaVersion !== 1) throw new Error("unsupported exact pack request schema");
  if (request.operation === "exact.prepare") return await prepare(request, receiptPath);
  if (request.operation === "exact.finalize") return await finalize(request, receiptPath);
  throw new Error("unsupported exact pack operation");
}
