import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  LAUNCHER_SCHEMA_VERSION,
  resolveLauncherVersionPaths,
} from "@open-design/launcher-proto";

import { hashJson, hashPath, type ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { winResources } from "../resources.js";
import { electronBuilderVersionForAppVersion } from "../versions.js";
import {
  resolveToolPackLauncherChannel,
  resolveToolPackLauncherRoot,
} from "../launcher-layout.js";
import { readPackagedVersion } from "./manifest.js";
import type { WinBuiltAppManifest, WinPackTiming, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);
const WIN_LAUNCHER_PAYLOAD_BASE_CACHE_VERSION = 1;

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
  cache?: ToolPackCache,
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
  const overlayRoot = join(dirname(paths.launcherPayloadPath), "overlay");
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

  const writeOverlay = async (): Promise<void> => {
    await rm(overlayRoot, { force: true, recursive: true });
    await mkdir(join(overlayRoot, "payload", "resources"), { recursive: true });
    await writeFile(join(overlayRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(
      join(overlayRoot, "payload", "resources", "open-design-config.json"),
      await readFile(paths.packagedConfigPath),
    );
    const packageJsonPath = join(builtApp.unpackedRoot, "resources", "app", "package.json");
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
      packageJson.version = electronBuilderVersionForAppVersion(packagedVersion);
      await mkdir(join(overlayRoot, "payload", "resources", "app"), { recursive: true });
      await writeFile(
        join(overlayRoot, "payload", "resources", "app", "package.json"),
        `${JSON.stringify(packageJson, null, 2)}\n`,
        "utf8",
      );
    } catch {
      // Legacy/fake unpacked fixtures may not include Electron app metadata.
    }
  };

  const createBaseArchive = async (outputPath: string): Promise<void> => {
    await rm(stageRoot, { force: true, recursive: true });
    await mkdir(payloadRoot, { recursive: true });
    await cp(builtApp.unpackedRoot, payloadRoot, { recursive: true });
    await execFileAsync(winResources.sevenZipExe, ["a", "-t7z", "-mx=5", outputPath, ".\\*"], {
      cwd: stageRoot,
      windowsHide: true,
    });
  };

  await runSegment("launcher-payload:prepare", async () => {
    await rm(stageRoot, { force: true, recursive: true });
    await rm(overlayRoot, { force: true, recursive: true });
    await rm(paths.launcherPayloadPath, { force: true });
    await mkdir(dirname(paths.launcherPayloadPath), { recursive: true });
  });

  if (cache == null) {
    await runSegment("launcher-payload:stage", async () => {
      await createBaseArchive(paths.launcherPayloadPath);
      await writeOverlay();
    });
  } else {
    const sourceKey = builtApp.cacheEntryPath == null
      ? await runSegment("launcher-payload:base-input-hash", async () => hashPath(builtApp.unpackedRoot))
      : `cache-entry:${builtApp.cacheEntryPath}`;
    const baseNode = {
      build: async ({ entryRoot }: { entryRoot: string }): Promise<{ createdAt: string; sourceKey: string }> => {
        await createBaseArchive(join(entryRoot, "payload-base.7z"));
        return { createdAt: new Date().toISOString(), sourceKey };
      },
      id: "win.launcher-payload-base",
      invalidate: async () => null,
      key: hashJson({
        cacheVersion: WIN_LAUNCHER_PAYLOAD_BASE_CACHE_VERSION,
        channel,
        namespace: config.namespace,
        node: "win.launcher-payload-base",
        sourceKey,
      }),
      outputs: ["payload-base.7z"],
    };
    await runSegment("launcher-payload:base-cache", async () => {
      const cached = await cache.acquire({
        materialize: [],
        node: baseNode,
      });
      await cp(join(cached.entryPath, "payload-base.7z"), paths.launcherPayloadPath);
      await writeOverlay();
    });
  }

  await runSegment("launcher-payload:overlay", async () => {
    await execFileAsync(winResources.sevenZipExe, ["u", "-t7z", paths.launcherPayloadPath, ".\\*"], {
      cwd: overlayRoot,
      windowsHide: true,
    });
  });
  await runSegment("launcher-payload:stat", async () => {
    const archive = await stat(paths.launcherPayloadPath);
    if (archive.size <= 0) throw new Error(`Windows launcher payload archive is empty: ${paths.launcherPayloadPath}`);
  });
  await runSegment("launcher-payload:cleanup", async () => {
    await rm(stageRoot, { force: true, recursive: true });
    await rm(overlayRoot, { force: true, recursive: true });
  });
  return timings;
}
