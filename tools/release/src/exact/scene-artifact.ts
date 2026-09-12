import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { create, extract, list } from "tar";
import { openArtifactProduct, writeArtifactEntry } from "./artifact-acquisition.ts";
import { readObject } from "./control-common.ts";

const releaseFields = new Set(["artifactBaseUrl", "channel", "publishedAt", "releaseVersion", "signatures"]);
function releaseOwnedFields(value: unknown, path = "$", violations: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((child, index) => releaseOwnedFields(child, `${path}[${index}]`, violations));
  else if (value != null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const field = `${path}.${key}`;
      if (releaseFields.has(key)) violations.push(field);
      releaseOwnedFields(child, field, violations);
    }
  }
  return violations;
}

/** Validate the business artifact without accepting workload/cache authority. */
export async function verifySceneArtifact(sceneDirectory: string, target: string) {
  const scene = await readObject(join(sceneDirectory, "scene.json"));
  if (scene.target !== target || typeof scene.shellBuildHash !== "string" || !/^[a-f0-9]{64}$/u.test(scene.shellBuildHash)) {
    throw new Error("Shell scene identity mismatch");
  }
  const violations = releaseOwnedFields(scene).sort();
  if (violations.length) throw new Error(`Shell scene contains release-owned fields: ${violations.join(", ")}`);
  return { sceneDirectory: resolve(sceneDirectory), target, shellBuildHash: scene.shellBuildHash };
}

export async function importSceneArtifact(input: Readonly<{ descriptor: string; transport: string; output: string }>) {
  const descriptor = await readObject(input.descriptor);
  await using product = await openArtifactProduct({ url: descriptor.url, sha256: descriptor.sha256 });
  const { archive, acquisition } = product;
  if (archive.entries.length !== 1 || archive.entries[0]?.path !== "scene.tar") throw new Error("scene artifact must contain only scene.tar");
  const transport = resolve(input.transport);
  await mkdir(dirname(transport), { recursive: true });
  await writeArtifactEntry(archive, "scene.tar", transport);
  return { ...await unpackSceneArtifact(transport, input.output), acquisition };
}

// A CI transport envelope, not a new product component or release authority.
// In particular, scene consumers must still verify their own scene manifest.
function safeName(name: string): void {
  if (!name || /[\\:\0]/u.test(name) || name.startsWith("/")
    || name.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe scene artifact path: ${name}`);
  }
}

async function absent(path: string): Promise<void> {
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error(`scene artifact destination already exists: ${path}`);
}

async function digest(file: string) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest("hex"), size };
}

async function files(root: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    safeName(path);
    const stat = await lstat(join(root, path));
    if (!stat.isFile() && !stat.isDirectory()) throw new Error(`scene artifact forbids links and special files: ${path}`);
    if (stat.mode & 0o7000) throw new Error(`scene artifact forbids special permissions: ${path}`);
    result.push(path);
    if (stat.isDirectory()) result.push(...await files(root, path));
  }
  return result;
}

export async function packSceneArtifact(sceneDirectory: string, archiveFile: string) {
  const root = await realpath(sceneDirectory);
  if (!(await lstat(sceneDirectory)).isDirectory()) throw new Error("scene source must be a real directory");
  const archive = resolve(archiveFile);
  await mkdir(dirname(archive), { recursive: true });
  const parent = await realpath(dirname(archive));
  const rel = relative(root, parent);
  if (rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))) {
    throw new Error("scene archive must be outside its source directory");
  }
  await absent(archive);
  const entries = await files(root);
  if (!entries.includes("scene.json")) throw new Error("scene artifact requires scene.json");
  // portable:true normalizes file modes, including read-only inputs: do not use it.
  await pipeline(create({ cwd: root, noDirRecurse: true, noMtime: true, strict: true,
    onWriteEntry(entry) {
      entry.myuser = "";
      if (entry.stat != null) {
        entry.stat.uid = 0; entry.stat.gid = 0;
        entry.stat.atime = new Date(0); entry.stat.ctime = new Date(0);
        entry.stat.dev = 0; entry.stat.ino = 0; entry.stat.nlink = 1;
      }
    },
  }, entries), createWriteStream(archive, { flags: "wx" }));
  return { sceneDirectory: root, archiveFile: archive, ...await digest(archive) };
}

export async function unpackSceneArtifact(archiveFile: string, sceneDirectory: string) {
  const destination = resolve(sceneDirectory);
  await absent(destination);
  await mkdir(dirname(destination), { recursive: true });
  const scratch = await mkdtemp(join(dirname(destination), ".scene-transport-"));
  try {
    // Parse and extract the same private bytes, never a mutable caller-owned archive.
    const archive = join(scratch, "scene.tar");
    await copyFile(archiveFile, archive);
    const paths = new Set<string>();
    let total = 0;
    let invalid: unknown;
    await list({ file: archive, strict: true, onReadEntry(entry) {
      try {
      const path = entry.path.replace(/\/$/u, "");
      safeName(path);
      if (entry.type !== "File" && entry.type !== "Directory") throw new Error(`scene artifact forbids entry type: ${entry.type}`);
      const key = path.normalize("NFC").toLowerCase();
      if (paths.has(key)) throw new Error(`duplicate scene artifact path: ${path}`);
      paths.add(key);
      if ((entry.mode ?? 0) & 0o7000) throw new Error(`scene artifact forbids special permissions: ${path}`);
      total += entry.size;
      if (paths.size > 100_000 || entry.size > 8 * 1024 ** 3 || total > 32 * 1024 ** 3) throw new Error("scene artifact exceeds transport bounds");
      } catch (error) { invalid ??= error; }
    } });
    if (invalid != null) throw invalid;
    const output = join(scratch, "scene");
    await mkdir(output);
    await extract({ file: archive, cwd: output, strict: true, chmod: true, processUmask: 0o022, preserveOwner: false });
    if (!(await lstat(join(output, "scene.json"))).isFile()) throw new Error("scene artifact requires scene.json");
    const receipt = { archiveFile: resolve(archiveFile), sceneDirectory: destination, ...await digest(archive) };
    await absent(destination);
    await rename(output, destination);
    return receipt;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
