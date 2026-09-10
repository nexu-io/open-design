import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture, type ZipFixtureEntries } from "./archive-fixture.ts";
import { afterEach, expect, it, vi } from "vitest";
import { exportPlatform, importPlatform } from "@/exact/platform-artifact.ts";
import { acquireNativeArtifacts } from "@/exact/native-acquisition.ts";
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
  const target = "darwin-arm64", id = "electron.platform.build";
  const resource = { schemaVersion: 1, target, blob: { sha256: digest("platform"), size: 8,
    mediaType: "application/zip", sources: [] }, treeSha256: "b".repeat(64), executables: ["bin/node"] };
  const archivePath = join(root, "source.zip"), resourcePath = join(root, "source.json");
  await writeFile(archivePath, "platform"); await json(resourcePath, resource);
  const input = { target, descriptor: join(root, "descriptor.json"),
    output: join(root, "candidate"), buildReceipt: join(root, "build.json") };
  const receipt = { schemaVersion: 1, operation: id, target, resource, archivePath, resourcePath };
  await json(input.buildReceipt, receipt);
  return { root, input, receipt };
}
async function cache(f: Awaited<ReturnType<typeof fixture>>, mutate?: (zip: ZipFixtureEntries) => void) {
  await exportPlatform(f.input);
  const zip = {} as ZipFixtureEntries;
  for (const name of await readdir(join(f.input.output, "artifact"))) zip[name] = await readFile(join(f.input.output, "artifact", name));
  mutate?.(zip);
  const body = await zipFixture(zip);
  await json(f.input.descriptor, { url: "https://cache.example/platform.zip", sha256: digest(body) });
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { fetch, restore: { ...f.input, output: join(f.root, "restored") } };
}

it("restores a portable platform with local paths rebound after the producer disappears", async () => {
  const f = await fixture(), hit = await cache(f);
  const portable = JSON.parse(await readFile(join(f.input.output, "artifact/platform-build-receipt.json"), "utf8"));
  expect(Object.keys(portable).sort()).toEqual(["operation", "resource", "schemaVersion", "target"]);
  expect(await readdir(f.input.output)).toEqual(["artifact"]);
  await rm(f.receipt.archivePath); await rm(f.receipt.resourcePath); await rm(f.input.buildReceipt);
  const sources = join(f.root, "sources.json"), acquired = join(f.root, "consumer");
  await json(sources, { sources: [{ target: f.input.target, artifact: JSON.parse(await readFile(f.input.descriptor, "utf8")) }] });
  await acquireNativeArtifacts({ product: "platform", sources, output: acquired });
  expect(await readFile(join(acquired, f.input.target, "platform.zip"))).toEqual(await readFile(join(f.input.output, "artifact/platform.zip")));
  const result = await importPlatform(hit.restore);
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
    if (fault === "identity") receipt.resource = { ...receipt.resource, blob: { ...receipt.resource.blob, sha256: "d".repeat(64) } };
    if (fault === "target") receipt.target = "darwin-x64";
    const cached = fault === "local paths" ? f.receipt : fault === "release source" ? { ...receipt,
      resource: { ...receipt.resource, blob: { ...receipt.resource.blob,
        sources: [{ kind: "remote", url: "https://release.example/platform.zip" }] } } } : receipt;
    zip["platform-build-receipt.json"] = JSON.stringify(cached);
    if (fault === "extra") zip["unexpected"] = "extra";
    if (fault === "missing") delete zip["platform.zip"];
    if (fault === "archive") zip["platform.zip"] = "tampered";
    if (fault === "descriptor") zip["platform-resource.json"] = "{}";
    if (fault === "oversized") zip["platform-build-receipt.json"] = " ".repeat(65 * 1024);
  });
  await expect(importPlatform(hit.restore)).rejects.toThrow();
  expect((await readdir(f.root)).filter(name => name === "restored" || name.startsWith(".product-transport-"))).toEqual([]);
});

it("rejects invalid descriptors before fetching and preserves existing output", async () => {
  const f = await fixture(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await json(f.input.descriptor, { url: "https://cache.example/platform.zip", sha256: "invalid" });
  await expect(importPlatform({ ...f.input, output: join(f.root, "absent") })).rejects.toThrow("SHA-256");
  expect(fetch).not.toHaveBeenCalled();
  const hit = await cache(f);
  await mkdir(hit.restore.output); await writeFile(join(hit.restore.output, "keep"), "existing");
  await expect(importPlatform(hit.restore)).rejects.toThrow("already exists");
  expect(hit.fetch).not.toHaveBeenCalled();
  expect(await readFile(join(hit.restore.output, "keep"), "utf8")).toBe("existing");
});

it("refuses a cross-target build before exporting", async () => {
  const f = await fixture(); await json(f.input.buildReceipt, { ...f.receipt, target: "win32-x64" });
  await expect(exportPlatform(f.input)).rejects.toThrow("binding mismatch");
  expect(await readdir(f.root)).not.toContain("candidate");
});
