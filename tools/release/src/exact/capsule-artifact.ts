import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateElectronCapsuleContent } from "@open-design/shell-electron/build/contracts";
import { canonicalBytes, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { CAPSULE_RELEASE_BUDGET, verifyCapsuleReleaseBudget } from "./capsule-budget.ts";
import { assertArtifactDestinationAbsent, stageArtifactProduct } from "./artifact-staging.ts";
import { openArtifactProduct, writeArtifactEntry } from "./artifact-acquisition.ts";

type Input = Readonly<{ target: string; output: string }>;
const RECEIPT = "capsule-build-receipt.json";
const CONTENT = "capsule-content.json";
const ARCHIVE = "capsule.zip";
function boundCapsule(receipt: JsonObject, target: string) {
  if (receipt.schemaVersion !== 1 || receipt.operation !== "electron.capsule.build"
    || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)) throw new Error("invalid Capsule build receipt");
  const content = validateElectronCapsuleContent(receipt.content);
  if (content.target !== target) throw new Error("Capsule target mismatch");
  return content;
}

/** Export verified, portable product bytes; orchestration binds its own results. */
export async function exportCapsule(input: Input & Readonly<{ buildReceipt: string }>) {
  const receipt = await readObject(input.buildReceipt);
  const content = boundCapsule(receipt, input.target);
  if (typeof receipt.archivePath !== "string" || resolve(receipt.archivePath) !== receipt.archivePath
    || typeof receipt.contentPath !== "string" || resolve(receipt.contentPath) !== receipt.contentPath) throw new Error("Capsule build paths must be absolute");
  if (!canonicalBytes(await readObject(receipt.contentPath)).equals(canonicalBytes(content))) throw new Error("Capsule descriptor differs from build receipt");
  await verifyCapsuleReleaseBudget(receipt.archivePath, content.archive);
  await stageArtifactProduct(input.output, async stage => {
    const artifact = join(stage, "artifact"); await mkdir(artifact);
    await copyFile(receipt.archivePath, join(artifact, ARCHIVE));
    await verifyCapsuleReleaseBudget(join(artifact, ARCHIVE), content.archive);
    await writeObject(join(artifact, CONTENT), content);
    await writeObject(join(artifact, RECEIPT), { schemaVersion: 1, operation: "electron.capsule.build", content });
  });
  return { artifactDirectory: join(resolve(input.output), "artifact") };
}

/** Rebind local paths only after identity, inventory, bytes and release budgets pass. */
export async function importCapsule(input: Input & Readonly<{ descriptor: string | Readonly<{ url: string; sha256: string }> }>) {
  const output = resolve(input.output), descriptor = typeof input.descriptor === "string" ? await readObject(input.descriptor) : input.descriptor;
  await assertArtifactDestinationAbsent(output);
  await using product = await openArtifactProduct({ url: descriptor.url, sha256: descriptor.sha256 });
  const { archive, acquisition } = product;
  await stageArtifactProduct(output, async stage => {
    if (archive.entries.map(entry => entry.path).sort().join(",") !== [RECEIPT, CONTENT, ARCHIVE].sort().join(",")) throw new Error("Capsule cache contains unexpected payloads");
    await writeArtifactEntry(archive, RECEIPT, join(stage, RECEIPT), 64 * 1024);
    const receipt = await readObject(join(stage, RECEIPT)), content = boundCapsule(receipt, input.target);
    if (Object.keys(receipt).sort().join(",") !== "content,operation,schemaVersion") throw new Error("Capsule artifact receipt is not portable");
    await writeArtifactEntry(archive, CONTENT, join(stage, CONTENT), 64 * 1024);
    if (!canonicalBytes(await readObject(join(stage, CONTENT))).equals(canonicalBytes(content))) throw new Error("cached Capsule descriptor mismatch");
    await writeArtifactEntry(archive, ARCHIVE, join(stage, ARCHIVE), Math.min(content.archive.size, CAPSULE_RELEASE_BUDGET.archiveBytes));
    await verifyCapsuleReleaseBudget(join(stage, ARCHIVE), content.archive);
    await writeObject(join(stage, RECEIPT), { ...receipt, archivePath: join(output, ARCHIVE), contentPath: join(output, CONTENT) });
  });
  return { buildReceipt: join(output, RECEIPT), contentPath: join(output, CONTENT), archivePath: join(output, ARCHIVE), acquisition };
}
