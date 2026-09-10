import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ReleasePolicyReceipt } from "../policy/release-profile.ts";
import { requiresFormalMacTrust } from "../policy/native-trust.ts";
import { canonicalBytes, checkedFile, readObject, writeObject, type JsonObject } from "./control-common.ts";
import { assertArtifactDestinationAbsent, stageArtifactProduct } from "./artifact-product.ts";
import { releaseObjects } from "./release-object.ts";

/** Reuse completed version-bound installer bytes, never an interrupted signing
 * workspace and never an installer from another release. */
export async function withDistributionResult(input: Readonly<{
  policy: ReleasePolicyReceipt; shell: string; target: string; binding: JsonObject;
  output: string; receipt: string; build: () => Promise<unknown>;
}>) {
  if (!["electron", "terminal"].includes(input.shell) || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(input.target)) {
    throw new Error("Invalid native result target");
  }
  const objects = releaseObjects(input.policy), prefix = `native/${input.shell}/${input.target}`;
  const manifestName = `${prefix}/result.json`;
  const validate = (result: JsonObject) => {
    if (result.schemaVersion !== 1 || result.operation !== "shell.distribution.contribute" || result.shell?.type !== input.shell
      || result.target !== input.target || typeof result.artifact?.file !== "string") throw new Error("Invalid completed distribution result");
    if (input.shell === "electron" && input.target.startsWith("darwin-") && requiresFormalMacTrust(input.policy)
      && result.platformTrust?.mode !== "formal") throw new Error("Completed distribution lacks formal macOS trust");
    if (result.platformTrust?.mode === "formal" && input.binding.signerTeamId != null
      && result.platformTrust.teamIdentifier !== input.binding.signerTeamId) throw new Error("Completed distribution signer differs from frozen identity");
    const file = basename(result.artifact.file);
    if (!file || file === "." || file === ".." || /[\\\0]/u.test(file)
      || ["result.json", "shell-contribution.json", "distribution-receipt.json"].includes(file)) throw new Error("Invalid completed installer name");
    return file;
  };
  const existing = await objects.read(manifestName);
  if (existing != null) {
    const saved = JSON.parse(existing.toString("utf8")) as JsonObject;
    if (saved.schemaVersion !== 1 || saved.operation !== "exact.distribution.result"
      || !canonicalBytes(saved.binding).equals(canonicalBytes(input.binding))) throw new Error("Completed distribution input binding mismatch");
    const file = validate(saved.contribution), bytes = await objects.read(`${prefix}/${file}`);
    if (bytes == null) throw new Error("Completed distribution installer is missing");
    await stageArtifactProduct(input.output, async stage => {
      const path = join(stage, file); await writeFile(path, bytes, { flag: "wx" });
      await checkedFile(saved.contribution.artifact, "Completed installer", path);
      await writeObject(join(stage, "shell-contribution.json"), saved.contribution);
    });
    await writeObject(input.receipt, saved.contribution);
    return saved.contribution;
  }
  // A failed local assembly is not a resumable signed result. Require a fresh
  // output instead of allowing native assembly to erase prior signed bytes.
  await assertArtifactDestinationAbsent(input.output);
  await input.build();
  // Native builders have different execution receipts. Their completed,
  // publication-facing contribution is the shared file-backed contract.
  const result = await readObject(join(input.output, "shell-contribution.json")), file = validate(result);
  const path = await checkedFile(result.artifact, "Completed installer", join(input.output, file));
  await objects.create(`${prefix}/${file}`, await readFile(path), result.artifact.mediaType ?? "application/octet-stream");
  await objects.create(manifestName, canonicalBytes({ schemaVersion: 1, operation: "exact.distribution.result", binding: input.binding, contribution: result }), "application/json");
  return result;
}
