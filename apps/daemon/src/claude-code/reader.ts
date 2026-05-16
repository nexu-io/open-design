import fs from 'node:fs';
import path from 'node:path';

import type { ClaudeCodeMcpServer, ClaudeCodeSkill } from '@open-design/contracts';

import { parseFrontmatter } from '../frontmatter.js';

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

function readSkillFile(
  skillMdPath: string,
  source: 'user' | 'plugin',
  extra: Partial<ClaudeCodeSkill> = {},
): ClaudeCodeSkill | null {
  let raw: string;
  try {
    raw = fs.readFileSync(skillMdPath, 'utf8');
  } catch {
    return null;
  }
  let data: Record<string, unknown> = {};
  try {
    const parsed = parseFrontmatter(raw) as { data?: Record<string, unknown> };
    data = parsed.data ?? {};
  } catch {
    data = {};
  }
  const idFromFm = typeof data.name === 'string' && data.name.length > 0 ? data.name : null;
  const fallbackId = path.basename(path.dirname(skillMdPath));
  const description = typeof data.description === 'string' ? data.description : undefined;
  return {
    id: idFromFm ?? fallbackId,
    source,
    description,
    path: skillMdPath,
    ...extra,
  };
}

export function readUserSkills(home: string): ClaudeCodeSkill[] {
  const root = path.join(home, 'skills');
  const out: ClaudeCodeSkill[] = [];
  for (const entry of safeReaddir(root)) {
    const skillMd = path.join(root, entry, 'SKILL.md');
    const skill = readSkillFile(skillMd, 'user');
    if (skill) out.push(skill);
  }
  return out;
}

function findSkillMdFiles(root: string, maxDepth: number): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'SKILL.md') {
        out.push(full);
      } else if (
        entry.isDirectory() &&
        entry.name !== '.claude-plugin' &&
        entry.name !== 'node_modules'
      ) {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

export function readPluginSkills(home: string): ClaudeCodeSkill[] {
  const out: ClaudeCodeSkill[] = [];
  for (const { pluginName, pluginVersion, versionDir } of readPluginManifests(home)) {
    for (const skillMd of findSkillMdFiles(versionDir, 4)) {
      const skill = readSkillFile(skillMd, 'plugin', { pluginName, pluginVersion });
      if (skill) out.push(skill);
    }
  }
  return out;
}
