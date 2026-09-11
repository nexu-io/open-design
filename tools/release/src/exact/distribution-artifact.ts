import { copyFile, lstat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { checkedFile, readObject, writeObject } from "./control-common.ts";
import { stageArtifactProduct } from "./artifact-product.ts";

/** Published installers travel as references to final version objects. Local
 * distribution without retention keeps the file-backed contribution contract. */
export async function exportReleaseDistribution(input: Readonly<{ source: string; output: string }>) {
  const source = resolve(input.source), receiptName = "shell-contribution.json";
  const contribution = await readObject(join(source, receiptName));
  if (typeof contribution.artifact?.file !== "string") throw new Error("Distribution contribution lacks an installer");
  const name = basename(contribution.artifact.file);
  if (!name || name === "." || name === ".." || name === receiptName) throw new Error("Invalid distribution installer name");
  const file = join(source, name);
  if (!(await lstat(file)).isFile()) throw new Error("Distribution installer must be a regular file");
  await checkedFile(contribution.artifact, "Distribution installer", file);
  await stageArtifactProduct(input.output, async stage => {
    if (contribution.artifact.publication == null) {
      await copyFile(file, join(stage, name));
      await checkedFile(contribution.artifact, "Transport installer", join(stage, name));
    }
    await writeObject(join(stage, receiptName), contribution);
  });
}
