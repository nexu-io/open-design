import { mkdtemp, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { pack, extract, inspect, resolveArchiveBackend } from "../src/build.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "native-archive-")); roots.push(root); const source = join(root, "source"); await mkdir(source); await writeFile(join(source, "valid"), "native", { mode: 0o755 }); return { root, source }; }
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

it.skipIf(process.platform === "win32")("drains concurrent native readers before cleaning a failed extraction", async () => {
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
