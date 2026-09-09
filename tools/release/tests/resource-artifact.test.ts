import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture, type ZipFixtureEntries } from "./archive-fixture.ts";
import { buildClosureDataResources, CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { afterEach, expect, it, vi } from "vitest";
import { exportDataResource, importDataResource } from "@/exact/resource-artifact.ts";
import { composeReleaseDataResources } from "@/exact/resource-composition.ts";
import { materializeReleaseDataResources } from "@/exact/resource-build.ts";
import { acquireArtifactProduct } from "@/exact/artifact-product.ts";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-resource-cache-")); roots.push(root);
  for (const resource of CLOSURE_DATA_RESOURCES) for (const input of resource.inputs) {
    await mkdir(join(root, input.source), { recursive: true });
    await writeFile(join(root, input.source, "input.txt"), input.source);
  }
  const resources = await buildClosureDataResources({ workspaceRoot: root, outputDirectory: join(root, "built") });
  const receipts = await Promise.all(resources.map(async resource => {
    const file = join(root, "built", `${resource.id}.json`);
    await writeFile(file, JSON.stringify({ schemaVersion: 1, operation: "closure.data-resource.build", resource }));
    return file;
  }));
  return { root, resources, receipts, input: { descriptor: join(root, "descriptor.json"), resourceId: "craft", output: join(root, "candidate"),
    resourceReceipt: join(root, "built/craft.json") } as const };
}
async function cache(f: Awaited<ReturnType<typeof fixture>>, mutate?: (zip: ZipFixtureEntries) => void) {
  await exportDataResource(f.input);
  expect(await readdir(f.input.output)).toEqual(["artifact"]);
  const zip = {} as ZipFixtureEntries;
  for (const file of await readdir(join(f.input.output, "artifact"))) zip[file] = await readFile(join(f.input.output, "artifact", file));
  mutate?.(zip);
  const body = await zipFixture(zip);
  const value = { url: "https://cache.example/craft.zip", sha256: createHash("sha256").update(body).digest("hex") };
  await writeFile(f.input.descriptor, JSON.stringify(value));
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { fetch, value, restore: { ...f.input, output: join(f.root, "restored") } };
}

it("restores a portable content-bound resource and feeds the existing complete composition", async () => {
  const f = await fixture(), hit = await cache(f);
  // The producer's original path is no longer available at restoration time.
  await rm(f.resources.find(resource => resource.id === "craft")!.path);
  const result = await importDataResource(hit.restore);
  const restored = JSON.parse(await readFile(result.resourceReceipt, "utf8"));
  expect(restored.resource.path).toBeUndefined();
  const composed = await composeReleaseDataResources({ schemaVersion: 1, operation: "closure.resources.build",
    resources: [{ id: "open-design-daemon" }, { id: "open-design-web" }] },
  f.receipts.map(file => file === f.input.resourceReceipt ? result.resourceReceipt : file));
  expect(composed.resources).toHaveLength(11);
  expect(composed.resources.find((resource: { id: string }) => resource.id === "craft")).toMatchObject({
    sha256: f.resources.find(resource => resource.id === "craft")!.sha256,
  });
});

it("acquires opaque transport bytes once without interpreting or repacking their payload", async () => {
  const f = await fixture(), hit = await cache(f);
  const output = join(f.root, "transport");
  await acquireArtifactProduct({ descriptor: f.input.descriptor, output });
  for (const file of await readdir(join(f.input.output, "artifact"))) {
    expect(await readFile(join(output, file))).toEqual(await readFile(join(f.input.output, "artifact", file)));
  }
  expect(hit.fetch).toHaveBeenCalledTimes(1);
  await expect(acquireArtifactProduct({ descriptor: f.input.descriptor, output })).rejects.toThrow("already exists");
});

it("materializes mixed sources without rebuilding the artifact-backed resource", async () => {
  const f = await fixture(), hit = await cache(f);
  await rm(join(f.root, "craft"), { recursive: true });
  const sources = join(f.root, "sources.json"), output = join(f.root, "mixed"), receipt = join(f.root, "mixed.json");
  await writeFile(sources, JSON.stringify({ sources: [{ id: "craft", artifact: hit.value }, { id: "skills" }] }));
  await materializeReleaseDataResources({ root: f.root, sources, output, receipt });
  expect(await readdir(join(output, "products"))).toEqual(["craft", "skills"]);
  expect(await readdir(join(output, "contributions"))).toEqual(["skills"]);
  expect(JSON.parse(await readFile(receipt, "utf8")).resources).toHaveLength(2);
  expect(hit.fetch).toHaveBeenCalledTimes(1);
});

it("rejects an invalid descriptor before download and leaves no restored directory", async () => {
  const f = await fixture(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await writeFile(f.input.descriptor, JSON.stringify({ url: "https://cache.example/craft.zip", sha256: "invalid" }));
  await expect(importDataResource({ ...f.input, output: join(f.root, "restored") })).rejects.toThrow("SHA-256");
  expect(fetch).not.toHaveBeenCalled();
  expect(await readdir(f.root)).not.toContain("restored");
});

it.each(["wrong identity", "wrong resource", "extra payload", "changed archive", "oversized receipt"])("rejects %s without publishing a restored product", async fault => {
  const f = await fixture();
  const hit = await cache(f, zip => {
    if (fault === "extra payload") zip["extra.txt"] = "unexpected";
    if (fault === "changed archive") zip[f.resources.find(resource => resource.id === "craft")!.file] = "tampered";
    if (fault === "oversized receipt") zip["resource-receipt.json"] = " ".repeat(65 * 1024);
  });
  if (fault === "wrong identity") {
    hit.value.sha256 = "c".repeat(64);
    await writeFile(f.input.descriptor, JSON.stringify(hit.value));
  }
  const input = fault === "wrong resource" ? { ...hit.restore, resourceId: "skills" } : hit.restore;
  await expect(importDataResource(input)).rejects.toThrow();
  expect(await readdir(f.root)).not.toContain("restored");
});

it("does not replace existing output", async () => {
  const f = await fixture(), hit = await cache(f);
  await mkdir(hit.restore.output); await writeFile(join(hit.restore.output, "keep"), "existing");
  await expect(importDataResource(hit.restore)).rejects.toThrow("already exists");
  expect(hit.fetch).not.toHaveBeenCalled();
  expect(await readFile(join(hit.restore.output, "keep"), "utf8")).toBe("existing");
});
