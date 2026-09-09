import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extract } from "@open-design/archive";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import type { ElectronSceneReceipt } from "./contracts.js";

const carrierFiles = ["main.cjs", "renderer-mount-preload.cjs", "carrier.json"] as const;
export type ElectronDistributionBase = Readonly<{ root: string; manifestSha256: string }>;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function fileHash(path: string) {
  if (!(await lstat(path)).isFile()) throw new Error("Electron base payload must be a regular file");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function contained(root: string, path: string) {
  const name = relative(root, path);
  return !isAbsolute(name) && name !== ".." && !name.startsWith("../");
}
/** pnpm side-effects cache can dereference postinstall-created framework links.
 * Such a tree may launch but is not a valid input to macOS bundle signing. */
async function verifyMacFrameworkLinks(runtime: string) {
  const framework = join(runtime, "Electron.app/Contents/Frameworks/Electron Framework.framework");
  for (const [path, expected] of [["Versions/Current", "A"], ["Electron Framework", "Versions/Current/Electron Framework"],
    ["Resources", "Versions/Current/Resources"]] as const) {
    const file = join(framework, path);
    if (!(await lstat(file)).isSymbolicLink() || await readlink(file) !== expected) {
      throw new Error("Electron framework links are invalid; use the verified official Electron archive");
    }
  }
}
/** Fingerprint native runtime files, permissions and internal framework links
 * without dereferencing links or multiplying large framework payloads. */
async function inventory(root: string) {
  const entries: { path: string; mode: number; sha256?: string; link?: string; directory?: true }[] = [];
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), info = await lstat(path), entry = { path: relative(root, path).replaceAll("\\", "/"), mode: info.mode & 0o777 };
      if (info.isDirectory()) { entries.push({ ...entry, directory: true }); await walk(path); }
      else if (info.isFile()) entries.push({ ...entry, sha256: await fileHash(path) });
      else if (info.isSymbolicLink()) {
        const link = await readlink(path);
        if (isAbsolute(link) || !contained(root, resolve(dirname(path), link))) throw new Error("Electron base runtime link escapes its root");
        entries.push({ ...entry, link });
      } else throw new Error("Electron base contains a special file");
    }
  }
  if (!(await lstat(root)).isDirectory()) throw new Error("Electron base runtime must be a directory");
  await walk(root);
  if (!entries.length) throw new Error("Electron base runtime is empty");
  return entries;
}

/** Neutral input assembly only. Tools own cache identity, transport and reuse;
 * no product manifest, Capsule, release metadata or signing enters this base. */
export async function assembleElectronDistributionBase(input: Readonly<{
  scene: Pick<ElectronSceneReceipt, "sceneRoot">; runtimeDirectory: string; electronVersion: string; target: string; outputRoot: string;
}>): Promise<ElectronDistributionBase> {
  const root = resolve(input.outputRoot), runtime = resolve(input.runtimeDirectory);
  if (contained(root, runtime) || contained(runtime, root) || contained(root, resolve(input.scene.sceneRoot))) throw new Error("Electron base input and output overlap");
  if (input.target.startsWith("darwin-")) await verifyMacFrameworkLinks(runtime);
  const runtimeEntries = await inventory(runtime);
  await mkdir(root); // Fresh destination only; never replace caller-owned bytes.
  await cp(runtime, join(root, "runtime"), { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true });
  await mkdir(join(root, "carrier"));
  for (const name of carrierFiles) await copyFile(join(input.scene.sceneRoot, name), join(root, "carrier", name));
  if (JSON.stringify(await inventory(join(root, "runtime"))) !== JSON.stringify(runtimeEntries)) throw new Error("Electron base runtime changed during assembly");
  const manifest = { schemaVersion: 1, operation: "electron.base.build", target: input.target,
    electronVersion: input.electronVersion, runtime: runtimeEntries,
    carrier: await Promise.all(carrierFiles.map(async name => ({ name, sha256: await fileHash(join(root, "carrier", name)) }))) };
  const bytes = JSON.stringify(manifest);
  await writeFile(join(root, "base.json"), bytes, { flag: "wx" });
  return { root, manifestSha256: digest(bytes) };
}

