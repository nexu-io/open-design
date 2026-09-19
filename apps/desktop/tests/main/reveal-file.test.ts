import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleRevealProjectFile,
  resolveProjectRelativeFile,
  revealValidatedFile,
  type RevealPathDeps,
  type RevealProjectFileDeps,
} from "../../src/main/open-path.js";

function makeRevealDeps(overrides: Partial<RevealPathDeps> = {}): RevealPathDeps {
  return {
    release: () => "5.15.0-100-generic",
    execFile: vi.fn(async () => ({ stdout: "" })),
    showItemInFolder: vi.fn(),
    ...overrides,
  };
}

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

describe("revealValidatedFile (WSL and native platforms)", () => {
  describe("non-WSL Linux / macOS / Windows", () => {
    it("calls showItemInFolder directly and does not invoke wslpath", async () => {
      const execFile = vi.fn();
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({ release: () => "5.15.0-100-generic", execFile, showItemInFolder });

      const result = await revealValidatedFile("/home/user/project/file.txt", deps);
      expect(result).toBe("");
      expect(showItemInFolder).toHaveBeenCalledWith("/home/user/project/file.txt");
      expect(execFile).not.toHaveBeenCalled();
    });
  });

  describe("WSL", () => {
    it("routes through wslpath -w and explorer.exe /select,<path>", async () => {
      const execFile = vi.fn(async (cmd: string, args: readonly string[]) => {
        if (cmd === "wslpath" && args[0] === "-w") {
          return { stdout: "C:\\Users\\u\\project\\file.txt\n" };
        }
        if (cmd === "explorer.exe") {
          return { stdout: "" };
        }
        throw new Error(`unexpected exec: ${cmd}`);
      });
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({
        release: () => "5.15.167.4-microsoft-standard-WSL2",
        execFile,
        showItemInFolder,
      });

      const result = await revealValidatedFile("/mnt/c/Users/u/project/file.txt", deps);
      expect(result).toBe("");
      expect(execFile).toHaveBeenNthCalledWith(1, "wslpath", ["-w", "/mnt/c/Users/u/project/file.txt"]);
      expect(execFile).toHaveBeenNthCalledWith(2, "explorer.exe", ["/select,C:\\Users\\u\\project\\file.txt"]);
      expect(showItemInFolder).not.toHaveBeenCalled();
    });

    it("handles paths with spaces, Unicode, and special characters on WSL", async () => {
      const execFile = vi.fn(async (cmd: string, args: readonly string[]) => {
        if (cmd === "wslpath" && args[0] === "-w") {
          return { stdout: "C:\\Users\\u\\My Documents\\项目设计 #1_v2@beta.png\n" };
        }
        if (cmd === "explorer.exe") {
          return { stdout: "" };
        }
        throw new Error(`unexpected: ${cmd}`);
      });
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({
        release: () => "5.15.167.4-Microsoft-Standard",
        execFile,
        showItemInFolder,
      });

      const inputPath = "/mnt/c/Users/u/My Documents/项目设计 #1_v2@beta.png";
      const result = await revealValidatedFile(inputPath, deps);
      expect(result).toBe("");
      expect(execFile).toHaveBeenNthCalledWith(1, "wslpath", ["-w", inputPath]);
      expect(execFile).toHaveBeenNthCalledWith(2, "explorer.exe", [
        "/select,C:\\Users\\u\\My Documents\\项目设计 #1_v2@beta.png",
      ]);
      expect(showItemInFolder).not.toHaveBeenCalled();
    });

    it("falls back to showItemInFolder when wslpath fails", async () => {
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") throw new Error("wslpath: command not found");
        return { stdout: "" };
      });
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        showItemInFolder,
      });

      const result = await revealValidatedFile("/home/u/project/file.txt", deps);
      expect(result).toBe("");
      expect(showItemInFolder).toHaveBeenCalledWith("/home/u/project/file.txt");
    });

    it("falls back to showItemInFolder when wslpath returns an empty string", async () => {
      const execFile = vi.fn(async () => ({ stdout: "   \n" }));
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        showItemInFolder,
      });

      const result = await revealValidatedFile("/home/u/project/file.txt", deps);
      expect(result).toBe("");
      expect(showItemInFolder).toHaveBeenCalledWith("/home/u/project/file.txt");
    });

    it("falls back to showItemInFolder when explorer.exe cannot be spawned (ENOENT/EACCES)", async () => {
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") return { stdout: "C:\\Users\\u\\file.txt\n" };
        if (cmd === "explorer.exe") {
          throw Object.assign(new Error("spawn explorer.exe ENOENT"), { code: "ENOENT" });
        }
        return { stdout: "" };
      });
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        showItemInFolder,
      });

      const result = await revealValidatedFile("/mnt/c/Users/u/file.txt", deps);
      expect(result).toBe("");
      expect(showItemInFolder).toHaveBeenCalledWith("/mnt/c/Users/u/file.txt");
    });

    it("treats non-zero explorer.exe exit after successful spawn as success", async () => {
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") return { stdout: "C:\\Users\\u\\file.txt\n" };
        if (cmd === "explorer.exe") {
          throw Object.assign(new Error("exit code 1"), { code: 1, stdout: "", stderr: "" });
        }
        return { stdout: "" };
      });
      const showItemInFolder = vi.fn();
      const deps = makeRevealDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        showItemInFolder,
      });

      const result = await revealValidatedFile("/mnt/c/Users/u/file.txt", deps);
      expect(result).toBe("");
      expect(execFile).toHaveBeenCalledWith("explorer.exe", ["/select,C:\\Users\\u\\file.txt"]);
      expect(showItemInFolder).not.toHaveBeenCalled();
    });
  });
});

