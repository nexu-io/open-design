import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pack, extract } from "@open-design/archive/build";
import { canonicalBytes, checkedFile, describeFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertConvergedProductAbsent, convergenceProductCandidate, openConvergedProduct, stageConvergedProduct } from "./convergence-product.ts";

type Input = Readonly<{ plan: string; pending: string; workload: string; output: string }>;
const RECEIPT = "base-build-receipt.json", ARCHIVE = "base.zip";
async function binding(input: Pick<Input, "plan">) {
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
/** A job-to-job transport uses exactly the same portable bytes as an R2 product. */
export async function packBase(input: Readonly<{ plan: string; buildReceipt: string; output: string }>) {
  const expected = await binding(input), receipt = await readObject(input.buildReceipt);
  bound(receipt, expected);
  if (typeof receipt.base.root !== "string" || resolve(receipt.base.root) !== receipt.base.root) throw new Error("base root must be absolute");
  await manifest(receipt.base.root, receipt);
  await stageConvergedProduct(input.output, async stage => {
    const archive = await pack(receipt.base.root, join(stage, ARCHIVE), { allowInternalLinks: true });
    await manifest(receipt.base.root, receipt);
    await writeObject(join(stage, RECEIPT), { schemaVersion: 1, operation: "electron.base.build", target: expected.target,
      planNode: expected, base: { manifestSha256: receipt.base.manifestSha256 }, archive: { sha256: archive.sha256, size: archive.size } });
  });
  return { artifactDirectory: resolve(input.output), planNode: expected };
}
export async function contributeBase(input: Input & Readonly<{ buildReceipt: string; artifact: string }>) {
  const expected = await binding(input), receipt = await readObject(input.buildReceipt);
  bound(receipt, expected);
  const candidate = await convergenceProductCandidate({ ...input, product: "base", data: expected });
  if (candidate == null) return { contributed: false };
  await stageConvergedProduct(input.output, async stage => {
    await packBase({ ...input, output: join(stage, "artifact") });
    await writeObject(join(stage, "products", input.workload, "product-manifest.json"), candidate);
  });
  return { contributed: true, artifactDirectory: join(resolve(input.output), "artifact"), productsDirectory: join(resolve(input.output), "products") };
}
export async function unpackBase(input: Readonly<{ plan: string; source: string; output: string }>) {
  const expected = await binding(input), output = resolve(input.output); await assertConvergedProductAbsent(output);
  await stageConvergedProduct(output, async stage => {
    if ((await readdir(input.source)).sort().join(",") !== [ARCHIVE, RECEIPT].sort().join(",")) throw new Error("base cache contains unexpected payloads");
    for (const name of [ARCHIVE, RECEIPT]) {
      const info = await lstat(join(input.source, name));
      if (!info.isFile() || info.size > (name === RECEIPT ? 64 * 1024 : 2 * 1024 ** 3)) throw new Error("invalid base transport file");
    }
    const receipt = await readObject(join(input.source, RECEIPT)); bound(receipt, expected);
    if (Object.keys(receipt).sort().join(",") !== "archive,base,operation,planNode,schemaVersion,target"
      || Object.keys(receipt.base).join(",") !== "manifestSha256") throw new Error("base cache receipt is not portable");
    if (!/^[a-f0-9]{64}$/u.test(receipt.archive?.sha256 ?? "") || !Number.isSafeInteger(receipt.archive?.size) || receipt.archive.size <= 0) throw new Error("invalid base archive binding");
    await checkedFile(receipt.archive, "base cache archive", join(input.source, ARCHIVE));
    await extract(join(input.source, ARCHIVE), join(stage, "base"), { allowInternalLinks: true });
    await manifest(join(stage, "base"), receipt);
    await writeObject(join(stage, RECEIPT), { ...receipt, base: { ...receipt.base, root: join(output, "base") } });
  });
  return { buildReceipt: join(output, RECEIPT), planNode: expected };
}
export async function restoreBase(input: Input) {
  await binding(input);
  await assertConvergedProductAbsent(resolve(input.output));
  await using product = await openConvergedProduct({ ...input, product: "base" });
  return { ...await unpackBase({ ...input, source: product.archive.root }), cache: product.cache };
}
