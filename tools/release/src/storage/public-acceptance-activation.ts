import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  releaseAcceptanceObjectKey,
  releaseVersionPrefix,
  type ReleaseTarget,
} from "@open-design/release";

import { normalizePublicUrl } from "./common.ts";
import { publishLatestRelease, sha256Digest } from "./latest-publication.ts";
import {
  artifactBinding,
  assertFileBinding,
  assertIdentity,
  assertPublicImmutableUrl,
  assertRecord,
  childRecord,
  fetchBytes,
  numberField,
  parseCredential,
  parseJsonBytes,
  resolvePublicClosure,
  stringField,
  type JsonRecord,
} from "./public-acceptance.ts";
import { publicAcceptanceTargets as targetDefinitions } from "./public-acceptance-targets.ts";
import { publishReleaseInventory, type ReleaseInventoryObject } from "./release-inventory.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

async function uploadImmutableCredential(input: {
  credentialBytes: Buffer;
  credentialPath: string;
  objectKey: string;
  storage: StorageConfig;
}): Promise<void> {
  const result = await putStorageObjectWithStatus({
    ...input.storage,
    bodyPath: input.credentialPath,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    headers: { "if-none-match": "*" },
    objectKey: input.objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) {
    throw new Error(`acceptance credential PUT failed with HTTP ${result.status}: ${result.body}`);
  }
  const existing = await getStorageObject({ ...input.storage, objectKey: input.objectKey });
  if (existing == null || !existing.bytes.equals(input.credentialBytes)) {
    throw new Error(`immutable acceptance credential conflict: ${input.objectKey}`);
  }
}

export async function activateAcceptedPublicRelease(input: {
  credentialPaths: string[];
  fetchImpl?: typeof fetch;
  publicOrigin: string;
  storage: StorageConfig;
  workDir: string;
}): Promise<{
  acceptanceUrls: Record<ReleaseTarget, string>;
  inventoryUrl: string;
  latestMetadataUrl: string;
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const accepted = await Promise.all(input.credentialPaths.map(async (path) => {
    const bytes = await readFile(path);
    return { bytes, credential: parseCredential(parseJsonBytes(bytes, `public acceptance credential ${path}`)), path };
  }));
  const requiredTargets = Object.keys(targetDefinitions).sort();
  const acceptedTargets = accepted.map(({ credential }) => credential.target).sort();
  if (!isDeepStrictEqual(acceptedTargets, requiredTargets)) {
    throw new Error(`activation requires exactly ${requiredTargets.join(", ")}; got ${acceptedTargets.join(", ") || "none"}`);
  }
  const primary = accepted[0]?.credential;
  if (primary == null) throw new Error("activation requires public acceptance credentials");
  for (const { credential } of accepted) {
    if (
      credential.commit !== primary.commit
      || credential.releaseVersion !== primary.releaseVersion
      || !isDeepStrictEqual(credential.metadata, primary.metadata)
    ) throw new Error("public acceptance credentials do not bind one release identity");
    for (const [label, binding] of [
      ["credential metadata URL", credential.metadata],
      [`credential ${credential.target} platform manifest URL`, credential.platformManifest],
      [`credential ${credential.artifactKind} URL`, credential.artifact],
    ] as const) assertPublicImmutableUrl(binding.url, input.publicOrigin, label);
  }
  const metadataBytes = await fetchBytes(primary.metadata.url, fetchImpl);
  assertFileBinding(
    { digest: sha256Digest(metadataBytes), size: metadataBytes.byteLength },
    primary.metadata,
    "public metadata",
  );
  const metadata = parseJsonBytes(metadataBytes, "public metadata");
  const metadataR2 = childRecord(metadata, "r2", "metadata");
  if (stringField(metadataR2, "versionMetadataUrl", "metadata.r2") !== primary.metadata.url) {
    throw new Error("accepted metadata URL no longer matches its public metadata identity");
  }
  const closureManifestUrl = normalizePublicUrl(stringField(metadataR2, "closureManifestUrl", "metadata.r2"));
  assertPublicImmutableUrl(closureManifestUrl, input.publicOrigin, "Closure manifest URL");
  const closureManifestBytes = await fetchBytes(closureManifestUrl, fetchImpl);
  const publicClosureManifest = parseJsonBytes(closureManifestBytes, "public Closure manifest");
  const embeddedClosure = childRecord(metadata, "closure", "metadata");
  if (!isDeepStrictEqual(publicClosureManifest, embeddedClosure)) {
    throw new Error("public Closure manifest differs from metadata.closure");
  }
  const platformBytes = new Map<ReleaseTarget, Buffer>();
  for (const { credential } of accepted) {
    const bytes = await fetchBytes(credential.platformManifest.url, fetchImpl);
    assertFileBinding(
      { digest: sha256Digest(bytes), size: bytes.byteLength },
      credential.platformManifest,
      `public ${credential.target} platform manifest`,
    );
    const platform = parseJsonBytes(bytes, `public ${credential.target} platform manifest`);
    assertIdentity({
      commit: credential.commit,
      metadata,
      platform,
      releaseVersion: credential.releaseVersion,
      target: credential.target,
    });
    const publicArtifact = artifactBinding(
      childRecord(platform, "artifacts", "platform")[credential.artifactKind],
      `platform.artifacts.${credential.artifactKind}`,
    );
    if (!isDeepStrictEqual(publicArtifact, credential.artifact)) {
      throw new Error(`accepted ${credential.artifactKind} no longer matches ${credential.target} metadata`);
    }
    const publicClosure = resolvePublicClosure({
      expectedVersion: credential.closure.version,
      metadata,
      publicOrigin: input.publicOrigin,
      target: credential.target,
    });
    if (!isDeepStrictEqual(publicClosure.binding, credential.closure)) {
      throw new Error(`accepted Closure binding no longer matches ${credential.target} metadata`);
    }
    if (!isDeepStrictEqual(publicClosure.coldStart, {
      budgetBytes: credential.coldStart.budgetBytes,
      components: credential.coldStart.components,
      requiredBytes: credential.coldStart.requiredBytes,
      target: credential.coldStart.target,
    })) throw new Error(`accepted cold-start budget no longer matches ${credential.target} metadata`);
    platformBytes.set(credential.target, bytes);
  }

  const releaseTargets = childRecord(metadata, "releaseTargets", "metadata");
  const platformInputs: Record<string, { manifest: JsonRecord; path: string }> = {};
  await mkdir(input.workDir, { recursive: true });
  for (const [target, embedded] of Object.entries(releaseTargets)) {
    assertRecord(embedded, `metadata.releaseTargets.${target}`);
    if (embedded.status !== "published") continue;
    const r2 = childRecord(embedded, "r2", `metadata.releaseTargets.${target}`);
    const url = normalizePublicUrl(stringField(r2, "versionManifestUrl", `${target}.r2`));
    assertPublicImmutableUrl(url, input.publicOrigin, `${target} platform manifest URL`);
    const bytes = platformBytes.get(target as ReleaseTarget) ?? await fetchBytes(url, fetchImpl);
    const manifest = parseJsonBytes(bytes, `${target} public platform manifest`);
    if (!isDeepStrictEqual(embedded, manifest)) {
      throw new Error(`combined metadata ${target} differs from its immutable platform manifest`);
    }
    const path = join(input.workDir, `${target}.json`);
    await writeFile(path, bytes);
    platformInputs[target] = { manifest, path };
  }
  const versionPrefix = stringField(metadataR2, "versionPrefix", "metadata.r2");
  const expectedVersionPrefix = releaseVersionPrefix("beta", primary.releaseVersion);
  if (versionPrefix !== expectedVersionPrefix) {
    throw new Error(`accepted metadata has unexpected version prefix: ${versionPrefix}`);
  }
  const acceptanceUrls = {} as Record<ReleaseTarget, string>;
  const versionRootUrl = `${input.publicOrigin.replace(/\/+$/u, "")}/${expectedVersionPrefix}`;
  const versionLockUrl = `${versionRootUrl}/version.lock.json`;
  const versionLockBytes = await fetchBytes(versionLockUrl, fetchImpl);
  const inventoryObjects: ReleaseInventoryObject[] = [
    { kind: "metadata", ...primary.metadata },
    {
      digest: sha256Digest(versionLockBytes),
      kind: "version-lock",
      size: versionLockBytes.byteLength,
      url: versionLockUrl,
    },
  ];
  for (const { bytes, credential, path } of accepted) {
    const key = releaseAcceptanceObjectKey("beta", primary.releaseVersion, credential.target);
    await uploadImmutableCredential({
      credentialBytes: bytes,
      credentialPath: path,
      objectKey: key,
      storage: input.storage,
    });
    acceptanceUrls[credential.target] = normalizePublicUrl(`${input.publicOrigin.replace(/\/+$/u, "")}/${key}`);
    inventoryObjects.push(
      { kind: "platform-manifest", target: credential.target, ...credential.platformManifest },
      { kind: credential.artifactKind, target: credential.target, ...credential.artifact },
      {
        digest: sha256Digest(bytes),
        kind: "acceptance",
        size: bytes.byteLength,
        target: credential.target,
        url: acceptanceUrls[credential.target],
      },
    );
  }
  inventoryObjects.push({
    digest: sha256Digest(closureManifestBytes),
    kind: "closure-manifest",
    size: closureManifestBytes.byteLength,
    url: closureManifestUrl,
  });
  const closureBlobs = childRecord(embeddedClosure, "blobs", "metadata.closure");
  for (const blob of Object.values(closureBlobs)) {
    assertRecord(blob, "metadata.closure.blob");
    inventoryObjects.push({
      digest: stringField(blob, "digest", "metadata.closure.blob"),
      kind: "closure-blob",
      size: numberField(blob, "size", "metadata.closure.blob"),
      url: stringField(blob, "url", "metadata.closure.blob"),
    });
  }
  for (const [target, platform] of Object.entries(releaseTargets)) {
    assertRecord(platform, `metadata.releaseTargets.${target}`);
    const artifacts = childRecord(platform, "artifacts", `metadata.releaseTargets.${target}`);
    for (const artifact of Object.values(artifacts)) {
      const binding = artifactBinding(artifact, `${target} Shell artifact`);
      inventoryObjects.push({ kind: "shell-artifact", target, ...binding });
    }
  }
  const inventoryUrl = await publishReleaseInventory({
    channel: "beta",
    objects: inventoryObjects,
    publicOrigin: input.publicOrigin,
    releaseVersion: primary.releaseVersion,
    storage: input.storage,
    workDir: input.workDir,
  });
  if (stringField(metadataR2, "inventoryUrl", "metadata.r2") !== inventoryUrl) {
    throw new Error("metadata inventory URL does not match the final release inventory");
  }
  const metadataPath = join(input.workDir, "metadata.json");
  await writeFile(metadataPath, metadataBytes);
  await publishLatestRelease({
    channel: "beta",
    metadataDir: input.workDir,
    metadataPath,
    platforms: platformInputs,
    releaseVersion: primary.releaseVersion,
    storage: input.storage,
  });
  return {
    acceptanceUrls,
    inventoryUrl,
    latestMetadataUrl: normalizePublicUrl(`${input.publicOrigin.replace(/\/+$/u, "")}/beta/latest/metadata.json`),
  };
}
