import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { zipFixture } from "./archive-fixture.ts";
import { acquireRuntimeResources, buildRuntimeResourceBatch } from "@/exact/runtime-resources.ts";
import { buildReleaseRuntimeResources } from "@/exact/resource-build.ts";

vi.mock("@/exact/resource-build.ts", () => ({ buildReleaseRuntimeResources: vi.fn() }));
const roots: string[] = [], ids = ["open-design-daemon", "open-design-web"], target = `${process.platform}-${process.arch}`;
afterEach(async () => { vi.unstubAllGlobals(); vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(mode = "cold", fault?: string) {
  const root = await mkdtemp(join(tmpdir(), "runtime-products-")); roots.push(root);
  const products = join(root, "built"), output = join(root, "acquired"), receipt = join(root, "receipt.json"), sources = join(root, "sources.json");
  const bodies = new Map<string, Buffer>();
  const values = await Promise.all(ids.map(async id => {
    const bytes = Buffer.from(id), file = `${id}.zip`;
    const resource = { id, file, entrypoint: "sidecar.mjs", sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, treeSha256: "a".repeat(64) };
    const product = Buffer.from(JSON.stringify({ schemaVersion: 1, operation: "closure.runtime-resource.build", target: fault === "target" ? "other-target" : target, resource }));
    if (mode === "hot" || (mode === "mixed" && id === ids[0])) {
      const body = await zipFixture({ [file]: fault === "bytes" ? "tampered" : bytes, "resource-receipt.json": product });
      const url = `https://cache.example/${id}.zip`; bodies.set(url, body);
      return { id, artifact: { url, sha256: createHash("sha256").update(body).digest("hex") } };
    }
    const directory = join(products, id); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, file), bytes); await writeFile(join(directory, "resource-receipt.json"), product);
    return { id };
  }));
  await writeFile(sources, JSON.stringify({ sources: values }));
  const fetch = vi.fn(async (url: URL) => new Response(new Uint8Array(bodies.get(String(url))!))); vi.stubGlobal("fetch", fetch);
  return { root, fetch, input: { sources, products, output, receipt, target }, values };
}

it.each(["cold", "mixed", "hot"])("acquires complete %s runtime inputs without a build or cache contribution", async mode => {
  const f = await fixture(mode); await acquireRuntimeResources(f.input);
  const result = JSON.parse(await readFile(f.input.receipt, "utf8"));
  expect(result.operation).toBe("closure.runtime-resources.build");
  expect(result.resources.map((resource: { id: string }) => resource.id)).toEqual(ids);
  expect(await readdir(f.input.output)).toEqual(ids);
  for (const resource of result.resources) expect(await readFile(resource.path, "utf8")).toBe(resource.id);
  expect(f.fetch).toHaveBeenCalledTimes(mode === "hot" ? 2 : mode === "mixed" ? 1 : 0);
  expect(buildReleaseRuntimeResources).not.toHaveBeenCalled();
});

it.each(["target", "bytes"])("rejects cached %s mismatch without a success receipt", async fault => {
  const f = await fixture("hot", fault);
  await expect(acquireRuntimeResources(f.input)).rejects.toThrow();
  await expect(readFile(f.input.receipt)).rejects.toThrow();
  expect(buildReleaseRuntimeResources).not.toHaveBeenCalled();
});

it("fails missing local products instead of building them", async () => {
  const f = await fixture(); await rm(f.input.products, { recursive: true });
  await expect(acquireRuntimeResources(f.input)).rejects.toThrow();
  expect(f.fetch).not.toHaveBeenCalled(); expect(buildReleaseRuntimeResources).not.toHaveBeenCalled();
});

it("produces only the selected runtime miss as an independent portable product", async () => {
  const f = await fixture(), id = "open-design-web";
  await writeFile(f.input.sources, JSON.stringify({ sources: [{ id }] }));
  const resource = JSON.parse(await readFile(join(f.input.products, id, "resource-receipt.json"), "utf8")).resource;
  vi.mocked(buildReleaseRuntimeResources).mockResolvedValue({ schemaVersion: 1, operation: "closure.runtime-resources.build",
    resources: [{ ...resource, path: join(f.input.products, id, resource.file) }] });
  await buildRuntimeResourceBatch({ ...f.input, root: f.root });
  expect(buildReleaseRuntimeResources).toHaveBeenCalledWith(expect.objectContaining({ resourceIds: [id] }));
  expect(await readdir(join(f.input.output, "products"))).toEqual([id]);
  expect(JSON.parse(await readFile(join(f.input.output, "products", id, "resource-receipt.json"), "utf8"))).toMatchObject({ target, resource });
});

it("refuses cache-backed producer requests before invoking a build", async () => {
  const f = await fixture("hot");
  await expect(buildRuntimeResourceBatch({ ...f.input, root: f.root })).rejects.toThrow("only selected misses");
  expect(buildReleaseRuntimeResources).not.toHaveBeenCalled();
});
