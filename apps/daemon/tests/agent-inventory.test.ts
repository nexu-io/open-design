import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ClaudeInventoryRunner } from '../src/agent-inventory/claude.js';
import { readClaudeInventory } from '../src/agent-inventory/claude.js';
import { readAgentInventoryForAgent } from '../src/routes/agent-inventory.js';

const tmpRoots: string[] = [];
type RunnerCall = { args: string[]; opts: { env: NodeJS.ProcessEnv; bin: string } };

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeHome(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-agent-inventory-'));
  tmpRoots.push(root);
  return root;
}

function writeFile(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function mcpRunner(stdout: string, options: { exitCode?: number; error?: NodeJS.ErrnoException } = {}): ClaudeInventoryRunner {
  return {
    async run() {
      if (options.error) throw options.error;
      return { exitCode: options.exitCode ?? 0, stdout, stderr: '' };
    },
  };
}

describe('Claude Code agent inventory reader', () => {
  it('returns unavailable when Claude Code config is absent', async () => {
    const home = makeHome();

    await expect(readClaudeInventory({
      homeDir: home,
      runner: mcpRunner('', { error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }),
    })).resolves.toMatchObject({
      agentId: 'claude',
      supported: true,
      available: false,
      mcpServers: [],
      skills: [],
      reason: 'config_not_detected',
    });
  });

  it('reads MCP servers from Claude Code CLI and skills from the configured Claude home', async () => {
    const home = makeHome();
    const claudeConfigDir = path.join(home, 'claude-profile');
    const runnerCalls: RunnerCall[] = [];
    writeFile(
      path.join(claudeConfigDir, 'skills', 'wireframe', 'SKILL.md'),
      '---\nname: wireframe-design\ndescription: Create wireframes.\n---\nBody',
    );

    const inventory = await readClaudeInventory({
      homeDir: home,
      env: { CLAUDE_BIN: '/opt/claude/bin/claude', CLAUDE_CONFIG_DIR: claudeConfigDir },
      runner: {
        async run(args, opts) {
          runnerCalls.push({ args, opts });
          return {
            exitCode: 0,
            stderr: '',
            stdout: [
              'Checking MCP server health…',
              'figma: https://mcp.example.test/mcp (HTTP) - ✓ Connected',
              'local: node server.js (stdio) - ✓ Connected',
            ].join('\n'),
          };
        },
      },
    });

    const call = runnerCalls[0]!;
    expect(call.args).toEqual(['mcp', 'list']);
    expect(call.opts.bin).toBe('/opt/claude/bin/claude');
    expect(call.opts.env.CLAUDE_CONFIG_DIR).toBe(claudeConfigDir);
    expect(inventory.available).toBe(true);
    expect(inventory.mcpServers).toEqual([
      expect.objectContaining({ id: 'figma', name: 'figma', source: 'user', transport: 'http' }),
      expect.objectContaining({ id: 'local', name: 'local', source: 'user', transport: 'stdio' }),
    ]);
    expect(inventory.skills).toEqual([
      expect.objectContaining({
        id: 'wireframe-design',
        name: 'wireframe-design',
        source: 'user',
        description: 'Create wireframes.',
      }),
    ]);
  });

  it('returns partial results when Claude Code MCP CLI fails', async () => {
    const home = makeHome();
    writeFile(path.join(home, '.claude', 'skills', 'fallback', 'SKILL.md'), 'No frontmatter.');

    const inventory = await readClaudeInventory({
      homeDir: home,
      runner: mcpRunner('bad news', { exitCode: 1 }),
    });

    expect(inventory.available).toBe(true);
    expect(inventory.mcpServers).toEqual([]);
    expect(inventory.skills).toEqual([
      expect.objectContaining({ id: 'fallback', name: 'fallback', source: 'user' }),
    ]);
    expect(inventory.warnings?.[0]).toMatch(/Claude Code MCP inventory failed/);
  });

  it('does not scan Claude plugin cache in the first inventory provider', async () => {
    const home = makeHome();
    writeFile(path.join(home, '.claude', '.gitkeep'), '');
    const pluginRoot = path.join(home, '.claude', 'plugins', 'cache', 'exampleco', 'design-pack', '1.2.3');
    writeFile(
      path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        id: 'design-pack',
        name: 'Design Pack',
        version: '1.2.3',
        mcpServers: {
          palette: { command: 'palette-mcp', description: 'Color tools.' },
        },
      }),
    );
    writeFile(
      path.join(pluginRoot, 'skills', 'audit', 'SKILL.md'),
      '---\nname: design-audit\ndescription: Audit UI quality.\n---\nBody',
    );

    const inventory = await readClaudeInventory({
      homeDir: home,
      runner: mcpRunner(''),
    });

    expect(inventory.mcpServers).toEqual([]);
    expect(inventory.skills).toEqual([]);
  });
});

describe('agent inventory route dispatch', () => {
  it('returns a generic unsupported response for providers not implemented in v1', async () => {
    await expect(readAgentInventoryForAgent('codex')).resolves.toMatchObject({
      agentId: 'codex',
      supported: false,
      available: false,
      mcpServers: [],
      skills: [],
      reason: 'unsupported_agent',
    });
  });
});
