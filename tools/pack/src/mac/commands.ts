import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { createPackageManagerInvocation } from "@open-design/platform";

import type { ToolPackConfig } from "../config/index.js";

type LoggedCommandOptions = Pick<SpawnOptionsWithoutStdio, "cwd" | "env" | "windowsVerbatimArguments">;

function quoteCommandPart(value: string): string {
  if (!/[\s"'$`\\]/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandLine(command: string, args: string[]): string {
  return [command, ...args].map(quoteCommandPart).join(" ");
}

export async function execFileAsync(
  command: string,
  args: string[],
  options: LoggedCommandOptions = {},
): Promise<void> {
  const startedAt = Date.now();
  process.stderr.write(`[tools-pack mac] run ${commandLine(command, args)}\n`);

  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: options.windowsVerbatimArguments,
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.once("error", rejectCommand);
    child.once("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolveCommand();
        return;
      }
      const suffix = signal == null ? `exit code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectCommand(new Error(`command failed with ${suffix}: ${commandLine(command, args)}`));
    });
  });

  process.stderr.write(`[tools-pack mac] done ${commandLine(command, args)} durationMs=${Date.now() - startedAt}\n`);
}

export async function runPnpm(
  config: ToolPackConfig,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  const env = { ...process.env, ...extraEnv };
  env.npm_execpath ||= join(
    dirname(createRequire(import.meta.url).resolve("pnpm")),
    "bin",
    "pnpm.cjs",
  );
  const invocation = createPackageManagerInvocation(args, env);
  await execFileAsync(invocation.command, invocation.args, {
    cwd: config.workspaceRoot,
    env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

export async function runNpmInstall(appRoot: string, packages: string[] = []): Promise<void> {
  await execFileAsync("npm", ["install", "--omit=dev", "--no-package-lock", "--no-save", ...packages], {
    cwd: appRoot,
    env: process.env,
  });
}

export async function runNpmPrune(appRoot: string): Promise<void> {
  await execFileAsync("npm", ["prune", "--omit=dev", "--no-package-lock"], { cwd: appRoot, env: process.env });
}

export async function runEsbuild(config: ToolPackConfig, args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  const esbuildCli = createRequire(import.meta.url).resolve("esbuild/bin/esbuild");
  // esbuild may replace its JavaScript shim with the native executable during
  // installation. Both forms implement the package bin contract, but only the
  // shim can be interpreted by Node directly.
  await execFileAsync(esbuildCli, args, {
    cwd: config.workspaceRoot,
    env: { ...process.env, ...extraEnv },
  });
}
