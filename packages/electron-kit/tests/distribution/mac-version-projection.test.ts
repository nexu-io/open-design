import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFile, uncache } from "@electron/asar";
import { afterEach, expect, it, vi } from "vitest";
import type { ElectronShellManifest } from "@/contracts/index.js";
import { inventoryNativeTree } from "@/distribution/native-tree.js";
import { projectMacBaseVersion } from "@/distribution/macos/version-projection.js";
import { finalizeMacBaseProjection } from "@/distribution/macos/finalize.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const manifest: ElectronShellManifest = { schemaVersion: 2, appId: "io.example", executableName: "example",
  productName: "Example", publisher: "Example", version: "1.0.0", channel: "stable", namespace: "example", protocol: "example",
  shell: { type: "electron", version: "1.0.0", buildHash: "a".repeat(64), digest: "b".repeat(64) } };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "mac-version-projection-")); roots.push(root);
  const baseAppPath = join(root, "base/example.app"), object = "Contents/Frameworks/Example Helper.app";
  await mkdir(join(baseAppPath, object), { recursive: true });
  await writeFile(join(baseAppPath, object, "Info.plist"), "fixed Helper version");
  await writeFile(join(baseAppPath, "Contents/Info.plist"), JSON.stringify({
    CFBundleIdentifier: manifest.appId, CFBundleExecutable: manifest.executableName, CFBundleName: manifest.productName,
    CFBundleVersion: "41.3.0", CFBundleShortVersionString: "41.3.0", NSCameraUsageDescription: "Preserve native policy",
  }));
  const seal = { schemaVersion: 1 as const, signer: { teamIdentifier: "ABC1234XYZ", certificateSha256: "a".repeat(64) },
    objects: [{ path: object, tree: await inventoryNativeTree(join(baseAppPath, object)) }] };
  const carrierDirectory = join(root, "carrier"); await mkdir(carrierDirectory);
  for (const file of ["main.cjs", "renderer-mount-preload.cjs", "carrier.json"]) await writeFile(join(carrierDirectory, file), file);
  const run = vi.fn(async (_command: string, args: readonly string[]) => ({
    stdout: args.includes("json") ? await readFile(args.at(-1)!, "utf8") : "", stderr: "",
  }));
  return { root, baseAppPath, seal, carrierDirectory, manifest, resources: [], run };
}

it("projects two versions with identical Helpers and no base modifications", async () => {
  const input = await fixture(), before = await inventoryNativeTree(input.baseAppPath);
  for (const version of ["1.0.1", "1.0.2"]) {
    const capsule = join(input.root, `${version}.zip`); await writeFile(capsule, `capsule ${version}`);
    const appPath = join(input.root, version, "example.app");
    await projectMacBaseVersion({ ...input, appPath, manifest: { ...manifest, version }, resources: [{ name: "capsule.zip", path: capsule }] });
    expect(await readFile(join(appPath, "Contents/Resources/capsule.zip"), "utf8")).toBe(`capsule ${version}`);
    const plist = JSON.parse(await readFile(join(appPath, "Contents/Info.plist"), "utf8"));
    expect(plist).toMatchObject({ CFBundleVersion: version, NSCameraUsageDescription: "Preserve native policy" });
    expect(plist.ElectronAsarIntegrity["Resources/app.asar"].hash).toMatch(/^[a-f0-9]{64}$/u);
    const archive = join(appPath, "Contents/Resources/app.asar");
    expect(JSON.parse(extractFile(archive, "shell.json").toString()).version).toBe(version); uncache(archive);
    expect(await inventoryNativeTree(join(appPath, input.seal.objects[0]!.path))).toEqual(input.seal.objects[0]!.tree);
  }
  expect(await inventoryNativeTree(input.baseAppPath)).toEqual(before);
});

it("refuses native identity drift and an existing destination", async () => {
  const input = await fixture(), appPath = join(input.root, "existing.app");
  await expect(projectMacBaseVersion({ ...input, appPath, manifest: { ...manifest, appId: "io.foreign" } })).rejects.toThrow("identity mismatch");
  await mkdir(appPath);
  await expect(projectMacBaseVersion({ ...input, appPath })).rejects.toThrow("EEXIST");
});

it("signs only the outer app and binds the notarization wait to the submitted version", async () => {
  const input = await fixture(), id = "01234567-89ab-cdef-0123-456789abcdef";
  const run = vi.fn(async (_command: string, args: readonly string[]) => ({ stdout:
    args[1] === "submit" ? JSON.stringify({ id }) : args[1] === "wait" ? JSON.stringify({ id, status: "Accepted" }) : "", stderr: "" }));
  await finalizeMacBaseProjection({ appPath: input.baseAppPath, seal: input.seal, identity: "a".repeat(40),
    entitlements: "/fixture/entitlements.plist", notary: { kind: "keychain", profile: "fixture" }, run });
  const signing = run.mock.calls.filter(([, args]) => args.includes("--sign"));
  expect(signing).toHaveLength(1); expect(signing[0]![1].at(-1)).toBe(input.baseAppPath);
  expect(signing[0]![1]).not.toContain("--deep");
  expect(run.mock.calls.find(([, args]) => args[1] === "wait")![1][2]).toBe(id);
  expect(run.mock.calls.at(-1)![1].slice(0, 2)).toEqual(["stapler", "staple"]);
});

it("does not expose credential-bearing subprocess errors or continue after a failed outer signature", async () => {
  const input = await fixture(), run = vi.fn(async () => { throw new Error("private password in child argv"); });
  await expect(finalizeMacBaseProjection({ appPath: input.baseAppPath, seal: input.seal, identity: "a".repeat(40),
    entitlements: "/fixture/entitlements.plist", notary: { kind: "keychain", profile: "fixture" }, run })).rejects.toThrow(/^macOS distribution outer-sign failed$/u);
  expect(run).toHaveBeenCalledTimes(1);
});

it("retains native stderr diagnosis while redacting injected authentication", async () => {
  const input = await fixture();
  const run = vi.fn(async () => { throw Object.assign(new Error("full command line must not escape"), { stderr: "chain resolution failed: private-password" }); });
  await expect(finalizeMacBaseProjection({ appPath: input.baseAppPath, seal: input.seal, identity: "a".repeat(40),
    entitlements: "/fixture/entitlements.plist", notary: { kind: "apple-id", appleId: "a@example.test", password: "private-password", teamId: "ABCDEFGHIJ" }, run }))
    .rejects.toThrow("outer-sign failed: chain resolution failed: [redacted]");
});
