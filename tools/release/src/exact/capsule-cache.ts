import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateElectronCapsuleContent } from "@open-design/shell-electron/build/contracts";
import { canonicalBytes, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { CAPSULE_RELEASE_BUDGET, verifyCapsuleReleaseBudget } from "./capsule-budget.ts";
import { assertConvergedProductAbsent, convergenceProductCandidate, openConvergedProduct, stageConvergedProduct, writeConvergedEntry } from "./convergence-product.ts";

type Input = Readonly<{ plan: string; pending: string; workload: string; output: string }>;
const RECEIPT = "capsule-build-receipt.json";
const CONTENT = "capsule-content.json";
const ARCHIVE = "capsule.zip";
async function binding(input: Input) {
  const plan = await readObject(input.plan), id = "electron.capsule.build";
  const node = plan.plan?.nodes?.[id], target = plan.plan?.target;
  if (plan.schemaVersion !== 1 || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)
    || node?.target !== target || !/^sha256:[a-f0-9]{64}$/u.test(node?.identity ?? "")) throw new Error("invalid Capsule plan");
  return { id, identity: node.identity as string, target: target as string };
}
function boundCapsule(receipt: JsonObject, expected: Awaited<ReturnType<typeof binding>>) {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.capsule.build"
    || !canonicalBytes(receipt.planNode ?? null).equals(canonicalBytes(expected))) throw new Error("cached Capsule plan binding mismatch");
  const content = validateElectronCapsuleContent(receipt.content);
  if (content.target !== expected.target) throw new Error("cached Capsule target mismatch");
  return content;
}

/** Contribute neutral Capsule bytes through the existing cache handoff; no R2 writes. */
export async function contributeCapsule(input: Input & Readonly<{ buildReceipt: string; artifact: string }>) {
  const expected = await binding(input), receipt = await readObject(input.buildReceipt);
  const content = boundCapsule(receipt, expected);
  if (typeof receipt.archivePath !== "string" || resolve(receipt.archivePath) !== receipt.archivePath
    || typeof receipt.contentPath !== "string" || resolve(receipt.contentPath) !== receipt.contentPath) throw new Error("Capsule build paths must be absolute");
  if (!canonicalBytes(await readObject(receipt.contentPath)).equals(canonicalBytes(content))) throw new Error("Capsule descriptor differs from build receipt");
  await verifyCapsuleReleaseBudget(receipt.archivePath, content.archive);
  const manifest = await convergenceProductCandidate({ ...input, product: "capsule", data: expected });
  if (manifest == null) return { contributed: false };
  await stageConvergedProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    await copyFile(receipt.archivePath, join(artifact, ARCHIVE));
    await verifyCapsuleReleaseBudget(join(artifact, ARCHIVE), content.archive);
    await writeObject(join(artifact, CONTENT), content);
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "electron.capsule.build", planNode: expected, content });
    await writeObject(join(stage, "products", input.workload, "product-manifest.json"), manifest);
  });
  return { contributed: true, artifactDirectory: join(resolve(input.output), "artifact"),
    productsDirectory: join(resolve(input.output), "products"), manifest };
}

/** Rebind local paths only after identity, inventory, bytes and release budgets pass. */
export async function restoreCapsule(input: Input) {
  const expected = await binding(input), output = resolve(input.output);
  await assertConvergedProductAbsent(output);
  await using product = await openConvergedProduct({ ...input, product: "capsule" });
  const { archive, cache } = product;
  await stageConvergedProduct(output, async stage => {
    if (archive.entries.map(entry => entry.path).sort().join(",") !== [RECEIPT, CONTENT, ARCHIVE].sort().join(",")) throw new Error("Capsule cache contains unexpected payloads");
    await writeConvergedEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)), content = boundCapsule(receipt, expected);
    if (Object.keys(receipt).sort().join(",") !== "content,operation,planNode,schemaVersion") throw new Error("Capsule cache receipt is not portable");
    await writeConvergedEntry(archive, CONTENT, join(stage, CONTENT), 64 * 1024);
    if (!canonicalBytes(await readObject(join(stage, CONTENT))).equals(canonicalBytes(content))) throw new Error("cached Capsule descriptor mismatch");
    await writeConvergedEntry(archive, ARCHIVE, join(stage, ARCHIVE), Math.min(content.archive.size, CAPSULE_RELEASE_BUDGET.archiveBytes));
    await verifyCapsuleReleaseBudget(join(stage, ARCHIVE), content.archive);
    await writeObject(join(stage, RECEIPT), { ...receipt, archivePath: join(output, ARCHIVE), contentPath: join(output, CONTENT) });
  });
  return { buildReceipt: join(output, RECEIPT), contentPath: join(output, CONTENT), archivePath: join(output, ARCHIVE), planNode: expected, cache };
}
