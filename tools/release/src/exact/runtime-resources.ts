import { copyFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { stageArtifactProduct } from "./artifact-staging.ts";
import { openArtifactProduct } from "./artifact-acquisition.ts";
import { buildReleaseRuntimeResources } from "./resource-build.ts";

const IDS = ["open-design-daemon", "open-design-web"] as const;
const RECEIPT = "resource-receipt.json";
type Source = Readonly<{ id: typeof IDS[number]; artifact?: Readonly<{ url: string; sha256: string }> }>;
type Input = Readonly<{ sources: string; target: string; output: string; receipt: string }>;

async function sources(file: string, complete: boolean): Promise<readonly Source[]> {
  const value = await readObject(file);
  if (Object.keys(value).join(",") !== "sources" || !Array.isArray(value.sources)
    || (complete && value.sources.length !== IDS.length)
    || new Set(value.sources.map(item => item?.id)).size !== value.sources.length
    || value.sources.some(item => item == null || !IDS.includes(item.id)
      || Object.keys(item).some(key => key !== "id" && key !== "artifact")
      || (Object.hasOwn(item, "artifact") && (item.artifact == null
        || Object.keys(item.artifact).sort().join(",") !== "sha256,url"
        || typeof item.artifact.url !== "string" || !/^[a-f0-9]{64}$/u.test(item.artifact.sha256 ?? ""))))) {
    throw new Error("invalid runtime resource source set");
  }
  return value.sources;
}

async function product(directory: string, id: string, target: string) {
  const receipt = await readObject(join(directory, RECEIPT)), resource = receipt.resource;
  if (Object.keys(receipt).sort().join(",") !== "operation,resource,schemaVersion,target"
    || receipt.schemaVersion !== 1 || receipt.operation !== "closure.runtime-resource.build" || receipt.target !== target
    || resource == null || Object.keys(resource).sort().join(",") !== "entrypoint,file,id,sha256,size,treeSha256"
    || resource.id !== id || !IDS.some(value => value === id) || resource.file !== `${id}.zip` || resource.entrypoint !== "sidecar.mjs"
    || !/^[a-f0-9]{64}$/u.test(resource.sha256 ?? "") || !/^[a-f0-9]{64}$/u.test(resource.treeSha256 ?? "")
    || !Number.isSafeInteger(resource.size) || resource.size <= 0) throw new Error("invalid runtime resource product binding");
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile()) || entries.map(entry => entry.name).sort().join(",") !== [RECEIPT, resource.file].sort().join(",")) {
    throw new Error("unexpected runtime resource payload");
  }
  await checkedFile(resource, "runtime product", join(directory, resource.file));
  return receipt;
}

async function copyProduct(directory: string, output: string, id: string, target: string) {
  const receipt = await product(directory, id, target);
  await stageArtifactProduct(output, async stage => {
    await copyFile(join(directory, receipt.resource.file), join(stage, receipt.resource.file));
    await writeObject(join(stage, RECEIPT), receipt);
    await product(stage, id, target);
  });
  return { ...receipt.resource, path: join(resolve(output), receipt.resource.file) };
}

/** A single workspace installation can produce either or both runtime misses.
 * Each result contributes independently; no cache hit reaches this producer. */
export async function buildRuntimeResourceBatch(input: Input & Readonly<{ root: string }>) {
  const selected = await sources(input.sources, false);
  if (input.target !== `${process.platform}-${process.arch}`) throw new Error("runtime build requires the native target");
  if (!selected.length || selected.some(source => source.artifact != null)) throw new Error("runtime build requires only selected misses");
  const build = await buildReleaseRuntimeResources({ root: input.root, resourceIds: selected.map(source => source.id),
    output: join(input.output, "build"), receipt: join(input.output, "build.json") });
  for (const resource of build.resources) {
    const directory = join(input.output, "products", resource.id);
    await stageArtifactProduct(directory, async stage => {
      const { id, file, sha256, size, treeSha256, entrypoint } = resource;
      await copyFile(resource.path, join(stage, file));
      await writeObject(join(stage, RECEIPT), { schemaVersion: 1, operation: "closure.runtime-resource.build", target: input.target,
        resource: { id, file, sha256, size, treeSha256, entrypoint } });
      await product(stage, id, input.target);
    });
  }
  await writeObject(input.receipt, { schemaVersion: 1, operation: "closure.runtime-resources.produce", target: input.target,
    resources: build.resources.map(({ id }) => ({ id, directory: join(resolve(input.output), "products", id) })) });
}

/** Scene composition gets verified native products; it never invokes a build. */
export async function acquireRuntimeResources(input: Input & Readonly<{ products: string }>) {
  const selected = await sources(input.sources, true);
  const settled = await Promise.allSettled(selected.map(async source => {
    const output = join(input.output, source.id);
    if (source.artifact == null) return copyProduct(join(input.products, source.id), output, source.id, input.target);
    await using opened = await openArtifactProduct(source.artifact);
    return await copyProduct(opened.archive.root, output, source.id, input.target);
  }));
  const resources: JsonObject[] = settled.map(result => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  await writeObject(input.receipt, { schemaVersion: 1, operation: "closure.runtime-resources.build", resources });
}
