import { describe, expect, it } from 'vitest';

import {
  AGENT_SLUGS,
  applyJsonInstall,
  isAgentSlug,
  planAgentInstall,
  removeJsonInstall,
  type JsonInstallPlan,
  type McpLaunchSpec,
} from '../src/mcp-agent-install.js';

const SPEC: McpLaunchSpec = {
  command: '/usr/local/bin/node',
  args: ['/opt/open-design/cli.js', 'mcp', '--daemon-url', 'http://127.0.0.1:7456'],
  env: { OD_DATA_DIR: '/home/u/.open-design' },
};

const SPEC_NO_ENV: McpLaunchSpec = { ...SPEC, env: {} };

const ctx = (platform: NodeJS.Platform = 'linux') => ({
  home: '/home/u',
  platform,
  serverName: 'open-design',
});

describe('agent slug guard', () => {
  it('accepts every documented slug and rejects others', () => {
    for (const s of AGENT_SLUGS) expect(isAgentSlug(s)).toBe(true);
    expect(isAgentSlug('not-an-agent')).toBe(false);
    expect(AGENT_SLUGS).toHaveLength(14);
  });
});

describe('CLI-driven agents', () => {
  it('claude registers via `claude mcp add --scope user` with env flags', () => {
    const plan = planAgentInstall('claude', SPEC, ctx());
    expect(plan.kind).toBe('cli');
    if (plan.kind !== 'cli') throw new Error('expected cli');
    expect(plan.bin).toBe('claude');
    expect(plan.addArgv).toEqual([
      'mcp', 'add', '--scope', 'user',
      'open-design',
      '-e', 'OD_DATA_DIR=/home/u/.open-design',
      '--',
      SPEC.command, ...SPEC.args,
    ]);
    expect(plan.removeArgv).toEqual(['mcp', 'remove', '--scope', 'user', 'open-design']);
  });

  it('codex uses --env and a -- separator', () => {
    const plan = planAgentInstall('codex', SPEC, ctx());
    if (plan.kind !== 'cli') throw new Error('expected cli');
    expect(plan.addArgv).toContain('--env');
    expect(plan.addArgv).toContain('OD_DATA_DIR=/home/u/.open-design');
    expect(plan.addArgv.slice(-SPEC.args.length - 2)).toEqual(['--', SPEC.command, ...SPEC.args]);
  });

  it('gemini omits the -- separator (positional command)', () => {
    const plan = planAgentInstall('gemini', SPEC_NO_ENV, ctx());
    if (plan.kind !== 'cli') throw new Error('expected cli');
    expect(plan.addArgv).toEqual([
      'mcp', 'add', '-s', 'user', '-t', 'stdio',
      'open-design', SPEC.command, ...SPEC.args,
    ]);
  });
});

describe('JSON-config agents', () => {
  it('cursor merges a stdio entry under mcpServers', () => {
    const plan = planAgentInstall('cursor', SPEC, ctx());
    if (plan.kind !== 'json') throw new Error('expected json');
    expect(plan.configPath).toBe('/home/u/.cursor/mcp.json');
    expect(plan.keyPath).toEqual(['mcpServers']);
    expect(plan.entry).toEqual({
      command: SPEC.command,
      args: SPEC.args,
      type: 'stdio',
      env: SPEC.env,
    });
  });

  it('opencode folds command+args into one array under `mcp` and uses `environment`', () => {
    const plan = planAgentInstall('opencode', SPEC, ctx());
    if (plan.kind !== 'json') throw new Error('expected json');
    expect(plan.keyPath).toEqual(['mcp']);
    expect(plan.entry).toEqual({
      type: 'local',
      command: [SPEC.command, ...SPEC.args],
      enabled: true,
      environment: SPEC.env,
    });
  });

  it('openclaw nests under mcp.servers', () => {
    const plan = planAgentInstall('openclaw', SPEC_NO_ENV, ctx());
    if (plan.kind !== 'json') throw new Error('expected json');
    expect(plan.keyPath).toEqual(['mcp', 'servers']);
    expect(plan.entry).toEqual({ command: SPEC.command, args: SPEC.args });
  });

  it('omits env entirely when the launch spec has no env', () => {
    const plan = planAgentInstall('cursor', SPEC_NO_ENV, ctx());
    if (plan.kind !== 'json') throw new Error('expected json');
    expect(plan.entry).not.toHaveProperty('env');
  });

  it('cline path is OS-specific', () => {
    const mac = planAgentInstall('cline', SPEC, ctx('darwin'));
    const linux = planAgentInstall('cline', SPEC, ctx('linux'));
    if (mac.kind !== 'json' || linux.kind !== 'json') throw new Error('expected json');
    expect(mac.configPath).toContain('Library/Application Support/Code/User');
    expect(linux.configPath).toContain('.config/Code/User');
    expect(mac.configPath).toContain('saoudrizwan.claude-dev');
  });
});

describe('manual (unverified) agents', () => {
  it('pi / vibe / hermes never produce a writable plan', () => {
    for (const slug of ['pi', 'vibe', 'hermes'] as const) {
      const plan = planAgentInstall(slug, SPEC, ctx());
      expect(plan.kind).toBe('manual');
      if (plan.kind !== 'manual') throw new Error('expected manual');
      expect(plan.snippet.length).toBeGreaterThan(0);
      expect(plan.reason.length).toBeGreaterThan(0);
    }
  });

  it('vibe snippet is TOML array-of-tables', () => {
    const plan = planAgentInstall('vibe', SPEC, ctx());
    if (plan.kind !== 'manual') throw new Error('expected manual');
    expect(plan.format).toBe('toml');
    expect(plan.snippet).toContain('[[mcp_servers]]');
    expect(plan.snippet).toContain('transport = "stdio"');
  });
});

describe('applyJsonInstall', () => {
  const plan = planAgentInstall('cursor', SPEC, ctx()) as JsonInstallPlan;

  it('creates the file structure from empty input', () => {
    const out = applyJsonInstall(null, plan);
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers['open-design'].command).toBe(SPEC.command);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('preserves unrelated keys and sibling servers', () => {
    const existing = JSON.stringify({
      editor: { theme: 'dark' },
      mcpServers: { 'other-server': { command: 'foo' } },
    });
    const out = JSON.parse(applyJsonInstall(existing, plan));
    expect(out.editor).toEqual({ theme: 'dark' });
    expect(out.mcpServers['other-server']).toEqual({ command: 'foo' });
    expect(out.mcpServers['open-design'].type).toBe('stdio');
  });

  it('is idempotent — re-applying yields the same content', () => {
    const once = applyJsonInstall(null, plan);
    const twice = applyJsonInstall(once, plan);
    expect(twice).toBe(once);
  });

  it('throws on an unparseable existing config rather than clobbering it', () => {
    expect(() => applyJsonInstall('{not json', plan)).toThrow(/not valid JSON/);
  });
});

describe('removeJsonInstall', () => {
  const plan = planAgentInstall('cursor', SPEC, ctx()) as JsonInstallPlan;

  it('removes only the open-design entry', () => {
    const existing = applyJsonInstall(
      JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
      plan,
    );
    const out = JSON.parse(removeJsonInstall(existing, plan)!);
    expect(out.mcpServers).not.toHaveProperty('open-design');
    expect(out.mcpServers.other).toEqual({ command: 'x' });
  });

  it('returns null when there is nothing to remove', () => {
    expect(removeJsonInstall(null, plan)).toBeNull();
    expect(removeJsonInstall('{}', plan)).toBeNull();
    expect(removeJsonInstall(JSON.stringify({ mcpServers: {} }), plan)).toBeNull();
  });
});
