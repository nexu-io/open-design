import { mkdtemp, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const extractionCalls = vi.hoisted(() => [] as string[][]);
const nativeControl = vi.hoisted(() => ({ code: undefined as string | undefined, onSpawn: undefined as ((child: import("node:child_process").ChildProcess) => void) | undefined }));
vi.mock("node:child_process", async original => {
  const actual = await original<typeof import("node:child_process")>();
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => {
    extractionCalls.push([...(args[1] as string[])]);
    const child = nativeControl.code === undefined ? actual.spawn(...args) : actual.spawn(process.execPath, ["-e", nativeControl.code], args[2]);
    nativeControl.onSpawn?.(child);
    return child;
  } };
});
import { pack, extract, inspect, resolveArchiveBackend } from "../src/build.js";
const roots: string[] = [];
afterEach(async () => { nativeControl.code = undefined; nativeControl.onSpawn = undefined; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "native-archive-")); roots.push(root); const source = join(root, "source"); await mkdir(source); await writeFile(join(source, "valid"), "native", { mode: 0o755 }); return { root, source }; }
it.for([{ kind: "unzip" as const, executable: "unzip" }, { kind: "7z" as const, executable: "7zz" }])("extracts many entries through one $kind process", async (tool, context) => {
  try { await resolveArchiveBackend("extract", { tool }); }
  catch (error) { if (String(error).includes("not found")) return context.skip(); throw error; }
  const { root, source } = await fixture();
  for (const [name, body] of [["z-last", "last"], ["a-first", "first"], ["empty", ""], ["[route]", "route"], ["large", "x".repeat(150_000)]]) {
    await writeFile(join(source, name!), body!);
  }
  const archive = await pack(source, join(root, "batch.zip"));
  extractionCalls.length = 0;
  await extract(archive.file, join(root, "output"), { tool });
  expect(extractionCalls).toHaveLength(1);
  for (const name of await readdir(source)) expect(await readFile(join(root, "output", name))).toEqual(await readFile(join(source, name)));
  // Native adapters need not enumerate a reordered central directory alike.
  // Reordering metadata must never silently assign one entry's bytes to another.
  const bytes = await readFile(archive.file), end = bytes.length - 22;
  const centralOffset = bytes.readUInt32LE(end + 16), centralLength = bytes.readUInt32LE(end + 12);
  const records: Buffer[] = [];
  for (let offset = centralOffset; offset < centralOffset + centralLength;) {
    const length = 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    records.push(Buffer.from(bytes.subarray(offset, offset + length))); offset += length;
  }
  Buffer.concat(records.reverse()).copy(bytes, centralOffset);
  await writeFile(join(root, "reordered.zip"), bytes);
  await extract(join(root, "reordered.zip"), join(root, "reordered"), { tool });
  for (const name of await readdir(source)) expect(await readFile(join(root, "reordered", name))).toEqual(await readFile(join(source, name)));
});
it.each(["short", "excess", "wrong!"])("rejects %s native output without committing a tree", async payload => {
  const { root, source } = await fixture();
  const archive = await pack(source, join(root, "input.zip"));
  nativeControl.code = `process.stdout.write(${JSON.stringify(payload === "excess" ? "native-extra" : payload)})`;
  await expect(extract(archive.file, join(root, "output"))).rejects.toThrow("archive extraction failed");
  await expect(stat(join(root, "output"))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await readdir(root)).filter(name => name.startsWith(".archive-"))).toEqual([]);
});
it("drains an aborted byte producer before removing its staging tree", async () => {
  const { root, source } = await fixture();
  await writeFile(join(source, "valid"), "x".repeat(1_000_000));
  const archive = await pack(source, join(root, "input.zip"));
  const controller = new AbortController();
  let exited = false;
  nativeControl.code = 'process.stdout.write("x".repeat(500_000)); setInterval(()=>{},1000)';
  nativeControl.onSpawn = child => {
    child.stdout!.once("data", () => controller.abort());
    child.once("close", () => { exited = true; });
  };
  await expect(extract(archive.file, join(root, "output"), { signal: controller.signal })).rejects.toThrow();
  expect(exited).toBe(true);
  expect((await readdir(root)).filter(name => name.startsWith(".archive-"))).toEqual([]);
  await expect(stat(join(root, "output"))).rejects.toMatchObject({ code: "ENOENT" });
});
it("keeps reproducible ZIP bytes independent of snapshot creation and access times", async () => {
  const { root, source } = await fixture();
  for (const name of ["_official", "registry"]) {
    await mkdir(join(source, name));
    await writeFile(join(source, name, "content.txt"), name);
  }
  const first = await pack(source, join(root, "first.zip"), { reproducible: true, permissions: "portable" });
  await new Promise(done => setTimeout(done, 1100));
  const second = await pack(source, join(root, "second.zip"), { reproducible: true, permissions: "portable" });
  expect(second.backend).toEqual(first.backend);
  expect(second.sha256).toBe(first.sha256);
  expect(await inspect(second.file)).toEqual(await inspect(first.file));
});
it("fails explicit configuration without falling back to PATH", async () => {
  await expect(resolveArchiveBackend("pack", { tool: { kind: "zip", executable: "/missing/archive-tool" } })).rejects.toThrow("not found");
});
it.skipIf(process.platform === "win32")("round-trips native ZIP bytes, modes and internal links", async () => {
  const { root, source } = await fixture(); await symlink("valid", join(source, "link"));
  await mkdir(join(source, "[id]"));
  await writeFile(join(source, "[id]", "page.js"), "route");
  const archive = await pack(source, join(root, "base.zip"), { tool: { kind: "zip", executable: "zip" }, allowInternalLinks: true });
  await expect(inspect(archive.file)).rejects.toThrow("policy");
  const options = { tool: { kind: "unzip" as const, executable: "unzip" }, allowInternalLinks: true };
  await extract(archive.file, join(root, "restored"), options);
  expect(await readFile(join(root, "restored/link"), "utf8")).toBe("native");
  expect(await readFile(join(root, "restored/[id]/page.js"), "utf8")).toBe("route");
  expect(await readlink(join(root, "restored/link"))).toBe("valid");
  expect((await stat(join(root, "restored/valid"))).mode & 0o777).toBe(0o755);
  await extract(archive.file, join(root, "portable"), { ...options, permissions: "portable" });
  expect((await stat(join(root, "portable/valid"))).mode & 0o777).toBe(0o644);
  const preferred = await resolveArchiveBackend("extract");
  if (preferred.kind === "7z") {
    await extract(archive.file, join(root, "sevenzip"), { tool: preferred, allowInternalLinks: true });
    expect(await readlink(join(root, "sevenzip/link"))).toBe("valid");
    expect(await readFile(join(root, "sevenzip/[id]/page.js"), "utf8")).toBe("route");
  }
  await expect(extract(archive.file, join(root, "restored"), options)).rejects.toThrow("already exists");
});
it.skipIf(process.platform === "win32")("rejects traversal metadata before native extraction", async () => {
  const { root, source } = await fixture();
  const archive = await pack(source, join(root, "base.zip"), { tool: { kind: "zip", executable: "zip" } });
  const bytes = await readFile(archive.file);
  for (let offset = bytes.indexOf("valid"); offset !== -1; offset = bytes.indexOf("valid", offset + 5)) bytes.write("../xx", offset);
  await writeFile(archive.file, bytes);
  await expect(extract(archive.file, join(root, "restored"), { tool: { kind: "unzip", executable: "unzip" } })).rejects.toThrow("path");
  await expect(stat(join(root, "restored"))).rejects.toThrow("ENOENT");
});

