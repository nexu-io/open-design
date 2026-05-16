import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerClaudeCodeRoutes } from '../src/claude-code/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures');

let server: http.Server;
let port: number;

beforeEach(async () => {
  const app = express();
  registerClaudeCodeRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') port = addr.port;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env.OD_CLAUDE_HOME;
});

async function get(pathname: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: res.status, body: await res.json() };
}

describe('GET /api/claude-code/mcp-servers', () => {
  it('returns available=false when home does not exist', async () => {
    process.env.OD_CLAUDE_HOME = path.join(FIXTURES, 'does-not-exist');
    const { status, body } = await get('/api/claude-code/mcp-servers');
    expect(status).toBe(200);
    expect(body).toEqual({ available: false, servers: [] });
  });

  it('sorts user-scope before plugin-scope, alphabetical within', async () => {
    process.env.OD_CLAUDE_HOME = path.join(FIXTURES, 'claude-home-mixed', 'home');
    const { status, body } = await get('/api/claude-code/mcp-servers');
    expect(status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.servers.map((s: any) => `${s.source}:${s.name}`)).toEqual([
      'user:alpha',
      'user:zulu',
      'plugin:beta',
    ]);
  });
});

describe('GET /api/claude-code/skills', () => {
  it('returns available=false when home does not exist', async () => {
    process.env.OD_CLAUDE_HOME = path.join(FIXTURES, 'does-not-exist');
    const { body } = await get('/api/claude-code/skills');
    expect(body).toEqual({ available: false, skills: [] });
  });

  it('sorts user-scope skills before plugin-scope skills', async () => {
    process.env.OD_CLAUDE_HOME = path.join(FIXTURES, 'claude-home-mixed', 'home');
    const { body } = await get('/api/claude-code/skills');
    expect(body.available).toBe(true);
    expect(body.skills.map((s: any) => `${s.source}:${s.id}`)).toEqual([
      'user:zskill',
      'plugin:askill',
    ]);
  });
});
