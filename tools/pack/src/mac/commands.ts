import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createPackageManagerInvocation } from "@open-design/platform";

import type { ToolPackConfig } from "../config.js";

export const execFileAsync = promisify(execFile);

export async function runPnpm(
  config: ToolPackConfig,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  const invocation = createPackageManagerInvocation(args, process.env);
  await execFileAsync(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env: { ...process.env, ...extraEnv },
  });
}

export async function runNpmInstall(appRoot: string): Promise<void> {
  await execFileAsync("npm", ["install", "--omit=dev", "--no-package-lock"], {
    cwd: appRoot,
    env: process.env,
  });
}

export async function runEsbuild(config: ToolPackConfig, args: string[]): Promise<void> {
  await runPnpm(config, ["--filter", "@open-design/packaged", "exec", "esbuild", ...args]);
}
