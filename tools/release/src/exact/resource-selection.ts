import { createHash } from "node:crypto";
import { copyFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { CLOSURE_RUNTIME_RESOURCE_IDS } from "@open-design/closure/build-runtime-resources";
import { parseReleaseVersion } from "@open-design/release";
import { verifyStandaloneMetadata, type SignedStandaloneMetadata, type StandaloneBlob } from "@open-design/standalone";
import { checkedFile, describeFile, readObject, type JsonObject } from "./control-common.ts";
import { validateDataResourceReceipt } from "./resource-composition.ts";

export type PreparedResource = Readonly<{
  id: string; entrypoint: string; treeSha256: string; blob: StandaloneBlob;
  artifact?: JsonObject;
}>;

/** Local products still cross the checksum boundary before publication. The
 * prepared artifact list contains only bytes this release must upload. */
export async function prepareLocalResource(resource: JsonObject, receiptFile: string, artifacts: string, artifactBaseUrl: string): Promise<PreparedResource> {
  if (typeof resource.id !== "string" || typeof resource.file !== "string" || typeof resource.entrypoint !== "string"
    || !/^[a-f0-9]{64}$/u.test(resource.treeSha256 ?? "") || !/^[a-f0-9]{64}$/u.test(resource.sha256 ?? "")
    || !Number.isSafeInteger(resource.size) || resource.size <= 0) throw new Error("exact.prepare resource descriptor is incomplete");
  const source = await checkedFile(resource, `Closure resource ${resource.id}`, typeof resource.path === "string"
    ? resolve(resource.path) : resolve(dirname(receiptFile), basename(resource.file)));
  const destination = join(artifacts, basename(resource.file));
  await copyFile(source, destination);
  const artifact = await describeFile(destination, "application/zip");
  if (artifact.sha256 !== resource.sha256 || artifact.size !== resource.size) throw new Error("Closure resource changed during copy");
  return { id: resource.id, entrypoint: resource.entrypoint, treeSha256: resource.treeSha256, artifact,
    blob: { sha256: resource.sha256, size: resource.size, mediaType: "application/zip",
      sources: [{ kind: "remote", url: `${artifactBaseUrl.replace(/\/$/u, "")}/${basename(destination)}` }] } };
}

/** Selection is a business input, not a workload/cache identity. Published
 * sources must be witnessed by a checksum-bound, signed document acquired from
 * this channel's immutable distribution namespace. Never fetch the ZIP merely
 * to relay it, and never promote a workload cache URL into product metadata. */
export async function prepareSelectedResources(input: Readonly<{
  selection: JsonObject; selectionFile: string; artifacts: string; artifactBaseUrl: string;
  channel: string; releaseVersion: string; keys: ReadonlyMap<string, string>;
}>): Promise<readonly PreparedResource[]> {
  const expected = [...CLOSURE_RUNTIME_RESOURCE_IDS, ...CLOSURE_DATA_RESOURCES.map(({ id }) => id)];
  const entries = input.selection.resources;
  if (input.selection.schemaVersion !== 1 || input.selection.operation !== "release.resources.select" || !Array.isArray(entries)
    || entries.length !== expected.length || new Set(entries.map(entry => entry?.id)).size !== expected.length
    || entries.some(entry => !expected.includes(entry?.id))) throw new Error("resource selection must contain exactly the declared resource set");
  const base = input.artifactBaseUrl.replace(/\/$/u, "");
  const suffix = `/${input.channel}/${input.releaseVersion}`;
  if (!base.endsWith(suffix)) throw new Error("resource selection requires a channel-version artifact base");
  const channelBase = `${base.slice(0, -input.releaseVersion.length)}`;
  const origin = new URL(base).origin;
  const immutableUrl = (raw: unknown): string => {
    if (typeof raw !== "string" || !raw.startsWith(channelBase)) throw new Error("resource publication URL is outside the channel");
    const url = new URL(raw), parts = raw.slice(channelBase.length).split("/");
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || url.href !== raw
      || parts.length !== 2 || !/^[a-zA-Z0-9._-]+$/u.test(parts[1]!) || parts[0] === input.releaseVersion) {
      throw new Error("resource publication URL must name an existing immutable version object");
    }
    parseReleaseVersion(parts[0]!, input.channel);
    return raw;
  };
  const documents = new Map<string, Promise<SignedStandaloneMetadata>>();
  const result: PreparedResource[] = [];
  for (const id of expected) {
    const entry = entries.find(value => value.id === id)!;
    if (entry.kind === "local") {
      if (typeof entry.receiptFile !== "string" || entry.metadata != null) throw new Error("invalid local resource selection");
      const file = resolve(dirname(input.selectionFile), entry.receiptFile), receipt = await readObject(file);
      const resources = receipt.operation === "closure.data-resource.build" ? [validateDataResourceReceipt(receipt)]
        : receipt.schemaVersion === 1 && ["closure.runtime-resources.build", "closure.resources.build"].includes(receipt.operation)
          && Array.isArray(receipt.resources) ? receipt.resources : [];
      const matches = resources.filter(resource => resource?.id === id);
      if (matches.length !== 1) throw new Error(`local resource receipt lacks unique selection: ${id}`);
      result.push(await prepareLocalResource(matches[0]!, file, input.artifacts, base));
    } else if (entry.kind === "published") {
      if (entry.receiptFile != null || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")
        || !/^[a-f0-9]{64}$/u.test(entry.metadata?.sha256 ?? "")) throw new Error("invalid published resource binding");
      const url = immutableUrl(entry.metadata.url);
      if (!url.endsWith("/content-metadata.json")) throw new Error("resource publication requires content metadata");
      const key = `${url}#${entry.metadata.sha256}`;
      let document = documents.get(key);
      if (document == null) {
        document = (async () => {
          const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
          if (!response.ok) throw new Error(`resource publication acquisition failed (${response.status})`);
          const bytes = Buffer.from(await response.arrayBuffer());
          if (createHash("sha256").update(bytes).digest("hex") !== entry.metadata.sha256) throw new Error("resource publication metadata digest mismatch");
          const envelope = JSON.parse(bytes.toString("utf8")) as SignedStandaloneMetadata;
          verifyStandaloneMetadata(envelope, input.keys);
          if (envelope.metadata.channel !== input.channel || url !== `${channelBase}${envelope.metadata.releaseVersion}/content-metadata.json`) {
            throw new Error("resource publication metadata identity mismatch");
          }
          return envelope;
        })();
        documents.set(key, document);
      }
      const { metadata } = await document;
      const resource = metadata.resources.find(value => value.id === id), blob = metadata.blobs[entry.sha256];
      if (resource == null || resource.blob !== entry.sha256 || resource.component !== "standalone.resource" || resource.materialization.type !== "zip"
        || blob == null || blob.mediaType !== "application/zip" || blob.sources.length === 0) throw new Error("published resource binding mismatch");
      for (const source of blob.sources) immutableUrl(source.url);
      result.push({ id, blob, entrypoint: resource.materialization.entrypoint, treeSha256: resource.materialization.treeSha256 });
    } else throw new Error("resource selection kind must be local or published");
  }
  return result;
}
