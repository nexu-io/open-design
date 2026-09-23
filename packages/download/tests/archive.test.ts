import { lstatSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { archiveExecutable, createTarArchive, extractArchive, listArchive, readTarEntry } from "../src/archive.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("uses injected native tools and avoids Windows Git Bash tar", () => {
  expect(archiveExecutable("win32", { SystemRoot: "C:\\Windows" })).toBe("C:\\Windows\\System32\\tar.exe");
  expect(archiveExecutable("win32", { OD_ARCHIVE_TAR: "custom-tar" })).toBe("custom-tar");
  expect(() => archiveExecutable("win32", {})).toThrow("SystemRoot");
});

it("round-trips a native tar archive without workspace or platform policy", () => {
  const root = mkdtempSync(join(tmpdir(), "archive-test-")); roots.push(root);
  const source = join(root, "source"), destination = join(root, "destination"), archive = join(root, "blob.tar.gz");
  mkdirSync(source); mkdirSync(destination); writeFileSync(join(source, "entry.js"), "export {};\n");
  createTarArchive(archive, [{ directory: source, entries: ["entry.js"] }]);
  expect(listArchive(archive, "tar.gz")).toEqual(["entry.js"]);
  expect(readTarEntry(archive, "entry.js")).toBe("export {};\n");
  extractArchive(archive, destination, "tar.gz");
  expect(readFileSync(join(destination, "entry.js"), "utf8")).toBe("export {};\n");
  expect(() => readTarEntry(archive, "../escape")).toThrow("unsafe archive entry");
});

it("reproduces identical archive bytes despite source mtimes and creation order", () => {
  const root = mkdtempSync(join(tmpdir(), "archive-reproducible-")); roots.push(root);
  const archives: Buffer[] = [];
  for (const index of [0, 1]) {
    const source = join(root, String(index)); mkdirSync(source);
    mkdirSync(join(source, "nested"));
    for (const name of index ? ["z.js", "a #=.js"] : ["a #=.js", "z.js"]) {
      const path = join(source, "nested", name);
      writeFileSync(path, name);
      utimesSync(path, index + 100, index + 100);
    }
    const archive = join(root, `${index}.tar.gz`);
    createTarArchive(archive, [{ directory: source, entries: ["nested"] }], { reproducible: true });
    expect(readTarEntry(archive, "nested/a #=.js")).toBe("a #=.js");
    archives.push(readFileSync(archive));
  }
  expect(archives[0]).toEqual(archives[1]);
});

it("keeps distinct file contents independent in reproducible archives", () => {
  const root = mkdtempSync(join(tmpdir(), "archive-independent-files-")); roots.push(root);
  const source = join(root, "source"), destination = join(root, "destination"), archive = join(root, "blob.tar.gz");
  mkdirSync(source); mkdirSync(destination);
  writeFileSync(join(source, "small.js"), "export const value = 'small';\n");
  writeFileSync(join(source, "large.js"), `export const value = '${"large".repeat(8_000)}';\n`);
  createTarArchive(archive, [{ directory: source, entries: ["small.js", "large.js"] }], { reproducible: true });
  extractArchive(archive, destination, "tar.gz");
  expect(readFileSync(join(destination, "small.js"), "utf8")).toBe("export const value = 'small';\n");
  expect(readFileSync(join(destination, "large.js"), "utf8")).toBe(`export const value = '${"large".repeat(8_000)}';\n`);
});

it.skipIf(process.platform === "win32")("preserves declared safe links without inheriting outside targets", () => {
  const root = mkdtempSync(join(tmpdir(), "archive-links-")); roots.push(root);
  const source = join(root, "source"), destination = join(root, "destination"), archive = join(root, "blob.tar.gz");
  mkdirSync(source); mkdirSync(destination); writeFileSync(join(source, "target"), "value");
  symlinkSync("target", join(source, "alias"));
  createTarArchive(archive, [{ directory: source, entries: ["alias", "target"] }], { dereference: false, reproducible: true });
  extractArchive(archive, destination, "tar.gz");
  expect(lstatSync(join(destination, "alias")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(destination, "alias"))).toBe("target");
  expect(readFileSync(join(destination, "alias"), "utf8")).toBe("value");
});
