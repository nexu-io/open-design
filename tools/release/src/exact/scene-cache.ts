import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readConvergedProduct, writeConvergedEntry } from "./convergence-product.ts";
import { unpackSceneArtifact } from "./scene-artifact.ts";

/** Consume a planner-authorized cache hit, without changing convergence authority. */
export async function restoreSceneCache(input: Readonly<{
  pending: string; workload: string; transport: string; output: string;
}>) {
  const { archive, cache } = await readConvergedProduct({ ...input, product: "scene" });
  if (Object.keys(archive.files).length !== 1 || archive.files["scene.tar"] == null) throw new Error("scene cache must contain only scene.tar");
  const transport = resolve(input.transport);
  await mkdir(dirname(transport), { recursive: true });
  await writeConvergedEntry(archive, "scene.tar", transport);
  return { ...await unpackSceneArtifact(transport, input.output), cache };
}
