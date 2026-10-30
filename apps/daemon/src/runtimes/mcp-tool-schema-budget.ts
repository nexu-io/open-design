import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { execAgentFile } from './invocation.js';

type EnabledConnection =
  | { type: 'local'; command: [string, ...string[]]; environment: Record<string, string> }
  | { type: 'remote'; url: string; headers: Record<string, string> };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}

function stringMap(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record(value))) {
    if (typeof item !== 'string') throw new Error('Expected string');
    result[key] = item;
  }
  return result;
}

function parseConnections(value: unknown): EnabledConnection[] {
  const config = record(value);
  if (config.mcp === undefined) return [];
  const connections: EnabledConnection[] = [];
  for (const raw of Object.values(record(config.mcp))) {
    const entry = record(raw);
    if (entry.enabled === false) continue;
    if (entry.type === 'local' && Array.isArray(entry.command)) {
      const args: string[] = [];
      for (const arg of entry.command) {
        if (typeof arg !== 'string') throw new Error('Invalid MCP command');
        args.push(arg);
      }
      const [command, ...rest] = args;
      if (!command) throw new Error('Missing MCP command');
      connections.push({ type: 'local', command: [command, ...rest], environment: stringMap(entry.environment) });
    } else if (entry.type === 'remote' && typeof entry.url === 'string') {
      const url = new URL(entry.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid MCP URL');
      connections.push({ type: 'remote', url: entry.url, headers: stringMap(entry.headers) });
    } else {
      throw new Error('Unsupported MCP connection');
    }
  }
  return connections;
}

export interface OpenCodePreflightInvocation {
  command: string;
  /** The same finalized environment and cwd passed to the generation child. */
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export interface McpToolSchemaMeasurement {
  bytes: number;
  toolCount: number;
}

/**
 * OpenCode owns its layered configuration, including remote organization
 * defaults and enterprise managed preferences. Ask the selected binary for
 * its resolved config instead of copying that policy into the daemon.
 * `debug config` initializes config, not a generation session or provider call.
 */
async function resolveConnections(invocation: OpenCodePreflightInvocation) {
  try {
    const { stdout } = await execAgentFile(invocation.command, ['debug', 'config'], {
      env: invocation.env,
      cwd: invocation.cwd,
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
    });
    const parsed: unknown = JSON.parse(String(stdout));
    return parseConnections(parsed);
  } catch {
    // Config output and subprocess errors can contain keys/headers. Never
    // include them in the failure card or daemon log. An unavailable probe
    // must not be interpreted as an empty, safe tool set.
    throw new Error('Could not resolve the BYOK OpenCode configuration. Check that the selected OpenCode CLI supports `debug config`, then retry.');
  }
}

function buildTransport(
  entry: EnabledConnection,
  invocation: OpenCodePreflightInvocation,
): Transport {
  if (entry.type === 'local') {
    const [command, ...args] = entry.command;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(invocation.env)) {
      if (value !== undefined) env[key] = value;
    }
    return new StdioClientTransport({
      command,
      args,
      cwd: invocation.cwd,
      env: { ...env, ...entry.environment },
      stderr: 'ignore',
    });
  }
  const url = new URL(entry.url);
  const options = entry.headers ? { requestInit: { headers: entry.headers } } : {};
  if (url.pathname.replace(/\/+$/, '').endsWith('/sse')) {
    return new SSEClientTransport(url, options);
  }
  // SDK 1.29's concrete optional callbacks include undefined, unlike its
  // Transport interface; runtime implementation is the SDK's own transport.
  return new StreamableHTTPClientTransport(url, options) as unknown as Transport;
}

async function measureServer(
  entry: EnabledConnection,
  invocation: OpenCodePreflightInvocation,
  timeoutMs: number,
): Promise<McpToolSchemaMeasurement> {
  const client = new Client({ name: 'open-design-preflight', version: '1' }, { capabilities: {} });
  const transport = buildTransport(entry, invocation);
  const abort = new AbortController();
  const { signal } = abort;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Client.connect awaits transport.start before honoring request options.
      // An SSE server that never sends its endpoint needs transport-level close.
      abort.abort();
      void transport.close().catch(() => {});
      reject(new Error('MCP preflight deadline exceeded'));
    }, timeoutMs);
    timer.unref?.();
  });
  const measure = async () => {
    await client.connect(transport, { signal, timeout: timeoutMs });
    let cursor: string | undefined;
    const cursors = new Set<string>();
    const measurement = { bytes: 0, toolCount: 0 };
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, { signal, timeout: timeoutMs });
      for (const tool of page.tools) {
        measurement.bytes += Buffer.byteLength(JSON.stringify(tool), 'utf8') + 1;
        measurement.toolCount += 1;
      }
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('Repeated MCP pagination cursor');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return measurement;
  };
  try {
    return await Promise.race([measure(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    abort.abort();
    await client.close().catch(() => {});
  }
}

/** Measure resolved MCP schemas before starting a billable generation. */
export async function measureOpenCodeMcpToolSchemaBytes(
  invocation: OpenCodePreflightInvocation,
  options: { serverTimeoutMs?: number } = {},
): Promise<McpToolSchemaMeasurement> {
  const connections = await resolveConnections(invocation);
  const results = await Promise.all(connections.map(async (entry) => {
    try {
      return await measureServer(entry, invocation, options.serverTimeoutMs ?? 4_000);
    } catch {
      throw new Error('Could not measure the BYOK OpenCode MCP tool schemas. Check the enabled MCP servers or disable unavailable servers before retrying.');
    }
  }));
  return results.reduce((total, result) => ({
    bytes: total.bytes + result.bytes,
    toolCount: total.toolCount + result.toolCount,
  }), { bytes: 0, toolCount: 0 });
}
