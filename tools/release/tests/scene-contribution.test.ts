import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { contributeScene } from "@/exact/scene-contribution.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(run = true) {
  const root = await mkdtemp(join(tmpdir(), "scene-contribution-")); roots.push(root);
  const scene = join(root, "scene"), pending = join(root, "pending.json"), output = join(root, "products");
  await mkdir(scene);
  await writeFile(join(scene, "scene.json"), JSON.stringify({ target: "darwin-arm64", shellBuildHash: "a".repeat(64) }));
  await writeFile(pending, JSON.stringify({ workloads: { electron_scene: { run, resultHit: !run, digest: "b".repeat(64),
    executionClass: { runnerClass: "electron_darwin_arm64", labels: ["macos-15"] } } } }));
  return { scene, pending, output, target: "darwin-arm64", workload: "electron_scene", artifact: "exact-electron-scene" };
}

it("emits the existing untrusted candidate without recomputing planner identity", async () => {
  const f = await fixture(), result = await contributeScene(f);
  expect(result.contributed).toBe(true);
  expect(JSON.parse(await readFile(join(f.output, f.workload, "product-manifest.json"), "utf8"))).toEqual({
    workload: f.workload, digest: "b".repeat(64), executionClass: { runnerClass: "electron_darwin_arm64", labels: ["macos-15"] },
    products: { scene: { type: "job", source: f.artifact, data: { target: f.target } } },
  });
});

it("validates cache hits but does not contribute them again", async () => {
  const f = await fixture(false);
  expect(await contributeScene(f)).toEqual({ contributed: false });
  await expect(access(f.output)).rejects.toThrow();
  await expect(contributeScene({ ...f, target: "win32-x64" })).rejects.toThrow("identity mismatch");
});

it.each(["mac", null, [], { runnerClass: "mac", labels: [] }, { runnerClass: "mac", labels: [false] }])(
  "rejects malformed execution classes without emitting a result: %j", async executionClass => {
    const f = await fixture();
    await writeFile(f.pending, JSON.stringify({ workloads: { electron_scene: { run: true, digest: "b".repeat(64), executionClass } } }));
    await expect(contributeScene(f)).rejects.toThrow("no convergence identity");
    await expect(access(f.output)).rejects.toThrow();
  });

it("rejects nested release fields and missing planner decisions before writing", async () => {
  const f = await fixture();
  await writeFile(join(f.scene, "scene.json"), JSON.stringify({ target: f.target, shellBuildHash: "a".repeat(64), resources: [{ metadata: { channel: "betahyx" } }] }));
  await expect(contributeScene(f)).rejects.toThrow("$.resources[0].metadata.channel");
  await expect(access(f.output)).rejects.toThrow();
  await writeFile(join(f.scene, "scene.json"), JSON.stringify({ target: f.target, shellBuildHash: "a".repeat(64) }));
  await writeFile(f.pending, JSON.stringify({ workloads: { electron_scene: { run: false } } }));
  await expect(contributeScene(f)).rejects.toThrow("no cache hit");
  await expect(contributeScene({ ...f, workload: "../escape" })).rejects.toThrow("invalid scene workload");
});
