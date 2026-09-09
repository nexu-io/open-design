import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateNodePlatformResource } from "@open-design/standalone/packages";
import { canonicalBytes, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertArtifactDestinationAbsent, openArtifactProduct, stageArtifactProduct, writeArtifactEntry } from "./artifact-product.ts";

type Input = Readonly<{ target: string; output: string }>;
const RECEIPT = "platform-build-receipt.json";
const RESOURCE = "platform-resource.json";
const ARCHIVE = "platform.zip";
function boundPlatform(receipt: JsonObject, target: string) {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.platform.build" || receipt.target !== target
    || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)) throw new Error("platform receipt binding mismatch");
  const resource = validateNodePlatformResource(receipt.resource);
  if (resource.target !== target || resource.blob.sources.length !== 0) throw new Error("cached platform must be target-bound and release-neutral");
  return resource;
}

/** Export verified portable platform bytes independently of orchestration. */
export async function exportPlatform(input: Input & Readonly<{ buildReceipt: string }>) {
  const target = input.target, receipt = await readObject(input.buildReceipt);
  const resource = boundPlatform(receipt, target);
  if (typeof receipt.archivePath !== "string" || resolve(receipt.archivePath) !== receipt.archivePath
    || typeof receipt.resourcePath !== "string" || resolve(receipt.resourcePath) !== receipt.resourcePath) throw new Error("platform build paths must be absolute");
  if (!canonicalBytes(await readObject(receipt.resourcePath)).equals(canonicalBytes(resource))) throw new Error("platform descriptor differs from build receipt");
  const source = await checkedFile(resource.blob, "platform contribution", receipt.archivePath);
  await stageArtifactProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    await copyFile(source, join(artifact, ARCHIVE));
    await checkedFile(resource.blob, "staged platform contribution", join(artifact, ARCHIVE));
    await writeObject(join(artifact, RESOURCE), resource);
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "electron.platform.build",
      target, resource });
  });
  return { artifactDirectory: join(resolve(input.output), "artifact") };
}

/** Import an exact artifact and rebind verified local paths. */
export async function importPlatform(input: Input & Readonly<{ descriptor: string }>) {
  const target = input.target, output = resolve(input.output), descriptor = await readObject(input.descriptor);
  await assertArtifactDestinationAbsent(output);
  await using product = await openArtifactProduct({ url: descriptor.url, sha256: descriptor.sha256 });
  const { archive, acquisition } = product;
  await stageArtifactProduct(output, async stage => {
    if (archive.entries.map(entry => entry.path).sort().join(",") !== [RECEIPT, RESOURCE, ARCHIVE].sort().join(",")) throw new Error("platform cache contains unexpected payloads");
    await writeArtifactEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)), resource = boundPlatform(receipt, target);
    if (Object.keys(receipt).sort().join(",") !== "operation,resource,schemaVersion,target") throw new Error("platform cache receipt is not portable");
    await writeArtifactEntry(archive, RESOURCE, join(stage, RESOURCE), 64 * 1024);
    if (!canonicalBytes(await readObject(join(stage, RESOURCE))).equals(canonicalBytes(resource))) throw new Error("cached platform descriptor mismatch");
    await writeArtifactEntry(archive, ARCHIVE, join(stage, ARCHIVE), resource.blob.size);
    await checkedFile(resource.blob, "restored platform", join(stage, ARCHIVE));
    await writeObject(join(stage, RECEIPT), { ...receipt, archivePath: join(output, ARCHIVE), resourcePath: join(output, RESOURCE) });
  });
  return { buildReceipt: join(output, RECEIPT), resourcePath: join(output, RESOURCE), archivePath: join(output, ARCHIVE), acquisition };
}
