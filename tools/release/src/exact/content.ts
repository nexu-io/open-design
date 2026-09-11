import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseReleaseVersion } from "@open-design/release";
import { STANDALONE_METADATA_SCHEMA, verifyStandaloneMetadata, type SignedStandaloneMetadata, type StandaloneShellRequirement } from "@open-design/standalone";
import { composeElectronCapsuleManifest, electronCompositeShellBuildHash, validateElectronCapsuleContent, validateElectronCapsuleRelease, assertElectronCapsuleReleaseManifest } from "@open-design/shell-electron/build/contracts";

import {
  canonicalBytes,
  checkedFile,
  describeFile,
  readObject,
  writeObject,
  type JsonObject,
} from "./control-common.ts";
import { composeReleaseDataResources } from "./resource-composition.ts";
import { verifyCapsuleReleaseBudget } from "./capsule-budget.ts";
import { preparePlatformProduct } from "./platform-product.ts";
import { mapWithConcurrency } from "../storage/concurrency.ts";

export type PrepareExactContentInput = Readonly<{
  channel: string;
  releaseVersion: string;
  sourceCommit: string;
  publishedAt: string;
  standaloneVersion: string;
  artifactBaseUrl: string;
  closureArtifactFile: string;
  standaloneArtifactFile: string;
  resourceReceiptFile?: string;
  dataResourceReceiptFiles?: readonly string[];
  capsuleProducts?: readonly Readonly<{ target: string; contentFile: string; archiveFile: string }>[];
  platformProducts?: readonly Readonly<{ target: string; resourceFile: string; archiveFile: string }>[];
  previousContentMetadataFile?: string;
  shells: readonly Readonly<{ type: string; version: string; scenes: readonly Readonly<{
    target: string; sceneDirectory: string; sceneManifestSha256: string;
  }>[] }>[];
  outputDirectory: string;
}>;

export type FinalizeExactContentInput = Readonly<{
  prepareReceipt: string;
  contentMetadataFile: string;
  closureArtifactFile: string;
  standaloneArtifactFile: string;
  contributions: readonly Readonly<{ receipt: string; archiveFile: string }>[];
  outputDirectory: string;
  verifyPublishedArtifact?: (descriptor: JsonObject) => Promise<unknown>;
}>;

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

/** Public signing identity may be frozen with release inputs; private material
 * remains confined to the signing operation. */
export async function preparationTrust() {
  return (await signingKeys()).map(({ keyId, publicKey }) => ({ keyId, publicKey }));
}

function signatures(value: unknown, keys: readonly SigningKey[]) {
  const body = canonicalBytes(value);
  return keys.map(({ keyId, privateKey }) => ({ algorithm: "Ed25519", keyId, value: sign(null, body, privateKey).toString("base64") }));
}

function signed(field: string, value: JsonObject, keys: readonly SigningKey[]): JsonObject {
  return { [field]: value, signatures: signatures(value, keys) };
}

