import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { assembleElectronDistributionBase, buildElectronDistributionBase, resolveElectronDistributionArchive, verifyElectronDistributionBase } from "@/distribution/base.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-base-")); roots.push(root);
  const runtimeDirectory = join(root, "runtime"), sceneRoot = join(root, "scene");
  await mkdir(runtimeDirectory); await mkdir(sceneRoot);
  await writeFile(join(runtimeDirectory, "electron"), "native bytes", { mode: 0o755 });
  const framework = join(runtimeDirectory, "Electron.app/Contents/Frameworks/Electron Framework.framework");
  await mkdir(join(framework, "Versions/A/Resources"), { recursive: true });
  await writeFile(join(framework, "Versions/A/Electron Framework"), "framework");
  await symlink("A", join(framework, "Versions/Current"));
  await symlink("Versions/Current/Electron Framework", join(framework, "Electron Framework"));
  await symlink("Versions/Current/Resources", join(framework, "Resources"));
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
it("reuses identical native/carrier output across independent Capsule and Closure changes", async () => {
  const input = await fixture(), base = await assembleElectronDistributionBase(input);
  for (const name of ["capsule.zip", "closure.mjs", "open-design-web.zip", "open-design-daemon.zip"]) {
    await writeFile(join(input.scene.sceneRoot, name), `new ${name}`);
  }
  await expect(verifyElectronDistributionBase(base, input)).resolves.toBeDefined();
  const next = await assembleElectronDistributionBase({ ...input, outputRoot: input.outputRoot + "-next" });
  expect(next.manifestSha256).toBe(base.manifestSha256);
  expect(await readFile(join(next.root, "base.json"))).toEqual(await readFile(join(base.root, "base.json")));
});
it("preserves internal runtime links but refuses escaping links", async () => {
  const input = await fixture();
  await symlink("electron", join(input.runtimeDirectory, "internal"));
  const base = await assembleElectronDistributionBase(input);
  await expect(verifyElectronDistributionBase(base, input)).resolves.toBeDefined();
  await symlink("../../external", join(input.runtimeDirectory, "escape"));
  await expect(assembleElectronDistributionBase({ ...input, outputRoot: input.outputRoot + "-other" })).rejects.toThrow("escapes its root");
});
it("rejects dereferenced framework input before building a signable base", async () => {
  const input = await fixture();
  const current = join(input.runtimeDirectory, "Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/Current");
  await rm(current);
  await mkdir(current);
  await expect(assembleElectronDistributionBase(input)).rejects.toThrow("official Electron archive");
});
it.skipIf(process.platform !== "darwin" || !process.env.ELECTRON_TEST_ARCHIVE)("preserves official framework links and supports native ad-hoc signing after base assembly", async () => {
  const input = await fixture(), target = `${process.platform}-${process.arch}`;
  const products = await Promise.all(["main.cjs", "renderer-mount-preload.cjs", "carrier.json"].map(async name => {
    const bytes = await readFile(join(input.scene.sceneRoot, name));
    return { name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }));
  const bytes = JSON.stringify({ schemaVersion: 1, operation: "electron.scene.build", target, products });
  await writeFile(join(input.scene.sceneRoot, "scene.json"), bytes);
  const base = await buildElectronDistributionBase({ sceneDirectory: input.scene.sceneRoot,
    sceneManifestSha256: createHash("sha256").update(bytes).digest("hex"),
    archivePath: process.env.ELECTRON_TEST_ARCHIVE!, outputRoot: input.outputRoot });
  const source = await resolveElectronDistributionArchive(target);
  await verifyElectronDistributionBase(base, { ...input, target, electronVersion: source.version });
  // Official developer archives do not ship a complete signed app resource seal.
  // This local structural probe is not a substitute for formal release signing.
  const app = join(base.root, "runtime/Electron.app");
  await promisify(execFile)("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app]);
  await promisify(execFile)("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
}, 120_000);
