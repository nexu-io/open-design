import { join } from "node:path";
import { readObject, writeObject } from "./control-common.ts";

const releaseFields = new Set(["artifactBaseUrl", "channel", "publishedAt", "releaseVersion", "signatures"]);
function releaseOwnedFields(value: unknown, path = "$", violations: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((child, index) => releaseOwnedFields(child, `${path}[${index}]`, violations));
  else if (value != null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const field = `${path}.${key}`;
      if (releaseFields.has(key)) violations.push(field);
      releaseOwnedFields(child, field, violations);
    }
  }
  return violations;
}

/** Publish no cache state: emit only the existing untrusted convergence candidate. */
export async function contributeScene(input: Readonly<{
  scene: string; target: string; pending: string; workload: string; artifact: string; output: string;
}>) {
  if (!/^[a-z][a-z0-9_]*$/u.test(input.workload)) throw new Error("invalid scene workload");
  if (!input.artifact.trim() || /[\r\n]/u.test(input.artifact)) throw new Error("invalid scene artifact name");
  const scene = await readObject(join(input.scene, "scene.json"));
  if (scene.target !== input.target || typeof scene.shellBuildHash !== "string" || !scene.shellBuildHash.trim()) {
    throw new Error("restored or built Shell scene identity mismatch");
  }
  const violations = releaseOwnedFields(scene).sort();
  if (violations.length) throw new Error(`Shell scene contains release-owned fields: ${violations.join(", ")}`);
  const pending = (await readObject(input.pending)).workloads?.[input.workload];
  if (pending == null || typeof pending.run !== "boolean") throw new Error("scene workload has no execution decision");
  if (!pending.run) {
    if (pending.resultHit !== true) throw new Error("skipped scene workload has no cache hit");
    return { contributed: false };
  }
  const executionClass = pending.executionClass;
  if (typeof pending.digest !== "string" || !/^[a-f0-9]{64}$/u.test(pending.digest)
    || executionClass == null || typeof executionClass !== "object" || Array.isArray(executionClass)
    || Object.keys(executionClass).sort().join(",") !== "labels,runnerClass"
    || typeof executionClass.runnerClass !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(executionClass.runnerClass)
    || !Array.isArray(executionClass.labels) || executionClass.labels.length === 0
    || executionClass.labels.some((label: unknown) => typeof label !== "string" || !label)) {
    throw new Error("scene workload has no convergence identity");
  }
  const manifest = { workload: input.workload, digest: pending.digest, executionClass: pending.executionClass,
    products: { scene: { type: "job", source: input.artifact, data: { target: input.target } } } };
  await writeObject(join(input.output, input.workload, "product-manifest.json"), manifest);
  return { contributed: true, manifest };
}
