import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { CLOSURE_RUNTIME_RESOURCE_IDS } from "@open-design/closure/build-runtime-resources";
import { STANDALONE_METADATA_SCHEMA, signStandaloneMetadata, type StandaloneMetadata } from "@open-design/standalone";
import { afterEach, expect, it, vi } from "vitest";
import { prepareSelectedResources } from "@/exact/resource-selection.ts";
import { prepareContent, finalizeContent } from "@/exact/content.ts";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-resource-selection-")); roots.push(root);
  const artifacts = join(root, "artifacts"); await mkdir(artifacts);
  const pair = generateKeyPairSync("ed25519");
  const ids = [...CLOSURE_RUNTIME_RESOURCE_IDS, ...CLOSURE_DATA_RESOURCES.map(({ id }) => id)];
  const channel = "betahyx", releaseVersion = "0.1.0-betahyx.2", prior = "0.1.0-betahyx.1";
  const channelBase = "https://releases.invalid/product/betahyx/", url = `${channelBase}${prior}/content-metadata.json`;
  const metadata: StandaloneMetadata = {
    schemaVersion: STANDALONE_METADATA_SCHEMA, channel, releaseVersion: prior, standaloneVersion: "0.1.0",
    sourceCommit: "a".repeat(40), publishedAt: "2026-09-10T00:00:00Z", shell: { terminal: { version: { min: "0.1.0" }, buildHash: "b".repeat(64) } },
    blobs: Object.fromEntries(ids.map(id => [digest(id), { sha256: digest(id), size: id.length, mediaType: "application/zip",
      sources: [{ kind: "remote", url: `${channelBase}${prior}/${id}-${digest(id)}.zip` }] }])),
    resources: ids.map(id => ({ id, component: "standalone.resource", blob: digest(id), sync: true,
      materialization: { type: "zip", entrypoint: "resource.json", treeSha256: "c".repeat(64) } })),
  };
  metadata.blobs[digest("launcher")] = { sha256: digest("launcher"), size: 8, mediaType: "text/javascript",
    sources: [{ kind: "remote", url: `${channelBase}${prior}/launcher.mjs` }] };
  metadata.resources.push({ id: "standalone-launcher", component: "standalone.launcher", blob: digest("launcher"), sync: true,
    materialization: { type: "file", entrypoint: "launcher.mjs" } });
  const body = JSON.stringify(signStandaloneMetadata(metadata, "test", pair.privateKey));
  const fetcher = vi.fn(async () => new Response(body)); vi.stubGlobal("fetch", fetcher);
  const selection = { schemaVersion: 1, operation: "release.resources.select", resources: ids.map(id => ({
    kind: "published", id, sha256: digest(id), metadata: { url, sha256: digest(body) },
  })) };
  const input = { selection, selectionFile: join(root, "selection.json"), artifacts, channel, releaseVersion,
    artifactBaseUrl: `${channelBase}${releaseVersion}`, keys: new Map([["test", pair.publicKey.export({ type: "spki", format: "pem" }).toString()]]) };
  return { root, pair, ids, metadata, body, fetcher, input };
}

it("hot-selects the complete resource set with one metadata fetch and no ZIP or local artifact", async () => {
  const { input, fetcher, ids } = await fixture();
  const result = await prepareSelectedResources(input);
  expect(result.map(resource => resource.id)).toEqual(ids);
  expect(result.every(resource => resource.artifact == null)).toBe(true);
  expect(await readdir(input.artifacts)).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(input.selection.resources[0]!.metadata.url, expect.objectContaining({ redirect: "error" }));
});

it("mixes a new local daemon with published resources and verifies new bytes before upload", async () => {
  const { root, input } = await fixture();
  const file = join(root, "daemon.zip"), receiptFile = join(root, "runtime.json");
  await writeFile(file, "new daemon");
  await writeFile(receiptFile, JSON.stringify({ schemaVersion: 1, operation: "closure.runtime-resources.build", resources: [{
    id: "open-design-daemon", file: "daemon.zip", sha256: digest("new daemon"), size: 10, entrypoint: "sidecar.mjs", treeSha256: "d".repeat(64),
  }] }));
  const selection = { ...input.selection, resources: [{ kind: "local", id: "open-design-daemon", receiptFile: "runtime.json" }, ...input.selection.resources.slice(1)] };
  const result = await prepareSelectedResources({ ...input, selection });
  expect(result.filter(resource => resource.artifact != null)).toHaveLength(1);
  expect(await readFile(result[0]!.artifact!.file, "utf8")).toBe("new daemon");
  expect(result[0]!.blob.sources[0]!.url).toBe(`${input.artifactBaseUrl}/daemon.zip`);
  await writeFile(file, "corrupt");
  await expect(prepareSelectedResources({ ...input, selection })).rejects.toThrow("binding verification failed");
});

