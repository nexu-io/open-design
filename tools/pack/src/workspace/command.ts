import { spawn } from "node:child_process";

import { createPackageManagerInvocation } from "@open-design/platform";

import { runWorkspaceBuildUnit, workspaceBuildUnitResult, type WorkspaceBuildConfig } from "../workspace-build.js";
import { WORKSPACE_ROOT } from "../workspace-root.js";
import { parseWorkspaceBuildUnit } from "./units.js";
import { exportWorkspaceOutputs, importWorkspaceOutputs, type WorkspaceSource } from "./products.js";

export type WorkspaceCommandOptions = { webOutputMode?: string; output?: string; scratch?: string; sources?: string; url?: string; sha256?: string };

export async function workspaceCommand(action: string, value: string, options: WorkspaceCommandOptions): Promise<unknown> {
  if (value === "javascript") {
    const selected = ["packages", "daemon", "shell"] as const;
    if (action === "import") {
      const sources: WorkspaceSource[] = JSON.parse(options.sources ?? "null");
      if (!Array.isArray(sources) || sources.length !== selected.length || selected.some((unit) => sources.filter((source) => source.unit === unit).length !== 1)) {
        throw new Error("JavaScript import requires exactly packages, daemon and shell sources");
      }
      const results = [];
      for (const unit of selected) {
        const source = sources.find((source) => source.unit === unit)!;
        results.push(await workspaceCommand(action, unit, { ...options, url: source.url, sha256: source.sha256 }));
      }
      return results;
    }
    if (action !== "build" && action !== "result") throw new Error("JavaScript group supports build, result or import");
    const results = [];
    for (const unit of selected) results.push(await workspaceCommand(action, unit, options));
    return results;
  }
  const startedAt = performance.now();
  const unit = parseWorkspaceBuildUnit(value);
  if (!["build", "result", "export", "import"].includes(action)) throw new Error(`unsupported workspace action: ${action}`);
  const webOutputMode = options.webOutputMode ?? "standalone";
  if (webOutputMode !== "standalone" && webOutputMode !== "server") throw new Error(`unsupported web output mode: ${webOutputMode}`);
  const config: WorkspaceBuildConfig = { workspaceRoot: WORKSPACE_ROOT, webOutputMode };
  if (action === "import") {
    if (!options.url || !options.sha256 || !options.scratch) throw new Error("workspace import requires --url, --sha256 and --scratch");
    await importWorkspaceOutputs(config.workspaceRoot, options.scratch, { unit, url: options.url, sha256: options.sha256 });
  }
  if (action === "build") {
    await runWorkspaceBuildUnit(config, unit, async (args, extraEnv) => {
      const invocation = createPackageManagerInvocation(args, process.env);
      process.stderr.write(`[tools-pack workspace] ${unit}: pnpm ${args.join(" ")}\n`);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(invocation.command, invocation.args, {
          cwd: config.workspaceRoot,
          env: { ...process.env, ...extraEnv },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          windowsVerbatimArguments: invocation.windowsVerbatimArguments,
        });
        child.stdout?.pipe(process.stderr, { end: false });
        child.stderr?.pipe(process.stderr, { end: false });
        child.once("error", reject);
        child.once("close", (code, signal) => code === 0 && signal === null
          ? resolve() : reject(new Error(`workspace ${unit} failed: ${signal ?? code}`)));
      });
    });
  }
  const result = await workspaceBuildUnitResult(config, unit);
  if (action === "export" || (action === "build" && options.output)) {
    if (!options.output) throw new Error("workspace export requires --output");
    exportWorkspaceOutputs(config.workspaceRoot, options.output, [result], [unit]);
  }
  process.stderr.write(`[tools-pack workspace] ${action} ${unit} durationMs=${Math.round(performance.now() - startedAt)}\n`);
  return result;
}
