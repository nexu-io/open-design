import { lstat, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { stageArtifactProduct } from "./artifact-staging.ts";
import { openArtifactProduct, writeArtifactEntry } from "./artifact-acquisition.ts";
import { readObject } from "./control-common.ts";

/** Consumers acquire hit transports directly; producers contribute only misses.
 * Source entries contain business targets and opaque artifact bindings, not plan state. */
export async function acquireSceneArtifacts(input: Readonly<{ sources: string; sourceCommit: string; output: string }>) {
  const value = await readObject(input.sources);
  if (!/^[a-f0-9]{40}$/u.test(input.sourceCommit) || Object.keys(value).join(",") !== "sources" || !Array.isArray(value.sources)) {
    throw new Error("Invalid scene acquisition inputs");
  }
  const seen = new Set<string>();
  for (const source of value.sources) {
    if (source == null || (Object.hasOwn(source, "artifact") && source.artifact == null) || Object.keys(source).some(key => !["shell", "target", "artifact"].includes(key))
      || !["electron", "terminal"].includes(source.shell) || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(source.target)) throw new Error("Invalid scene acquisition target");
    const name = `exact-${source.shell}-scene-${source.target}-${input.sourceCommit}`;
    if (seen.has(name)) throw new Error("Duplicate scene acquisition target");
    seen.add(name);
  }
  // The workflow transport flattens a single downloaded artifact. Derive its
  // sole owner from the complete business input set, never from directory guesses.
  const fresh = value.sources.filter(source => source.artifact == null);
  if (fresh.length === 1) {
    const source = fresh[0], transport = join(input.output, "scene.tar");
    const directory = join(input.output, `exact-${source.shell}-scene-${source.target}-${input.sourceCommit}`);
    const status = await lstat(transport);
    if (!status.isFile() || status.isSymbolicLink()) throw new Error("Built scene transport is not a regular file");
    await mkdir(directory);
    await rename(transport, join(directory, "scene.tar"));
  }
  const results = await Promise.allSettled(value.sources.map(async source => {
    const output = join(input.output, `exact-${source.shell}-scene-${source.target}-${input.sourceCommit}`);
    if (source.artifact == null) {
      if (!(await lstat(join(output, "scene.tar"))).isFile()) throw new Error("Built scene transport is missing");
      return;
    }
    await using product = await openArtifactProduct(source.artifact);
    if (product.archive.entries.length !== 1 || product.archive.entries[0]?.path !== "scene.tar") throw new Error("scene artifact must contain only scene.tar");
    await stageArtifactProduct(output, stage => writeArtifactEntry(product.archive, "scene.tar", join(stage, "scene.tar")));
  }));
  for (const result of results) if (result.status === "rejected") throw result.reason;
}