function requireRelease(request: JsonObject): void {
  const channel = String(request.channel ?? "");
  if (!IDENTIFIER.test(channel)) throw new Error("invalid release channel");
  parseReleaseVersion(String(request.releaseVersion ?? ""), channel);
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

function publicObjectUrl(base: string, file: string): string {
  return `${base}/${encodeURIComponent(basename(file))}`;
}

async function previousRequirements(path: unknown, channel: string, keys: readonly SigningKey[]): Promise<Map<string, StandaloneShellRequirement>> {
  if (typeof path !== "string") return new Map();
  try {
    const envelope = await readObject(path);
    verifyStandaloneMetadata(envelope as SignedStandaloneMetadata, new Map(keys.map(({ keyId, publicKey }) => [keyId, publicKey])));
    const metadata = (envelope as SignedStandaloneMetadata).metadata;
    if (metadata.channel !== channel) return new Map();
    return new Map(Object.entries(metadata.shell));
  } catch { return new Map(); }
}

export async function prepareContent(request: PrepareExactContentInput, receiptPath: string): Promise<void> {
  requireRelease(request);
  const shells: unknown = request.shells;
  if (!Array.isArray(shells) || shells.length === 0) throw new Error("exact.prepare requires at least one Shell");
  const shellRecords: JsonObject[] = [];
  const shellTypes = new Set<string>();
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
      // Each carrier retains its own immutable installation seeds. They may
      // differ from one another and from this release's content inputs.
      sceneRecords.push({ target, directory, sceneManifestSha256: binding, shellBuildHash: buildHash });
    }
    sceneRecords.sort((a, b) => String(a.target).localeCompare(String(b.target)));
    const buildHash = createHash("sha256").update(canonicalBytes(sceneRecords.map(({ target, shellBuildHash }) => ({ target, shellBuildHash })))).digest("hex");
    shellRecords.push({ type: shellType, version: shellVersion, buildHash, scenes: sceneRecords });
  }
  shellRecords.sort((a, b) => String(a.type).localeCompare(String(b.type)));
  const capsuleProducts = new Map<string, { contentFile: string; archiveFile: string }>();
  const electronTargets = new Set<string>(shellRecords.filter(shell => shell.type === "electron")
    .flatMap(shell => (shell.scenes as JsonObject[]).map(scene => String(scene.target))));
  for (const product of request.capsuleProducts ?? []) {
    if (!electronTargets.has(product.target) || capsuleProducts.has(product.target)) throw new Error("invalid or duplicate Capsule product target");
    capsuleProducts.set(product.target, product);
  }
  if (request.capsuleProducts != null && capsuleProducts.size !== electronTargets.size) throw new Error("Capsule products do not cover Electron topology");
  const platformProducts = new Map<string, NonNullable<PrepareExactContentInput["platformProducts"]>[number]>();
  for (const product of request.platformProducts ?? []) {
    if (!electronTargets.has(product.target) || platformProducts.has(product.target)) throw new Error("invalid or duplicate platform product target");
    platformProducts.set(product.target, product);
  }
  if (platformProducts.size !== electronTargets.size) throw new Error("platform products do not cover Electron topology");
  const keys = await signingKeys();
  for (const shell of shellRecords) {
    if (shell.type !== "electron") continue;
    for (const scene of shell.scenes as JsonObject[]) {
      const neutral = await readObject(join(scene.directory, "scene.json"));
      const product = capsuleProducts.get(String(scene.target));
      if (product == null && neutral.capsule?.archiveFile !== "capsule.zip") throw new Error("Electron scene lacks its independently built Capsule baseline");
      const content = validateElectronCapsuleContent(product == null ? neutral.capsule.content : await readObject(product.contentFile));
      if (content.target !== scene.target) throw new Error("Electron Capsule baseline target mismatch");
      const archiveFile = product?.archiveFile ?? join(scene.directory, "capsule.zip"), archive = await describeFile(archiveFile, "application/zip");
      if (archive.sha256 !== content.archive.sha256 || archive.size !== content.archive.size) throw new Error("Electron Capsule baseline archive mismatch");
      const budget = await verifyCapsuleReleaseBudget(archiveFile, content.archive);
      const platform = await preparePlatformProduct({ ...platformProducts.get(String(scene.target))!,
        outputDirectory: request.outputDirectory, artifactBaseUrl: request.artifactBaseUrl });
      scene.platform = platform.archive;
      scene.capabilityBuildHash = electronCompositeShellBuildHash(content, scene.shellBuildHash, platform.resource);
      const manifest = composeElectronCapsuleManifest({ content, platform: platform.resource, version: String(shell.version),
        minimumCarrierVersion: String(shell.version), providedShellVersion: String(shell.version) });
      const manifestFile = join(resolve(request.outputDirectory), "documents", `capsule-${scene.target}.json`);
      const archived = join(resolve(request.outputDirectory), "artifacts", `capsule-${scene.target}-${archive.sha256}.zip`);
      await mkdir(join(resolve(request.outputDirectory), "artifacts"), { recursive: true });
      await copyFile(archiveFile, archived);
      const archivedDescription = await describeFile(archived, "application/zip");
      if (archivedDescription.sha256 !== archive.sha256 || archivedDescription.size !== archive.size) throw new Error("Capsule source changed during copy");
      await writeObject(manifestFile, signed("document", manifest, keys));
      scene.capsule = { manifest: await describeFile(manifestFile), archive: archivedDescription, budget };
    }
    shell.buildHash = createHash("sha256").update(canonicalBytes((shell.scenes as JsonObject[])
      .map(({ target, capabilityBuildHash }) => ({ target, shellBuildHash: capabilityBuildHash })))).digest("hex");
  }
  const old = await previousRequirements(request.previousContentMetadataFile, String(request.channel), keys);
  for (const shell of shellRecords) {
    shell.minimumVersion = shell.version;
    const prior = old.get(String(shell.type));
    if (prior != null && prior.buildHash === shell.buildHash && compareCore(prior.version.min, String(shell.version)) <= 0) shell.minimumVersion = prior.version.min;
  }
  const output = resolve(String(request.outputDirectory ?? "")), artifacts = join(output, "artifacts"), documents = join(output, "documents"), trustFile = join(output, "trust/keys.json");
  await mkdir(artifacts, { recursive: true });
  const closureSource = resolve(String(request.closureArtifactFile ?? ""));
  const closureSourceDescription = await describeFile(closureSource);
  const closureFile = join(artifacts, `closure-${closureSourceDescription.sha256}.mjs`);
  await copyFile(closureSource, closureFile);
  const closure = await describeFile(closureFile, "text/javascript");
  if (closure.sha256 !== closureSourceDescription.sha256 || closure.size !== closureSourceDescription.size) throw new Error("Closure promotion source changed during copy");
  const standaloneSource = resolve(String(request.standaloneArtifactFile ?? ""));
  const standaloneSourceDescription = await describeFile(standaloneSource);
  const standaloneFile = join(artifacts, `standalone-launcher-${standaloneSourceDescription.sha256}.mjs`);
  await copyFile(standaloneSource, standaloneFile);
  const standalone = await describeFile(standaloneFile, "text/javascript");
  if (standalone.sha256 !== standaloneSourceDescription.sha256 || standalone.size !== standaloneSourceDescription.size) throw new Error("Standalone launcher promotion source changed during copy");
  const closureResources: Array<{ blob: JsonObject; entrypoint: string; id: string; treeSha256: string }> = [];
  if (request.dataResourceReceiptFiles != null && request.resourceReceiptFile == null) throw new Error("independent data resources require a runtime resource collection");
  if (typeof request.resourceReceiptFile === "string") {
    const resourceReceiptPath = resolve(request.resourceReceiptFile), originalReceipt = await readObject(resourceReceiptPath);
    const resourceReceipt = request.dataResourceReceiptFiles == null ? originalReceipt
      : await composeReleaseDataResources(originalReceipt, request.dataResourceReceiptFiles);
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
  const metadata = { schemaVersion: STANDALONE_METADATA_SCHEMA, channel: request.channel, releaseVersion: request.releaseVersion, standaloneVersion: request.standaloneVersion, sourceCommit: request.sourceCommit, publishedAt: request.publishedAt,
    blobs,
    resources: [
      { id: "standalone-launcher", component: "standalone.launcher", blob: standalone.sha256, sync: true, materialization: { type: "file", entrypoint: "launcher.mjs" } },
      { id: "closure", component: "standalone.resource", blob: closure.sha256, sync: true, materialization: { type: "file", entrypoint: "closure.mjs" } },
      ...closureResources.map((resource) => ({ id: resource.id, component: "standalone.resource", blob: resource.blob.sha256, sync: true, materialization: { type: "zip", entrypoint: resource.entrypoint, treeSha256: resource.treeSha256 } })),
    ],
    shell: Object.fromEntries(shellRecords.map((shell) => [shell.type, { version: { min: shell.minimumVersion }, buildHash: shell.buildHash }])),
  };
  const contentFile = join(documents, "content-metadata.json");
  await writeObject(contentFile, signed("metadata", metadata, keys));
  await writeObject(trustFile, { schemaVersion: 1, keys: keys.map(({ keyId, publicKey }) => ({ keyId, publicKey })) });
  const receipt: JsonObject = { schemaVersion: 2, operation: "exact.prepare", channel: request.channel, releaseVersion: request.releaseVersion, sourceCommit: request.sourceCommit, publishedAt: request.publishedAt, artifactBaseUrl: base, standaloneVersion: request.standaloneVersion, shells: shellRecords, closureArtifact: closure, standaloneArtifact: standalone, resourceArtifacts: closureResources.map(({ blob }) => blob), contentMetadata: await describeFile(contentFile), trustFile: await describeFile(trustFile) };
  await writeObject(receiptPath, receipt);
}

