import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import JSZip from "jszip";
import { standaloneTreeSha256 } from "@open-design/standalone";
import { CLOSURE_DATA_RESOURCES, type ClosureDataResourceId } from "../data-resources.js";
export { CLOSURE_DATA_RESOURCES } from "../data-resources.js";

type FileEntry = Readonly<{ path: string; body: Buffer; sha256: string; size: number }>;
export type ClosureDataResourceArtifact = Readonly<{
  id: ClosureDataResourceId; file: string; path: string; sha256: string;
  size: number; treeSha256: string; entrypoint: "resource.json"; sync: true;
}>;
const sha256 = (body: Buffer) => createHash("sha256").update(body).digest("hex");

async function buildResource(input: Readonly<{
  resource: typeof CLOSURE_DATA_RESOURCES[number]; workspaceRoot: string; outputDirectory: string;
}>): Promise<ClosureDataResourceArtifact> {
  const entries: FileEntry[] = [];
  const claimed = new Set<string>();
  function claim(name: string) {
    if (name.includes("\\") || name.normalize("NFC") !== name || name.split("/").some(part => !part || part === "." || part === ".." || /[\x00-\x1f<>:"|?*]/u.test(part) || /[. ]$/u.test(part))) throw new Error(`unsafe resource path: ${name}`);
    const folded = name.toLowerCase();
    if (claimed.has(folded)) throw new Error(`resource path collision: ${name}`);
    claimed.add(folded);
  }
  function add(name: string, body: Buffer) {
    claim(name); entries.push({ path: name, body, sha256: sha256(body), size: body.byteLength });
  }
  async function visit(source: string, prefix: string) {
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error(`resource symbolic link is forbidden: ${source}`);
    if (info.isDirectory()) {
      if (prefix) claim(prefix);
      for (const name of (await readdir(source)).sort()) await visit(join(source, name), prefix ? `${prefix}/${name}` : name);
    } else if (info.isFile()) add(prefix, await readFile(source));
    else throw new Error(`resource special file is forbidden: ${source}`);
  }
  add("resource.json", Buffer.from(`${JSON.stringify({ schemaVersion: 1, id: input.resource.id })}\n`));
  for (const item of input.resource.inputs) {
    const source = join(input.workspaceRoot, item.source);
    const outputRelative = relative(source, input.outputDirectory);
    if (outputRelative === "" || (!outputRelative.startsWith("../") && outputRelative !== ".." && !outputRelative.startsWith("..\\"))) throw new Error("resource output must not be inside its input");
    await visit(source, item.prefix);
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, entry.body, { createFolders: false, date: new Date("1980-01-01T00:00:00Z"), unixPermissions: 0o100644 });
  const body = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" });
  const digest = sha256(body), file = `${input.resource.id}-${digest}.zip`, path = join(input.outputDirectory, file);
  await mkdir(input.outputDirectory, { recursive: true });
  const temporary = join(input.outputDirectory, `.resource-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, body, { flag: "wx" });
    try { await link(temporary, path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await lstat(path);
      if (!existing.isFile() || existing.isSymbolicLink() || !(await readFile(path)).equals(body)) throw new Error(`immutable resource collision: ${path}`);
    }
  } finally { await rm(temporary, { force: true }); }
  const treeSha256 = standaloneTreeSha256(entries.map(({ path, sha256, size }) => ({ path, sha256, size })));
  return Object.freeze({ id: input.resource.id, file, path, sha256: digest, size: body.byteLength, treeSha256, entrypoint: "resource.json", sync: true });
}

/** Build inputs only; signing, cache selection, preparation and activation remain
 * with their existing authorities. No partial set can become a complete receipt. */
export async function buildClosureDataResource(input: Readonly<{
  id: ClosureDataResourceId; workspaceRoot: string; outputDirectory: string;
}>): Promise<ClosureDataResourceArtifact> {
  const resource = CLOSURE_DATA_RESOURCES.find(resource => resource.id === input.id);
  if (resource == null) throw new Error(`unknown Closure data resource: ${input.id}`);
  return buildResource({ resource, workspaceRoot: resolve(input.workspaceRoot), outputDirectory: resolve(input.outputDirectory) });
}

export async function buildClosureDataResources(input: Readonly<{ workspaceRoot: string; outputDirectory: string }>): Promise<readonly ClosureDataResourceArtifact[]> {
  const results = await Promise.allSettled(CLOSURE_DATA_RESOURCES.map(({ id }) => buildClosureDataResource({ ...input, id })));
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return Object.freeze(results.map(result => {
    if (result.status !== "fulfilled") throw new Error("incomplete data resource build");
    return result.value;
  }));
}
