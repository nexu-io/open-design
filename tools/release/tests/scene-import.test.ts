import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture, type ZipFixtureEntries } from "./archive-fixture.ts";
import { afterEach, expect, it, vi } from "vitest";
import { packSceneArtifact } from "@/exact/scene-artifact.ts";
import { importSceneArtifact } from "@/exact/scene-artifact.ts";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(extra = false) {
  const root = await mkdtemp(join(tmpdir(), "scene-cache-test-")); roots.push(root);
  const source = join(root, "source"); await mkdir(source); await writeFile(join(source, "scene.json"), "{}");
  await writeFile(join(source, ".native"), "native"); await chmod(join(source, ".native"), 0o755);
  const tar = join(root, "source.tar"); await packSceneArtifact(source, tar);
  const zip = {} as ZipFixtureEntries; zip["scene.tar"] = await readFile(tar); if (extra) zip["extra"] = "unlisted";
  const body = await zipFixture(zip);
  const descriptor = join(root, "descriptor.json");
  const value = { url: "https://cache.example/scene.zip", sha256: createHash("sha256").update(body).digest("hex") };
  await writeFile(descriptor, JSON.stringify(value));
  const fetch = vi.fn(async () => new Response(new Uint8Array(body))); vi.stubGlobal("fetch", fetch);
  return { root, fetch, value, input: { descriptor, transport: join(root, "restored.tar"), output: join(root, "restored") } };
}

it("imports digest-verified bytes and preserves the opaque transport", async () => {
  const f = await fixture(); const result = await importSceneArtifact(f.input);
  expect(result.acquisition.url).toBe("https://cache.example/scene.zip");
  expect(await readFile(f.input.transport)).toEqual(await readFile(join(f.root, "source.tar")));
  expect(await readFile(join(f.input.output, ".native"), "utf8")).toBe("native");
  if (process.platform !== "win32") expect((await stat(join(f.input.output, ".native"))).mode & 0o777).toBe(0o755);
});

it("rejects invalid descriptors before fetching and corrupted bytes before writing outputs", async () => {
  const f = await fixture(); const valid = f.value.sha256; f.value.sha256 = "invalid";
  await writeFile(f.input.descriptor, JSON.stringify(f.value));
  await expect(importSceneArtifact(f.input)).rejects.toThrow("SHA-256"); expect(f.fetch).not.toHaveBeenCalled();
  f.value.sha256 = valid; await writeFile(f.input.descriptor, JSON.stringify(f.value));
  f.fetch.mockResolvedValueOnce(new Response("tampered"));
  await expect(importSceneArtifact(f.input)).rejects.toThrow("digest mismatch");
  expect(await readdir(f.root)).not.toContain("restored.tar");
});

it("rejects extra ZIP payloads and credentialed sources", async () => {
  const f = await fixture(true);
  await expect(importSceneArtifact(f.input)).rejects.toThrow("only scene.tar");
  f.value.url = "https://user:secret@cache.example/scene.zip";
  await writeFile(f.input.descriptor, JSON.stringify(f.value)); f.fetch.mockClear();
  await expect(importSceneArtifact(f.input)).rejects.toThrow("credential-free HTTPS"); expect(f.fetch).not.toHaveBeenCalled();
});
