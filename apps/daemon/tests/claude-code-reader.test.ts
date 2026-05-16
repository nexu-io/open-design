import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { detectAvailability, readUserMcpServers } from '../src/claude-code/reader.js';

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
