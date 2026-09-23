import { execFile } from 'node:child_process';
import { extname } from 'node:path';
import { promisify } from 'node:util';

import type { ToolsDevSuiteSpec } from './types.ts';

const execFileAsync = promisify(execFile);
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
const pnpmExecPath = process.env.npm_execpath;
const nodeLoadablePackageManagerExtensions = new Set(['.js', '.cjs', '.mjs']);

export type RunToolsDevJsonOptions = {
  timeoutMs?: number;
};

/**
 * The release channel every e2e-owned tools-dev runtime reports.
 *
 * A source checkout carries no explicit channel, so
 * `resolveAppVersionInfo` (apps/daemon/src/app-version.ts) falls back to
 * `packaged ? 'stable' : 'development'` — and its `isPackagedRuntime` counts any
 * linux `execPath` under `/opt/` as packaged. GitHub's hosted runners install
 * Node at `/opt/hostedtoolcache/node/<version>/x64/bin/node`, so a CI daemon
 * self-identifies as a stable release. `whatsNewSourceUrl`
 * (apps/daemon/src/services/whats-new.ts) then fetches the live release
 * document and a real "OpenDesign X.Y.Z is here" card lands on top of the UI
 * under test, where its overlay blocks clicks until the spec times out.
 *
 * Pinning the channel here restores the property that service already
 * documents for itself — development/CI builds resolve to no card — and stops
 * CI runs from being attributed to the stable channel in telemetry. It is
 * declared in this module only, so a developer's own `pnpm tools-dev` and every
 * packaged runtime keep their inferred channel.
 */
export const E2E_TOOLS_DEV_RELEASE_CHANNEL = 'development';

/**
 * The environment every e2e-owned tools-dev process runs under.
 *
 * Layering, outermost first: the ambient environment, then the harness-wide
 * defaults a spec may deliberately override, then the caller's `extraEnv`, then
 * the per-suite identity that must never be overridden because it is what keeps
 * one runtime's data off another's disk.
 */
export function composeToolsDevEnv(
  suite: ToolsDevSuiteSpec,
  extraEnv: Record<string, string | undefined> = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    // Ahead of `extraEnv`: an ambient shell value must not be able to pull a
    // live release card into a test run, while a spec that means to exercise
    // release-channel behavior can still opt back in explicitly.
    OD_RELEASE_CHANNEL: E2E_TOOLS_DEV_RELEASE_CHANNEL,
    ...extraEnv,
    CODEX_HOME: suite.codexHomeDir,
    OD_DATA_DIR: suite.dataDir,
    OD_MEDIA_CONFIG_DIR: suite.dataDir,
  };
}

export async function runToolsDevJson<T>(
  workspaceRoot: string,
  suite: ToolsDevSuiteSpec,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
  options: RunToolsDevJsonOptions = {},
): Promise<T> {
  const useNpmExecPathWithNode = process.env.OD_E2E_PNPM_COMMAND == null
    && pnpmExecPath != null
    && nodeLoadablePackageManagerExtensions.has(extname(pnpmExecPath).toLowerCase());
  const command = useNpmExecPathWithNode
    ? process.execPath
    : (process.env.OD_E2E_PNPM_COMMAND == null && pnpmExecPath ? pnpmExecPath : pnpmCommand);
  const commandArgs = useNpmExecPathWithNode
    ? [pnpmExecPath, 'tools-dev', ...args]
    : ['tools-dev', ...args];
  const { stdout } = await execFileAsync(command, commandArgs, {
    cwd: workspaceRoot,
    env: composeToolsDevEnv(suite, extraEnv),
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32' && command !== process.execPath,
    timeout: options.timeoutMs,
  });
  return parseJsonOutput<T>(stdout);
}

export function isToolsDevPortConflict(error: unknown): boolean {
  const text = error instanceof Error
    ? `${error.message}\n${error.stack ?? ''}`
    : String(error);
  return text.includes('EADDRINUSE') ||
    (text.includes('is already running in namespace') && text.includes('stop it or choose another namespace'));
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T;
  }
  const objectStart = stdout.lastIndexOf('\n{');
  const arrayStart = stdout.lastIndexOf('\n[');
  const jsonStart = Math.max(objectStart, arrayStart);
  if (jsonStart < 0) {
    throw new Error(`Expected JSON output from tools-dev, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart + 1)) as T;
}
