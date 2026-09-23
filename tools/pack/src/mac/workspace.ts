import type { ToolPackCache } from "../cache/index.js";
import type { ToolPackConfig } from "../config/index.js";
import { ensureWorkspaceBuildArtifacts } from "../workspace-build.js";
import { runPnpm } from "./commands.js";

export async function ensureMacWorkspaceBuild(config: ToolPackConfig, cache: ToolPackCache): Promise<void> {
  await ensureWorkspaceBuildArtifacts(
    config,
    cache,
    async (args, extraEnv) => await runPnpm(config, args, extraEnv),
  );
}
