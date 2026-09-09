import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it, vi } from "vitest";
import { contributePlatform, restorePlatform } from "@/exact/platform-cache.ts";
import { preparePlatformProduct } from "@/exact/platform-product.ts";

const roots: string[] = [];
const digest = (body: string | Buffer) => createHash("sha256").update(body).digest("hex");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-platform-cache-")); roots.push(root);
  const target = "darwin-arm64", id = "electron.platform.build", identity = `sha256:${"a".repeat(64)}`;
  const resource = { schemaVersion: 1, target, blob: { sha256: digest("platform"), size: 8,
    mediaType: "application/zip", sources: [] }, treeSha256: "b".repeat(64), executables: ["bin/node"] };
  const archivePath = join(root, "source.zip"), resourcePath = join(root, "source.json");
  await writeFile(archivePath, "platform"); await json(resourcePath, resource);
  const input = { plan: join(root, "plan.json"), pending: join(root, "pending.json"), workload: "platform_darwin_arm64",
    output: join(root, "candidate"), buildReceipt: join(root, "build.json"), artifact: "platform-artifact" };
  const receipt = { schemaVersion: 1, operation: id, target, planNode: { id, identity, target }, resource, archivePath, resourcePath };
  await json(input.buildReceipt, receipt);
  await json(input.plan, { schemaVersion: 1, plan: { target, nodes: { [id]: { target, identity } } } });
  await json(input.pending, { workloads: { [input.workload]: { run: true, resultHit: false, digest: "c".repeat(64),
    executionClass: { runnerClass: "platform", labels: ["macos-15"] } } } });
  return { root, input, receipt };
}
async function cache(f: Awaited<ReturnType<typeof fixture>>, mutate?: (zip: JSZip) => void) {
  await contributePlatform(f.input);
  const zip = new JSZip();
  for (const name of await readdir(join(f.input.output, "artifact"))) zip.file(name, await readFile(join(f.input.output, "artifact", name)));
  mutate?.(zip);
  const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await json(f.input.pending, { workloads: { [f.input.workload]: { run: false, resultHit: true,
    result: { products: { platform: { type: "url", source: "https://cache.example/platform.zip", data: { sha256: digest(body) } } } } } } });
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { fetch, restore: { ...f.input, output: join(f.root, "restored") } };
}

it("restores a portable platform with local paths rebound after the producer disappears", async () => {
  const f = await fixture(), hit = await cache(f);
  const portable = JSON.parse(await readFile(join(f.input.output, "artifact/platform-build-receipt.json"), "utf8"));
  expect(Object.keys(portable).sort()).toEqual(["operation", "planNode", "resource", "schemaVersion", "target"]);
  const manifest = JSON.parse(await readFile(join(f.input.output, "products", f.input.workload, "product-manifest.json"), "utf8"));
  expect(manifest).toMatchObject({ digest: "c".repeat(64), products: { platform: {
    type: "job", source: f.input.artifact, data: f.receipt.planNode } } });
  await rm(f.receipt.archivePath); await rm(f.receipt.resourcePath); await rm(f.input.buildReceipt);
  const result = await restorePlatform(hit.restore);
  expect(await readFile(result.archivePath, "utf8")).toBe("platform");
  expect(JSON.parse(await readFile(result.buildReceipt, "utf8"))).toEqual({ ...portable,
    archivePath: result.archivePath, resourcePath: result.resourcePath });
  expect(JSON.parse(await readFile(result.resourcePath, "utf8"))).toEqual(f.receipt.resource);
  const prepared = await preparePlatformProduct({ target: f.receipt.target, resourceFile: result.resourcePath,
    archiveFile: result.archivePath, outputDirectory: join(f.root, "release"), artifactBaseUrl: "https://release.example/betahyx/v1" });
  expect(prepared.resource.blob.sources).toEqual([{ kind: "remote",
    url: `https://release.example/betahyx/v1/platform-darwin-arm64-${digest("platform")}.zip` }]);
  expect(await readFile(prepared.archive.file, "utf8")).toBe("platform");
});

it.each(["identity", "target", "extra", "missing", "archive", "descriptor", "oversized", "local paths", "release source"])("rejects %s corruption without a partial product", async fault => {
  const f = await fixture();
  const hit = await cache(f, zip => {
    const { archivePath: _archive, resourcePath: _resource, ...receipt } = f.receipt;
    if (fault === "identity") receipt.planNode = { ...receipt.planNode, identity: `sha256:${"d".repeat(64)}` };
    if (fault === "target") receipt.target = "darwin-x64";
    const cached = fault === "local paths" ? f.receipt : fault === "release source" ? { ...receipt,
      resource: { ...receipt.resource, blob: { ...receipt.resource.blob,
        sources: [{ kind: "remote", url: "https://release.example/platform.zip" }] } } } : receipt;
    zip.file("platform-build-receipt.json", JSON.stringify(cached));
    if (fault === "extra") zip.file("unexpected", "extra");
    if (fault === "missing") zip.remove("platform.zip");
    if (fault === "archive") zip.file("platform.zip", "tampered");
    if (fault === "descriptor") zip.file("platform-resource.json", "{}");
    if (fault === "oversized") zip.file("platform-build-receipt.json", " ".repeat(65 * 1024));
  });
  await expect(restorePlatform(hit.restore)).rejects.toThrow();
  expect((await readdir(f.root)).filter(name => name === "restored" || name.startsWith(".product-transport-"))).toEqual([]);
});

it("rejects non-hits before fetching, preserves existing output and does not recontribute hits", async () => {
  const f = await fixture(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(restorePlatform({ ...f.input, output: join(f.root, "absent") })).rejects.toThrow("planner cache hit");
  expect(fetch).not.toHaveBeenCalled();
  const hit = await cache(f);
  expect(await contributePlatform({ ...f.input, output: join(f.root, "unused") })).toEqual({ contributed: false });
  await mkdir(hit.restore.output); await writeFile(join(hit.restore.output, "keep"), "existing");
  await expect(restorePlatform(hit.restore)).rejects.toThrow("already exists");
  expect(hit.fetch).not.toHaveBeenCalled();
  expect(await readFile(join(hit.restore.output, "keep"), "utf8")).toBe("existing");
});

it("refuses an unbound build before contributing", async () => {
  const f = await fixture(); await json(f.input.buildReceipt, { ...f.receipt, planNode: undefined });
  await expect(contributePlatform(f.input)).rejects.toThrow("binding mismatch");
  expect(await readdir(f.root)).not.toContain("candidate");
});
