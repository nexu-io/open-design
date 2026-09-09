import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { create } from "tar";
import { packSceneArtifact, unpackSceneArtifact } from "@/exact/scene-artifact.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "scene-artifact-test-")); roots.push(root);
  const scene = join(root, "source"); await mkdir(join(scene, "platform", "bin"), { recursive: true });
  await writeFile(join(scene, "scene.json"), "{}");
  await writeFile(join(scene, "platform", "bin", "node"), "native-node");
  await chmod(join(scene, "platform", "bin", "node"), 0o755);
  await writeFile(join(scene, "platform", ".lock"), "locked");
  await chmod(join(scene, "platform", ".lock"), 0o444);
  await writeFile(join(scene, "platform", "empty"), "");
  return { root, scene, archive: join(root, "scene.tar"), output: join(root, "restored") };
}

it("round-trips native modes, read-only and hidden files, and empty files", async () => {
  const f = await fixture();
  const packed = await packSceneArtifact(f.scene, f.archive);
  // Outer artifact transport may normalize its own sole file to 0644.
  await chmod(f.archive, 0o644);
  expect(await unpackSceneArtifact(f.archive, f.output)).toMatchObject({ sha256: packed.sha256, size: packed.size });
  for (const name of ["scene.json", "platform/bin/node", "platform/.lock", "platform/empty"]) {
    expect(await readFile(join(f.output, name))).toEqual(await readFile(join(f.scene, name)));
    if (process.platform !== "win32") expect((await stat(join(f.output, name))).mode & 0o777).toBe((await stat(join(f.scene, name))).mode & 0o777);
  }
});

it("produces identical transport bytes despite source timestamp changes", async () => {
  const f = await fixture(); const first = await packSceneArtifact(f.scene, f.archive);
  await utimes(join(f.scene, "scene.json"), new Date(123456), new Date(234567));
  const second = await packSceneArtifact(f.scene, join(f.root, "second.tar"));
  expect(second.sha256).toBe(first.sha256);
});

it("refuses existing outputs and archives without overwriting them", async () => {
  const f = await fixture(); await packSceneArtifact(f.scene, f.archive);
  await expect(packSceneArtifact(f.scene, f.archive)).rejects.toThrow("already exists");
  await mkdir(f.output); await writeFile(join(f.output, "keep"), "keep");
  await expect(unpackSceneArtifact(f.archive, f.output)).rejects.toThrow("already exists");
  expect(await readFile(join(f.output, "keep"), "utf8")).toBe("keep");
});

it("refuses an archive inside the source", async () => {
  const f = await fixture();
  await expect(packSceneArtifact(f.scene, join(f.scene, "scene.tar"))).rejects.toThrow("outside");
});

it.skipIf(process.platform === "win32")("rejects source links and archive links without publishing a destination", async () => {
  const f = await fixture(); await symlink("scene.json", join(f.scene, "link"));
  await expect(packSceneArtifact(f.scene, f.archive)).rejects.toThrow("forbids links");
  await create({ cwd: f.scene, file: f.archive }, ["scene.json", "link"]);
  await expect(unpackSceneArtifact(f.archive, f.output)).rejects.toThrow("entry type");
  expect(await readdir(f.root)).toEqual(expect.not.arrayContaining(["restored"]));
  expect((await readdir(f.root)).some(name => name.startsWith(".scene-transport-"))).toBe(false);
});

it("rejects duplicate entries", async () => {
  const f = await fixture(); await create({ cwd: f.scene, file: f.archive }, ["scene.json", "scene.json"]);
  await expect(unpackSceneArtifact(f.archive, f.output)).rejects.toThrow("duplicate");
});

it("rejects traversal and truncated archives without leaving a scene", async () => {
  const f = await fixture(); await writeFile(join(f.root, "outside"), "keep");
  await create({ cwd: f.scene, file: f.archive, preservePaths: true }, ["scene.json", "../outside"]);
  await expect(unpackSceneArtifact(f.archive, f.output)).rejects.toThrow("unsafe");
  await writeFile(f.archive, "not a tar archive");
  await expect(unpackSceneArtifact(f.archive, f.output)).rejects.toThrow();
  expect(await readFile(join(f.root, "outside"), "utf8")).toBe("keep");
});
