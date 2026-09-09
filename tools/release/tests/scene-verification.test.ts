import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { verifySceneArtifact } from "@/exact/scene-artifact.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(fields = {}) {
  const root = await mkdtemp(join(tmpdir(), "scene-verification-")); roots.push(root);
  const scene = join(root, "scene"); await mkdir(scene);
  await writeFile(join(scene, "scene.json"), JSON.stringify({ target: "darwin-arm64", shellBuildHash: "a".repeat(64), ...fields }));
  return scene;
}

it("verifies the actual scene without planner state", async () => {
  const scene = await fixture();
  expect(await verifySceneArtifact(scene, "darwin-arm64")).toEqual({ sceneDirectory: scene, target: "darwin-arm64", shellBuildHash: "a".repeat(64) });
  await expect(verifySceneArtifact(scene, "win32-x64")).rejects.toThrow("identity mismatch");
});

it.each(["", "sha256:" + "a".repeat(64), "A".repeat(64)])("rejects malformed physical identity: %s", async shellBuildHash => {
  await expect(verifySceneArtifact(await fixture({ shellBuildHash }), "darwin-arm64")).rejects.toThrow("identity mismatch");
});

it("rejects nested release-owned fields", async () => {
  const scene = await fixture({ resources: [{ metadata: { channel: "betahyx" } }] });
  await expect(verifySceneArtifact(scene, "darwin-arm64")).rejects.toThrow("$.resources[0].metadata.channel");
});