it.each(["missing", "duplicate", "cache-origin", "other-channel", "latest", "current", "digest", "blob", "signature", "source-cache"])("rejects %s without accepting an unbound published resource", async kind => {
  const { input, metadata, pair, fetcher } = await fixture();
  const first = input.selection.resources[0]!;
  if (kind === "missing") input.selection.resources.pop();
  if (kind === "duplicate") input.selection.resources[1] = first;
  if (kind === "cache-origin") first.metadata.url = first.metadata.url.replace("releases.invalid", "workload-results.invalid");
  if (kind === "other-channel") first.metadata.url = first.metadata.url.replace("/betahyx/", "/stable/");
  if (kind === "latest") first.metadata.url = first.metadata.url.replace("0.1.0-betahyx.1", "latest");
  if (kind === "current") first.metadata.url = first.metadata.url.replace("0.1.0-betahyx.1", input.releaseVersion);
  if (kind === "digest") first.metadata.sha256 = "0".repeat(64);
  if (kind === "blob") first.sha256 = "0".repeat(64);
  if (kind === "signature" || kind === "source-cache") {
    if (kind === "source-cache") metadata.blobs[first.sha256] = { ...metadata.blobs[first.sha256]!, sources: [{ kind: "remote", url: "https://workload-results.invalid/cache.zip" }] };
    const envelope = signStandaloneMetadata(metadata, "test", pair.privateKey);
    if (kind === "signature") envelope.metadata.sourceCommit = "f".repeat(40);
    const body = JSON.stringify(envelope); first.metadata.sha256 = digest(body);
    fetcher.mockImplementation(async () => new Response(body));
  }
  await expect(prepareSelectedResources(input)).rejects.toThrow();
  expect(await readdir(input.artifacts)).toEqual([]);
});

it("carries published URLs through prepare/finalize without placing old ZIPs in the upload receipt", async () => {
  const { root, pair, input, ids } = await fixture();
  vi.stubEnv("OD_EXACT_SIGNING_KEY_ID", "test");
  vi.stubEnv("OD_EXACT_ED25519_PRIVATE_KEY", pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const closure = join(root, "closure.mjs"), launcher = join(root, "launcher.mjs"), scene = join(root, "scene");
  await mkdir(scene); await writeFile(closure, "closure"); await writeFile(launcher, "launcher");
  const manifest = JSON.stringify({ schemaVersion: 1, target: "darwin-arm64", shellVersion: "0.1.0", shellBuildHash: "e".repeat(64),
    closure: { sha256: digest("closure") }, standalone: { sha256: digest("launcher") } });
  await writeFile(join(scene, "scene.json"), manifest);
  await writeFile(input.selectionFile, JSON.stringify(input.selection));
  const output = join(root, "prepared"), receiptFile = join(output, "prepare-receipt.json");
  await prepareContent({ channel: input.channel, releaseVersion: input.releaseVersion, sourceCommit: "a".repeat(40),
    publishedAt: "2026-09-10T00:00:00Z", standaloneVersion: "0.1.0", artifactBaseUrl: input.artifactBaseUrl,
    closureArtifactFile: closure, standaloneArtifactFile: launcher, resourceReceiptFile: input.selectionFile,
    shells: [{ type: "terminal", version: "0.1.0", scenes: [{ target: "darwin-arm64", sceneDirectory: scene, sceneManifestSha256: digest(manifest) }] }], outputDirectory: output }, receiptFile);
  const prepared = JSON.parse(await readFile(receiptFile, "utf8"));
  expect(prepared.resourceArtifacts).toEqual([]);
  const content = JSON.parse(await readFile(prepared.contentMetadata.file, "utf8"));
  for (const id of ids) expect(content.metadata.blobs[digest(id)].sources[0].url).toContain("/0.1.0-betahyx.1/");
  const contribution = join(root, "contribution.json"), archive = join(root, "terminal.zip"); await writeFile(archive, "terminal");
  await writeFile(contribution, JSON.stringify({ schemaVersion: 1, operation: "shell.distribution.contribute", target: "darwin-arm64",
    shell: { type: "terminal", version: "0.1.0", buildHash: "e".repeat(64) }, artifact: { file: archive, sha256: digest("terminal"), size: 8, mediaType: "application/zip" } }));
  const final = join(root, "final"), packed = join(final, "pack-receipt.json");
  await finalizeContent({ prepareReceipt: receiptFile, contentMetadataFile: prepared.contentMetadata.file,
    closureArtifactFile: prepared.closureArtifact.file, standaloneArtifactFile: prepared.standaloneArtifact.file,
    contributions: [{ receipt: contribution, archiveFile: archive }], outputDirectory: final }, packed);
  const receipt = JSON.parse(await readFile(packed, "utf8"));
  expect(receipt.artifacts).toHaveLength(3);
  expect(receipt.resourcePublications).toEqual(ids.map(id => ({ id, sha256: digest(id), metadata: {
    url: `${input.artifactBaseUrl}/content-metadata.json`, sha256: prepared.contentMetadata.sha256,
  } })));
  expect(receipt.artifacts.some((artifact: { sha256: string }) => ids.some(id => digest(id) === artifact.sha256))).toBe(false);
});