describe("handleRevealProjectFile (full IPC pipeline wiring)", () => {
  function makeIpcDeps(overrides: Partial<RevealProjectFileDeps> = {}): RevealProjectFileDeps {
    return {
      release: () => "5.15.0-100-generic",
      execFile: vi.fn(async () => ({ stdout: "" })),
      showItemInFolder: vi.fn(),
      fetchResolvedProjectDir: vi.fn(async () => ({
        ok: true as const,
        context: { fromTrustedPicker: true, hasBaseDir: false, resolvedDir: "/canonical/projects/proj-1" },
      })),
      isOpenPathAllowedForProject: vi.fn(() => ({ ok: true as const })),
      validateExistingDirectory: vi.fn(async () => ({ ok: true as const, resolved: "/canonical/projects/proj-1" })),
      resolveProjectRelativeFile: vi.fn(async () => ({
        ok: true as const,
        resolved: "/canonical/projects/proj-1/src/index.html",
      })),
      ...overrides,
    };
  }

  it("calls showItemInFolder with canonical absolute path on valid project and relative file", async () => {
    const deps = makeIpcDeps();
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-1", "src/index.html", deps);

    expect(result).toBe("");
    expect(deps.fetchResolvedProjectDir).toHaveBeenCalledWith("http://127.0.0.1:4000", "proj-1");
    expect(deps.isOpenPathAllowedForProject).toHaveBeenCalledWith({
      fromTrustedPicker: true,
      hasBaseDir: false,
      resolvedDir: "/canonical/projects/proj-1",
    });
    expect(deps.validateExistingDirectory).toHaveBeenCalledWith("/canonical/projects/proj-1");
    expect(deps.resolveProjectRelativeFile).toHaveBeenCalledWith("/canonical/projects/proj-1", "src/index.html");
    expect(deps.showItemInFolder).toHaveBeenCalledWith("/canonical/projects/proj-1/src/index.html");
  });

  it("rejects when daemon API URL is missing without calling showItemInFolder", async () => {
    const deps = makeIpcDeps();
    const result = await handleRevealProjectFile(null, "proj-1", "src/index.html", deps);

    expect(result).toBe("reveal-file: daemon API URL not available");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects when project directory lookup fails without calling showItemInFolder", async () => {
    const deps = makeIpcDeps({
      fetchResolvedProjectDir: vi.fn(async () => ({ ok: false as const, reason: "project not found" })),
    });
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-missing", "index.html", deps);

    expect(result).toBe("reveal-file: project not found");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects untrusted project directory without calling showItemInFolder", async () => {
    const deps = makeIpcDeps({
      isOpenPathAllowedForProject: vi.fn(() => ({
        ok: false as const,
        reason: "project did not come from the trusted picker flow",
      })),
    });
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-untrusted", "index.html", deps);

    expect(result).toBe("reveal-file: project did not come from the trusted picker flow");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects when directory validation fails without calling showItemInFolder", async () => {
    const deps = makeIpcDeps({
      validateExistingDirectory: vi.fn(async () => ({
        ok: false as const,
        reason: "path does not exist",
      })),
    });
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-1", "index.html", deps);

    expect(result).toBe("reveal-file: path does not exist");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects path traversal or escape without calling showItemInFolder", async () => {
    const deps = makeIpcDeps({
      resolveProjectRelativeFile: vi.fn(async () => ({
        ok: false as const,
        reason: "path escapes project root",
      })),
    });
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-1", "../../etc/passwd", deps);

    expect(result).toBe("reveal-file: path escapes project root");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects when file does not exist without calling showItemInFolder", async () => {
    const deps = makeIpcDeps({
      resolveProjectRelativeFile: vi.fn(async () => ({
        ok: false as const,
        reason: "file does not exist",
      })),
    });
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-1", "ghost.png", deps);

    expect(result).toBe("reveal-file: file does not exist");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("rejects when target path is a directory without calling showItemInFolder", async () => {
    const deps = makeIpcDeps({
      resolveProjectRelativeFile: vi.fn(async () => ({
        ok: false as const,
        reason: "path is a directory, not a file",
      })),
    });
    const result = await handleRevealProjectFile("http://127.0.0.1:4000", "proj-1", "src", deps);

    expect(result).toBe("reveal-file: path is a directory, not a file");
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });
});
