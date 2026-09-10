import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { canonicalBytes, checkedFile, readObject } from "./control-common.ts";
import { importDataResource } from "./resource-artifact.ts";
import { validateDataResourceReceipt } from "./resource-composition.ts";
import { stageArtifactProduct } from "./artifact-product.ts";

/** Acquire a complete version input set. Missing local products fail instead
 * of causing implicit builds; cached products are acquired at their consumer,
 * never re-exported as new workload contributions. */
export async function acquireReleaseDataResources(input: Readonly<{
  sources: string; products: string; output: string; receipt: string;
}>) {
  const request = await readObject(input.sources), expected = CLOSURE_DATA_RESOURCES.map(({ id }) => id);
  if (Object.keys(request).join(",") !== "sources" || !Array.isArray(request.sources)
    || request.sources.length !== expected.length || new Set(request.sources.map(source => source?.id)).size !== expected.length
    || request.sources.some(source => source == null || !expected.includes(source.id)
      || Object.keys(source).some(key => key !== "id" && key !== "artifact")
      || (Object.hasOwn(source, "artifact") && (source.artifact == null
        || Object.keys(source.artifact).sort().join(",") !== "sha256,url"
        || typeof source.artifact.url !== "string" || !/^[a-f0-9]{64}$/u.test(source.artifact.sha256 ?? ""))))) {
    throw new Error("resource acquisition requires the complete declared source set");
  }
  const settled = await Promise.allSettled(request.sources.map(async source => {
    const output = join(resolve(input.output), source.id);
    if (source.artifact != null) return { resourceId: source.id,
      ...await importDataResource({ resourceId: source.id, descriptor: source.artifact, output }) };
    const directory = join(resolve(input.products), source.id);
    const receipt = await readObject(join(directory, "resource-receipt.json"));
    const resource = validateDataResourceReceipt(receipt);
    if (resource.id !== source.id) throw new Error("local data product identity mismatch");
    const file = await checkedFile(resource, "local data product", join(directory, resource.file));
    const resourceReceipt = join(output, "resource-receipt.json");
    const { id, sha256, size, treeSha256, entrypoint, sync } = resource;
    await stageArtifactProduct(output, async stage => {
      const destination = join(stage, resource.file);
      await copyFile(file, destination);
      await checkedFile(resource, "acquired data product", destination);
      await writeFile(join(stage, "resource-receipt.json"), canonicalBytes({ schemaVersion: 1, operation: "closure.data-resource.build",
        resource: { id, file: resource.file, sha256, size, treeSha256, entrypoint, sync } }), { flag: "wx" });
    });
    return { resourceId: source.id, resourceReceipt };
  }));
  const resources = settled.map(result => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes({ schemaVersion: 1, operation: "closure.data-resources.acquire", resources }), { flag: "wx" });
}
