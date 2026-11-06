import { describe, expect, it, vi } from "vitest";

import { openValidatedDirectory, type OpenPathDeps } from "../../src/main/open-path.js";

function makeDeps(overrides: Partial<OpenPathDeps> = {}): OpenPathDeps {
  return {
    release: () => "5.15.0-100-generic",
    execFile: vi.fn(async () => ({ stdout: "" })),
    openPath: vi.fn(async () => ""),
    ...overrides,
  };
}

describe("openValidatedDirectory", () => {
  describe("non-WSL Linux", () => {
    it("hands the path to shell.openPath and never invokes wslpath", async () => {
      const execFile = vi.fn(async () => ({ stdout: "" }));
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/home/u/project", makeDeps({
        release: () => "5.15.0-100-generic",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(openPath).toHaveBeenCalledWith("/home/u/project");
      expect(execFile).not.toHaveBeenCalled();
    });

    it("propagates an error string from shell.openPath", async () => {
      const result = await openValidatedDirectory("/home/u/project", makeDeps({
        release: () => "5.15.0-100-generic",
        openPath: vi.fn(async () => "shell.openPath: permission denied"),
      }));

      expect(result).toBe("shell.openPath: permission denied");
    });
  });

  describe("WSL", () => {
    it("routes through wslpath -w + explorer.exe and returns empty on success", async () => {
      const execFile = vi.fn(async (cmd: string, args: readonly string[]) => {
        if (cmd === "wslpath" && args[0] === "-w") {
          return { stdout: "C:\\Users\\u\\project\n" };
        }
        if (cmd === "explorer.exe") {
          return { stdout: "" };
        }
        throw new Error(`unexpected execFile call: ${cmd}`);
      });
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/mnt/c/Users/u/project", makeDeps({
        release: () => "5.15.167.4-microsoft-standard-WSL2",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(execFile).toHaveBeenNthCalledWith(1, "wslpath", ["-w", "/mnt/c/Users/u/project"]);
      expect(execFile).toHaveBeenNthCalledWith(2, "explorer.exe", ["C:\\Users\\u\\project"]);
      expect(openPath).not.toHaveBeenCalled();
    });

    it("detects WSL release strings regardless of casing", async () => {
      const execFile = vi.fn(async (cmd: string, args: readonly string[]) => {
        if (cmd === "wslpath") return { stdout: "C:\\Users\\u\\project\n" };
        return { stdout: "" };
      });
      await openValidatedDirectory("/mnt/c/Users/u/project", makeDeps({
        release: () => "4.19.128-Microsoft-Standard",
        execFile,
      }));
      expect(execFile).toHaveBeenCalledWith("wslpath", ["-w", "/mnt/c/Users/u/project"]);
    });

    it("falls back to shell.openPath when wslpath fails", async () => {
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") throw new Error("wslpath: command not found");
        return { stdout: "" };
      });
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/home/u/project", makeDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(openPath).toHaveBeenCalledWith("/home/u/project");
    });

    it("falls back to shell.openPath when wslpath returns an empty string", async () => {
      const execFile = vi.fn(async () => ({ stdout: "   \n" }));
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/home/u/project", makeDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(execFile).toHaveBeenCalledTimes(1);
      expect(execFile).toHaveBeenCalledWith("wslpath", ["-w", "/home/u/project"]);
      expect(openPath).toHaveBeenCalledWith("/home/u/project");
    });

    it("falls back to shell.openPath when explorer.exe cannot be spawned (ENOENT)", async () => {
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") return { stdout: "C:\\Users\\u\\project\n" };
        if (cmd === "explorer.exe") {
          throw Object.assign(new Error("spawn explorer.exe ENOENT"), { code: "ENOENT" });
        }
        return { stdout: "" };
      });
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/mnt/c/Users/u/project", makeDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(openPath).toHaveBeenCalledWith("/mnt/c/Users/u/project");
    });

    it("treats a non-zero explorer.exe exit after a successful spawn as success", async () => {
      // explorer.exe routinely exits 1 even after opening the folder, so
      // a rejected execFile without an ENOENT-style code must not fall
      // back to shell.openPath; otherwise the user would see Explorer
      // open AND a Chrome file:// tab — the original #1581 symptom.
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") return { stdout: "C:\\Users\\u\\project\n" };
        if (cmd === "explorer.exe") {
          throw Object.assign(new Error("Command failed with exit code 1"), {
            code: 1,
            stdout: "",
            stderr: "",
          });
        }
        return { stdout: "" };
      });
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/mnt/c/Users/u/project", makeDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(execFile).toHaveBeenCalledWith("explorer.exe", ["C:\\Users\\u\\project"]);
      expect(openPath).not.toHaveBeenCalled();
    });

    it("falls back to shell.openPath when explorer.exe is blocked (EACCES)", async () => {
      const execFile = vi.fn(async (cmd: string) => {
        if (cmd === "wslpath") return { stdout: "C:\\Users\\u\\project\n" };
        if (cmd === "explorer.exe") {
          throw Object.assign(new Error("spawn explorer.exe EACCES"), { code: "EACCES" });
        }
        return { stdout: "" };
      });
      const openPath = vi.fn(async () => "");
      const result = await openValidatedDirectory("/mnt/c/Users/u/project", makeDeps({
        release: () => "5.15.0-microsoft-standard-WSL2",
        execFile,
        openPath,
      }));

      expect(result).toBe("");
      expect(openPath).toHaveBeenCalledWith("/mnt/c/Users/u/project");
    });
  });
});