export async function finalizeContent(request: FinalizeExactContentInput, receiptPath: string): Promise<void> {
  const prepared = await readObject(String(request.prepareReceipt ?? ""));
  if (prepared.schemaVersion !== 2 || prepared.operation !== "exact.prepare") throw new Error("invalid exact.prepare receipt");
  const contributions = request.contributions;
  if (!Array.isArray(contributions) || contributions.length === 0) throw new Error("exact.finalize requires Shell contributions");
  const preparedShells = new Map((prepared.shells as JsonObject[]).map((shell) => [String(shell.type), shell]));
  const expected = new Set<string>((prepared.shells as JsonObject[]).flatMap((shell) => (shell.scenes as JsonObject[]).map((scene) => `${shell.type}/${scene.target}`)));
  const seen = new Set<string>(), distributions = new Map<string, JsonObject[]>();
  for (const key of preparedShells.keys()) distributions.set(key, []);
  const artifactDescription = async (descriptor: JsonObject, label: string, path?: string) => {
    if (descriptor.publication != null) {
      if (request.verifyPublishedArtifact == null) throw new Error("Published artifact requires origin verification");
      await request.verifyPublishedArtifact(descriptor);
      return { ...descriptor, file: basename(descriptor.file) };
    }
    return describeFile(await checkedFile(descriptor, label, path), descriptor.mediaType ?? "application/octet-stream");
  };
  const artifacts: JsonObject[] = await Promise.all([
    artifactDescription(prepared.closureArtifact, "Closure artifact", request.closureArtifactFile),
    artifactDescription(prepared.standaloneArtifact, "Standalone launcher artifact", request.standaloneArtifactFile),
  ]);
  artifacts.push(...await mapWithConcurrency((prepared.resourceArtifacts ?? []) as JsonObject[], 4, resource =>
    artifactDescription(resource, "Closure resource artifact", join(resolve(String(request.prepareReceipt), ".."), "artifacts", basename(String(resource.file))))));
  for (const raw of contributions) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid Shell contribution descriptor");
    const descriptor = raw as JsonObject, contribution = await readObject(String(descriptor.receipt ?? ""));
    const shellType = String(contribution.shell?.type ?? ""), target = String(contribution.target ?? ""), key = `${shellType}/${target}`;
    const shell = preparedShells.get(shellType), scene = (shell?.scenes as JsonObject[] | undefined)?.find((value) => value.target === target);
    if (contribution.schemaVersion !== 1 || contribution.operation !== "shell.distribution.contribute" || !expected.has(key) || seen.has(key)) throw new Error(`invalid or duplicate Shell contribution: ${key}`);
    if (contribution.shell?.version !== shell?.version || contribution.shell?.buildHash !== scene?.shellBuildHash) throw new Error(`Shell contribution identity mismatch: ${key}`);
    seen.add(key);
    const artifact = await artifactDescription(contribution.artifact, `${key} distribution`, descriptor.archiveFile);
    const path = artifact.file, mediaType = String(contribution.artifact.mediaType ?? "application/octet-stream");
    artifacts.push(artifact);
    if (contribution.updater != null && (contribution.updater.protocol !== "standalone-shell-updater-v4"
      || contribution.updater.interaction !== "restart-and-install" || typeof contribution.updater.handler !== "string" || !IDENTIFIER.test(contribution.updater.handler))) {
      throw new Error(`Shell contribution has an invalid updater contract: ${key}`);
    }
    if (shellType === "electron") {
      if (contribution.updater == null) throw new Error(`Electron Shell contribution lacks updater contract: ${key}`);
      const identity = contribution.installIdentity;
      if (identity == null || typeof identity !== "object" || Array.isArray(identity)
        || ["appId", "executableName", "namespace", "productName"].some((field) => typeof identity[field] !== "string" || identity[field].length === 0)) {
        throw new Error(`Electron Shell contribution lacks installed identity: ${key}`);
      }
      if (target.startsWith("darwin-") && (contribution.platformTrust?.platform !== "macos"
        || !["formal", "verify-only"].includes(String(contribution.platformTrust.mode))
        || typeof contribution.platformTrust.designatedRequirement !== "string" || contribution.platformTrust.designatedRequirement.length === 0
        || typeof contribution.platformTrust.teamIdentifier !== "string" || contribution.platformTrust.teamIdentifier.length === 0)) {
        throw new Error(`Electron Shell contribution lacks macOS trust identity: ${key}`);
      }
    }
    distributions.get(shellType)!.push({
      shell: { type: shellType, version: shell!.version, buildHash: scene!.shellBuildHash },
      target,
      ...(contribution.installIdentity == null ? {} : { installIdentity: contribution.installIdentity }),
      ...(contribution.platformTrust == null ? {} : { platformTrust: contribution.platformTrust }),
      artifact: { url: publicObjectUrl(String(prepared.artifactBaseUrl), path), sha256: artifact.sha256, size: artifact.size, mediaType },
      ...(contribution.updater == null ? {} : { updater: contribution.updater }),
    });
  }
  if (seen.size !== expected.size || [...expected].some((key) => !seen.has(key))) throw new Error("Shell contributions do not cover prepared topology");
  const keys = await signingKeys(), output = resolve(String(request.outputDirectory ?? "")), documents = join(output, "documents");
  await mkdir(documents, { recursive: true });
  const capsuleFiles: string[] = [];
  for (const shell of prepared.shells as JsonObject[]) {
    if (shell.type !== "electron") continue;
    for (const scene of shell.scenes as JsonObject[]) {
      const preparedRoot = resolve(request.prepareReceipt, "..");
      const manifest = await checkedFile(scene.capsule.manifest, "Capsule manifest", join(preparedRoot, "documents", `capsule-${scene.target}.json`));
      const archive = await checkedFile(scene.capsule.archive, "Capsule archive", join(preparedRoot, "artifacts", basename(scene.capsule.archive.file)));
      const destination = join(documents, basename(manifest));
      await copyFile(manifest, destination);
      capsuleFiles.push(destination);
      artifacts.push(await describeFile(archive, "application/zip"));
      const distribution = distributions.get("electron")!.find(value => value.target === scene.target)!;
      const manifestDescription = await describeFile(destination), archiveDescription = await describeFile(archive);
      distribution.capsule = validateElectronCapsuleRelease({ schemaVersion: 1,
        manifest: { url: publicObjectUrl(String(prepared.artifactBaseUrl), destination), sha256: manifestDescription.sha256, size: manifestDescription.size },
        archive: { url: publicObjectUrl(String(prepared.artifactBaseUrl), archive), sha256: archiveDescription.sha256, size: archiveDescription.size },
      });
      const capsuleManifest = assertElectronCapsuleReleaseManifest(distribution.capsule, (await readObject(destination)).document, scene.target);
      const platformDescription = await artifactDescription(scene.platform, "platform archive", join(preparedRoot, "artifacts", basename(scene.platform.file)));
      const platform = platformDescription.file;
      if (platformDescription.sha256 !== capsuleManifest.platform.blob.sha256 || platformDescription.size !== capsuleManifest.platform.blob.size
        || capsuleManifest.platform.blob.sources.length !== 1 || capsuleManifest.platform.blob.sources[0]!.url !== publicObjectUrl(String(prepared.artifactBaseUrl), platform)) {
        throw new Error("Capsule platform publication binding mismatch");
      }
      artifacts.push(platformDescription);
      // Re-evaluate current policy; a cached preparation receipt cannot waive it.
      await verifyCapsuleReleaseBudget(archive, capsuleManifest.archive);
    }
  }
  const contentSource = await checkedFile(prepared.contentMetadata, "content metadata", request.contentMetadataFile), contentFile = join(documents, "content-metadata.json");
  await copyFile(contentSource, contentFile);
  const content = await describeFile(contentFile), base = String(prepared.artifactBaseUrl);
  const lanes: JsonObject = { content: { releaseVersion: prepared.releaseVersion, url: publicObjectUrl(base, contentFile), sha256: content.sha256, size: content.size } };
  const shellMetadata: JsonObject = {}, shellFiles: string[] = [], requiredAcceptances: JsonObject[] = [];
  for (const shellType of [...distributions.keys()].sort()) {
    const values = distributions.get(shellType)!.sort((a, b) => String(a.target).localeCompare(String(b.target)));
    const shellDocument = { schemaVersion: 1, channel: prepared.channel, releaseVersion: prepared.releaseVersion, sourceCommit: prepared.sourceCommit, publishedAt: prepared.publishedAt, distributions: values };
    const shellFile = join(documents, `${shellType}-metadata.json`);
    await writeObject(shellFile, signed("document", shellDocument, keys));
    shellFiles.push(shellFile);
    const description = await describeFile(shellFile); shellMetadata[shellType] = description;
    lanes[shellType] = { releaseVersion: prepared.releaseVersion, url: publicObjectUrl(base, shellFile), sha256: description.sha256, size: description.size };
    for (const value of values) requiredAcceptances.push({
      shell: value.shell,
      target: value.target,
      ...(value.installIdentity == null ? {} : { installIdentity: value.installIdentity }),
      ...(value.platformTrust == null ? {} : { platformTrust: value.platformTrust }),
      artifact: value.artifact,
      shellMetadata: { url: lanes[shellType].url, sha256: description.sha256, size: description.size },
      ...(value.updater == null ? {} : { updater: value.updater }),
    });
  }
  const headFile = join(documents, "channel-head.json");
  await writeObject(headFile, signed("head", { schemaVersion: 1, channel: prepared.channel, publishedAt: prepared.publishedAt, lanes }, keys));
  const receipt: JsonObject = { schemaVersion: 2, operation: "exact.pack", channel: prepared.channel, releaseVersion: prepared.releaseVersion, sourceCommit: prepared.sourceCommit, shells: (prepared.shells as JsonObject[]).map(({ type, version, buildHash, minimumVersion }) => ({ type, version, buildHash, minimumVersion })), artifacts, documents: await Promise.all([contentFile, ...capsuleFiles, ...shellFiles, headFile].map((path) => describeFile(path))), contentMetadataFile: contentFile, shellMetadataFiles: Object.fromEntries(Object.entries(shellMetadata).map(([key, value]) => [key, value.file])), channelHeadFile: headFile, requiredAcceptances };
  if (shellMetadata.terminal != null) Object.assign(receipt, { terminalMetadataFile: shellMetadata.terminal.file, shellBuildHash: preparedShells.get("terminal")!.buildHash, minimumShellVersion: preparedShells.get("terminal")!.minimumVersion });
  await writeObject(receiptPath, receipt);
}
