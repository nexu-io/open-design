import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { openConvergedProduct, writeConvergedEntry } from "./convergence-product.ts";
import { unpackSceneArtifact } from "./scene-artifact.ts";

/** Consume a planner-authorized cache hit, without changing convergence authority. */
export async function restoreSceneCache(input: Readonly<{
  pending: string; workload: string; transport: string; output: string;
}>) {
  await using product = await openConvergedProduct({ ...input, product: "scene" });
  const { archive, cache } = product;
  if (archive.entries.length !== 1 || archive.entries[0]?.path !== "scene.tar") throw new Error("scene cache must contain only scene.tar");
  const transport = resolve(input.transport);
  await mkdir(dirname(transport), { recursive: true });
  await writeConvergedEntry(archive, "scene.tar", transport);
  return { ...await unpackSceneArtifact(transport, input.output), cache };
}