it.skipIf(process.platform === "win32")("drains the native reader before cleaning a failed extraction", async () => {
  const { root, source } = await fixture();
  await Promise.all(Array.from({ length: 16 }, (_, index) => writeFile(join(source, `file-${index}`), `payload-${index}`)));
  const archive = await pack(source, join(root, "base.zip"), { tool: { kind: "zip", executable: "zip" } });
  const options = { tool: { kind: "unzip" as const, executable: "unzip" } };
  await extract(archive.file, join(root, "good"), options);
  expect(await readFile(join(root, "good/file-15"), "utf8")).toBe("payload-15");
  const bytes = await readFile(archive.file), central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expect(central).toBeGreaterThan(0);
  bytes.writeUInt32LE((bytes.readUInt32LE(central + 16) ^ 1) >>> 0, central + 16);
  const local = bytes.readUInt32LE(central + 42);
  bytes.writeUInt32LE(bytes.readUInt32LE(central + 16), local + 14);
  await writeFile(archive.file, bytes);
  await expect(extract(archive.file, join(root, "bad"), options)).rejects.toThrow("archive extraction failed");
  await expect(stat(join(root, "bad"))).rejects.toThrow("ENOENT");
  expect((await readdir(root)).filter(name => name.startsWith(".archive-"))).toEqual([]);
});
