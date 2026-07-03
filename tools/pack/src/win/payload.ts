import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
import { WIN_PAYLOAD_SEVEN_Z_CREATE_ARGS, resolveWinNsisOverlayRequiredPaths } from "./custom-installer.js";
import type { WinBuiltAppManifest, WinPackTiming, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);
const WIN_LAUNCHER_PAYLOAD_BASE_CACHE_VERSION = 2;
const WIN_LAUNCHER_PAYLOAD_ARCHIVE_CACHE_VERSION = 2;

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
  options: { seedFromInstallerPayload?: boolean } = {},
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

  async function pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  const writeOverlay = async (input: { includeExecutable: boolean }): Promise<void> => {
    await rm(overlayRoot, { force: true, recursive: true });
    await mkdir(join(overlayRoot, "payload", "resources"), { recursive: true });
    await writeFile(join(overlayRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    if (input.includeExecutable) {
      await cp(join(builtApp.unpackedRoot, "Open Design.exe"), join(overlayRoot, "payload", "Open Design.exe"));
    }
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
    await execFileAsync(winResources.sevenZipExe, ["a", ...WIN_PAYLOAD_SEVEN_Z_CREATE_ARGS, outputPath, ".\\*"], {
      cwd: stageRoot,
      windowsHide: true,
    });
  };

  const createArchiveFromInstallerBase = async (outputPath: string): Promise<boolean> => {
    if (options.seedFromInstallerPayload !== true) return false;
    if (!(await pathExists(paths.installerBasePayloadPath))) return false;
    await rm(outputPath, { force: true });
    await mkdir(dirname(outputPath), { recursive: true });
    await cp(paths.installerBasePayloadPath, outputPath);

    const overlayTopLevel = new Set(resolveWinNsisOverlayRequiredPaths().map((entry) => entry[0]).filter((entry) => entry != null));
    const entries = await readdir(builtApp.unpackedRoot, { withFileTypes: true });
    const renameArgs = entries
      .map((entry) => entry.name)
      .filter((name) => !overlayTopLevel.has(name))
      .flatMap((name) => [name, `payload/${name}`]);
    if (renameArgs.length > 0) {
      await execFileAsync(winResources.sevenZipExe, ["rn", outputPath, ...renameArgs], {
        windowsHide: true,
      });
    }
    await writeOverlay({ includeExecutable: true });
    await execFileAsync(winResources.sevenZipExe, ["u", "-t7z", outputPath, ".\\*"], {
      cwd: overlayRoot,
      windowsHide: true,
    });
    return true;
  };

  const createPayloadArchive = async (outputPath: string): Promise<void> => {
    if (await createArchiveFromInstallerBase(outputPath)) return;
    await createBaseArchive(outputPath);
    await writeOverlay({ includeExecutable: false });
    await execFileAsync(winResources.sevenZipExe, ["u", "-t7z", outputPath, ".\\*"], {
      cwd: overlayRoot,
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
      await createPayloadArchive(paths.launcherPayloadPath);
    });
  } else {
    const sourceKey = builtApp.cacheEntryPath == null
      ? await runSegment("launcher-payload:base-input-hash", async () => hashPath(builtApp.unpackedRoot))
      : `cache-entry:${builtApp.cacheEntryPath}`;
    const configBody = await readFile(paths.packagedConfigPath, "utf8");
    let baseArchivePath: string | null = null;
    const usesInstallerSeed = options.seedFromInstallerPayload === true && await pathExists(paths.installerBasePayloadPath);
    if (!usesInstallerSeed) {
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
        baseArchivePath = join(cached.entryPath, "payload-base.7z");
      });
    }

    const archiveNode = {
      build: async ({ entryRoot }: { entryRoot: string }): Promise<{ createdAt: string; sourceKey: string }> => {
        const outputPath = join(entryRoot, "payload.7z");
        if (usesInstallerSeed) {
          if (!(await createArchiveFromInstallerBase(outputPath))) {
            throw new Error("missing Windows NSIS base payload for launcher payload seed");
          }
        } else {
          if (baseArchivePath == null) throw new Error("missing Windows launcher payload base cache path");
          await cp(baseArchivePath, outputPath);
          await writeOverlay({ includeExecutable: false });
          await execFileAsync(winResources.sevenZipExe, ["u", "-t7z", outputPath, ".\\*"], {
            cwd: overlayRoot,
            windowsHide: true,
          });
        }
        return { createdAt: new Date().toISOString(), sourceKey };
      },
      id: "win.launcher-payload",
      invalidate: async () => null,
      key: hashJson({
        baseCacheVersion: WIN_LAUNCHER_PAYLOAD_BASE_CACHE_VERSION,
        cacheVersion: WIN_LAUNCHER_PAYLOAD_ARCHIVE_CACHE_VERSION,
        channel,
        configBody,
        manifest,
        namespace: config.namespace,
        node: "win.launcher-payload",
        seed: usesInstallerSeed ? "nsis-base" : "launcher-base",
        sourceKey,
      }),
      outputs: ["payload.7z"],
    };
    await runSegment("launcher-payload:archive-cache", async () => {
      await cache.acquire({
        materialize: [{ from: "payload.7z", reuse: true, to: paths.launcherPayloadPath }],
        node: archiveNode,
      });
    });
  }
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

