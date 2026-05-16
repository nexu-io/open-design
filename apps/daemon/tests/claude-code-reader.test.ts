import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  detectAvailability,
  readPluginMcpServers,
  readPluginSkills,
  readUserMcpServers,
  readUserSkills,
} from '../src/claude-code/reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures');

describe('detectAvailability', () => {
  it('returns false when the home dir does not exist', () => {
    expect(detectAvailability(path.join(FIXTURES, 'claude-home-does-not-exist'))).toBe(false);
  });

  it('returns true when the home dir exists', () => {
    expect(detectAvailability(path.join(FIXTURES, 'claude-home-empty'))).toBe(true);
  });
});

describe('readUserMcpServers', () => {
  it('parses user-scope MCP servers from <home>/../.claude.json', () => {
    const home = path.join(FIXTURES, 'claude-home-user-mcp', 'home');
    const servers = readUserMcpServers(home);
    expect(servers.map((s) => s.name).sort()).toEqual([
      'filesystem',
      'remote-http',
      'remote-sse',
      'weird',
    ]);

    const filesystem = servers.find((s) => s.name === 'filesystem')!;
    expect(filesystem.source).toBe('user');
    expect(filesystem.transport).toBe('stdio');
    expect(filesystem.command).toBe('node /abs/fs-server.js');
    expect(filesystem.url).toBeUndefined();

    const sse = servers.find((s) => s.name === 'remote-sse')!;
    expect(sse.transport).toBe('sse');
    expect(sse.url).toBe('https://example.com/sse');
    expect(sse.command).toBeUndefined();

    const http = servers.find((s) => s.name === 'remote-http')!;
    expect(http.transport).toBe('http');
    expect(http.url).toBe('https://example.com/http');

    const weird = servers.find((s) => s.name === 'weird')!;
    expect(weird.transport).toBe('unknown');
    expect(weird.command).toBeUndefined();
    expect(weird.url).toBeUndefined();
  });

  it('returns [] when .claude.json is missing', () => {
    const home = path.join(FIXTURES, 'claude-home-empty');
    expect(readUserMcpServers(home)).toEqual([]);
  });

  it('returns [] without throwing when .claude.json is malformed', () => {
    const home = path.join(FIXTURES, 'claude-home-malformed-json', 'home');
    expect(readUserMcpServers(home)).toEqual([]);
  });
});

describe('readPluginMcpServers', () => {
  it('returns servers declared in plugin manifests with plugin attribution', () => {
    const home = path.join(FIXTURES, 'claude-home-plugin-mcp', 'home');
    const servers = readPluginMcpServers(home);
    expect(servers.map((s) => s.name).sort()).toEqual(['github', 'sentry']);

    const gh = servers.find((s) => s.name === 'github')!;
    expect(gh.source).toBe('plugin');
    expect(gh.pluginName).toBe('example-pack');
    expect(gh.pluginVersion).toBe('1.2.3');
    expect(gh.transport).toBe('stdio');
    expect(gh.command).toBe('node /abs/github.js');

    const sentry = servers.find((s) => s.name === 'sentry')!;
    expect(sentry.transport).toBe('sse');
    expect(sentry.url).toBe('https://sentry.example/sse');
  });

  it('returns [] when no plugin cache exists', () => {
    expect(readPluginMcpServers(path.join(FIXTURES, 'claude-home-empty'))).toEqual([]);
  });

  it('skips plugins with malformed manifests without crashing the scan', () => {
    const home = path.join(FIXTURES, 'claude-home-plugin-mcp', 'home');
    const servers = readPluginMcpServers(home);
    expect(servers.every((s) => s.pluginName !== 'broken')).toBe(true);
    expect(servers.some((s) => s.pluginName === 'example-pack')).toBe(true);
  });
});

describe('readUserSkills', () => {
  it('returns skills parsed from ~/.claude/skills/<name>/SKILL.md', () => {
    const home = path.join(FIXTURES, 'claude-home-user-skills', 'home');
    const skills = readUserSkills(home);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain('web-animation-design');

    const wad = skills.find((s) => s.id === 'web-animation-design')!;
    expect(wad.source).toBe('user');
    expect(wad.description).toContain('animations');
    expect(wad.path.endsWith('SKILL.md')).toBe(true);
  });

  it('falls back to directory name when SKILL.md has no frontmatter', () => {
    const home = path.join(FIXTURES, 'claude-home-user-skills', 'home');
    const skills = readUserSkills(home);
    const noFm = skills.find((s) => s.id === 'no-frontmatter');
    expect(noFm).toBeDefined();
    expect(noFm!.description).toBeUndefined();
    expect(noFm!.source).toBe('user');
  });

  it('returns [] when ~/.claude/skills does not exist', () => {
    expect(readUserSkills(path.join(FIXTURES, 'claude-home-empty'))).toEqual([]);
  });
});

describe('readPluginSkills', () => {
  it('finds SKILL.md files under plugin cache and attributes plugin name/version', () => {
    const home = path.join(FIXTURES, 'claude-home-plugin-skills', 'home');
    const skills = readPluginSkills(home);
    const ids = skills.map((s) => s.id).sort();
    expect(ids).toContain('brainstorming');
    expect(ids).toContain('research');

    const b = skills.find((s) => s.id === 'brainstorming')!;
    expect(b.source).toBe('plugin');
    expect(b.pluginName).toBe('skills-pack');
    expect(b.pluginVersion).toBe('2.0.0');
  });

  it('returns [] when no plugin cache exists', () => {
    expect(readPluginSkills(path.join(FIXTURES, 'claude-home-empty'))).toEqual([]);
  });
});
