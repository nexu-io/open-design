import { readObject, type JsonObject } from "./control-common.ts";
import { openArtifactProduct } from "./artifact-product.ts";
export {
  assertArtifactDestinationAbsent as assertConvergedProductAbsent,
  stageArtifactProduct as stageConvergedProduct,
  writeArtifactEntry as writeConvergedEntry,
} from "./artifact-product.ts";

export async function openConvergedProduct(input: Readonly<{ pending: string; workload: string; product: string }>) {
  const workload = (await readObject(input.pending)).workloads?.[input.workload];
  const product = workload?.result?.products?.[input.product];
  if (workload?.resultHit !== true || workload.run !== false || product?.type !== "url"
    || typeof product.source !== "string" || !/^[a-f0-9]{64}$/u.test(product.data?.sha256)) {
    throw new Error(`${input.product} restore requires a complete planner cache hit`);
  }
  const opened = await openArtifactProduct({ url: product.source, sha256: product.data.sha256 });
  return { archive: opened.archive, cache: opened.acquisition, [Symbol.asyncDispose]: opened[Symbol.asyncDispose] };
}

/** Build an untrusted candidate using the existing planner identity. The caller
 * verifies/stages product bytes before writing this manifest for handoff. */
export async function convergenceProductCandidate(input: Readonly<{
  pending: string; workload: string; artifact: string; product: string; data: JsonObject;
}>) {
  if (!/^[a-z][a-z0-9_]*$/u.test(input.workload)) throw new Error(`invalid ${input.product} workload`);
  if (!input.artifact.trim() || /[\r\n]/u.test(input.artifact)) throw new Error(`invalid ${input.product} artifact name`);
  const pending = (await readObject(input.pending)).workloads?.[input.workload];
  if (pending == null || typeof pending.run !== "boolean") throw new Error(`${input.product} workload has no execution decision`);
  if (!pending.run) {
    if (pending.resultHit !== true) throw new Error(`skipped ${input.product} workload has no cache hit`);
    return undefined;
  }
  const executionClass = pending.executionClass;
  if (typeof pending.digest !== "string" || !/^[a-f0-9]{64}$/u.test(pending.digest)
    || executionClass == null || typeof executionClass !== "object" || Array.isArray(executionClass)
    || Object.keys(executionClass).sort().join(",") !== "labels,runnerClass"
    || typeof executionClass.runnerClass !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(executionClass.runnerClass)
    || !Array.isArray(executionClass.labels) || executionClass.labels.length === 0
    || executionClass.labels.some((label: unknown) => typeof label !== "string" || !label)) {
    throw new Error(`${input.product} workload has no convergence identity`);
  }
  return { workload: input.workload, digest: pending.digest, executionClass,
    products: { [input.product]: { type: "job", source: input.artifact, data: input.data } } };
}
