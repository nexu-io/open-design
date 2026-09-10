import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildClosureDataResource, CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import type { ClosureRuntimeResourceId } from "@open-design/closure/build-runtime-resources";
import { exportDataResource, importDataResource } from "./resource-artifact.ts";
import { canonicalBytes, checkedFile, readObject } from "./control-common.ts";

/** Runtime production is separate from the nine independent data products. */
export async function buildReleaseRuntimeResources(input: Readonly<{
  root: string; output: string; receipt: string; resourceIds?: readonly ClosureRuntimeResourceId[];
}>) {
  const root = resolve(input.root), resolver = createRequire(join(root, "tools/release/package.json"));
  const builder: typeof import("@open-design/closure/build-runtime-resources") = await import(
    pathToFileURL(resolver.resolve("@open-design/closure/build-runtime-resources")).href);
  const result = await builder.buildClosureRuntimeResources({ workspaceRoot: root, outputDirectory: resolve(input.output), resourceIds: input.resourceIds });
  if (result.schemaVersion !== 1 || result.operation !== "closure.runtime-resources.build"
    || result.resources.map(resource => resource.id).sort().join(",") !== [...(input.resourceIds ?? builder.CLOSURE_RUNTIME_RESOURCE_IDS)].sort().join(",")) throw new Error("invalid runtime resource set");
  for (const resource of result.resources) await checkedFile(resource, "runtime resource", resource.path);
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes(result), { flag: "wx" });
  return result;
}

/** One release-neutral product, not a complete resource receipt or cache hit.
 * The Closure producer owns declarations and validates the selected group. */
export async function buildReleaseDataResource(input: Readonly<{
  root: string; resourceId: string; output: string; receipt: string;
}>) {
  const resource = await buildClosureDataResource({
    id: input.resourceId as Parameters<typeof buildClosureDataResource>[0]["id"],
    workspaceRoot: resolve(input.root), outputDirectory: resolve(input.output),
  });
  const receipt = { schemaVersion: 1, operation: "closure.data-resource.build", resource } as const;
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes(receipt), { flag: "wx" });
  return receipt;
}

/** A finite business selection, not a plan or cache decision. The portable tool
 * includes this producer; resource-only runners need source data and archive
 * executables, not a workspace install. Each product remains independently
 * exportable and a partial batch never emits a successful batch receipt. */
export async function buildReleaseDataResources(input: Readonly<{
  root: string; resourceIds: unknown; output: string; receipt: string;
}>) {
  const ids = input.resourceIds;
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !CLOSURE_DATA_RESOURCES.some(resource => resource.id === id))
    || new Set(ids).size !== ids.length) throw new Error("resource IDs must be a unique array of declared Closure resources");
  const resources = [];
  for (const resourceId of ids as string[]) {
    const started = Date.now();
    const output = join(resolve(input.output), "products", resourceId);
    const resourceReceipt = join(output, "resource-receipt.json");
    try {
      await buildReleaseDataResource({ root: input.root, resourceId, output, receipt: resourceReceipt });
      const contribution = await exportDataResource({ resourceId, resourceReceipt,
        output: join(resolve(input.output), "contributions", resourceId) });
      const result = { resourceId, resourceReceipt, ...contribution, durationMs: Date.now() - started };
      resources.push(result);
      process.stdout.write(`${JSON.stringify({ operation: "resource.build.completed", ...result })}\n`);
    } catch (error) {
      process.stderr.write(`${JSON.stringify({ operation: "resource.build.failed", resourceId, durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error) })}\n`);
      throw error;
    }
  }
  const receipt = { schemaVersion: 1, operation: "closure.data-resources.build", resources };
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes(receipt), { flag: "wx" });
  return receipt;
}

export async function materializeReleaseDataResources(input: Readonly<{
  root: string; sources: string; output: string; receipt: string;
}>) {
  const request = await readObject(input.sources);
  if (Object.keys(request).join(",") !== "sources" || !Array.isArray(request.sources)) throw new Error("resource request requires sources");
  const seen = new Set<string>();
  for (const source of request.sources) {
    if (source == null || typeof source !== "object" || Array.isArray(source)
      || Object.keys(source).some(key => key !== "id" && key !== "artifact")
      || !CLOSURE_DATA_RESOURCES.some(resource => resource.id === source.id) || seen.has(source.id)) throw new Error("invalid or duplicate resource source");
    seen.add(source.id);
    if (source.artifact != null && (typeof source.artifact !== "object" || Array.isArray(source.artifact)
      || Object.keys(source.artifact).sort().join(",") !== "sha256,url"
      || typeof source.artifact.url !== "string" || !/^[a-f0-9]{64}$/u.test(source.artifact.sha256))) throw new Error("invalid resource artifact");
    if (Object.hasOwn(source, "artifact") && source.artifact == null) throw new Error("invalid resource artifact");
  }
  const resources = [];
  for (const source of request.sources) {
    const started = Date.now();
    if (source.artifact != null) {
      const result = await importDataResource({ resourceId: source.id, descriptor: source.artifact,
        output: join(resolve(input.output), "products", source.id) });
      resources.push({ resourceId: source.id, ...result, durationMs: Date.now() - started });
    } else {
      const result = await buildReleaseDataResources({ ...input, resourceIds: [source.id],
        receipt: join(resolve(input.output), "results", `${source.id}.json`) });
      resources.push(...result.resources);
    }
  }
  await mkdir(dirname(resolve(input.receipt)), { recursive: true });
  await writeFile(input.receipt, canonicalBytes({ schemaVersion: 1, operation: "closure.data-resources.materialize", resources }), { flag: "wx" });
}
