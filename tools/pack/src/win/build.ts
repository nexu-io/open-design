import { createHash } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import {
  collectWorkspaceTarballs,
  createWinPackagedAppCacheKey,
  ensureWinWorkspaceBuild,
  prepareWinPackagedApp,
} from "./app.js";
import { PRODUCT_NAME } from "./constants.js";
import { pathExists } from "./fs.js";
import { materializeCachedUnpackedForInstaller, runElectronBuilder } from "./builder.js";
import {
  readBuiltAppManifest,
  readPackagedVersion,
} from "./manifest.js";
import { buildWinLauncherPayloadArchive } from "./payload.js";
import { resolveWinPaths } from "./paths.js";
import {
  collectWinSizeReport,
  shouldBuildWinNsisInstaller,
  shouldBuildWinPortableZip,
} from "./report.js";
import { copyWinIcon, prepareResourceTree } from "./resources.js";
import type { WinPackResult, WinPackTiming, WinPaths } from "./types.js";

function logWinBuildProgress(message: string, fields: Record<string, unknown> = {}): void {
  const suffix = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  process.stderr.write(`[tools-pack win] ${message}${suffix.length === 0 ? "" : ` ${suffix}`}\n`);
}

async function writeLocalLatestYml(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  if (!(await pathExists(paths.setupPath))) return;
  const packagedVersion = await readPackagedVersion(config);
  const setupPayload = await readFile(paths.setupPath);
  const setupMetadata = await stat(paths.setupPath);
  const sha512 = createHash("sha512").update(setupPayload).digest("base64");
  const setupName = basename(paths.setupPath);
  await writeFile(
    paths.latestYmlPath,
    [
      `version: ${JSON.stringify(packagedVersion)}`,
      "files:",
      `  - url: ${JSON.stringify(setupName)}`,
      `    sha512: ${JSON.stringify(sha512)}`,
      `    size: ${setupMetadata.size}`,
      `path: ${JSON.stringify(setupName)}`,
      `sha512: ${JSON.stringify(sha512)}`,
      `releaseDate: ${JSON.stringify(new Date().toISOString())}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function packWin(config: ToolPackConfig): Promise<WinPackResult> {
  const paths = resolveWinPaths(config);
  const cache = new ToolPackCache(config.roots.cacheRoot);
  const timings: WinPackTiming[] = [];
  const segments: WinPackTiming[] = [];
  const hasNsisTarget = shouldBuildWinNsisInstaller(config.to);
  const hasZipTarget = shouldBuildWinPortableZip(config.to);
  const hasLauncherPayloadTarget = hasNsisTarget || hasZipTarget;
  const runPhase = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    logWinBuildProgress("phase:start", { phase });
    try {
      const result = await task();
      logWinBuildProgress("phase:done", { durationMs: Date.now() - startedAt, phase });
      return result;
    } catch (error) {
      logWinBuildProgress("phase:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      throw error;
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

  await runPhase("target-artifact-cleanup", async () => {
    if (!hasNsisTarget) {
      await rm(paths.setupPath, { force: true });
      await rm(paths.installerBasePayloadPath, { force: true });
      await rm(paths.installerOverlayPayloadPath, { force: true });
      await rm(paths.latestYmlPath, { force: true });
    }
    if (!hasZipTarget) {
      await rm(paths.setupZipPath, { force: true });
    }
  });
  await runPhase("workspace-build", async () => {
    await ensureWinWorkspaceBuild(config, cache);
  });
  const resourceTree = await runPhase("resource-tree", async () =>
    prepareResourceTree(config, paths, cache, { materialize: config.to !== "dir" })
  );
  await runPhase("win-icon", async () => {
    await copyWinIcon(paths);
  });
  const tarballs = await runPhase("workspace-tarballs", async () => collectWorkspaceTarballs(config, paths, cache));
  const packagedAppKey = await createWinPackagedAppCacheKey(config, tarballs.key, tarballs.tarballs);
  let packagedAppRoot: string | null = null;
  await runPhase("electron-builder", async () => {
    const builderSegments = await runElectronBuilder(config, paths, cache, packagedAppKey, async () => {
      if (packagedAppRoot != null) return packagedAppRoot;
      const packagedApp = await prepareWinPackagedApp(config, paths, tarballs, cache);
      packagedAppRoot = packagedApp.appRoot;
      return packagedAppRoot;
    }, resourceTree);
    segments.push(...builderSegments);
  });
  await runPhase("latest-yml", async () => {
    await writeLocalLatestYml(config, paths);
  });
  let builtApp = await readBuiltAppManifest(paths);
  if (hasLauncherPayloadTarget) {
    builtApp = await runPhase("payload-unpacked-materialize", async () => {
      if (builtApp == null) throw new Error("cannot build Windows launcher payload without a built app manifest");
      const packagedVersion = await readPackagedVersion(config);
      return builtApp.unpackedRoot === paths.unpackedRoot
        ? materializeCachedUnpackedForInstaller(paths, packagedVersion)
        : materializeCachedUnpackedForInstaller(builtApp.unpackedRoot, paths, packagedVersion);
    });
    await runPhase("payload-artifact", async () => {
      if (builtApp == null) throw new Error("cannot build Windows launcher payload without a built app manifest");
      segments.push(...await buildWinLauncherPayloadArchive(config, paths, builtApp, cache, {
        seedFromInstallerPayload: hasNsisTarget,
      }));
    });
  }
  const sizeReport = await runPhase("size-report", async () => collectWinSizeReport(config, paths, builtApp));
  return {
    blockmapPath: (await pathExists(paths.blockmapPath)) ? paths.blockmapPath : null,
    installerPath: hasNsisTarget && await pathExists(paths.setupPath) ? paths.setupPath : null,
    latestYmlPath: hasNsisTarget && await pathExists(paths.latestYmlPath) ? paths.latestYmlPath : null,
    outputRoot: config.roots.output.namespaceRoot,
    payloadPath: (await pathExists(paths.launcherPayloadPath)) ? paths.launcherPayloadPath : null,
    portableZipPath: hasZipTarget && await pathExists(paths.setupZipPath) ? paths.setupZipPath : null,
    resourceRoot: builtApp == null ? paths.resourceRoot : join(builtApp.unpackedRoot, "resources", "open-design"),
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    cacheReport: cache.report(),
    segments,
    sizeReport,
    timings,
    to: config.to,
    unpackedPath: builtApp?.unpackedRoot ?? ((await pathExists(paths.unpackedRoot)) ? paths.unpackedRoot : null),
    webStandaloneHookAuditPath: (await pathExists(paths.webStandaloneHookAuditPath)) ? paths.webStandaloneHookAuditPath : null,
  };
}
