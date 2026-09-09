import { join } from "node:path";
import { readObject, writeObject } from "./control-common.ts";
import { convergenceProductCandidate } from "./convergence-product.ts";

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
  const manifest = await convergenceProductCandidate({ ...input, product: "scene", data: { target: input.target } });
  if (manifest == null) return { contributed: false };
  await writeObject(join(input.output, input.workload, "product-manifest.json"), manifest);
  return { contributed: true, manifest };
}
