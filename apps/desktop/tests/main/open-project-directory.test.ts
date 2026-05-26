import { describe, expect, it, vi } from "vitest";

import {
  isWslLinux,
  openProjectDirectoryInFileManager,
} from "../../src/main/open-project-directory.js";

describe("isWslLinux", () => {
  it("detects WSL kernels via microsoft in the release string", () => {
    expect(isWslLinux("5.15.133.1-microsoft-standard-WSL2", "linux")).toBe(true);
    expect(isWslLinux("6.8.0-45-generic", "linux")).toBe(false);
    expect(isWslLinux("5.15.133.1-microsoft-standard-WSL2", "darwin")).toBe(false);
  });
});

describe("openProjectDirectoryInFileManager", () => {
  it("uses shell.openPath on native Linux", async () => {
    const openPath = vi.fn(async () => "");
    const execFile = vi.fn();

    const result = await openProjectDirectoryInFileManager("/tmp/project", {
      isWsl: () => false,
      openPath,
      execFile,
    });

    expect(result).toBe("");
    expect(openPath).toHaveBeenCalledWith("/tmp/project");
    expect(execFile).not.toHaveBeenCalled();
  });

  it("routes through wslpath and explorer.exe on WSL (#1581)", async () => {
    const execFile = vi.fn(async (cmd: string, args: readonly string[]) => {
      if (cmd === "wslpath") {
        return { stdout: "C:\\Users\\me\\project\r\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });
    const openPath = vi.fn();

    const result = await openProjectDirectoryInFileManager("/home/me/project", {
      isWsl: () => true,
      execFile,
      openPath,
    });

    expect(result).toBe("");
    expect(execFile).toHaveBeenNthCalledWith(
      1,
      "wslpath",
      ["-w", "/home/me/project"],
      { timeout: 5000 },
    );
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      "explorer.exe",
      ["C:\\Users\\me\\project"],
      { timeout: 5000 },
    );
    expect(openPath).not.toHaveBeenCalled();
  });
});
