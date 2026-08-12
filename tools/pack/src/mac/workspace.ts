import type { ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { ensureWorkspaceBuildArtifacts, type ToolPackShellBuildIdentity } from "../workspace-build.js";
import { runPnpm } from "./commands.js";

async function buildWorkspaceArtifacts(config: ToolPackConfig): Promise<void> {
  await runPnpm(config, ["--filter", "@open-design/shell-electron...", "build"]);
}

export async function ensureMacWorkspaceBuild(config: ToolPackConfig, cache: ToolPackCache): Promise<ToolPackShellBuildIdentity> {
  return await ensureWorkspaceBuildArtifacts(config, cache, async () => {
    await buildWorkspaceArtifacts(config);
  });
}
