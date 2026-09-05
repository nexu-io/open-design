import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveProjectRelativeFile } from "../../src/main/open-path.js";

describe("resolveProjectRelativeFile", () => {
  let tempDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "od-reveal-test-"));
    projectRoot = join(tempDir, "project");
    await mkdir(projectRoot, { recursive: true });
    await mkdir(join(projectRoot, "src", "nested"), { recursive: true });
    await writeFile(join(projectRoot, "index.html"), "<!doctype html>");
    await writeFile(join(projectRoot, "src", "nested", "file.ts"), "export const x = 1;");
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  it("resolves a valid root-level file to its canonical absolute path", async () => {
    const canonicalRoot = await realpath(projectRoot);
    const result = await resolveProjectRelativeFile(projectRoot, "index.html");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved).toBe(join(canonicalRoot, "index.html"));
    }
  });

  it("resolves a valid nested file to its canonical absolute path", async () => {
    const canonicalRoot = await realpath(projectRoot);
    const result = await resolveProjectRelativeFile(projectRoot, "src/nested/file.ts");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved).toBe(join(canonicalRoot, "src", "nested", "file.ts"));
    }
  });

  it("rejects non-string or empty relative paths", async () => {
    await expect(resolveProjectRelativeFile(projectRoot, "")).resolves.toEqual({
      ok: false,
      reason: "relative path must be a non-empty string",
    });
    await expect(resolveProjectRelativeFile(projectRoot, "   ")).resolves.toEqual({
      ok: false,
      reason: "relative path must be a non-empty string",
    });
  });

  it("rejects paths containing null bytes", async () => {
    await expect(resolveProjectRelativeFile(projectRoot, "index.html\0evil")).resolves.toEqual({
      ok: false,
      reason: "relative path contains null bytes",
    });
  });

  it("rejects absolute paths", async () => {
    await expect(resolveProjectRelativeFile(projectRoot, "/etc/passwd")).resolves.toEqual({
      ok: false,
      reason: "relative path must not be absolute",
    });
    await expect(resolveProjectRelativeFile(projectRoot, "C:\\Windows\\System32")).resolves.toEqual({
      ok: false,
      reason: "relative path must not be absolute",
    });
    await expect(resolveProjectRelativeFile(projectRoot, "\\\\server\\share\\file")).resolves.toEqual({
      ok: false,
      reason: "relative path must not be absolute",
    });
  });

  it("rejects ../ directory traversal attempting to escape project root", async () => {
    const outsideFile = join(tempDir, "outside.txt");
    await writeFile(outsideFile, "secret");

    await expect(resolveProjectRelativeFile(projectRoot, "../outside.txt")).resolves.toEqual({
      ok: false,
      reason: "path escapes project root",
    });
    await expect(resolveProjectRelativeFile(projectRoot, "src/../../outside.txt")).resolves.toEqual({
      ok: false,
      reason: "path escapes project root",
    });
    await expect(resolveProjectRelativeFile(projectRoot, "..")).resolves.toEqual({
      ok: false,
      reason: "path escapes project root",
    });
  });

  it("rejects symlinks pointing outside the project root", async () => {
    const outsideFile = join(tempDir, "secret.txt");
    await writeFile(outsideFile, "confidential");
    const linkPath = join(projectRoot, "symlink-outside.txt");
    await symlink(outsideFile, linkPath);

    await expect(resolveProjectRelativeFile(projectRoot, "symlink-outside.txt")).resolves.toEqual({
      ok: false,
      reason: "path escapes project root",
    });
  });

  it("rejects non-existent files", async () => {
    await expect(resolveProjectRelativeFile(projectRoot, "does-not-exist.txt")).resolves.toEqual({
      ok: false,
      reason: "file does not exist",
    });
  });

  it("rejects directories", async () => {
    await expect(resolveProjectRelativeFile(projectRoot, "src")).resolves.toEqual({
      ok: false,
      reason: "path is a directory, not a file",
    });
  });

  it("ensures paths escaping the project root never reach shell.showItemInFolder", async () => {
    const showItemInFolder = vi.fn();
    const maliciousPaths = [
      "../outside.txt",
      "src/../../outside.txt",
      "/etc/passwd",
      "C:\\Windows\\System32",
      "",
      "non-existent.txt",
    ];

    for (const p of maliciousPaths) {
      const resolved = await resolveProjectRelativeFile(projectRoot, p);
      if (resolved.ok) {
        showItemInFolder(resolved.resolved);
      }
    }

    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  it("forwards the canonical absolute path to shell.showItemInFolder on success", async () => {
    const canonicalRoot = await realpath(projectRoot);
    const showItemInFolder = vi.fn();
    const resolved = await resolveProjectRelativeFile(projectRoot, "src/nested/file.ts");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      showItemInFolder(resolved.resolved);
    }

    expect(showItemInFolder).toHaveBeenCalledWith(join(canonicalRoot, "src", "nested", "file.ts"));
  });
});
