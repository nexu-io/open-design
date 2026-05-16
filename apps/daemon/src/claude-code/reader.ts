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

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

interface PluginRecord {
  manifest: Record<string, unknown>;
  pluginName: string;
  pluginVersion: string;
  versionDir: string;
}

function readPluginManifests(home: string): PluginRecord[] {
  const cacheRoot = path.join(home, 'plugins', 'cache');
  const out: PluginRecord[] = [];
  for (const marketplace of safeReaddir(cacheRoot)) {
    for (const plugin of safeReaddir(path.join(cacheRoot, marketplace))) {
      for (const version of safeReaddir(path.join(cacheRoot, marketplace, plugin))) {
        const versionDir = path.join(cacheRoot, marketplace, plugin, version);
        const manifestPath = path.join(versionDir, '.claude-plugin', 'plugin.json');
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
        } catch {
          continue;
        }
        const manifestName = typeof manifest.name === 'string' ? manifest.name : plugin;
        const manifestVersion = typeof manifest.version === 'string' ? manifest.version : version;
        out.push({ manifest, pluginName: manifestName, pluginVersion: manifestVersion, versionDir });
      }
    }
  }
  return out;
}

export function readPluginMcpServers(home: string): ClaudeCodeMcpServer[] {
  const out: ClaudeCodeMcpServer[] = [];
  for (const { manifest, pluginName, pluginVersion } of readPluginManifests(home)) {
    const servers = manifest.mcpServers;
    if (!servers || typeof servers !== 'object') continue;
    for (const [name, entry] of Object.entries(servers as Record<string, RawMcpEntry>)) {
      out.push({
        name,
        source: 'plugin',
        pluginName,
        pluginVersion,
        ...classifyTransport(entry),
      });
    }
  }
  return out;
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
