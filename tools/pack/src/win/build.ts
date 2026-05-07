import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
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
import { runElectronBuilder } from "./builder.js";
import {
  readBuiltAppManifest,
  readPackagedVersion,
} from "./manifest.js";
import { resolveWinPaths } from "./paths.js";
import { collectWinSizeReport } from "./report.js";
import { copyWinIcon, prepareResourceTree } from "./resources.js";
import type { WinPackResult, WinPackTiming, WinPaths } from "./types.js";

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
  const runPhase = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

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
    await runElectronBuilder(config, paths, cache, packagedAppKey, async () => {
      if (packagedAppRoot != null) return packagedAppRoot;
      const packagedApp = await prepareWinPackagedApp(config, paths, tarballs, cache);
      packagedAppRoot = packagedApp.appRoot;
      return packagedAppRoot;
    }, resourceTree);
  });
  await runPhase("latest-yml", async () => {
    await writeLocalLatestYml(config, paths);
  });
  const builtApp = await readBuiltAppManifest(paths);
  const sizeReport = await runPhase("size-report", async () => collectWinSizeReport(config, paths, builtApp));
  return {
    blockmapPath: (await pathExists(paths.blockmapPath)) ? paths.blockmapPath : null,
    installerPath: (await pathExists(paths.setupPath)) ? paths.setupPath : null,
    latestYmlPath: (await pathExists(paths.latestYmlPath)) ? paths.latestYmlPath : null,
    outputRoot: config.roots.output.namespaceRoot,
    resourceRoot: builtApp == null ? paths.resourceRoot : join(builtApp.unpackedRoot, "resources", "open-design"),
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    cacheReport: cache.report(),
    sizeReport,
    timings,
    to: config.to,
    unpackedPath: builtApp?.unpackedRoot ?? ((await pathExists(paths.unpackedRoot)) ? paths.unpackedRoot : null),
    webStandaloneHookAuditPath: (await pathExists(paths.webStandaloneHookAuditPath)) ? paths.webStandaloneHookAuditPath : null,
  };
}