function requirePayloadManifestValue(value: unknown, name: string, expected: unknown): void {
  if (value !== expected) {
    throw new Error(`launcher payload manifest ${name} expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
  }
}

function archiveRelativePath(value: string): string {
  if (value.length === 0 || isAbsolute(value) || value.includes("..")) {
    throw new Error(`unsafe launcher payload relative path: ${value}`);
  }
  return value.replaceAll("/", "\\").replaceAll("\\", "\\");
}

export async function validateWinLauncherPayloadArchive(input: {
  expectedVersion: string;
  namespace: string;
  payloadPath: string;
  workspaceRoot: string;
}): Promise<{ manifest: WinLauncherPayloadManifest; payloadPath: string; valid: true }> {
  if (process.platform !== "win32") throw new Error("Windows launcher payload validation must run on Windows");
  const payloadPath = isAbsolute(input.payloadPath) ? input.payloadPath : resolve(input.workspaceRoot, input.payloadPath);
  if (!(await stat(payloadPath).then((entry) => entry.isFile()).catch(() => false))) {
    throw new Error(`Windows launcher payload archive not found: ${payloadPath}`);
  }

  const extractRoot = await mkdtemp(join(tmpdir(), "od-win-payload-"));
  try {
    await execFileAsync(winResources.sevenZipExe, ["x", payloadPath, `-o${extractRoot}`, "-y"], {
      windowsHide: true,
    });
    const manifest = JSON.parse(await readFile(join(extractRoot, "manifest.json"), "utf8")) as WinLauncherPayloadManifest;
    const expectedChannel = resolveToolPackLauncherChannel({
      appVersion: input.expectedVersion,
      namespace: input.namespace,
    });
    requirePayloadManifestValue(manifest.schemaVersion, "schemaVersion", LAUNCHER_SCHEMA_VERSION);
    requirePayloadManifestValue(manifest.channel, "channel", expectedChannel);
    requirePayloadManifestValue(manifest.namespace, "namespace", input.namespace);
    requirePayloadManifestValue(manifest.version, "version", input.expectedVersion);
    requirePayloadManifestValue(manifest.platform, "platform", "win32");
    requirePayloadManifestValue(manifest.payloadRoot, "payloadRoot", "payload");
    requirePayloadManifestValue(manifest.entry?.cwd, "entry.cwd", "payload");
    requirePayloadManifestValue(manifest.entry?.executable, "entry.executable", "payload/Open Design.exe");

    await stat(join(extractRoot, archiveRelativePath("payload/Open Design.exe")));
    await stat(join(extractRoot, archiveRelativePath("payload/resources/open-design-config.json")));
    return { manifest, payloadPath, valid: true };
  } finally {
    await rm(extractRoot, { force: true, recursive: true });
  }
}
