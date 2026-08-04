import type {
  AgentInventoryMcpServer,
  AgentInventoryMcpTransport,
  AgentInventoryResponse,
  AgentInventorySkill,
} from '@open-design/contracts';
import { spawn } from 'node:child_process';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseFrontmatter } from '../design-systems/frontmatter.js';

interface ClaudeInventoryOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  runner?: ClaudeInventoryRunner;
}

interface InventoryAccumulator {
  mcpServers: AgentInventoryMcpServer[];
  skills: AgentInventorySkill[];
  warnings: string[];
}

export interface ClaudeInventoryRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ClaudeInventoryRunner {
  run(args: string[], opts: { env: NodeJS.ProcessEnv; bin: string }): Promise<ClaudeInventoryRunnerResult>;
}

const defaultRunner: ClaudeInventoryRunner = {
  run(args, opts) {
    return new Promise<ClaudeInventoryRunnerResult>((resolve, reject) => {
      const child = spawn(opts.bin, args, {
        env: opts.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('claude CLI timed out after 30s'));
      }, 30_000);
      child.stdout?.on('data', (d) => {
        stdout += String(d);
      });
      child.stderr?.on('data', (d) => {
        stderr += String(d);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });
    });
  },
};

export async function readClaudeInventory(
  options: ClaudeInventoryOptions = {},
): Promise<AgentInventoryResponse> {
  const homeDir = options.homeDir ?? os.homedir();
  const env = normalizeEnv(options.env);
  const claudeDir = resolveClaudeConfigDir(env, homeDir);
  const acc: InventoryAccumulator = { mcpServers: [], skills: [], warnings: [] };

  const mcpInventoryReadable = await readMcpServersFromClaudeCli({
    acc,
    env,
    runner: options.runner ?? defaultRunner,
  });
  await readUserSkills(path.join(claudeDir, 'skills'), acc);

  const available = (await exists(claudeDir)) || mcpInventoryReadable;
  if (!available) {
    return {
      agentId: 'claude',
      supported: true,
      available: false,
      mcpServers: [],
      skills: [],
      reason: 'config_not_detected',
    };
  }

  return {
    agentId: 'claude',
    supported: true,
    available: true,
    mcpServers: sortByName(acc.mcpServers),
    skills: sortByName(acc.skills),
    ...(acc.warnings.length > 0 ? { warnings: acc.warnings } : {}),
  };
}

async function readMcpServersFromClaudeCli({
  acc,
  env,
  runner,
}: {
  acc: InventoryAccumulator;
  env: NodeJS.ProcessEnv;
  runner: ClaudeInventoryRunner;
}): Promise<boolean> {
  const bin = env.CLAUDE_BIN?.trim() || 'claude';
  let result: ClaudeInventoryRunnerResult;
  try {
    result = await runner.run(['mcp', 'list'], { env, bin });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') {
      acc.warnings.push('Claude Code CLI was not found while reading MCP inventory.');
      return false;
    }
    acc.warnings.push(`Could not read Claude Code MCP inventory: ${messageFor(err)}`);
    return false;
  }
  if (result.exitCode !== 0) {
    acc.warnings.push(`Claude Code MCP inventory failed: ${failureDetail(result)}`);
    return false;
  }
  acc.mcpServers.push(...parseClaudeMcpList(result.stdout));
  return true;
}

async function readUserSkills(
  skillsDir: string,
  acc: InventoryAccumulator,
): Promise<void> {
  for (const skillPath of await findSkillFiles(skillsDir)) {
    const skill = await readSkillFile(skillPath, 'user');
    if (skill) acc.skills.push(skill);
    else acc.warnings.push(`Could not read Claude Code skill at ${path.basename(path.dirname(skillPath))}.`);
  }
}

async function readSkillFile(
  skillPath: string,
  source: 'user',
): Promise<AgentInventorySkill | null> {
  try {
    const raw = await fs.readFile(skillPath, 'utf8');
    const { data } = parseFrontmatter(raw);
    const folder = path.basename(path.dirname(skillPath));
    const id = stringValue(data.name) ?? folder;
    const description = stringValue(data.description);
    return {
      id,
      name: stringValue(data.title) ?? stringValue(data.name) ?? folder,
      source,
      ...(description ? { description } : {}),
    };
  } catch {
    return null;
  }
}

async function findSkillFiles(root: string): Promise<string[]> {
  return findFilesNamed(root, 'SKILL.md');
}

async function findFilesNamed(
  root: string,
  fileName: string,
  maxDepth = 8,
): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) {
        out.push(full);
      } else if (entry.isDirectory()) {
        await walk(full, depth + 1);
      }
    }
  }
  await walk(root, 0);
  return out;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseClaudeMcpList(stdout: string): AgentInventoryMcpServer[] {
  const servers: AgentInventoryMcpServer[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Checking MCP server health')) continue;
    const match = /^([^:]+):\s*(.*?)(?:\s+\(([^)]+)\))?(?:\s+-\s+.*)?$/.exec(line);
    if (!match) continue;
    const name = match[1]?.trim();
    if (!name) continue;
    const detail = match[2]?.trim() ?? '';
    const transportLabel = match[3]?.trim();
    servers.push({
      id: name,
      name,
      source: 'user',
      transport: inferTransportFromClaudeMcpList(detail, transportLabel),
    });
  }
  return servers;
}

function inferTransportFromClaudeMcpList(
  detail: string,
  transportLabel?: string,
): AgentInventoryMcpTransport {
  const label = transportLabel?.toLowerCase();
  if (label === 'stdio' || label === 'sse' || label === 'http') return label;
  if (label === 'streamable-http') return 'http';
  if (/^https?:\/\//i.test(detail)) return 'http';
  if (/^sse:\/\//i.test(detail)) return 'sse';
  if (detail) return 'stdio';
  return 'unknown';
}

function normalizeEnv(env: ClaudeInventoryOptions['env']): NodeJS.ProcessEnv {
  return { ...process.env, ...(env ?? {}) } as NodeJS.ProcessEnv;
}

function resolveClaudeConfigDir(env: NodeJS.ProcessEnv, homeDir: string): string {
  const configured = env.CLAUDE_CONFIG_DIR?.trim();
  if (!configured) return path.join(homeDir, '.claude');
  if (configured === '~') return homeDir;
  if (configured.startsWith('~/') || configured.startsWith('~\\')) {
    return path.join(homeDir, configured.slice(2));
  }
  return path.isAbsolute(configured) ? configured : path.resolve(configured);
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function failureDetail(result: ClaudeInventoryRunnerResult): string {
  return result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
