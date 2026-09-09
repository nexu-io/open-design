import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalBytes, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertConvergedProductAbsent, stageConvergedProduct, convergenceProductCandidate, readConvergedProduct, writeConvergedEntry } from "./convergence-product.ts";
import { EXACT_DATA_PLAN_NODE_IDS } from "./plan.ts";
import { validateDataResourceReceipt } from "./resource-composition.ts";

type Input = Readonly<{ plan: string; resourceId: string; pending: string; workload: string; output: string }>;
const RECEIPT = "resource-receipt.json";
async function binding(input: Input) {
  const plan = await readObject(input.plan), id = `closure.data.${input.resourceId}.build`;
  const node = plan.plan?.nodes?.[id];
  if (plan.schemaVersion !== 1 || !EXACT_DATA_PLAN_NODE_IDS.some(value => value === id)
    || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(plan.plan?.target)
    || node?.target !== plan.plan.target || !/^sha256:[a-f0-9]{64}$/u.test(node?.identity ?? "")) throw new Error("invalid data resource plan");
  return { id, identity: node.identity as string, target: plan.plan.target as string };
}
function boundResource(receipt: JsonObject, expected: Awaited<ReturnType<typeof binding>>, resourceId: string) {
  const resource = validateDataResourceReceipt(receipt);
  if (resource.id !== resourceId || !canonicalBytes(receipt.planNode ?? null).equals(canonicalBytes(expected))) throw new Error("cached data resource plan binding mismatch");
  return resource;
}
/** Stage only verified neutral bytes plus a relocatable receipt. Emit the
 * existing untrusted handoff candidate, never publish cache state directly. */
export async function contributeDataResource(input: Input & Readonly<{ resourceReceipt: string; artifact: string }>) {
  const expected = await binding(input), receipt = await readObject(input.resourceReceipt);
  const resource = boundResource(receipt, expected, input.resourceId);
  const source = await checkedFile(resource, "data contribution", resolve(dirname(input.resourceReceipt), resource.file));
  const manifest = await convergenceProductCandidate({ ...input, product: "resource", data: expected });
  if (manifest == null) return { contributed: false };
  await stageConvergedProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    const destination = join(artifact, resource.file);
    await copyFile(source, destination);
    await checkedFile(resource, "staged data contribution", destination);
    // Original-machine paths and unrelated fields are not transport authority.
    const { id, file, sha256, size, treeSha256, entrypoint, sync } = resource;
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "closure.data-resource.build",
      planNode: expected, resource: { id, file, sha256, size, treeSha256, entrypoint, sync } });
    await writeObject(join(stage, "products", input.workload, "product-manifest.json"), manifest);
  });
  return { contributed: true, artifactDirectory: join(resolve(input.output), "artifact"),
    productsDirectory: join(resolve(input.output), "products"), manifest };
}

/** Recover only the exact planner-authorized product. An incomplete or invalid
 * download never becomes a visible resource directory or a success receipt. */
export async function restoreDataResource(input: Input) {
  const expected = await binding(input);
  await assertConvergedProductAbsent(resolve(input.output));
  const { archive, cache } = await readConvergedProduct({ ...input, product: "resource" });
  await stageConvergedProduct(input.output, async stage => {
    await writeConvergedEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)), resource = boundResource(receipt, expected, input.resourceId);
    if (Object.keys(archive.files).length !== 2 || archive.files[resource.file] == null) throw new Error("resource cache contains unexpected payloads");
    await writeConvergedEntry(archive, resource.file, join(stage, resource.file), resource.size);
    await checkedFile(resource, "restored data resource", join(stage, resource.file));
  });
  return { resourceReceipt: join(resolve(input.output), RECEIPT), planNode: expected, cache };
}
