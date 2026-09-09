import { mkdtemp, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { pack, extract, inspect, resolveArchiveBackend } from "../src/build.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "native-archive-")); roots.push(root); const source = join(root, "source"); await mkdir(source); await writeFile(join(source, "valid"), "native", { mode: 0o755 }); return { root, source }; }
it("fails explicit configuration without falling back to PATH", async () => {
  await expect(resolveArchiveBackend("pack", { tool: { kind: "zip", executable: "/missing/archive-tool" } })).rejects.toThrow("not found");
});
it.skipIf(process.platform === "win32")("round-trips native ZIP bytes, modes and internal links", async () => {
  const { root, source } = await fixture(); await symlink("valid", join(source, "link"));
  const archive = await pack(source, join(root, "base.zip"), { tool: { kind: "zip", executable: "zip" }, allowInternalLinks: true });
  await expect(inspect(archive.file)).rejects.toThrow("policy");
  const options = { tool: { kind: "unzip" as const, executable: "unzip" }, allowInternalLinks: true };
  await extract(archive.file, join(root, "restored"), options);
  expect(await readFile(join(root, "restored/link"), "utf8")).toBe("native");
  expect(await readlink(join(root, "restored/link"))).toBe("valid");
  expect((await stat(join(root, "restored/valid"))).mode & 0o777).toBe(0o755);
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
