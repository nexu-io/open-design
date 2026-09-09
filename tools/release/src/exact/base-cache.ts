import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pack, extract } from "@open-design/archive/build";
import { canonicalBytes, checkedFile, describeFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertConvergedProductAbsent, convergenceProductCandidate, readConvergedProduct, stageConvergedProduct, writeConvergedEntry } from "./convergence-product.ts";

type Input = Readonly<{ plan: string; pending: string; workload: string; output: string }>;
const RECEIPT = "base-build-receipt.json", ARCHIVE = "base.zip";
async function binding(input: Input) {
  const plan = await readObject(input.plan), id = "electron.base.build", target = plan.plan?.target;
  const node = plan.plan?.nodes?.[id];
  if (plan.schemaVersion !== 1 || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)
    || node?.target !== target || !/^sha256:[a-f0-9]{64}$/u.test(node?.identity ?? "")) throw new Error("invalid base plan");
  return { id, identity: node.identity as string, target: target as string };
}
function bound(receipt: JsonObject, expected: Awaited<ReturnType<typeof binding>>) {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.base.build" || receipt.target !== expected.target
    || !canonicalBytes(receipt.planNode ?? null).equals(canonicalBytes(expected))
    || !/^[a-f0-9]{64}$/u.test(receipt.base?.manifestSha256 ?? "")) throw new Error("base cache plan binding mismatch");
}
async function manifest(root: string, receipt: JsonObject) {
  const path = join(root, "base.json"), descriptor = await readObject(path);
  // The opaque transport is authenticated here; Kit verifies every native and
  // carrier byte against this manifest before using the base for native signing.
  if ((await describeFile(path)).sha256 !== receipt.base.manifestSha256
    || descriptor.schemaVersion !== 1 || descriptor.operation !== "electron.base.build"
    || descriptor.target !== receipt.target) throw new Error("base manifest binding mismatch");
}
export async function contributeBase(input: Input & Readonly<{ buildReceipt: string; artifact: string }>) {
  const expected = await binding(input), receipt = await readObject(input.buildReceipt);
  bound(receipt, expected);
  if (typeof receipt.base.root !== "string" || resolve(receipt.base.root) !== receipt.base.root) throw new Error("base root must be absolute");
  await manifest(receipt.base.root, receipt);
  const candidate = await convergenceProductCandidate({ ...input, product: "base", data: expected });
  if (candidate == null) return { contributed: false };
  await stageConvergedProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    const archive = await pack(receipt.base.root, join(artifact, ARCHIVE), { allowInternalLinks: true });
    await manifest(receipt.base.root, receipt);
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "electron.base.build", target: expected.target,
      planNode: expected, base: { manifestSha256: receipt.base.manifestSha256 }, archive: { sha256: archive.sha256, size: archive.size } });
    await writeObject(join(stage, "products", input.workload, "product-manifest.json"), candidate);
  });
  return { contributed: true, artifactDirectory: join(resolve(input.output), "artifact"), productsDirectory: join(resolve(input.output), "products") };
}
export async function restoreBase(input: Input) {
  const expected = await binding(input), output = resolve(input.output); await assertConvergedProductAbsent(output);
  const { archive, cache } = await readConvergedProduct({ ...input, product: "base" });
  await stageConvergedProduct(output, async stage => {
    if (Object.keys(archive.files).sort().join(",") !== [ARCHIVE, RECEIPT].sort().join(",")) throw new Error("base cache contains unexpected payloads");
    await writeConvergedEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)); bound(receipt, expected);
    if (Object.keys(receipt).sort().join(",") !== "archive,base,operation,planNode,schemaVersion,target"
      || Object.keys(receipt.base).join(",") !== "manifestSha256") throw new Error("base cache receipt is not portable");
    if (!/^[a-f0-9]{64}$/u.test(receipt.archive?.sha256 ?? "") || !Number.isSafeInteger(receipt.archive?.size) || receipt.archive.size <= 0) throw new Error("invalid base archive binding");
    await writeConvergedEntry(archive, ARCHIVE, join(stage, ARCHIVE), receipt.archive.size);
    await checkedFile(receipt.archive, "base cache archive", join(stage, ARCHIVE));
    await extract(join(stage, ARCHIVE), join(stage, "base"), { allowInternalLinks: true });
    await manifest(join(stage, "base"), receipt);
    await rm(join(stage, ARCHIVE));
    await writeObject(join(stage, RECEIPT), { ...receipt, base: { ...receipt.base, root: join(output, "base") } });
  });
  return { buildReceipt: join(output, RECEIPT), planNode: expected, cache };
}
