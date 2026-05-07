import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { readAppConfig, writeAppConfig } from '../src/app-config.js';
import { isLocalSameOrigin } from '../src/server.js';

describe('app-config', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-appconfig-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  describe('readAppConfig', () => {
    it('returns {} when config file does not exist', async () => {
      expect(await readAppConfig(dataDir)).toEqual({});
    });

    it('returns parsed config from existing file', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({ onboardingCompleted: true }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg.onboardingCompleted).toBe(true);
    });

    it('returns {} for corrupted JSON without crashing', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), '{not valid');
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({});
    });

    it('returns {} when file contains a JSON array', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), '[1,2,3]');
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({});
    });

    it('returns {} when file contains a JSON primitive', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), '"hello"');
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({});
    });

    it('filters out unknown keys from stored file', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({ agentId: 'claude', rogue: 'value', __proto: 'x' }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ agentId: 'claude' });
      expect(cfg).not.toHaveProperty('rogue');
      expect(cfg).not.toHaveProperty('__proto');
    });

    it('filters out invalid scalar values from stored file', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          onboardingCompleted: 'yes',
          agentId: 123,
          skillId: { id: 'bad' },
          designSystemId: ['bad'],
        }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({});
    });
  });

  describe('writeAppConfig', () => {
    it('creates data directory if missing', async () => {
      const nested = path.join(dataDir, 'sub', 'dir');
      await writeAppConfig(nested, { onboardingCompleted: true });
      const cfg = await readAppConfig(nested);
      expect(cfg.onboardingCompleted).toBe(true);
    });

    it('only persists ALLOWED_KEYS, filtering unknown keys', async () => {
      await writeAppConfig(dataDir, {
        onboardingCompleted: true,
        unknownKey: 'should be dropped',
        agentId: 'claude',
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ onboardingCompleted: true, agentId: 'claude' });
      expect(cfg).not.toHaveProperty('unknownKey');
    });

    it('does not persist invalid scalar values', async () => {
      await writeAppConfig(dataDir, {
        onboardingCompleted: 'yes',
        agentId: 123,
        skillId: false,
        designSystemId: { id: 'bad' },
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({});
    });

    it('merges with existing config', async () => {
      await writeAppConfig(dataDir, { agentId: 'claude' });
      await writeAppConfig(dataDir, { skillId: 'coder' });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentId).toBe('claude');
      expect(cfg.skillId).toBe('coder');
    });

    it('clears a key when null is sent', async () => {
      await writeAppConfig(dataDir, { agentId: 'claude', skillId: 'coder' });
      await writeAppConfig(dataDir, { agentId: null });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentId).toBeNull();
      expect(cfg.skillId).toBe('coder');
    });

    it('clears agentModels when null is sent', async () => {
      await writeAppConfig(dataDir, {
        agentModels: { a: { model: 'gpt-4' } },
        onboardingCompleted: true,
      });
      expect((await readAppConfig(dataDir)).agentModels).toBeDefined();
      await writeAppConfig(dataDir, { agentModels: null });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentModels).toBeUndefined();
      expect(cfg.onboardingCompleted).toBe(true);
    });

    it('clears agentModels when empty object is sent', async () => {
      await writeAppConfig(dataDir, {
        agentModels: { a: { model: 'gpt-4' } },
      });
      await writeAppConfig(dataDir, { agentModels: {} });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentModels).toBeUndefined();
    });

    it('validates agentModels entries, dropping invalid shapes', async () => {
      await writeAppConfig(dataDir, {
        agentModels: {
          validAgent: { model: 'gpt-4', reasoning: 'fast' },
          invalidAgent: 'not-an-object',
          arrayAgent: [1, 2, 3],
          badKeys: { model: 'ok', extra: 42 },
        },
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentModels).toEqual({
        validAgent: { model: 'gpt-4', reasoning: 'fast' },
      });
    });

    it('drops agentModels entirely when no entries are valid', async () => {
      await writeAppConfig(dataDir, {
        onboardingCompleted: true,
        agentModels: { bad: 'string-value' },
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.onboardingCompleted).toBe(true);
      expect(cfg.agentModels).toBeUndefined();
    });

    it('persists supported per-agent CLI env keys and drops everything else', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: {
            CLAUDE_CONFIG_DIR: '  ~/.claude-2  ',
            ANTHROPIC_API_KEY: 'sk-should-not-persist',
          },
          codex: {
            CODEX_HOME: '~/.codex-alt',
            CODEX_BIN: '~/bin/codex-next',
            OPENAI_API_KEY: 'sk-should-not-persist',
          },
          gemini: {
            GEMINI_API_KEY: 'should-not-persist',
          },
          __proto__: {
            CLAUDE_CONFIG_DIR: 'bad',
          },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        codex: { CODEX_HOME: '~/.codex-alt', CODEX_BIN: '~/bin/codex-next' },
      });
    });

    it('drops agentCliEnv entries that collide with Object.prototype keys', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          toString: {
            CODEX_HOME: '~/.codex-prototype',
          },
          hasOwnProperty: {
            CLAUDE_CONFIG_DIR: '~/.claude-prototype',
          },
          claude: {
            CLAUDE_CONFIG_DIR: '~/.claude-2',
          },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
      });
    });

    it('clears agentCliEnv when null or an empty object is sent', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        },
        onboardingCompleted: true,
      });
      expect((await readAppConfig(dataDir)).agentCliEnv).toBeDefined();

      await writeAppConfig(dataDir, { agentCliEnv: null });
      let cfg = await readAppConfig(dataDir);
      expect(cfg.agentCliEnv).toBeUndefined();
      expect(cfg.onboardingCompleted).toBe(true);

      await writeAppConfig(dataDir, {
        agentCliEnv: {
          codex: { CODEX_HOME: '~/.codex-alt' },
        },
      });
      await writeAppConfig(dataDir, { agentCliEnv: {} });
      cfg = await readAppConfig(dataDir);
      expect(cfg.agentCliEnv).toBeUndefined();
    });

    it('handles corrupted existing file gracefully on write', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), 'CORRUPT');
      await writeAppConfig(dataDir, { agentId: 'test' });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentId).toBe('test');
    });
  });
});

