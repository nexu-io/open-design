import fs from 'node:fs';
import path from 'node:path';

import type { ClaudeCodeMcpServer } from '@open-design/contracts';

export function detectAvailability(home: string): boolean {
  try {
    return fs.statSync(home).isDirectory();
  } catch {
    return false;
  }
}

interface RawMcpEntry {
  command?: string;
  args?: string[];
  url?: string;
  type?: string;
}

type TransportFields = Pick<ClaudeCodeMcpServer, 'transport' | 'command' | 'url'>;

function classifyTransport(entry: RawMcpEntry): TransportFields {
  if (typeof entry.command === 'string' && entry.command.length > 0) {
    const args = Array.isArray(entry.args) ? entry.args : [];
    const cmd = [entry.command, ...args].join(' ').trim();
    return { transport: 'stdio', command: cmd };
  }
  if (typeof entry.url === 'string' && entry.url.length > 0) {
    if (entry.type === 'sse') return { transport: 'sse', url: entry.url };
    return { transport: 'http', url: entry.url };
  }
  return { transport: 'unknown' };
}

export function readUserMcpServers(home: string): ClaudeCodeMcpServer[] {
  const configPath = path.join(home, '..', '.claude.json');
  let parsed: { mcpServers?: Record<string, RawMcpEntry> };
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const servers = parsed.mcpServers;
  if (!servers || typeof servers !== 'object') return [];
  return Object.entries(servers).map(([name, entry]) => ({
    name,
    source: 'user' as const,
    ...classifyTransport(entry),
  }));
}
