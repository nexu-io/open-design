import path from 'node:path';

import { SIDECAR_ENV } from '@open-design/sidecar-proto';

import { mergeNoProxyWithLoopbackDefaults } from '../connectionTest.js';
import {
  applySandboxRuntimeEnv,
  type SandboxRuntimeConfig,
} from '../sandbox-mode.js';

export interface AgentRuntimeToolTokenGrant {
  token?: string;
}

export interface AgentRuntimeEnvironmentConfig {
  dataDir: string;
  sandboxRuntime: SandboxRuntimeConfig;
}

export function createAgentRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
  daemonUrl: string,
  toolTokenGrant: AgentRuntimeToolTokenGrant | null = null,
  nodeBin: string = process.execPath,
  config: AgentRuntimeEnvironmentConfig,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = applySandboxRuntimeEnv(
    {
      ...baseEnv,
      OD_DATA_DIR: config.dataDir,
      OD_DAEMON_URL: daemonUrl,
      OD_NODE_BIN: nodeBin,
    },
    config.sandboxRuntime,
  );
  const sidecarIpcPath = baseEnv[SIDECAR_ENV.IPC_PATH];
  if (typeof sidecarIpcPath === 'string' && sidecarIpcPath.length > 0) {
    env[SIDECAR_ENV.IPC_PATH] = sidecarIpcPath;
  }
  if (config.sandboxRuntime.enabled) {
    const noProxy = mergeNoProxyWithLoopbackDefaults(env.NO_PROXY ?? env.no_proxy);
    if (noProxy) {
      env.NO_PROXY = noProxy;
      if (process.platform !== 'win32') env.no_proxy = noProxy;
    }
  }

  // Keep the daemon's Node-compatible runtime discoverable by child tools,
  // including npm .cmd shims on Windows.
  const nodeBinDir = path.dirname(nodeBin);
  if (nodeBinDir) {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    const existingPath = typeof env[pathKey] === 'string' ? env[pathKey] : '';
    const parts = existingPath.split(path.delimiter).filter((part) => part.length > 0);
    const normalize = (value: string) => value.replace(/[/\\]+$/u, '');
    const normalizedDir = normalize(nodeBinDir);
    const alreadyIncluded = parts.some((part) => {
      const normalizedPart = normalize(part);
      return process.platform === 'win32'
        ? normalizedPart.toLowerCase() === normalizedDir.toLowerCase()
        : normalizedPart === normalizedDir;
    });
    if (!alreadyIncluded) {
      env[pathKey] = [nodeBinDir, ...parts].join(path.delimiter);
    }
  }

  if (toolTokenGrant?.token) {
    env.OD_TOOL_TOKEN = toolTokenGrant.token;
  } else {
    delete env.OD_TOOL_TOKEN;
  }

  return env;
}

export function createAgentRuntimeToolPrompt(
  daemonUrl: string,
  toolTokenGrant: AgentRuntimeToolTokenGrant | null = null,
): string {
  const tokenLine = toolTokenGrant?.token
    ? '- `OD_TOOL_TOKEN` is available in your environment for this run. Use it only through project wrapper commands; do not print, persist, or override it.'
    : '- `OD_TOOL_TOKEN` is not available for this run, so `/api/tools/*` wrapper commands may be unavailable.';

  return [
    '## Runtime tool environment',
    '',
    `- Daemon URL: \`${daemonUrl}\` (also available as \`OD_DAEMON_URL\`).`,
    '- `OD_NODE_BIN` is the absolute path to the Node-compatible runtime that started the daemon; packaged desktop installs provide this even when the user has no system `node` on PATH.',
    '- `OD_BIN` is the absolute path to the Open Design CLI script. On POSIX shells run wrappers with `"$OD_NODE_BIN" "$OD_BIN" tools ...`; do not call bare `od`, which may resolve to the system octal-dump command on Unix-like systems.',
    '- On PowerShell use `& $env:OD_NODE_BIN $env:OD_BIN tools ...`; on cmd.exe use `"%OD_NODE_BIN%" "%OD_BIN%" tools ...`.',
    tokenLine,
    '- Prefer project wrapper commands through `OD_NODE_BIN` + `OD_BIN` over raw HTTP. The wrappers read these environment values automatically.',
  ].join('\n');
}
