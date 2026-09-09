import { lstat, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { checkedFile, readObject, type JsonObject } from "./control-common.ts";

/** A downloaded product set has one declared directory per resource, never an
 * open-ended glob. Reject incomplete/extra entries before content preparation. */
export async function resolveDataResourceReceipts(directory: string): Promise<readonly string[]> {
  const root = resolve(directory), entries = await readdir(root, { withFileTypes: true });
  const expected = CLOSURE_DATA_RESOURCES.map(({ id }) => id).sort();
  if (entries.some(entry => !entry.isDirectory())
    || entries.map(entry => entry.name).sort().join(",") !== expected.join(",")) {
    throw new Error("data products directory must contain exactly the declared resource set");
  }
  return Promise.all(CLOSURE_DATA_RESOURCES.map(async ({ id }) => {
    const receipt = join(root, id, "resource-receipt.json");
    if (!(await lstat(receipt)).isFile()) throw new Error("data product receipt must be a regular file");
    if (validateDataResourceReceipt(await readObject(receipt)).id !== id) throw new Error("data product directory identity mismatch");
    return receipt;
  }));
}

export function validateDataResourceReceipt(receipt: JsonObject): JsonObject {
  const resource = receipt.resource;
  if (receipt.schemaVersion !== 1 || receipt.operation !== "closure.data-resource.build" || resource == null
    || !CLOSURE_DATA_RESOURCES.some(({ id }) => id === resource.id) || resource.entrypoint !== "resource.json" || resource.sync !== true
    || !/^[a-f0-9]{64}$/u.test(resource.sha256 ?? "") || !/^[a-f0-9]{64}$/u.test(resource.treeSha256 ?? "")
    || !Number.isSafeInteger(resource.size) || resource.size <= 0
    || resource.file !== `${resource.id}-${resource.sha256}.zip`) throw new Error("invalid single data resource receipt");
  return resource;
}

/** Replace the complete data selection, retaining runtime products. Selection
 * never builds missing inputs or confers convergence/result-cache authority.
 * A relocated single-product receipt travels beside its archive; its original
 * machine's absolute path is informational, not a fallback source. */
export async function composeReleaseDataResources(collection: JsonObject, receiptFiles: readonly string[]): Promise<JsonObject> {
  if (collection.schemaVersion !== 1 || collection.operation !== "closure.resources.build" || !Array.isArray(collection.resources)) {
    throw new Error("invalid Closure resource collection");
  }
  const expected = new Set<string>(CLOSURE_DATA_RESOURCES.map(({ id }) => id));
  const runtimeIds = new Set(["open-design-daemon", "open-design-web"]);
  const seen = new Set<string>();
  const runtime: JsonObject[] = [];
  for (const resource of collection.resources) {
    if (resource == null || typeof resource.id !== "string" || seen.has(resource.id)
      || (!expected.has(resource.id) && !runtimeIds.has(resource.id))) throw new Error("invalid or duplicate collection resource");
    seen.add(resource.id);
    if (runtimeIds.has(resource.id)) runtime.push(resource);
  }
  if (runtime.length !== runtimeIds.size) throw new Error("incomplete runtime resource set");
  const selected = new Map<string, JsonObject>();
  for (const file of receiptFiles) {
    const resource = validateDataResourceReceipt(await readObject(file));
    if (selected.has(resource.id)) throw new Error("duplicate data resource receipt");
    const path = await checkedFile(resource, `data resource ${resource.id}`, resolve(dirname(file), resource.file));
    selected.set(resource.id, { ...resource, path });
  }
  if (selected.size !== expected.size) throw new Error("prepare requires a complete data resource set");
  return { schemaVersion: 1, operation: "closure.resources.build",
    resources: [...runtime, ...CLOSURE_DATA_RESOURCES.map(({ id }) => selected.get(id)!)] };
}
