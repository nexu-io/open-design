import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { winResources } from "../resources.js";
import type { WinBuiltAppManifest, WinPackTiming, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

function logWinZipProgress(message: string, fields: Record<string, unknown> = {}): void {
  const suffix = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  process.stderr.write(`[tools-pack win] ${message}${suffix.length === 0 ? "" : ` ${suffix}`}\n`);
}

// Produces a portable zip from the unpacked Electron build using the same 7z
// binary that ships with tools-pack for the NSIS payload. The zip lays files
// flat at the archive root so that users can extract it anywhere on Windows
// and run `Open Design.exe` without going through the NSIS installer.
//
// We deliberately do not delegate this to electron-builder's native `zip`
// target: the existing tools-pack flow forces electron-builder to `to: "dir"`
// so the cached `win-unpacked` output can be shared across cache hits and
// post-processed into the custom NSIS installer. Producing the zip from that
// same cached unpacked tree keeps the build deterministic and avoids a
// second electron-builder pass.
export async function buildWinPortableZip(
  _config: ToolPackConfig,
  paths: WinPaths,
  builtApp: WinBuiltAppManifest,
): Promise<WinPackTiming[]> {
  if (process.platform !== "win32") throw new Error("Windows portable zip build must run on Windows");
  const timings: WinPackTiming[] = [];
  const runSegment = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    logWinZipProgress("segment:start", { phase });
    try {
      const result = await task();
      logWinZipProgress("segment:done", { durationMs: Date.now() - startedAt, phase });
      return result;
    } catch (error) {
      logWinZipProgress("segment:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      throw error;
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };
  const runExecSegment = async (
    phase: string,
    command: string,
    args: string[],
    options: { cwd: string; outputPath?: string },
  ): Promise<void> => {
    const startedAt = Date.now();
    const details: Record<string, unknown> = {
      args,
      command,
      cwd: options.cwd,
    };
    logWinZipProgress("segment:start", { phase });
    try {
      const result = await execFileAsync(command, args, {
        cwd: options.cwd,
        windowsHide: true,
      });
      details.stdoutBytes = result.stdout.length;
      details.stderrBytes = result.stderr.length;
      details.stdoutTail = result.stdout.slice(-2000);
      details.stderrTail = result.stderr.slice(-2000);
      if (options.outputPath != null) {
        details.outputBytes = (await stat(options.outputPath)).size;
        details.outputPath = options.outputPath;
      }
      logWinZipProgress("segment:done", { durationMs: Date.now() - startedAt, phase });
      timings.push({ details, durationMs: Date.now() - startedAt, phase });
    } catch (error) {
      const failure = error as { code?: unknown; stderr?: unknown; stdout?: unknown };
      details.code = failure.code;
      details.stdoutTail = typeof failure.stdout === "string" ? failure.stdout.slice(-2000) : undefined;
      details.stderrTail = typeof failure.stderr === "string" ? failure.stderr.slice(-2000) : undefined;
      logWinZipProgress("segment:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      timings.push({ details, durationMs: Date.now() - startedAt, phase });
      throw error;
    }
  };

  await runSegment("portable-zip:prepare", async () => {
    await mkdir(dirname(paths.setupZipPath), { recursive: true });
    await rm(paths.setupZipPath, { force: true });
  });
  await runSegment("portable-zip:7z", async () => {
    await runExecSegment(
      "portable-zip:7z:process",
      winResources.sevenZipExe,
      ["a", "-tzip", "-mx=5", paths.setupZipPath, ".\\*"],
      {
        cwd: builtApp.unpackedRoot,
        outputPath: paths.setupZipPath,
      },
    );
  });
  await runSegment("portable-zip:stat", async () => {
    await stat(paths.setupZipPath);
  });
  return timings;
}
