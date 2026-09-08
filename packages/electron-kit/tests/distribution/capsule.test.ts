import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { buildElectronCapsuleContent } from "@/distribution/capsule.js";
import { assertElectronCapsuleCompatibility, assertElectronCapsuleReleaseManifest, composeElectronCapsuleManifest, resolveElectronCompositeShellIdentity, validateElectronCapsuleContent, validateElectronCapsuleManifest, validateElectronCapsuleRelease } from "@/contracts/capsule.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-capsule-")); roots.push(root);
  const entryPath = join(root, "entry.ts");
  await writeFile(entryPath, 'export const createElectronCapsuleDefinition = () => ({ title: "first" });');
  return { root, entryPath, outputRoot: join(root, "first"), target: "darwin-arm64" as const };
}
describe("independent Capsule build", () => {
  it("derives composite capability from authenticated Capsule and physical carrier without rewriting either", () => {
    const carrier = { target: "darwin-arm64" as const, shell: { type: "electron", version: "1.0.0", buildHash: "a".repeat(64), digest: "b".repeat(64) } };
    const manifest = composeElectronCapsuleManifest({ content: {
      schemaVersion: 1, protocol: "electron-capsule-v5", target: carrier.target, entrypoint: "capsule.cjs",
      archive: { sha256: "c".repeat(64), size: 100, treeSha256: "d".repeat(64) },
    }, version: "2.0.0", minimumCarrierVersion: "1.0.0", providedShellVersion: "3.0.0" });
    const before = JSON.stringify({ carrier, manifest });
    const shell = resolveElectronCompositeShellIdentity(manifest, carrier);
    expect(shell).toMatchObject({ type: "electron", version: "3.0.0", buildHash: expect.stringMatching(/^[a-f0-9]{64}$/), digest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(shell.buildHash).not.toBe(carrier.shell.buildHash);
    expect(shell.digest).not.toBe(carrier.shell.digest);
    expect(Object.isFrozen(shell)).toBe(true);
    expect(JSON.stringify({ carrier, manifest })).toBe(before);
    const renamed = resolveElectronCompositeShellIdentity({ ...manifest, version: "2.0.1", provides: { shellVersion: "3.0.1" } }, carrier);
    expect(renamed.buildHash).toBe(shell.buildHash);
    expect(renamed.digest).not.toBe(shell.digest);
    expect(resolveElectronCompositeShellIdentity({ ...manifest, archive: { ...manifest.archive, sha256: "e".repeat(64) } }, carrier).buildHash).not.toBe(shell.buildHash);
    expect(resolveElectronCompositeShellIdentity(manifest, { ...carrier, shell: { ...carrier.shell, buildHash: "e".repeat(64) } }).buildHash).not.toBe(shell.buildHash);
    expect(() => resolveElectronCompositeShellIdentity(manifest, { ...carrier, shell: { ...carrier.shell, version: "0.9.0" } })).toThrow("carrier");
    expect(() => resolveElectronCompositeShellIdentity(manifest, { ...carrier, target: "win32-x64" })).toThrow("carrier");
    expect(() => resolveElectronCompositeShellIdentity(manifest, { ...carrier, shell: { ...carrier.shell, type: "terminal" } })).toThrow("Electron");
  });
  it("binds signed release references to one target manifest without duplicating its compatibility", () => {
    const release = validateElectronCapsuleRelease({ schemaVersion: 1,
      manifest: { url: "https://release.invalid/capsule.json", sha256: "a".repeat(64), size: 500 },
      archive: { url: "https://release.invalid/capsule.zip", sha256: "b".repeat(64), size: 100 },
    });
    const manifest = composeElectronCapsuleManifest({ content: {
      schemaVersion: 1, protocol: "electron-capsule-v5", target: "darwin-arm64", entrypoint: "capsule.cjs",
      archive: { sha256: release.archive.sha256, size: release.archive.size, treeSha256: "c".repeat(64) },
    }, version: "2.0.0", minimumCarrierVersion: "1.0.0", providedShellVersion: "3.0.0" });
    expect(assertElectronCapsuleReleaseManifest(release, manifest, "darwin-arm64")).toEqual(manifest);
    expect(release).not.toHaveProperty("provides");
    expect(() => assertElectronCapsuleReleaseManifest(release, manifest, "win32-x64")).toThrow("binding");
    expect(() => assertElectronCapsuleReleaseManifest(release, { ...manifest, archive: { ...manifest.archive, size: 101 } }, "darwin-arm64")).toThrow("binding");
    expect(() => assertElectronCapsuleReleaseManifest(release, { ...manifest, archive: { ...manifest.archive, sha256: "d".repeat(64) } }, "darwin-arm64")).toThrow("binding");
    for (const invalid of [{ ...release, schemaVersion: 2 }, { ...release, latest: "https://release.invalid/latest" },
      ...["file:///capsule.zip", "https://user:password@release.invalid/capsule.zip", "https://release.invalid/capsule.zip#fragment"].map(url => ({ ...release, archive: { ...release.archive, url } })),
      { ...release, manifest: { ...release.manifest, sha256: "wrong" } }, { ...release, archive: { ...release.archive, size: 0 } }]) {
      expect(() => validateElectronCapsuleRelease(invalid)).toThrow();
    }
  });
  it("binds deterministic module bytes and tree separately from compatibility metadata", async () => {
    const input = await fixture(), first = await buildElectronCapsuleContent(input);
    const second = await buildElectronCapsuleContent({ ...input, outputRoot: join(input.root, "second") });
    expect(second.content).toEqual(first.content);
    expect(await readFile(second.contentPath)).toEqual(await readFile(first.contentPath));
    const bytes = await readFile(first.archivePath), zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(["capsule.cjs"]);
    const module = await zip.file("capsule.cjs")!.async("nodebuffer");
    expect(first.content.archive).toEqual({ sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength,
      treeSha256: standaloneTreeSha256([{ path: "capsule.cjs", sha256: createHash("sha256").update(module).digest("hex"), size: module.byteLength }]) });
    await writeFile(input.entryPath, 'export const createElectronCapsuleDefinition = () => ({ title: "changed" });');
    const changed = await buildElectronCapsuleContent({ ...input, outputRoot: join(input.root, "changed") });
    expect(changed.content.archive.sha256).not.toBe(first.content.archive.sha256);
    await expect(buildElectronCapsuleContent(input)).rejects.toThrow();
    expect(await readFile(first.archivePath)).toEqual(bytes);
  });
  it("composes version-only releases from retained content without source or compilation", async () => {
    const input = await fixture(), built = await buildElectronCapsuleContent(input);
    const bytes = await readFile(built.archivePath);
    const content = validateElectronCapsuleContent(JSON.parse(await readFile(built.contentPath, "utf8")));
    await rm(input.entryPath);
    const first = composeElectronCapsuleManifest({ content, version: "1.0.0", minimumCarrierVersion: "1.0.0", providedShellVersion: "2.0.0" });
    const second = composeElectronCapsuleManifest({ content, version: "1.0.1", minimumCarrierVersion: "1.1.0", providedShellVersion: "2.1.0" });
    expect(second.archive).toEqual(first.archive);
    expect(second).toMatchObject({ version: "1.0.1", requires: { carrierVersion: "1.1.0" }, provides: { shellVersion: "2.1.0" } });
    expect(content).not.toHaveProperty("version");
    expect(content).not.toHaveProperty("requires");
    expect(await readFile(built.archivePath)).toEqual(bytes);
    expect(() => validateElectronCapsuleContent({ ...content, version: "1.0.0" })).toThrow("fields");
    for (const invalid of [{ ...content, target: { toString: () => "darwin-arm64" } },
      { ...content, archive: { ...content.archive, treeSha256: "bad" } },
      { ...content, requires: { carrierVersion: "1.0.0" } }]) {
      expect(() => validateElectronCapsuleContent(invalid)).toThrow();
    }
    expect(() => composeElectronCapsuleManifest({ content, version: "bad", minimumCarrierVersion: "1.0.0", providedShellVersion: "2.0.0" })).toThrow();
  });
  it("rejects unsupported protocols, platform targets, fields and carrier floors", async () => {
    const input = await fixture(), { content } = await buildElectronCapsuleContent(input);
    const manifest = composeElectronCapsuleManifest({ content, version: "1.0.0", minimumCarrierVersion: "1.0.0", providedShellVersion: "2.0.0" });
    for (const invalid of [{ ...manifest, target: "linux-x64" }, { ...manifest, entrypoint: "../main.cjs" },
      { ...manifest, schemaVersion: 2 }, { ...manifest, latest: "anything" }, { ...manifest, archive: { ...manifest.archive, size: -1 } }]) {
      expect(() => validateElectronCapsuleManifest(invalid)).toThrow();
    }
    expect(() => assertElectronCapsuleCompatibility(manifest, { target: "darwin-arm64", version: "1.0.0" })).not.toThrow();
    expect(() => assertElectronCapsuleCompatibility(manifest, { target: "win32-x64", version: "1.0.0" })).toThrow();
    expect(() => assertElectronCapsuleCompatibility(manifest, { target: "darwin-arm64", version: "0.9.0" })).toThrow();
  });
});
