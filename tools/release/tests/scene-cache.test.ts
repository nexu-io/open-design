import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture, type ZipFixtureEntries } from "./archive-fixture.ts";
import { afterEach, expect, it, vi } from "vitest";
import { packSceneArtifact } from "@/exact/scene-artifact.ts";
import { restoreSceneCache } from "@/exact/scene-cache.ts";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(extra = false) {
  const root = await mkdtemp(join(tmpdir(), "scene-cache-test-")); roots.push(root);
  const source = join(root, "source"); await mkdir(source); await writeFile(join(source, "scene.json"), "{}");
  await writeFile(join(source, ".native"), "native"); await chmod(join(source, ".native"), 0o755);
  const tar = join(root, "source.tar"); await packSceneArtifact(source, tar);
  const zip = {} as ZipFixtureEntries; zip["scene.tar"] = await readFile(tar); if (extra) zip["extra"] = "unlisted";
  const body = await zipFixture(zip);
  const pending = join(root, "pending.json"), workload = "electron_scene";
  const value = { workloads: { [workload]: { run: false, resultHit: true, result: { products: { scene: {
    type: "url", source: "https://cache.example/scene.zip", data: { sha256: createHash("sha256").update(body).digest("hex") },
  } } } } } };
  await writeFile(pending, JSON.stringify(value));
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { root, fetch, value, input: { pending, workload, transport: join(root, "restored.tar"), output: join(root, "restored") } };
}

it("restores only a digest-verified hit and preserves the opaque transport", async () => {
  const f = await fixture(); const result = await restoreSceneCache(f.input);
  expect(result.cache.url).toBe("https://cache.example/scene.zip");
  expect(await readFile(f.input.transport)).toEqual(await readFile(join(f.root, "source.tar")));
  expect(await readFile(join(f.input.output, ".native"), "utf8")).toBe("native");
  if (process.platform !== "win32") expect((await stat(join(f.input.output, ".native"))).mode & 0o777).toBe(0o755);
});

it("rejects misses before fetching and corrupted bytes before writing outputs", async () => {
  const f = await fixture(); f.value.workloads.electron_scene.resultHit = false;
  await writeFile(f.input.pending, JSON.stringify(f.value));
  await expect(restoreSceneCache(f.input)).rejects.toThrow("planner cache hit"); expect(f.fetch).not.toHaveBeenCalled();
  f.value.workloads.electron_scene.resultHit = true; await writeFile(f.input.pending, JSON.stringify(f.value));
  f.fetch.mockResolvedValueOnce(new Response("tampered"));
  await expect(restoreSceneCache(f.input)).rejects.toThrow("digest mismatch");
  expect(await readdir(f.root)).not.toContain("restored.tar");
});

it("rejects extra ZIP payloads and credentialed sources", async () => {
  const f = await fixture(true);
  await expect(restoreSceneCache(f.input)).rejects.toThrow("only scene.tar");
  f.value.workloads.electron_scene.result.products.scene.source = "https://user:secret@cache.example/scene.zip";
  await writeFile(f.input.pending, JSON.stringify(f.value)); f.fetch.mockClear();
  await expect(restoreSceneCache(f.input)).rejects.toThrow("credential-free HTTPS"); expect(f.fetch).not.toHaveBeenCalled();
});
