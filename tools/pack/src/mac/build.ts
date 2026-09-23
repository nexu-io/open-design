import { ToolPackCache } from "../cache/index.js";
import type { ToolPackConfig } from "../config/index.js";
import { workspaceBuildUnitResult } from "../workspace-build.js";
import { WORKSPACE_BUILD_UNITS } from "../workspace/units.js";
import { processWebSourcemaps } from "../web-sourcemaps.js";
import { collectWorkspaceTarballs, copyResourceTree, writeAssembledApp } from "./app.js";
import { seedPackagedAppConfig } from "./app-config.js";
import { finalizeMacArtifacts } from "./artifacts.js";
import { resolveElectronBuilderTargets, runElectronBuilder } from "./builder.js";
import { scrubMacExtendedAttributes } from "./fs.js";
import { createMacLauncherPayloadArchive } from "./payload.js";
import { resolveMacPaths } from "./paths.js";
import { collectMacSizeReport } from "./report.js";
import type { MacBuildOutput, MacPackResult, MacPackTiming } from "./types.js";
import { ensureMacWorkspaceBuild } from "./workspace.js";

function logMacBuildProgress(message: string, fields: Record<string, unknown> = {}): void {
  const suffix = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  process.stderr.write(`[tools-pack mac] ${message}${suffix.length === 0 ? "" : ` ${suffix}`}\n`);
}

export async function packMac(config: ToolPackConfig): Promise<MacPackResult> {
  return executeMacPackaging(config, "build");
}

/** Package caller-built/restored source outputs; source provenance belongs to the caller. */
export async function packageMac(config: ToolPackConfig, runtimeProductRoot?: string): Promise<MacPackResult> {
  return executeMacPackaging(config, "existing", runtimeProductRoot);
}

async function executeMacPackaging(
  config: ToolPackConfig,
  source: "build" | "existing",
  runtimeProductRoot?: string,
): Promise<MacPackResult> {
  const paths = resolveMacPaths(config);
  const targets = resolveElectronBuilderTargets(config.to as MacBuildOutput);
  const cache = new ToolPackCache(config.roots.cacheRoot);
  const timings: MacPackTiming[] = [];
  const runPhase = async <T>(phase: string, task: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    logMacBuildProgress("phase:start", { phase });
    try {
      const result = await task();
      logMacBuildProgress("phase:done", { durationMs: Date.now() - startedAt, phase });
      return result;
    } catch (error) {
      logMacBuildProgress("phase:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      throw error;
    } finally {
      timings.push({ durationMs: Date.now() - startedAt, phase });
    }
  };

  if (source === "build") {
    await runPhase("workspace-build", async () => ensureMacWorkspaceBuild(config, cache));
  } else {
    await runPhase("workspace-inputs", async () => {
      for (const unit of WORKSPACE_BUILD_UNITS) await workspaceBuildUnitResult(config, unit);
    });
    // Public source results preserve pristine maps. Per-release upload and
    // stripping are packaging work even when source compilation was omitted.
    await runPhase("web-sourcemaps", async () => processWebSourcemaps(config));
  }
  await runPhase("seed-app-config", async () => {
    await seedPackagedAppConfig(config);
  });
  await runPhase("resource-tree", async () => {
    await copyResourceTree(config, paths);
  });
  const tarballs = await runPhase("workspace-tarballs", async () => runtimeProductRoot == null
    ? collectWorkspaceTarballs(config, paths)
    : []);
  await runPhase("assembled-app", async () => {
    await writeAssembledApp(config, paths, tarballs, runtimeProductRoot);
  });
  await runPhase("electron-builder", async () => {
    await runElectronBuilder(config, paths, targets);
  });
  await runPhase("xattr-scrub", async () => {
    await scrubMacExtendedAttributes(paths.appPath);
  });
  const payloadPath = await runPhase("payload-artifact", async () => createMacLauncherPayloadArchive(config, paths));
  const artifacts = await runPhase("artifacts", async () => finalizeMacArtifacts(config, paths));
  const sizeReport = await runPhase("size-report", async () => collectMacSizeReport(config, paths, artifacts, targets));

  return {
    appPath: paths.appPath,
    cacheReport: cache.report(),
    dmgPath: artifacts.dmgPath,
    latestMacYmlPath: artifacts.latestMacYmlPath,
    outputRoot: config.roots.output.namespaceRoot,
    payloadPath,
    resourceRoot: paths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    sizeReport,
    timings,
    to: config.to,
    zipPath: artifacts.zipPath,
  };
}
