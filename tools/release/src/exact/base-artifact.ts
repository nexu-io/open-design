import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pack, extract } from "@open-design/archive/build";
import { checkedFile, describeFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertArtifactDestinationAbsent, openArtifactProduct, stageArtifactProduct } from "./artifact-product.ts";

type Input = Readonly<{ target: string; output: string }>;
const RECEIPT = "base-build-receipt.json", ARCHIVE = "base.zip";
function bound(receipt: JsonObject, target: string) {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.base.build" || receipt.target !== target
    || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)
    || !/^[a-f0-9]{64}$/u.test(receipt.base?.manifestSha256 ?? "")) throw new Error("base artifact binding mismatch");
}
async function manifest(root: string, receipt: JsonObject) {
  const path = join(root, "base.json"), descriptor = await readObject(path);
  // The opaque transport is authenticated here; Kit verifies every native and
  // carrier byte against this manifest before using the base for native signing.
  if ((await describeFile(path)).sha256 !== receipt.base.manifestSha256
    || descriptor.schemaVersion !== 1 || descriptor.operation !== "electron.base.build"
    || descriptor.target !== receipt.target) throw new Error("base manifest binding mismatch");
}
/** A job-to-job transport uses exactly the same portable bytes as an R2 product. */
export async function packBase(input: Readonly<{ target: string; buildReceipt: string; output: string }>) {
  const target = input.target, receipt = await readObject(input.buildReceipt);
  bound(receipt, target);
  if (typeof receipt.base.root !== "string" || resolve(receipt.base.root) !== receipt.base.root) throw new Error("base root must be absolute");
  await manifest(receipt.base.root, receipt);
  await stageArtifactProduct(input.output, async stage => {
    const archive = await pack(receipt.base.root, join(stage, ARCHIVE), { allowInternalLinks: true });
    await manifest(receipt.base.root, receipt);
    await writeObject(join(stage, RECEIPT), { schemaVersion: 1, operation: "electron.base.build", target,
      base: { manifestSha256: receipt.base.manifestSha256 }, archive: { sha256: archive.sha256, size: archive.size } });
  });
  return { artifactDirectory: resolve(input.output) };
}
export async function exportBase(input: Input & Readonly<{ buildReceipt: string }>) {
  await stageArtifactProduct(input.output, async stage => {
    await packBase({ ...input, output: join(stage, "artifact") });
  });
  return { artifactDirectory: join(resolve(input.output), "artifact") };
}
export async function unpackBase(input: Readonly<{ target: string; source: string; output: string }>) {
  const target = input.target, output = resolve(input.output); await assertArtifactDestinationAbsent(output);
  await stageArtifactProduct(output, async stage => {
    if ((await readdir(input.source)).sort().join(",") !== [ARCHIVE, RECEIPT].sort().join(",")) throw new Error("base cache contains unexpected payloads");
    for (const name of [ARCHIVE, RECEIPT]) {
      const info = await lstat(join(input.source, name));
      if (!info.isFile() || info.size > (name === RECEIPT ? 64 * 1024 : 2 * 1024 ** 3)) throw new Error("invalid base transport file");
    }
    const receipt = await readObject(join(input.source, RECEIPT)); bound(receipt, target);
    if (Object.keys(receipt).sort().join(",") !== "archive,base,operation,schemaVersion,target"
      || Object.keys(receipt.base).join(",") !== "manifestSha256") throw new Error("base cache receipt is not portable");
    if (!/^[a-f0-9]{64}$/u.test(receipt.archive?.sha256 ?? "") || !Number.isSafeInteger(receipt.archive?.size) || receipt.archive.size <= 0) throw new Error("invalid base archive binding");
    await checkedFile(receipt.archive, "base cache archive", join(input.source, ARCHIVE));
    await extract(join(input.source, ARCHIVE), join(stage, "base"), { allowInternalLinks: true });
    await manifest(join(stage, "base"), receipt);
    await writeObject(join(stage, RECEIPT), { ...receipt, base: { ...receipt.base, root: join(output, "base") } });
  });
  return { buildReceipt: join(output, RECEIPT) };
}
export async function importBase(input: Input & Readonly<{ descriptor: string }>) {
  const descriptor = await readObject(input.descriptor);
  await assertArtifactDestinationAbsent(resolve(input.output));
  await using product = await openArtifactProduct({ url: descriptor.url, sha256: descriptor.sha256 });
  return { ...await unpackBase({ ...input, source: product.archive.root }), acquisition: product.acquisition };
}
