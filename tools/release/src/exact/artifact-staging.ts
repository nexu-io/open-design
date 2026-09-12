import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function assertArtifactDestinationAbsent(path: string) {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("artifact product destination already exists");
}

/** Publish a complete local projection only after every byte has been verified. */
export async function stageArtifactProduct(output: string, prepare: (stage: string) => Promise<void>) {
  const destination = resolve(output);
  await assertArtifactDestinationAbsent(destination);
  await mkdir(dirname(destination), { recursive: true });
  const scratch = await mkdtemp(join(dirname(destination), ".product-transport-"));
  try {
    const stage = join(scratch, "output"); await mkdir(stage);
    await prepare(stage);
    await assertArtifactDestinationAbsent(destination);
    await rename(stage, destination);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
