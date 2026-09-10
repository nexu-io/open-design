import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { exportInstallationInput } from "@/exact/installation-input.ts";
import { describeFile, writeObject } from "@/exact/control-common.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "installation-input-")); roots.push(root);
  const source = join(root, "prepared"), output = join(root, "native");
  async function file(path: string) {
    const absolute = join(source, path); await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, path); return describeFile(absolute);
  }
  const prepared = { schemaVersion: 2, operation: "exact.prepare", channel: "betahyx", releaseVersion: "0.1.0-betahyx.21",
    contentMetadata: await file("documents/content-metadata.json"), trustFile: await file("trust/keys.json"),
    shells: [{ type: "electron", scenes: [{ target: "darwin-arm64", capsule: {
      manifest: await file("documents/capsule-darwin-arm64.json"), archive: await file("artifacts/capsule.zip"),
    } }] }, { type: "terminal", scenes: [{ target: "darwin-arm64" }] }] };
  await file("artifacts/web.zip"); await file("artifacts/daemon.zip"); await file("artifacts/platform.zip");
  await writeObject(join(source, "prepare-receipt.json"), prepared);
  return { source, output, prepared };
}
it("projects the exact installation binding without Closure or platform payloads", async () => {
  const f = await fixture(); await exportInstallationInput(f);
  expect((await readdir(f.output, { recursive: true })).sort()).toEqual([
    "artifacts", "artifacts/capsule.zip", "documents", "documents/capsule-darwin-arm64.json",
    "documents/content-metadata.json", "prepare-receipt.json", "trust", "trust/keys.json",
  ]);
  expect(await readFile(join(f.output, "prepare-receipt.json"))).toEqual(await readFile(join(f.source, "prepare-receipt.json")));
  expect(await readdir(join(f.source, "artifacts"))).toContain("web.zip");
});
it("fails atomically on a corrupt Capsule, without exposing partial installation inputs", async () => {
  const f = await fixture(); await writeFile(join(f.source, "artifacts/capsule.zip"), "corrupt");
  await expect(exportInstallationInput(f)).rejects.toThrow("binding verification failed");
  await expect(readdir(f.output)).rejects.toThrow();
});
it("never replaces an already frozen projection", async () => {
  const f = await fixture(); await exportInstallationInput(f);
  await expect(exportInstallationInput(f)).rejects.toThrow("already exists");
});
