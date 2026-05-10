import { ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { collectWorkspaceTarballs, copyResourceTree, writeAssembledApp } from "./app.js";
import { seedPackagedAppConfig } from "./app-config.js";
import { finalizeMacArtifacts } from "./artifacts.js";
import { resolveElectronBuilderTargets, runElectronBuilder } from "./builder.js";
import { clearQuarantine } from "./fs.js";
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

  await runPhase("workspace-build", async () => {
    await ensureMacWorkspaceBuild(config, cache);
  });
  await runPhase("seed-app-config", async () => {
    await seedPackagedAppConfig(config);
  });
  await runPhase("resource-tree", async () => {
    await copyResourceTree(config, paths);
  });
  const tarballs = await runPhase("workspace-tarballs", async () => collectWorkspaceTarballs(config, paths));
  await runPhase("assembled-app", async () => {
    await writeAssembledApp(config, paths, tarballs);
  });
  await runPhase("electron-builder", async () => {
    await runElectronBuilder(config, paths, targets);
  });
  await runPhase("quarantine", async () => {
    await clearQuarantine(paths.appPath);
  });
  const artifacts = await runPhase("artifacts", async () => finalizeMacArtifacts(config, paths));
  const sizeReport = await runPhase("size-report", async () => collectMacSizeReport(config, paths, artifacts, targets));

  return {
    appPath: paths.appPath,
    cacheReport: cache.report(),
    dmgPath: artifacts.dmgPath,
    latestMacYmlPath: artifacts.latestMacYmlPath,
    outputRoot: config.roots.output.namespaceRoot,
    resourceRoot: paths.resourceRoot,
    runtimeNamespaceRoot: config.roots.runtime.namespaceRoot,
    sizeReport,
    timings,
    to: config.to,
    zipPath: artifacts.zipPath,
  };
}
