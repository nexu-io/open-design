import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateNodePlatformResource } from "@open-design/standalone/packages";
import { canonicalBytes, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertConvergedProductAbsent, convergenceProductCandidate, openConvergedProduct, stageConvergedProduct, writeConvergedEntry } from "./convergence-product.ts";

type Input = Readonly<{ plan: string; pending: string; workload: string; output: string }>;
const RECEIPT = "platform-build-receipt.json";
const RESOURCE = "platform-resource.json";
const ARCHIVE = "platform.zip";
async function binding(input: Input) {
  const plan = await readObject(input.plan), id = "electron.platform.build";
  const node = plan.plan?.nodes?.[id], target = plan.plan?.target;
  if (plan.schemaVersion !== 1 || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)
    || node?.target !== target || !/^sha256:[a-f0-9]{64}$/u.test(node?.identity ?? "")) throw new Error("invalid platform plan");
  return { id, identity: node.identity as string, target: target as string };
}
function boundPlatform(receipt: JsonObject, expected: Awaited<ReturnType<typeof binding>>) {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.platform.build" || receipt.target !== expected.target
    || !canonicalBytes(receipt.planNode ?? null).equals(canonicalBytes(expected))) throw new Error("cached platform plan binding mismatch");
  const resource = validateNodePlatformResource(receipt.resource);
  if (resource.target !== expected.target || resource.blob.sources.length !== 0) throw new Error("cached platform must be target-bound and release-neutral");
  return resource;
}

/** Contribute neutral bytes to the existing untrusted handoff, never write R2. */
export async function contributePlatform(input: Input & Readonly<{ buildReceipt: string; artifact: string }>) {
  const expected = await binding(input), receipt = await readObject(input.buildReceipt);
  const resource = boundPlatform(receipt, expected);
  if (typeof receipt.archivePath !== "string" || resolve(receipt.archivePath) !== receipt.archivePath
    || typeof receipt.resourcePath !== "string" || resolve(receipt.resourcePath) !== receipt.resourcePath) throw new Error("platform build paths must be absolute");
  if (!canonicalBytes(await readObject(receipt.resourcePath)).equals(canonicalBytes(resource))) throw new Error("platform descriptor differs from build receipt");
  const source = await checkedFile(resource.blob, "platform contribution", receipt.archivePath);
  const manifest = await convergenceProductCandidate({ ...input, product: "platform", data: expected });
  if (manifest == null) return { contributed: false };
  await stageConvergedProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    await copyFile(source, join(artifact, ARCHIVE));
    await checkedFile(resource.blob, "staged platform contribution", join(artifact, ARCHIVE));
    await writeObject(join(artifact, RESOURCE), resource);
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "electron.platform.build",
      target: expected.target, planNode: expected, resource });
    await writeObject(join(stage, "products", input.workload, "product-manifest.json"), manifest);
  });
  return { contributed: true, artifactDirectory: join(resolve(input.output), "artifact"),
    productsDirectory: join(resolve(input.output), "products"), manifest };
}

/** Restore only a planner-authorized immutable hit and rebind local paths. */
export async function restorePlatform(input: Input) {
  const expected = await binding(input), output = resolve(input.output);
  await assertConvergedProductAbsent(output);
  await using product = await openConvergedProduct({ ...input, product: "platform" });
  const { archive, cache } = product;
  await stageConvergedProduct(output, async stage => {
    if (archive.entries.map(entry => entry.path).sort().join(",") !== [RECEIPT, RESOURCE, ARCHIVE].sort().join(",")) throw new Error("platform cache contains unexpected payloads");
    await writeConvergedEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)), resource = boundPlatform(receipt, expected);
    if (Object.keys(receipt).sort().join(",") !== "operation,planNode,resource,schemaVersion,target") throw new Error("platform cache receipt is not portable");
    await writeConvergedEntry(archive, RESOURCE, join(stage, RESOURCE), 64 * 1024);
    if (!canonicalBytes(await readObject(join(stage, RESOURCE))).equals(canonicalBytes(resource))) throw new Error("cached platform descriptor mismatch");
    await writeConvergedEntry(archive, ARCHIVE, join(stage, ARCHIVE), resource.blob.size);
    await checkedFile(resource.blob, "restored platform", join(stage, ARCHIVE));
    await writeObject(join(stage, RECEIPT), { ...receipt, archivePath: join(output, ARCHIVE), resourcePath: join(output, RESOURCE) });
  });
  return { buildReceipt: join(output, RECEIPT), resourcePath: join(output, RESOURCE), archivePath: join(output, ARCHIVE), planNode: expected, cache };
}
