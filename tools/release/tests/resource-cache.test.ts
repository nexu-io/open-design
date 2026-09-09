import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { buildClosureDataResources, CLOSURE_DATA_RESOURCES } from "@open-design/closure/build-resources";
import { afterEach, expect, it, vi } from "vitest";
import { contributeDataResource, restoreDataResource } from "@/exact/resource-cache.ts";
import { composeReleaseDataResources } from "@/exact/resource-composition.ts";

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
  const target = "darwin-arm64", identity = `sha256:${"a".repeat(64)}`;
  const receipts = await Promise.all(resources.map(async resource => {
    const file = join(root, "built", `${resource.id}.json`);
    await writeFile(file, JSON.stringify({ schemaVersion: 1, operation: "closure.data-resource.build", resource,
      planNode: { id: `closure.data.${resource.id}.build`, identity, target } }));
    return file;
  }));
  const plan = join(root, "plan.json"), pending = join(root, "pending.json"), workload = "data_craft_darwin_arm64";
  await writeFile(plan, JSON.stringify({ schemaVersion: 1, plan: { target, nodes: { "closure.data.craft.build": { identity, target } } } }));
  const value = { workloads: { [workload]: { run: true, resultHit: false, digest: "b".repeat(64),
    executionClass: { runnerClass: "data", labels: ["macos-15"] } } } };
  await writeFile(pending, JSON.stringify(value));
  return { root, resources, receipts, value, input: { plan, pending, workload, resourceId: "craft", output: join(root, "candidate"),
    resourceReceipt: join(root, "built/craft.json"), artifact: "craft-artifact" } as const };
}
async function cache(f: Awaited<ReturnType<typeof fixture>>, mutate?: (zip: JSZip) => void) {
  const result = await contributeDataResource(f.input);
  expect(result.contributed).toBe(true);
  const zip = new JSZip();
  for (const file of await readdir(join(f.input.output, "artifact"))) zip.file(file, await readFile(join(f.input.output, "artifact", file)));
  mutate?.(zip);
  const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const value = { workloads: { [f.input.workload]: { run: false, resultHit: true, result: { products: { resource: {
    type: "url", source: "https://cache.example/craft.zip", data: { sha256: createHash("sha256").update(body).digest("hex") },
  } } } } } };
  await writeFile(f.input.pending, JSON.stringify(value));
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { fetch, value, restore: { ...f.input, output: join(f.root, "restored") } };
}

it("restores a portable plan-bound resource and feeds the existing complete composition", async () => {
  const f = await fixture(), hit = await cache(f);
  const manifest = JSON.parse(await readFile(join(f.input.output, "products", f.input.workload, "product-manifest.json"), "utf8"));
  expect(manifest).toMatchObject({ digest: "b".repeat(64), executionClass: f.value.workloads[f.input.workload].executionClass,
    products: { resource: { type: "job", source: "craft-artifact" } } });
  // The producer's original path is no longer available at restoration time.
  await rm(f.resources.find(resource => resource.id === "craft")!.path);
  const result = await restoreDataResource(hit.restore);
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

it("rejects a non-hit before download and leaves no restored directory", async () => {
  const f = await fixture(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(restoreDataResource({ ...f.input, output: join(f.root, "restored") })).rejects.toThrow("planner cache hit");
  expect(fetch).not.toHaveBeenCalled();
  expect(await readdir(f.root)).not.toContain("restored");
});

it.each(["wrong identity", "wrong target", "extra payload", "changed archive", "oversized receipt"])("rejects %s without publishing a restored product", async fault => {
  const f = await fixture();
  const hit = await cache(f, zip => {
    if (fault === "extra payload") zip.file("extra.txt", "unexpected");
    if (fault === "changed archive") zip.file(f.resources.find(resource => resource.id === "craft")!.file, "tampered");
    if (fault === "oversized receipt") zip.file("resource-receipt.json", " ".repeat(65 * 1024));
  });
  if (fault === "wrong identity") {
    const plan = JSON.parse(await readFile(f.input.plan, "utf8"));
    plan.plan.nodes["closure.data.craft.build"].identity = `sha256:${"c".repeat(64)}`;
    await writeFile(f.input.plan, JSON.stringify(plan));
  }
  if (fault === "wrong target") {
    const plan = JSON.parse(await readFile(f.input.plan, "utf8"));
    plan.plan.target = "darwin-x64";
    plan.plan.nodes["closure.data.craft.build"].target = "darwin-x64";
    await writeFile(f.input.plan, JSON.stringify(plan));
  }
  await expect(restoreDataResource(hit.restore)).rejects.toThrow();
  expect(await readdir(f.root)).not.toContain("restored");
});

it("does not replace existing output or republish a cache hit", async () => {
  const f = await fixture(), hit = await cache(f);
  expect(await contributeDataResource({ ...f.input, output: join(f.root, "unused") })).toEqual({ contributed: false });
  expect(await readdir(f.root)).not.toContain("unused");
  await mkdir(hit.restore.output); await writeFile(join(hit.restore.output, "keep"), "existing");
  await expect(restoreDataResource(hit.restore)).rejects.toThrow("already exists");
  expect(hit.fetch).not.toHaveBeenCalled();
  expect(await readFile(join(hit.restore.output, "keep"), "utf8")).toBe("existing");
});
