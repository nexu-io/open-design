import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { afterEach, expect, it, vi } from "vitest";
import { contributeCapsule, restoreCapsule } from "@/exact/capsule-cache.ts";

const roots: string[] = [];
const digest = (body: string | Buffer) => createHash("sha256").update(body).digest("hex");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-capsule-cache-")); roots.push(root);
  const target = "darwin-arm64", id = "electron.capsule.build", identity = `sha256:${"a".repeat(64)}`;
  const zip = new JSZip(); zip.file("capsule.cjs", "capsule");
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const content = { schemaVersion: 1, protocol: "electron-capsule-v6", target, entrypoint: "capsule.cjs",
    archive: { sha256: digest(bytes), size: bytes.length,
      treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", size: 7, sha256: digest("capsule") }]) } };
  const archivePath = join(root, "source.zip"), contentPath = join(root, "source.json");
  await writeFile(archivePath, bytes); await json(contentPath, content);
  const input = { plan: join(root, "plan.json"), pending: join(root, "pending.json"), workload: "capsule_darwin_arm64",
    output: join(root, "candidate"), buildReceipt: join(root, "build.json"), artifact: "capsule-artifact" };
  const receipt = { schemaVersion: 1, operation: id, planNode: { id, identity, target }, content, archivePath, contentPath };
  await json(input.buildReceipt, receipt);
  await json(input.plan, { schemaVersion: 1, plan: { target, nodes: { [id]: { target, identity } } } });
  await json(input.pending, { workloads: { [input.workload]: { run: true, resultHit: false, digest: "c".repeat(64),
    executionClass: { runnerClass: "capsule", labels: ["macos-15"] } } } });
  return { root, input, receipt, bytes };
}
async function cache(f: Awaited<ReturnType<typeof fixture>>, mutate?: (zip: JSZip) => void) {
  await contributeCapsule(f.input);
  const zip = new JSZip();
  for (const name of await readdir(join(f.input.output, "artifact"))) zip.file(name, await readFile(join(f.input.output, "artifact", name)));
  mutate?.(zip);
  const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await json(f.input.pending, { workloads: { [f.input.workload]: { run: false, resultHit: true,
    result: { products: { capsule: { type: "url", source: "https://cache.example/capsule.zip", data: { sha256: digest(body) } } } } } } });
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { fetch, restore: { ...f.input, output: join(f.root, "restored") } };
}

it("restores a portable Capsule after producer paths disappear", async () => {
  const f = await fixture(), hit = await cache(f);
  const portable = JSON.parse(await readFile(join(f.input.output, "artifact/capsule-build-receipt.json"), "utf8"));
  expect(Object.keys(portable).sort()).toEqual(["content", "operation", "planNode", "schemaVersion"]);
  expect(JSON.parse(await readFile(join(f.input.output, "products", f.input.workload, "product-manifest.json"), "utf8")))
    .toMatchObject({ digest: "c".repeat(64), products: { capsule: { type: "job", source: f.input.artifact, data: f.receipt.planNode } } });
  await rm(f.receipt.archivePath); await rm(f.receipt.contentPath); await rm(f.input.buildReceipt);
  const result = await restoreCapsule(hit.restore);
  expect(await readFile(result.archivePath)).toEqual(f.bytes);
  expect(JSON.parse(await readFile(result.buildReceipt, "utf8"))).toEqual({ ...portable,
    archivePath: result.archivePath, contentPath: result.contentPath });
  expect(JSON.parse(await readFile(result.contentPath, "utf8"))).toEqual(f.receipt.content);
});

it.each(["identity", "target", "extra", "missing", "archive", "descriptor", "oversized", "local paths", "tree"])("rejects %s corruption without a partial Capsule", async fault => {
  const f = await fixture();
  const hit = await cache(f, zip => {
    const { archivePath: _archive, contentPath: _content, ...receipt } = structuredClone(f.receipt);
    if (fault === "identity") receipt.planNode.identity = `sha256:${"d".repeat(64)}`;
    if (fault === "target") receipt.content.target = "darwin-x64";
    if (fault === "tree") receipt.content.archive.treeSha256 = "d".repeat(64);
    zip.file("capsule-build-receipt.json", JSON.stringify(fault === "local paths" ? f.receipt : receipt));
    if (fault === "tree") zip.file("capsule-content.json", JSON.stringify(receipt.content));
    if (fault === "extra") zip.file("unexpected", "extra");
    if (fault === "missing") zip.remove("capsule.zip");
    if (fault === "archive") zip.file("capsule.zip", "tampered");
    if (fault === "descriptor") zip.file("capsule-content.json", "{}");
    if (fault === "oversized") zip.file("capsule-build-receipt.json", " ".repeat(65 * 1024));
  });
  await expect(restoreCapsule(hit.restore)).rejects.toThrow();
  expect((await readdir(f.root)).filter(name => name === "restored" || name.startsWith(".product-transport-"))).toEqual([]);
});

it("rejects non-hits before fetching, preserves existing output and does not recontribute hits", async () => {
  const f = await fixture(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(restoreCapsule({ ...f.input, output: join(f.root, "absent") })).rejects.toThrow("planner cache hit");
  expect(fetch).not.toHaveBeenCalled();
  const hit = await cache(f);
  expect(await contributeCapsule({ ...f.input, output: join(f.root, "unused") })).toEqual({ contributed: false });
  await mkdir(hit.restore.output); await writeFile(join(hit.restore.output, "keep"), "existing");
  await expect(restoreCapsule(hit.restore)).rejects.toThrow("already exists");
  expect(hit.fetch).not.toHaveBeenCalled();
  expect(await readFile(join(hit.restore.output, "keep"), "utf8")).toBe("existing");
});

it("refuses unbound production before contributing", async () => {
  const f = await fixture(); await json(f.input.buildReceipt, { ...f.receipt, planNode: undefined });
  await expect(contributeCapsule(f.input)).rejects.toThrow("binding mismatch");
  expect(await readdir(f.root)).not.toContain("candidate");
});
