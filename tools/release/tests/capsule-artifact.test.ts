import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture, type ZipFixtureEntries } from "./archive-fixture.ts";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { afterEach, expect, it, vi } from "vitest";
import { exportCapsule, importCapsule } from "@/exact/capsule-artifact.ts";
import { acquireNativeArtifacts } from "@/exact/native-acquisition.ts";

const roots: string[] = [];
const digest = (body: string | Buffer) => createHash("sha256").update(body).digest("hex");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-capsule-cache-")); roots.push(root);
  const target = "darwin-arm64", id = "electron.capsule.build";
  const zip = {} as ZipFixtureEntries; zip["capsule.cjs"] = "capsule";
  const bytes = await zipFixture(zip);
  const content = { schemaVersion: 1, protocol: "electron-capsule-v6", target, entrypoint: "capsule.cjs",
    archive: { sha256: digest(bytes), size: bytes.length,
      treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", size: 7, sha256: digest("capsule") }]) } };
  const archivePath = join(root, "source.zip"), contentPath = join(root, "source.json");
  await writeFile(archivePath, bytes); await json(contentPath, content);
  const input = { target, descriptor: join(root, "descriptor.json"),
    output: join(root, "candidate"), buildReceipt: join(root, "build.json") };
  const receipt = { schemaVersion: 1, operation: id, content, archivePath, contentPath };
  await json(input.buildReceipt, receipt);
  return { root, input, receipt, bytes };
}
async function cache(f: Awaited<ReturnType<typeof fixture>>, mutate?: (zip: ZipFixtureEntries) => void) {
  await exportCapsule(f.input);
  const zip = {} as ZipFixtureEntries;
  for (const name of await readdir(join(f.input.output, "artifact"))) zip[name] = await readFile(join(f.input.output, "artifact", name));
  mutate?.(zip);
  const body = await zipFixture(zip);
  await json(f.input.descriptor, { url: "https://cache.example/capsule.zip", sha256: digest(body) });
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { fetch, restore: { ...f.input, output: join(f.root, "restored") } };
}

it("restores a portable Capsule after producer paths disappear", async () => {
  const f = await fixture(), hit = await cache(f);
  const portable = JSON.parse(await readFile(join(f.input.output, "artifact/capsule-build-receipt.json"), "utf8"));
  expect(Object.keys(portable).sort()).toEqual(["content", "operation", "schemaVersion"]);
  expect(await readdir(f.input.output)).toEqual(["artifact"]);
  await rm(f.receipt.archivePath); await rm(f.receipt.contentPath); await rm(f.input.buildReceipt);
  const sources = join(f.root, "sources.json"), acquired = join(f.root, "consumer");
  await json(sources, { sources: [{ target: f.input.target, artifact: JSON.parse(await readFile(f.input.descriptor, "utf8")) }] });
  await acquireNativeArtifacts({ product: "capsule", sources, output: acquired });
  expect(await readFile(join(acquired, f.input.target, "capsule.zip"))).toEqual(await readFile(join(f.input.output, "artifact/capsule.zip")));
  const result = await importCapsule(hit.restore);
  expect(await readFile(result.archivePath)).toEqual(f.bytes);
  expect(JSON.parse(await readFile(result.buildReceipt, "utf8"))).toEqual({ ...portable,
    archivePath: result.archivePath, contentPath: result.contentPath });
  expect(JSON.parse(await readFile(result.contentPath, "utf8"))).toEqual(f.receipt.content);
});

it.each(["target", "extra", "missing", "archive", "descriptor", "oversized", "local paths", "tree"])("rejects %s corruption without a partial Capsule", async fault => {
  const f = await fixture();
  const hit = await cache(f, zip => {
    const { archivePath: _archive, contentPath: _content, ...receipt } = structuredClone(f.receipt);
    if (fault === "target") receipt.content.target = "darwin-x64";
    if (fault === "tree") receipt.content.archive.treeSha256 = "d".repeat(64);
    zip["capsule-build-receipt.json"] = JSON.stringify(fault === "local paths" ? f.receipt : receipt);
    if (fault === "tree") zip["capsule-content.json"] = JSON.stringify(receipt.content);
    if (fault === "extra") zip["unexpected"] = "extra";
    if (fault === "missing") delete zip["capsule.zip"];
    if (fault === "archive") zip["capsule.zip"] = "tampered";
    if (fault === "descriptor") zip["capsule-content.json"] = "{}";
    if (fault === "oversized") zip["capsule-build-receipt.json"] = " ".repeat(65 * 1024);
  });
  await expect(importCapsule(hit.restore)).rejects.toThrow();
  expect((await readdir(f.root)).filter(name => name === "restored" || name.startsWith(".product-transport-"))).toEqual([]);
});

it("requires an exact blob binding before fetching and preserves existing output", async () => {
  const f = await fixture(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await json(f.input.descriptor, { url: "https://cache.example/capsule.zip" });
  await expect(importCapsule({ ...f.input, output: join(f.root, "absent") })).rejects.toThrow("SHA-256 binding");
  expect(fetch).not.toHaveBeenCalled();
  const hit = await cache(f);
  await mkdir(hit.restore.output); await writeFile(join(hit.restore.output, "keep"), "existing");
  await expect(importCapsule(hit.restore)).rejects.toThrow("already exists");
  expect(hit.fetch).not.toHaveBeenCalled();
  expect(await readFile(join(hit.restore.output, "keep"), "utf8")).toBe("existing");
});

it("refuses cross-target production before exporting", async () => {
  const f = await fixture();
  await expect(exportCapsule({ ...f.input, target: "win32-x64" })).rejects.toThrow("target mismatch");
  expect(await readdir(f.root)).not.toContain("candidate");
});
