import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pack } from "@open-design/archive/build";
import { afterEach, expect, it, vi } from "vitest";
import { acquireSceneArtifacts } from "@/exact/scene-acquisition.ts";
import { writeObject } from "@/exact/control-common.ts";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("combines direct cached transports with fresh producer outputs without relaying or repacking hits", async () => {
  const root = await mkdtemp(join(tmpdir(), "scene-acquisition-")); roots.push(root);
  const source = join(root, "source"); await mkdir(source); await writeFile(join(source, "scene.tar"), "opaque cached scene");
  const zip = join(root, "product.zip"); await pack(source, zip);
  const bytes = await readFile(zip), fetch = vi.fn(async () => new Response(bytes)); vi.stubGlobal("fetch", fetch);
  const sourceCommit = "a".repeat(40), output = join(root, "scenes"), fresh = join(output, `exact-terminal-scene-darwin-arm64-${sourceCommit}`);
  await mkdir(output, { recursive: true }); await writeFile(join(output, "scene.tar"), "fresh scene");
  const sources = join(root, "sources.json"); await writeObject(sources, { sources: [
    { shell: "electron", target: "darwin-arm64", artifact: { url: "https://cache.example/scene.zip", sha256: createHash("sha256").update(bytes).digest("hex") } },
    { shell: "terminal", target: "darwin-arm64" },
  ] });
  await acquireSceneArtifacts({ sources, sourceCommit, output });
  expect(await readFile(join(output, `exact-electron-scene-darwin-arm64-${sourceCommit}`, "scene.tar"), "utf8")).toBe("opaque cached scene");
  expect(await readFile(join(fresh, "scene.tar"), "utf8")).toBe("fresh scene");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects a missing miss contribution and duplicate targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "scene-acquisition-")); roots.push(root);
  const sources = join(root, "sources.json"), source = { shell: "electron", target: "darwin-arm64" };
  await writeObject(sources, { sources: [source] });
  const input = { sources, sourceCommit: "a".repeat(40), output: join(root, "out") };
  await expect(acquireSceneArtifacts(input)).rejects.toThrow();
  await writeObject(sources, { sources: [source, source] });
  await expect(acquireSceneArtifacts(input)).rejects.toThrow("Duplicate");
});
it("retains named directories for multiple fresh transports", async () => {
  const root = await mkdtemp(join(tmpdir(), "scene-acquisition-")); roots.push(root);
  const sourceCommit = "b".repeat(40), sources = join(root, "sources.json"), output = join(root, "out");
  const entries = ["electron", "terminal"].map(shell => ({ shell, target: "darwin-arm64" }));
  for (const { shell } of entries) {
    const directory = join(output, `exact-${shell}-scene-darwin-arm64-${sourceCommit}`);
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, "scene.tar"), shell);
  }
  await writeObject(sources, { sources: entries });
  await acquireSceneArtifacts({ sources, sourceCommit, output });
  for (const { shell } of entries) expect(await readFile(join(output, `exact-${shell}-scene-darwin-arm64-${sourceCommit}`, "scene.tar"), "utf8")).toBe(shell);
});
it("refuses an ambiguous flat transport or symlink instead of guessing ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "scene-acquisition-")); roots.push(root);
  const sources = join(root, "sources.json"), output = join(root, "out"), sourceCommit = "c".repeat(40);
  await mkdir(output); await writeFile(join(root, "external"), "unowned");
  await symlink(join(root, "external"), join(output, "scene.tar"));
  await writeObject(sources, { sources: [{ shell: "electron", target: "darwin-arm64" }] });
  await expect(acquireSceneArtifacts({ sources, sourceCommit, output })).rejects.toThrow("regular file");
  await rm(join(output, "scene.tar")); await writeFile(join(output, "scene.tar"), "ambiguous");
  await writeObject(sources, { sources: ["electron", "terminal"].map(shell => ({ shell, target: "darwin-arm64" })) });
  await expect(acquireSceneArtifacts({ sources, sourceCommit, output })).rejects.toThrow();
});
