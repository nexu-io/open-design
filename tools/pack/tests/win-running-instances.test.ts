import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access, copyFile, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createRunningInstancesScript } from "../src/win/custom-installer.js";

const execFileAsync = promisify(execFile);

async function waitForOutput(child: ChildProcess, marker: string): Promise<void> {
  const stdout = child.stdout;
  if (stdout == null) throw new Error("child stdout is not piped");
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let output = "";
  stdout.on("data", (chunk) => {
    output += String(chunk);
    if (output.includes(marker)) resolve();
  });
  child.once("error", reject);
  child.once("exit", (code) => reject(new Error(`child exited before ${marker}: ${code ?? "signal"}`)));
  await promise;
}

describe("Windows installer running-instance guard", () => {
  it.skipIf(process.platform !== "win32")(
    "quarantines the launcher before killing processes that an external client auto-respawns",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "od-installer-respawn-"));
      const executablePath = join(root, "Open Design.exe");
      const launcherBackupPath = `${root}.open-design-update-launcher.old`;
      const helperPath = join(root, "running-instances.ps1");
      const watcherPath = join(root, "watcher.cjs");
      const powershellPath = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      let watcher: ChildProcess | null = null;

      const runHelper = async (action: "close" | "detect") => {
        const result = await execFileAsync(
          powershellPath,
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            helperPath,
            action,
            root,
            "Open Design.exe",
            launcherBackupPath,
          ],
          { windowsHide: true },
        );
        return result.stdout.trim();
      };

      try {
        await copyFile(process.execPath, executablePath);
        await writeFile(helperPath, createRunningInstancesScript(), "utf8");
        await writeFile(
          watcherPath,
          `const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");
const [executablePath] = process.argv.slice(2);
let child = null;
let spawnCount = 0;
let stopping = false;
function startChild() {
  if (stopping || child !== null || !existsSync(executablePath)) return;
  let candidate;
  try {
    candidate = spawn(executablePath, ["-e", "process.stdin.resume()"], {
      stdio: ["pipe", "ignore", "ignore"],
      windowsHide: true,
    });
  } catch {
    return;
  }
  child = candidate;
  child.once("spawn", () => {
    spawnCount += 1;
    process.stdout.write("spawn:" + spawnCount + ":" + child.pid + "\\n");
  });
  child.once("error", () => {
    child = null;
  });
  child.once("exit", () => {
    child = null;
  });
}
const retry = setInterval(startChild, 25);
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(retry);
  if (child === null) process.exit(0);
  child.once("exit", () => process.exit(0));
  child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
startChild();
`,
          "utf8",
        );

        watcher = spawn(process.execPath, [watcherPath, executablePath], {
          stdio: ["ignore", "pipe", "ignore"],
          windowsHide: true,
        });
        await waitForOutput(watcher, "spawn:1:");

        await runHelper("close");

        await expect(access(executablePath)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(access(launcherBackupPath)).resolves.toBeUndefined();
        expect((await stat(launcherBackupPath)).size).toBeGreaterThan(0);
        expect(await runHelper("detect")).toBe("");

        const respawned = waitForOutput(watcher, "spawn:2:");
        await copyFile(process.execPath, executablePath);
        await respawned;
        expect(await runHelper("detect")).not.toBe("");
      } finally {
        if (watcher != null && watcher.exitCode == null && watcher.pid != null) {
          const exited = once(watcher, "exit");
          await execFileAsync("taskkill", ["/pid", String(watcher.pid), "/t", "/f"], {
            windowsHide: true,
          }).catch(() => {});
          await exited;
        }
        await rm(launcherBackupPath, { force: true });
        await rm(root, { force: true, recursive: true });
      }
    },
    40_000,
  );
  it.skipIf(process.platform !== "win32")(
    "preserves both launchers when restore finds a recreated original",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "od-installer-restore-conflict-"));
      const originalPath = join(root, "Open Design.exe");
      const quarantinePath = join(root, "Open Design.exe.quarantine");
      const helperPath = join(root, "restore-launchers.ps1");
      const powershellPath = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const generatedScript = createRunningInstancesScript();
      const restoreStart = generatedScript.indexOf("function Restore-Launchers {");
      const restoreEnd = generatedScript.indexOf("\nfunction Get-LiveProcess", restoreStart);

      expect(restoreStart).toBeGreaterThanOrEqual(0);
      expect(restoreEnd).toBeGreaterThan(restoreStart);

      try {
        await writeFile(originalPath, "recreated-launcher", "utf8");
        await writeFile(quarantinePath, "quarantined-launcher", "utf8");
        await writeFile(
          helperPath,
          `$ErrorActionPreference = "Stop"
${generatedScript.slice(restoreStart, restoreEnd)}
Restore-Launchers @([pscustomobject]@{ Original = $args[0]; Quarantine = $args[1] })
`,
          "utf8",
        );

        await expect(
          execFileAsync(
            powershellPath,
            ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helperPath, originalPath, quarantinePath],
            { windowsHide: true },
          ),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("launcher restore conflict") });
        await expect(readFile(originalPath, "utf8")).resolves.toBe("recreated-launcher");
        await expect(readFile(quarantinePath, "utf8")).resolves.toBe("quarantined-launcher");
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
    20_000,
  );
  it.skipIf(process.platform !== "win32")(
    "preserves both launchers when the original reappears during restore",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "od-installer-restore-race-"));
      const originalPath = join(root, "Open Design.exe");
      const quarantinePath = join(root, "Open Design.exe.quarantine");
      const helperPath = join(root, "restore-launchers.ps1");
      const powershellPath = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const generatedScript = createRunningInstancesScript();
      const restoreStart = generatedScript.indexOf("function Restore-Launchers {");
      const restoreEnd = generatedScript.indexOf("\nfunction Get-LiveProcess", restoreStart);

      expect(restoreStart).toBeGreaterThanOrEqual(0);
      expect(restoreEnd).toBeGreaterThan(restoreStart);

      try {
        await writeFile(quarantinePath, "quarantined-launcher", "utf8");
        await writeFile(
          helperPath,
          `param([string]$OriginalPath, [string]$QuarantinePath)
$ErrorActionPreference = "Stop"
${generatedScript.slice(restoreStart, restoreEnd)}
$script:OriginalPath = $OriginalPath
$script:Recreated = $false
$script:NativeTestPath = Get-Command -Name Test-Path -CommandType Cmdlet
function Test-Path {
  param([string]$LiteralPath, [string]$PathType)
  if (-not $script:Recreated -and $LiteralPath -eq $script:OriginalPath -and -not $PSBoundParameters.ContainsKey("PathType")) {
    [System.IO.File]::WriteAllText($LiteralPath, "recreated-launcher")
    $script:Recreated = $true
    return $false
  }
  if ($PSBoundParameters.ContainsKey("PathType")) {
    return (& $script:NativeTestPath -LiteralPath $LiteralPath -PathType $PathType)
  }
  return (& $script:NativeTestPath -LiteralPath $LiteralPath)
}
Restore-Launchers @([pscustomobject]@{ Original = $OriginalPath; Quarantine = $QuarantinePath })
`,
          "utf8",
        );
        await expect(
          execFileAsync(
            powershellPath,
            ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helperPath, originalPath, quarantinePath],
            { windowsHide: true },
          ),
        ).rejects.toMatchObject({ stderr: expect.any(String) });
        await expect(readFile(originalPath, "utf8")).resolves.toBe("recreated-launcher");
        await expect(readFile(quarantinePath, "utf8")).resolves.toBe("quarantined-launcher");
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
    20_000,
  );

  it.skipIf(process.platform !== "win32")(
    "fails closed when an existing target loses its launcher before quarantine",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "od-installer-missing-launcher-"));
      const helperPath = join(root, "running-instances.ps1");
      const launcherBackupPath = join(root, "launcher-backup.exe");
      const powershellPath = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );

      try {
        await writeFile(helperPath, createRunningInstancesScript(), "utf8");
        await expect(
          execFileAsync(
            powershellPath,
            [
              "-NoLogo",
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              helperPath,
              "close",
              root,
              "Open Design.exe",
              launcherBackupPath,
            ],
            { windowsHide: true },
          ),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("expected launcher is missing") });
        await expect(access(launcherBackupPath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
    20_000,
  );
});
