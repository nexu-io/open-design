import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertArtifactDestinationAbsent } from "./artifact-product.ts";
import { importBase, unpackBase } from "./base-artifact.ts";
import { importToolchain, unpackToolchain } from "./toolchain-artifact.ts";
import { importSceneArtifact, unpackSceneArtifact } from "./scene-artifact.ts";
import { distributionStage } from "./distribution-stage.ts";

type Source = Readonly<{ descriptor: string; directory?: never } | { directory: string; descriptor?: never }>;
export type DistributionInputs = Readonly<{
  shell: string; target: string; output: string; scene: Source; base?: Source; toolchain?: Source;
}>;

/** Three independent, authenticated inputs. Neither release metadata nor plan
 * identities enter acquisition. Join all owners on failure; retain diagnosis. */
export async function acquireDistributionInputs(input: DistributionInputs) {
  if (!["electron", "terminal"].includes(input.shell)) throw new Error("Invalid distribution Shell");
  const electron = input.shell === "electron";
  if (electron !== (input.base != null && input.toolchain != null)
    || (!electron && (input.base != null || input.toolchain != null))) throw new Error("Distribution input topology mismatch");
  const sources = [input.scene, ...(electron ? [input.base!, input.toolchain!] : [])];
  for (const source of sources) {
    if (source == null || (typeof source.descriptor === "string") === (typeof source.directory === "string")) {
      throw new Error("Each distribution input requires exactly one descriptor or directory");
    }
  }
  const output = resolve(input.output);
  await assertArtifactDestinationAbsent(output);
  await mkdir(output, { recursive: true });
  const scene = join(output, "scene"), base = join(output, "base"), toolchain = join(output, "toolchain");
  const tasks: Promise<unknown>[] = [distributionStage("scene-acquisition", () => input.scene.descriptor != null
    ? importSceneArtifact({ descriptor: input.scene.descriptor, transport: join(output, "scene.tar"), output: scene })
    : unpackSceneArtifact(join(input.scene.directory, "scene.tar"), scene))];
  if (electron) {
    const acquire = async (kind: "base" | "toolchain") => {
      const source = input[kind]!, common = { target: input.target, output: kind === "base" ? base : toolchain };
      return source.descriptor != null
        ? (kind === "base" ? importBase : importToolchain)({ ...common, descriptor: source.descriptor })
        : (kind === "base" ? unpackBase : unpackToolchain)({ ...common, source: source.directory });
    };
    // Fixed fan-out is deliberately bounded; no per-file process spawning.
    tasks.push(distributionStage("base-acquisition", () => acquire("base")));
    tasks.push(distributionStage("toolchain-acquisition", () => acquire("toolchain")));
  }
  const results = await Promise.allSettled(tasks);
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Distribution input acquisition failed");
  return { scene, ...(electron ? { base, toolchain } : {}) };
}
