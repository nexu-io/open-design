import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPackageWithOptions } from "@electron/asar";
import { afterEach, expect, it } from "vitest";
import { readElectronInstalledManifest } from "@/update/installation/inspection.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true }))); });
const manifest = { schemaVersion: 2, appId: "org.example.electron", productName: "Example", publisher: "Example",
  executableName: "example", namespace: "example", protocol: "example", version: "1.2.3-betahyx.4", channel: "betahyx",
  shell: { type: "electron", version: "1.2.3", buildHash: "a".repeat(64), digest: "b".repeat(64) } };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-inspection-test-")); roots.push(root);
  const source = join(root, "source"), resources = join(root, "resources"), archive = join(resources, "app.asar");
  await mkdir(source); await mkdir(resources);
  const pack = async (value: unknown = manifest, unpack?: string) => {
    await writeFile(join(source, "shell.json"), JSON.stringify(value));
    await createPackageWithOptions(source, archive, { unpack });
  };
  await pack();
  return { root, source, resources, archive, pack };
}

it("reads and hashes actual physical bytes without changing the installation", async () => {
  const f = await fixture(), bytes = await readFile(f.archive);
  const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
  expect(await readElectronInstalledManifest(f.resources)).toEqual({ manifest,
    manifestSha256: hash(JSON.stringify(manifest)), archive: { file: "app.asar", sha256: hash(bytes), size: bytes.length } });
  expect(await readFile(f.archive)).toEqual(bytes);
  expect(await readdir(f.resources)).toEqual(["app.asar"]);
});

it("observes archive replacement instead of reusing an ASAR header cache", async () => {
  const f = await fixture(), first = await readElectronInstalledManifest(f.resources);
  const replacement = { ...manifest, productName: "Replacement with a different header size" };
  await f.pack(replacement);
  const second = await readElectronInstalledManifest(f.resources);
  expect(second.manifest).toEqual(replacement);
  expect(second.archive.sha256).not.toBe(first.archive.sha256);
});

it("rejects unpacked or linked manifests rather than reading an external file", async () => {
  const f = await fixture();
  await f.pack(manifest, "shell.json");
  await expect(readElectronInstalledManifest(f.resources)).rejects.toThrow("packed regular file");
  await rm(join(f.source, "shell.json"));
  await writeFile(join(f.source, "other.json"), JSON.stringify(manifest));
  await symlink("other.json", join(f.source, "shell.json"));
  await createPackageWithOptions(f.source, f.archive, {});
  await expect(readElectronInstalledManifest(f.resources)).rejects.toThrow("packed regular file");
});

it("rejects indirect archive and resource roots", async () => {
  const f = await fixture();
  const other = await fixture();
  await rm(f.archive); await symlink(other.archive, f.archive);
  await expect(readElectronInstalledManifest(f.resources)).rejects.toThrow();
  const alias = join(f.root, "alias"); await symlink(other.resources, alias);
  await expect(readElectronInstalledManifest(alias)).rejects.toThrow("resource root");
  await expect(readElectronInstalledManifest("relative/resources")).rejects.toThrow("resource root");
});

it("rejects missing, corrupt, and invalid physical manifests", async () => {
  const f = await fixture();
  await f.pack({ ...manifest, schemaVersion: 1 });
  await expect(readElectronInstalledManifest(f.resources)).rejects.toThrow("schema");
  await rm(join(f.source, "shell.json"));
  await createPackageWithOptions(f.source, f.archive, {});
  await expect(readElectronInstalledManifest(f.resources)).rejects.toThrow();
  await writeFile(f.archive, "not an archive");
  await expect(readElectronInstalledManifest(f.resources)).rejects.toThrow();
});
