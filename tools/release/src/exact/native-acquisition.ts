import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { readObject } from "./control-common.ts";
import { importCapsule } from "./capsule-artifact.ts";
import { importPlatform } from "./platform-artifact.ts";

/** Acquire opaque product bindings at their consumer, without build or cache writes.
 * Misses must already be present; composition verifies their business descriptors. */
export async function acquireNativeArtifacts(input: Readonly<{
  product: "capsule" | "platform"; sources: string; output: string;
}>) {
  const request = await readObject(input.sources), seen = new Set<string>();
  if (Object.keys(request).join(",") !== "sources" || !Array.isArray(request.sources) || request.sources.length === 0) throw new Error("Invalid native acquisition source set");
  for (const source of request.sources) {
    if (source == null || Object.keys(source).some(key => key !== "target" && key !== "artifact")
      || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(source.target)
      || seen.has(source.target) || (Object.hasOwn(source, "artifact") && (source.artifact == null
        || Object.keys(source.artifact).sort().join(",") !== "sha256,url"
        || typeof source.artifact.url !== "string" || !/^[a-f0-9]{64}$/u.test(source.artifact.sha256 ?? "")))) throw new Error("Invalid or duplicate native acquisition target");
    seen.add(source.target);
  }
  const importer = input.product === "capsule" ? importCapsule : importPlatform;
  const files = input.product === "capsule" ? ["capsule-content.json", "capsule.zip"] : ["platform-resource.json", "platform.zip"];
  const results = await Promise.allSettled(request.sources.map(async source => {
    const output = join(input.output, source.target);
    if (source.artifact != null) return importer({ target: source.target, descriptor: source.artifact, output });
    for (const file of files) if (!(await lstat(join(output, file))).isFile()) throw new Error("Built native product is missing");
  }));
  for (const result of results) if (result.status === "rejected") throw result.reason;
}
