#!/usr/bin/env node
// Probe the daemon's ZCode connection-test endpoint without opening Settings.
//
// Usage:
//   node --experimental-strip-types scripts/zcode-connection-test.ts --model glm-5.2
//   node --experimental-strip-types scripts/zcode-connection-test.ts --daemon http://127.0.0.1:17456 --model glm-5-turbo
//
// The daemon URL is resolved in this order:
//   --daemon / --daemon-url > $OD_DAEMON_URL > $OD_PORT > `pnpm tools-dev status --json`.

import { spawn } from 'node:child_process';

interface Args {
  daemonUrl?: string;
  model?: string;
  timeoutMs: number;
}

interface AppConfigPayload {
  config?: {
    agentCliEnv?: unknown;
  };
}

function usage(exitCode = 2): never {
  console.error(`Usage:
  node --experimental-strip-types scripts/zcode-connection-test.ts [--model <id>] [--daemon <url>] [--timeout-ms <ms>]

Examples:
  node --experimental-strip-types scripts/zcode-connection-test.ts --model glm-5.2
  node --experimental-strip-types scripts/zcode-connection-test.ts --daemon http://127.0.0.1:17456 --model glm-5-turbo`);
  process.exit(exitCode);
}

function readArgs(argv: string[]): Args {
  const args: Args = { timeoutMs: 120_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      index += 1;
      const value = argv[index];
      if (!value) usage();
      return value;
    };
    if (flag === '--daemon' || flag === '--daemon-url') args.daemonUrl = next();
    else if (flag === '--model') args.model = next();
    else if (flag === '--timeout-ms') args.timeoutMs = Number(next());
    else if (flag === '-h' || flag === '--help') usage(0);
    else usage();
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) usage();
  return args;
}

function run(command: string, args: string[]): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: false,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', () => resolve({ code: 1, stdout }));
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

async function daemonUrlFromToolsDev(): Promise<string | null> {
  const result = await run('corepack', ['pnpm', 'tools-dev', 'status', '--json']);
  if (result.code !== 0) return null;
  const jsonStart = result.stdout.indexOf('{');
  if (jsonStart < 0) return null;
  try {
    const parsed = JSON.parse(result.stdout.slice(jsonStart)) as {
      apps?: { daemon?: { url?: unknown } };
    };
    const url = parsed.apps?.daemon?.url;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

async function resolveDaemonUrl(args: Args): Promise<string> {
  if (args.daemonUrl) return args.daemonUrl.replace(/\/+$/u, '');
  if (process.env.OD_DAEMON_URL) return process.env.OD_DAEMON_URL.replace(/\/+$/u, '');
  if (process.env.OD_PORT) return `http://127.0.0.1:${process.env.OD_PORT}`;
  const discovered = await daemonUrlFromToolsDev();
  if (discovered) return discovered.replace(/\/+$/u, '');
  throw new Error(
    'Cannot determine daemon URL. Start tools-dev, pass --daemon <url>, or set OD_DAEMON_URL.',
  );
}

async function readAgentCliEnv(daemonUrl: string): Promise<unknown> {
  try {
    const response = await fetch(`${daemonUrl}/api/app-config`);
    if (!response.ok) return undefined;
    const payload = (await response.json()) as AppConfigPayload | null;
    return payload?.config?.agentCliEnv;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const args = readArgs(process.argv.slice(2));
  const daemonUrl = await resolveDaemonUrl(args);
  const agentCliEnv = await readAgentCliEnv(daemonUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(`${daemonUrl}/api/test/connection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'agent',
        agentId: 'zcode',
        ...(agentCliEnv && typeof agentCliEnv === 'object' ? { agentCliEnv } : {}),
        ...(args.model ? { model: args.model } : {}),
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text below.
    }
    console.log(JSON.stringify({
      daemonUrl,
      httpStatus: response.status,
      request: {
        agentId: 'zcode',
        model: args.model ?? null,
        agentCliEnvLoaded: Boolean(agentCliEnv && typeof agentCliEnv === 'object'),
      },
      response: payload,
    }, null, 2));
    if (!response.ok) process.exitCode = 1;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'ok' in payload &&
      (payload as { ok?: unknown }).ok !== true
    ) {
      process.exitCode = 1;
    }
  } finally {
    clearTimeout(timer);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
