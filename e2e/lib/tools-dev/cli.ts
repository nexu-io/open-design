import { execFile } from 'node:child_process';
import { extname } from 'node:path';
import { promisify } from 'node:util';

import type { ToolsDevSuiteSpec } from './types.ts';

const execFileAsync = promisify(execFile);
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
const pnpmExecPath = process.env.npm_execpath;
const nodeLoadablePackageManagerExtensions = new Set(['.js', '.cjs', '.mjs']);

export async function runToolsDevJson<T>(
  workspaceRoot: string,
  suite: ToolsDevSuiteSpec,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
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
    env: {
      ...process.env,
      ...extraEnv,
      CODEX_HOME: suite.codexHomeDir,
      OD_DATA_DIR: suite.dataDir,
      OD_MEDIA_CONFIG_DIR: suite.dataDir,
    },
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32' && command !== process.execPath,
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
