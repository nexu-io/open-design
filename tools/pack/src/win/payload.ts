import { execFile } from "node:child_process";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherVersionPaths,
} from "@open-design/launcher-proto";

import type { ToolPackConfig } from "../config.js";
import { winResources } from "../resources.js";
import {
  resolveToolPackLauncherChannel,
  resolveToolPackLauncherRoot,
} from "../launcher-layout.js";
import { readPackagedVersion } from "./manifest.js";
import type { WinBuiltAppManifest, WinPackTiming, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

export type WinLauncherPayloadManifest = {
  channel: string;
  entry: {
    cwd: "payload";
    executable: "payload/Open Design.exe";
  };
  namespace: string;
  payloadRoot: "payload";
  platform: "win32";
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  version: string;
};

export function buildWinLauncherPayloadManifest(input: {
  channel: string;
  namespace: string;
  version: string;
}): WinLauncherPayloadManifest {
  return {
    channel: input.channel,
    entry: {
      cwd: "payload",
      executable: "payload/Open Design.exe",
    },
    namespace: input.namespace,
    payloadRoot: "payload",
    platform: "win32",
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    version: input.version,
  };
}

function logWinPayloadProgress(message: string, fields: Record<string, unknown> = {}): void {
  const suffix = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  process.stderr.write(`[tools-pack win] ${message}${suffix.length === 0 ? "" : ` ${suffix}`}\n`);
}

export async function buildWinLauncherPayloadArchive(
  config: ToolPackConfig,
  paths: WinPaths,
  builtApp: WinBuiltAppManifest,
): Promise<WinPackTiming[]> {
  if (process.platform !== "win32") throw new Error("Windows launcher payload build must run on Windows");
  const timings: WinPackTiming[] = [];
  const packagedVersion = await readPackagedVersion(config);
  const channel = resolveToolPackLauncherChannel(config);
  const launcherRoot = resolveToolPackLauncherRoot(config);
  resolveLauncherVersionPaths({
    channel,
    namespace: config.namespace,
    root: launcherRoot,
    version: packagedVersion,
  });
  const stageRoot = join(dirname(paths.launcherPayloadPath), "stage");
  const payloadRoot = join(stageRoot, "payload");
  const manifest = buildWinLauncherPayloadManifest({
    channel,
    namespace: config.namespace,
    version: packagedVersion,
  });

  const runSegment = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    logWinPayloadProgress("segment:start", { phase });
    try {
      const result = await task();
      logWinPayloadProgress("segment:done", { durationMs: Date.now() - startedAt, phase });
      return result;
    } catch (error) {
      logWinPayloadProgress("segment:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      throw error;
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

  await runSegment("launcher-payload:prepare", async () => {
    await rm(stageRoot, { force: true, recursive: true });
    await rm(paths.launcherPayloadPath, { force: true });
    await mkdir(payloadRoot, { recursive: true });
  });
  await runSegment("launcher-payload:stage", async () => {
    await cp(builtApp.unpackedRoot, payloadRoot, { recursive: true });
    await writeFile(join(stageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  });
  await runSegment("launcher-payload:7z", async () => {
    await mkdir(dirname(paths.launcherPayloadPath), { recursive: true });
    await execFileAsync(winResources.sevenZipExe, ["a", "-t7z", "-mx=5", paths.launcherPayloadPath, ".\\*"], {
      cwd: stageRoot,
      windowsHide: true,
    });
  });
  await runSegment("launcher-payload:stat", async () => {
    const archive = await stat(paths.launcherPayloadPath);
    if (archive.size <= 0) throw new Error(`Windows launcher payload archive is empty: ${paths.launcherPayloadPath}`);
  });
  await runSegment("launcher-payload:cleanup", async () => {
    await rm(stageRoot, { force: true, recursive: true });
  });
  return timings;
}