export async function verifyElectronDistributionBase(base: ElectronDistributionBase, input: Readonly<{
  scene: Pick<ElectronSceneReceipt, "sceneRoot">; electronVersion: string; target: string;
}>) {
  const root = resolve(base.root), bytes = await readFile(join(root, "base.json"));
  if (!/^[a-f0-9]{64}$/u.test(base.manifestSha256) || digest(bytes) !== base.manifestSha256) throw new Error("Electron base manifest binding mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.schemaVersion !== 1 || manifest.operation !== "electron.base.build"
    || manifest.target !== input.target || manifest.electronVersion !== input.electronVersion) throw new Error("Electron base target or runtime version mismatch");
  if (JSON.stringify(await inventory(join(root, "runtime"))) !== JSON.stringify(manifest.runtime)) throw new Error("Electron base runtime integrity mismatch");
  if (input.target.startsWith("darwin-")) await verifyMacFrameworkLinks(join(root, "runtime"));
  const carrier = await Promise.all(carrierFiles.map(async name => {
    const sha256 = await fileHash(join(root, "carrier", name));
    if (sha256 !== await fileHash(join(input.scene.sceneRoot, name))) throw new Error("Electron base carrier differs from scene");
    return { name, sha256 };
  }));
  if (JSON.stringify(carrier) !== JSON.stringify(manifest.carrier)) throw new Error("Electron base carrier integrity mismatch");
  return { runtimeDirectory: join(root, "runtime"), carrierDirectory: join(root, "carrier") };
}

export async function resolveElectronDistributionArchive(target: string) {
  if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)) throw new Error("unsupported Electron archive target");
  const packagePath = createRequire(import.meta.url).resolve("electron/package.json");
  const { version } = JSON.parse(await readFile(packagePath, "utf8"));
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("invalid pinned Electron version");
  const fileName = `electron-v${version}-${target}.zip`;
  const checksums = JSON.parse(await readFile(join(dirname(packagePath), "checksums.json"), "utf8"));
  const sha256 = checksums[fileName];
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(sha256)) throw new Error("Electron archive lacks a pinned checksum");
  return { version, fileName, sha256, url: `https://github.com/electron/electron/releases/download/v${version}/${fileName}` };
}

export async function buildElectronDistributionBase(input: Readonly<{ sceneDirectory: string; sceneManifestSha256: string; archivePath: string; outputRoot: string }>) {
  if (process.platform !== "darwin" && process.platform !== "win32") throw new Error("unsupported Electron base platform");
  const scene = { sceneRoot: resolve(input.sceneDirectory) };
  const bytes = await readFile(join(scene.sceneRoot, "scene.json"));
  if (!/^[a-f0-9]{64}$/u.test(input.sceneManifestSha256) || digest(bytes) !== input.sceneManifestSha256) throw new Error("Electron base scene binding mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.schemaVersion !== 1 || manifest.operation !== "electron.scene.build"
    || manifest.target !== `${process.platform}-${process.arch}` || !Array.isArray(manifest.products)) throw new Error("Electron base scene is invalid");
  // The base consumes carrier products only, not the scene's independent
  // Capsule/Closure payloads. Verify the selected projection against its source.
  for (const name of carrierFiles) {
    const entries = manifest.products.filter((entry: { name?: string }) => entry?.name === name);
    const path = join(scene.sceneRoot, name);
    if (entries.length !== 1 || entries[0].sha256 !== await fileHash(path)
      || entries[0].size !== (await lstat(path)).size) throw new Error("Electron base scene carrier binding mismatch");
  }
  const source = await resolveElectronDistributionArchive(manifest.target);
  const scratch = await mkdtemp(join(tmpdir(), "electron-official-runtime-"));
  try {
    const archive = join(scratch, "runtime.zip");
    await copyFile(input.archivePath, archive);
    if (await fileHash(archive) !== source.sha256) throw new Error("Official Electron archive checksum mismatch");
    const runtimeDirectory = join(scratch, "runtime");
    await extract(archive, runtimeDirectory, { allowInternalLinks: true });
    const base = await assembleElectronDistributionBase({ scene, runtimeDirectory,
      electronVersion: source.version, target: manifest.target, outputRoot: input.outputRoot });
    for (const name of carrierFiles) {
      if (await fileHash(join(base.root, "carrier", name)) !== manifest.products.find((entry: { name?: string }) => entry?.name === name).sha256) {
        throw new Error("Electron base carrier changed during assembly");
      }
    }
    return base;
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
