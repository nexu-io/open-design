import { workspaceBuildUnitResult } from "../workspace/source.js";
import { WORKSPACE_BUILD_UNITS } from "../workspace/units.js";
import { processWebSourcemaps } from "../web-sourcemaps.js";
import { collectExistingWorkspaceTarballs, writeExistingAssembledApp } from "./existing-app.js";
import { validateMacRuntimeProductRoot } from "./runtime-product.js";
import { ToolPackCache } from "../cache/index.js";
import type { ToolPackConfig } from "../config/index.js";
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
  return executeMacPackaging(config, false);
}
export async function packageMac(config: ToolPackConfig, runtimeProductRoot?: string): Promise<MacPackResult> {
  if (runtimeProductRoot) await validateMacRuntimeProductRoot(config, runtimeProductRoot);
  return executeMacPackaging(config, true, runtimeProductRoot);
}
async function executeMacPackaging(config: ToolPackConfig, existing: boolean, runtimeProductRoot?: string): Promise<MacPackResult> {
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

  if (existing) {
    await runPhase("workspace-inputs", async () => { for (const unit of WORKSPACE_BUILD_UNITS) await workspaceBuildUnitResult(config, unit); });
    await runPhase("web-sourcemaps", async () => processWebSourcemaps(config));
  } else {
    await runPhase("workspace-build", async () => { await ensureMacWorkspaceBuild(config, cache); });
  }
  await runPhase("seed-app-config", async () => {
    await seedPackagedAppConfig(config);
  });
  await runPhase("resource-tree", async () => {
    await copyResourceTree(config, paths);
  });
  const tarballs = await runPhase("workspace-tarballs", async () => runtimeProductRoot ? [] : existing ? collectExistingWorkspaceTarballs(config, paths) : collectWorkspaceTarballs(config, paths));
  await runPhase("assembled-app", async () => {
    if (existing) await writeExistingAssembledApp(config, paths, tarballs, runtimeProductRoot);
    else await writeAssembledApp(config, paths, tarballs);
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