// ---------------------------------------------------------------------------
// HTTP-layer origin guard
// ---------------------------------------------------------------------------

function httpRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port),
        path: parsed.pathname,
        method: opts.method ?? 'GET',
        headers: opts.headers ?? {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

describe('app-config disabled lists', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-disabled-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists disabledSkills as string array', async () => {
    await writeAppConfig(dataDir, { disabledSkills: ['skill-a', 'skill-b'] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toEqual(['skill-a', 'skill-b']);
  });

  it('persists disabledDesignSystems as string array', async () => {
    await writeAppConfig(dataDir, { disabledDesignSystems: ['ds-x'] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledDesignSystems).toEqual(['ds-x']);
  });

  it('drops disabledSkills when not a string array', async () => {
    await writeAppConfig(dataDir, { disabledSkills: 'not-array' } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toBeUndefined();
  });

  it('drops disabledSkills with non-string elements', async () => {
    await writeAppConfig(dataDir, { disabledSkills: [1, 2, 3] } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toBeUndefined();
  });

  it('clears disabledSkills when empty array is sent', async () => {
    await writeAppConfig(dataDir, { disabledSkills: ['a'] });
    await writeAppConfig(dataDir, { disabledSkills: [] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toEqual([]);
  });
});

describe('app-config origin guard', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const app = express();
        app.use(express.json());
        app.get('/api/app-config', (req, res) => {
          if (!isLocalSameOrigin(req, port)) {
            return res
              .status(403)
              .json({ error: 'cross-origin request rejected' });
          }
          res.json({ config: {} });
        });
        app.put('/api/app-config', (req, res) => {
          if (!isLocalSameOrigin(req, port)) {
            return res
              .status(403)
              .json({ error: 'cross-origin request rejected' });
          }
          res.json({ config: req.body });
        });
        server = app.listen(0, '127.0.0.1', () => {
          port = (server.address() as { port: number }).port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      }),
  );

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('allows GET from same-origin (no Origin header)', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect(res.status).toBe(200);
  });

  it('allows PUT from same-origin', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
      },
      body: JSON.stringify({ onboardingCompleted: true }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects GET with cross-origin Origin header', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.com',
      },
    });
    expect(res.status).toBe(403);
  });

  it('rejects PUT with cross-origin Origin header', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.com',
      },
      body: JSON.stringify({ agentId: 'hacked' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects request with wrong Host header', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: { Host: 'evil.com:9999' },
    });
    expect(res.status).toBe(403);
  });

  it('still rejects non-loopback Origin', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.com',
      },
    });
    expect(res.status).toBe(403);
  });
});
