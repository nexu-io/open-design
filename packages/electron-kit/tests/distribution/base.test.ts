import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assembleElectronDistributionBase, verifyElectronDistributionBase } from "@/distribution/base.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-base-")); roots.push(root);
  const runtimeDirectory = join(root, "runtime"), sceneRoot = join(root, "scene");
  await mkdir(runtimeDirectory); await mkdir(sceneRoot);
  await writeFile(join(runtimeDirectory, "electron"), "native bytes", { mode: 0o755 });
  for (const name of ["main.cjs", "renderer-mount-preload.cjs", "carrier.json"]) await writeFile(join(sceneRoot, name), name);
  await writeFile(join(sceneRoot, "capsule.zip"), "not in base");
  return { scene: { sceneRoot }, runtimeDirectory, electronVersion: "42.0.0", target: "darwin-arm64", outputRoot: join(root, "base") };
}
it("keeps base neutral and verifies restored native and carrier bytes", async () => {
  const input = await fixture(), base = await assembleElectronDistributionBase(input);
  const manifest = JSON.parse(await readFile(join(base.root, "base.json"), "utf8"));
  expect(manifest.carrier.map((entry: { name: string }) => entry.name)).toEqual(["main.cjs", "renderer-mount-preload.cjs", "carrier.json"]);
  await expect(verifyElectronDistributionBase(base, input)).resolves.toMatchObject({ runtimeDirectory: join(base.root, "runtime") });
  await expect(assembleElectronDistributionBase(input)).rejects.toThrow("EEXIST");
  await writeFile(join(base.root, "runtime/electron"), "tampered");
  await expect(verifyElectronDistributionBase(base, input)).rejects.toThrow("runtime integrity");
});
it("rejects different carrier inputs and target bindings", async () => {
  const input = await fixture(), base = await assembleElectronDistributionBase(input);
  await expect(verifyElectronDistributionBase(base, { ...input, target: "win32-x64" })).rejects.toThrow("target or runtime version");
  await writeFile(join(input.scene.sceneRoot, "main.cjs"), "changed carrier");
  await expect(verifyElectronDistributionBase(base, input)).rejects.toThrow("differs from scene");
});
it("preserves internal runtime links but refuses escaping links", async () => {
  const input = await fixture();
  await symlink("electron", join(input.runtimeDirectory, "internal"));
  const base = await assembleElectronDistributionBase(input);
  await expect(verifyElectronDistributionBase(base, input)).resolves.toBeDefined();
  await symlink("../../external", join(input.runtimeDirectory, "escape"));
  await expect(assembleElectronDistributionBase({ ...input, outputRoot: input.outputRoot + "-other" })).rejects.toThrow("escapes its root");
});
