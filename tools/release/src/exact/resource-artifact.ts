import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertArtifactDestinationAbsent, stageArtifactProduct, openArtifactProduct, writeArtifactEntry } from "./artifact-product.ts";
import { validateDataResourceReceipt } from "./resource-composition.ts";

type Input = Readonly<{ resourceId: string; output: string }>;
const RECEIPT = "resource-receipt.json";
function boundResource(receipt: JsonObject, resourceId: string) {
  const resource = validateDataResourceReceipt(receipt);
  if (resource.id !== resourceId) throw new Error("data resource identity mismatch");
  return resource;
}
/** Export verified neutral bytes and a relocatable business receipt. */
export async function exportDataResource(input: Input & Readonly<{ resourceReceipt: string }>) {
  const receipt = await readObject(input.resourceReceipt);
  const resource = boundResource(receipt, input.resourceId);
  const source = await checkedFile(resource, "data contribution", resolve(dirname(input.resourceReceipt), resource.file));
  await stageArtifactProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    const destination = join(artifact, resource.file);
    await copyFile(source, destination);
    await checkedFile(resource, "staged data contribution", destination);
    // Original-machine paths and unrelated fields are not transport authority.
    const { id, file, sha256, size, treeSha256, entrypoint, sync } = resource;
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "closure.data-resource.build",
      resource: { id, file, sha256, size, treeSha256, entrypoint, sync } });
  });
  return { artifactDirectory: join(resolve(input.output), "artifact") };
}

/** Invalid downloads never become visible products or success receipts. */
export async function importDataResource(input: Input & Readonly<{ descriptor: string }>) {
  const descriptor = await readObject(input.descriptor);
  await assertArtifactDestinationAbsent(resolve(input.output));
  await using product = await openArtifactProduct({ url: descriptor.url, sha256: descriptor.sha256 });
  const { archive, acquisition } = product;
  await stageArtifactProduct(input.output, async stage => {
    await writeArtifactEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)), resource = boundResource(receipt, input.resourceId);
    if (Object.keys(receipt).sort().join(",") !== "operation,resource,schemaVersion"
      || Object.keys(resource).sort().join(",") !== "entrypoint,file,id,sha256,size,sync,treeSha256") throw new Error("resource artifact receipt is not portable");
    if (archive.entries.length !== 2 || !archive.entries.some(entry => entry.path === resource.file)) throw new Error("resource cache contains unexpected payloads");
    await writeArtifactEntry(archive, resource.file, join(stage, resource.file), resource.size);
    await checkedFile(resource, "restored data resource", join(stage, resource.file));
  });
  return { resourceReceipt: join(resolve(input.output), RECEIPT), acquisition };
}
