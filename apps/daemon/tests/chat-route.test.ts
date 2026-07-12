import type http from 'node:http';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  promises as fsp,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bufferedAntigravityGeminiFirstTokenAt,
  composeLiveInstructionPrompt,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveGrantedCodexImagegenOverride,
  resolveCodexGeneratedImagesDir,
  resolveChatExtraAllowedDirs,
  resolveEffectiveDesignSystemSelection,
  resolveResearchCommandContract,
  startServer,
  validateCodexGeneratedImagesDir,
} from '../src/server.js';
import { skillCwdAliasSegment } from '../src/cwd-aliases.js';
import { getAgentDef } from '../src/agents.js';
import { readMemoryConfig, writeMemoryConfig } from '../src/memory.js';
import { upsertMessage } from '../src/db.js';
import { renderCodexImagegenOverride } from '../src/prompts/system.js';

const FAKE_VELA_FIXTURE = resolve(process.cwd(), 'tests', 'fixtures', 'fake-vela.mjs');

function symlinkDir(target: string, link: string): void {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

async function withFakeAgent<T>(
  binName: string,
  script: string,
  run: () => Promise<T>,
): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-chat-route-bin-'));
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(
        join(dir, `${binName}.cmd`),
        `@echo off\r\nnode "${runner}" %*\r\n`,
      );
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
    killProcessesUsingPath(dir);
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function killProcessesUsingPath(pathFragment: string): void {
  if (process.platform === 'win32') return;
  let output = '';
  try {
    output = execFileSync('pgrep', ['-f', pathFragment], { encoding: 'utf8' });
  } catch {
    return;
  }
  for (const line of output.split('\n')) {
    const pid = Number(line.trim());
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
  }
}

describe('/api/chat', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMemoryConfig: Awaited<ReturnType<typeof readMemoryConfig>> | null = null;
  const originalPath = process.env.PATH;
  const originalAgentHome = process.env.OD_AGENT_HOME;
  const tempDirs: string[] = [];

  async function createPluginFixture(args: {
    pluginId: string;
    dirName: string;
    localSkillPath?: string;
  }): Promise<string> {
    const root = await fsp.mkdtemp(join(tmpdir(), 'od-plugin-fixture-'));
    tempDirs.push(root);
    const fixtureDir = resolve(root, args.dirName);
    const baseFixtureDir = resolve(
      process.cwd(),
      'tests',
      'fixtures',
      'plugin-fixtures',
      'sample-plugin',
    );
    await fsp.cp(baseFixtureDir, fixtureDir, { recursive: true });
    const manifestPath = resolve(fixtureDir, 'open-design.json');
    const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8')) as {
      name: string;
      title: string;
      od?: { context?: { skills?: Array<{ ref?: string; path?: string }> } };
    };
    manifest.name = args.pluginId;
    manifest.title = args.pluginId;
    if (args.localSkillPath) {
      manifest.od ??= {};
      manifest.od.context ??= {};
      manifest.od.context.skills = [{ path: args.localSkillPath }];
    }
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return fixtureDir;
  }

  beforeAll(async () => {
    if (process.env.OD_DATA_DIR) {
      originalMemoryConfig = await readMemoryConfig(process.env.OD_DATA_DIR);
      await writeMemoryConfig(process.env.OD_DATA_DIR, {
        enabled: false,
        extraction: null,
      });
    }
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(() => {
    if (originalPath == null) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalAgentHome == null) {
      delete process.env.OD_AGENT_HOME;
    } else {
      process.env.OD_AGENT_HOME = originalAgentHome;
    }
  });

  afterAll(async () => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (process.env.OD_DATA_DIR && originalMemoryConfig) {
      await writeMemoryConfig(process.env.OD_DATA_DIR, {
        enabled: originalMemoryConfig.enabled,
        extraction: originalMemoryConfig.extraction,
      });
    }
  });

  it('does not reference an out-of-scope response while starting a run', async () => {
    process.env.PATH = '';
    const emptyAgentHome = mkdtempSync(join(tmpdir(), 'od-empty-agent-home-'));
    tempDirs.push(emptyAgentHome);
    process.env.OD_AGENT_HOME = emptyAgentHome;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        message: 'hello',
      }),
    });
    const body = await response.text();

    expect(response.ok).toBe(true);
    expect(body).not.toContain('res is not defined');
    expect(body).toContain('AGENT_UNAVAILABLE');
  });

  it('marks json stream runs failed when an error frame exits with code 0', async () => {
    const conversationId = `conv-${randomUUID()}`;

    await withFakeAgent(
      'opencode',
      `
console.log(JSON.stringify({
  type: 'error',
  error: { message: 'model not found: fake-opencode-model' },
}));
process.exit(0);
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            conversationId,
            message: 'hello',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('AGENT_EXECUTION_FAILED');
        expect(body).toContain('model not found: fake-opencode-model');
        expect(body).toContain('"status":"failed"');
        expect(body).not.toContain('"status":"succeeded"');

        const runsResponse = await fetch(
          `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
        );
        const runsBody = (await runsResponse.json()) as {
          runs: Array<{ conversationId: string | null; status: string; exitCode: number | null }>;
        };

        expect(runsBody.runs).toHaveLength(1);
        expect(runsBody.runs[0]).toMatchObject({
          conversationId,
          status: 'failed',
          exitCode: 1,
        });
      },
    );
  });

  it('marks OpenCode tool-only runs failed when no assistant output is produced', async () => {
    const conversationId = `conv-${randomUUID()}`;

    await withFakeAgent(
      'opencode',
      `
console.log(JSON.stringify({ type: 'step_start', sessionID: 'opencode-tool-only-session' }));
console.log(JSON.stringify({
  type: 'tool_use',
  sessionID: 'opencode-tool-only-session',
  part: {
    tool: 'Read',
    callID: 'call-read-1',
    state: {
      status: 'completed',
      input: JSON.stringify({ file: 'src/app.ts' }),
      output: 'file contents',
    },
  },
}));
console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 0 } } }));
process.exit(0);
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            conversationId,
            message: 'read the file and summarize it',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('"type":"tool_use"');
        expect(body).toContain('"type":"tool_result"');
        expect(body).toContain('AGENT_EXECUTION_FAILED');
        expect(body).toContain('Agent completed without producing any output');
        expect(body).toContain('"status":"failed"');
        expect(body).not.toContain('"status":"succeeded"');

        const runsResponse = await fetch(
          `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
        );
        const runsBody = (await runsResponse.json()) as {
          runs: Array<{ conversationId: string | null; status: string; exitCode: number | null }>;
        };

        expect(runsBody.runs).toHaveLength(1);
        expect(runsBody.runs[0]).toMatchObject({
          conversationId,
          status: 'failed',
          exitCode: 0,
        });
      },
    );
  });

  it('passes OPENCODE_CONFIG_CONTENT external_directory rules for the managed project cwd', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for OpenCode cwd permission tests');
    }

    const projectId = `proj-${randomUUID()}`;
    const markerDir = await fsp.mkdtemp(join(tmpdir(), 'od-opencode-config-'));
    tempDirs.push(markerDir);
    const envFile = join(markerDir, 'opencode-config-content.json');
    const cwdFile = join(markerDir, 'cwd.txt');

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'OpenCode cwd permission fixture' }),
    });
    expect(createProjectResponse.ok).toBe(true);

    await withFakeAgent(
      'opencode',
      `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(envFile)}, process.env.OPENCODE_CONFIG_CONTENT || '');
  fs.writeFileSync(${JSON.stringify(cwdFile)}, process.cwd());
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'cwd-permission-ok' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            message: 'hello',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('cwd-permission-ok');

        const effectiveCwd = (await fsp.readFile(cwdFile, 'utf8')).trim();
        const raw = await fsp.readFile(envFile, 'utf8');
        const parsed = JSON.parse(raw) as {
          permission?: {
            external_directory?: Record<string, string>;
          };
        };

        const externalDirectory = parsed.permission?.external_directory ?? {};
        const cwdAliases = new Set([effectiveCwd]);
        if (effectiveCwd.startsWith('/private/var/')) {
          cwdAliases.add(effectiveCwd.replace(/^\/private\/var\//, '/var/'));
        }
        const allowedCwd = [...cwdAliases].find(
          (cwd) =>
            externalDirectory[cwd] === 'allow' &&
            externalDirectory[`${cwd}/*`] === 'allow' &&
            externalDirectory[`${cwd}/**`] === 'allow',
        );
        expect(allowedCwd).toBeTruthy();
      },
    );
  });

  it('passes BYOK provider config to the daemon-backed OpenCode runtime', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for BYOK OpenCode config tests');
    }

    const projectId = `proj-${randomUUID()}`;
    const markerDir = await fsp.mkdtemp(join(tmpdir(), 'od-byok-opencode-config-'));
    tempDirs.push(markerDir);
    const envFile = join(markerDir, 'opencode-config-content.json');
    const keyFile = join(markerDir, 'byok-key.txt');
    const argsFile = join(markerDir, 'args.json');

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'BYOK OpenCode fixture' }),
    });
    expect(createProjectResponse.ok).toBe(true);

    await withFakeAgent(
      'opencode',
      `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(envFile)}, process.env.OPENCODE_CONFIG_CONTENT || '');
  fs.writeFileSync(${JSON.stringify(keyFile)}, process.env.OPEN_DESIGN_BYOK_API_KEY || '');
  fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'byok-opencode-ok' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'byok-opencode',
            projectId,
            message: 'hello',
            model: 'deepseek-v4-flash',
            byokProvider: {
              protocol: 'senseaudio',
              apiKey: 'sk-test-byok',
              baseUrl: 'https://api.senseaudio.cn',
            },
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('byok-opencode-ok');

        expect(await fsp.readFile(keyFile, 'utf8')).toBe('sk-test-byok');
        expect(JSON.parse(await fsp.readFile(argsFile, 'utf8'))).toEqual([
          'run',
          '--format',
          'json',
          '-m',
          'open-design-byok/deepseek-v4-flash',
        ]);
        const parsed = JSON.parse(await fsp.readFile(envFile, 'utf8')) as {
          provider?: Record<string, {
            npm?: string;
            options?: Record<string, unknown>;
            models?: Record<string, unknown>;
          }>;
        };
        const provider = parsed.provider?.['open-design-byok'];
        expect(provider).toMatchObject({
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.senseaudio.cn',
            apiKey: '{env:OPEN_DESIGN_BYOK_API_KEY}',
          },
        });
        expect(provider?.models?.['deepseek-v4-flash']).toEqual({
          name: 'deepseek-v4-flash',
          limit: {
            context: 128_000,
            output: 16_384,
          },
        });
        expect(JSON.stringify(parsed)).not.toContain('sk-test-byok');
      },
    );
  });

  it('passes keyless BYOK provider config without auth fields to OpenCode', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for BYOK OpenCode config tests');
    }

    const projectId = `proj-${randomUUID()}`;
    const markerDir = await fsp.mkdtemp(join(tmpdir(), 'od-byok-opencode-keyless-'));
    tempDirs.push(markerDir);
    const envFile = join(markerDir, 'opencode-config-content.json');
    const keyFile = join(markerDir, 'byok-key.txt');
    const argsFile = join(markerDir, 'args.json');

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'BYOK keyless OpenCode fixture' }),
    });
    expect(createProjectResponse.ok).toBe(true);

    await withFakeAgent(
      'opencode',
      `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(envFile)}, process.env.OPENCODE_CONFIG_CONTENT || '');
  fs.writeFileSync(${JSON.stringify(keyFile)}, process.env.OPEN_DESIGN_BYOK_API_KEY || '');
  fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'byok-opencode-keyless-ok' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'byok-opencode',
            projectId,
            message: 'hello',
            model: 'model',
            byokProvider: {
              protocol: 'openai',
              apiKey: '',
              baseUrl: 'http://127.0.0.1:8000/v1',
              requiresApiKey: false,
            },
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('byok-opencode-keyless-ok');

        expect(await fsp.readFile(keyFile, 'utf8')).toBe('');
        expect(JSON.parse(await fsp.readFile(argsFile, 'utf8'))).toEqual([
          'run',
          '--format',
          'json',
          '-m',
          'open-design-byok/model',
        ]);
        const rawConfig = await fsp.readFile(envFile, 'utf8');
        const parsed = JSON.parse(rawConfig) as {
          provider?: Record<string, {
            npm?: string;
            options?: Record<string, unknown>;
            models?: Record<string, unknown>;
          }>;
        };
        const provider = parsed.provider?.['open-design-byok'];
        expect(provider).toMatchObject({
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'http://127.0.0.1:8000/v1',
          },
        });
        expect(provider?.options).not.toHaveProperty('apiKey');
        expect(rawConfig).not.toContain('OPEN_DESIGN_BYOK_API_KEY');
      },
    );
  });

  it('does not pass forged BYOK provider config to other local runtimes', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for BYOK OpenCode config tests');
    }

    const projectId = `proj-${randomUUID()}`;
    const markerDir = await fsp.mkdtemp(join(tmpdir(), 'od-byok-opencode-isolation-'));
    tempDirs.push(markerDir);
    const envFile = join(markerDir, 'opencode-config-content.json');
    const keyFile = join(markerDir, 'byok-key.txt');

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'BYOK isolation fixture' }),
    });
    expect(createProjectResponse.ok).toBe(true);

    await withFakeAgent(
      'opencode',
      `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(envFile)}, process.env.OPENCODE_CONFIG_CONTENT || '');
  fs.writeFileSync(${JSON.stringify(keyFile)}, process.env.OPEN_DESIGN_BYOK_API_KEY || '');
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'opencode-ok' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            message: 'hello',
            model: 'deepseek-v4-flash',
            byokProvider: {
              protocol: 'senseaudio',
              apiKey: 'sk-test-byok',
              baseUrl: 'https://api.senseaudio.cn',
            },
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('opencode-ok');
        expect(await fsp.readFile(keyFile, 'utf8')).toBe('');
        expect(await fsp.readFile(envFile, 'utf8')).not.toContain('open-design-byok');
        expect(await fsp.readFile(envFile, 'utf8')).not.toContain('sk-test-byok');
      },
    );
  });

  it('strips inherited OpenCode server auth env before spawning the opencode CLI', async () => {
    const inheritedPassword = process.env.OPENCODE_SERVER_PASSWORD;
    process.env.OPENCODE_SERVER_PASSWORD = 'test-parent-server-password';

    const markerDir = await fsp.mkdtemp(join(tmpdir(), 'od-opencode-env-'));
    tempDirs.push(markerDir);
    const envFile = join(markerDir, 'opencode-server-password.txt');

    try {
      await withFakeAgent(
        'opencode',
        `
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(envFile)}, process.env.OPENCODE_SERVER_PASSWORD || '');
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'opencode-env-ok' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
        async () => {
          const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              message: 'hello',
            }),
          });
          const body = await response.text();

          expect(response.ok).toBe(true);
          expect(body).toContain('opencode-env-ok');
          expect(await fsp.readFile(envFile, 'utf8')).toBe('');
        },
      );
    } finally {
      if (inheritedPassword == null) {
        delete process.env.OPENCODE_SERVER_PASSWORD;
      } else {
        process.env.OPENCODE_SERVER_PASSWORD = inheritedPassword;
      }
    }
  });


  it('reuses an existing assistant message row instead of creating a duplicate when assistantMessageId is supplied', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for assistant message reuse tests');
    }
    const projectId = `proj-${randomUUID()}`;
    const assistantMessageId = `assistant-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Assistant row reuse fixture' }),
    });
    expect(createProjectResponse.ok).toBe(true);

    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.ok).toBe(true);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    const dbFile = resolve(process.env.OD_DATA_DIR, 'app.sqlite');
    const sqlite = new Database(dbFile);
    try {
      upsertMessage(sqlite as never, conversationId!, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        runStatus: 'failed',
        startedAt: Date.now() - 1_000,
        endedAt: Date.now() - 500,
      });
    } finally {
      sqlite.close();
    }

    await withFakeAgent(
      'opencode',
      `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'reused-assistant-row-ok' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            assistantMessageId,
            message: 'retry this turn',
          }),
        });
        const body = await response.text();
        expect(response.ok).toBe(true);
        expect(body).toContain('reused-assistant-row-ok');
      },
    );

    const verifyDb = new Database(dbFile, { readonly: true });
    try {
      const rows = verifyDb
        .prepare(`SELECT id, content, run_id FROM messages WHERE conversation_id = ? AND role = 'assistant'`)
        .all(conversationId) as Array<{ id: string; content: string; run_id: string | null }>;
      expect(rows.filter((row) => row.id === assistantMessageId)).toHaveLength(1);
      expect(rows.some((row) => row.id !== assistantMessageId && row.content.includes('reused-assistant-row-ok'))).toBe(false);
      const reused = rows.find((row) => row.id === assistantMessageId);
      expect(reused?.content).toContain('reused-assistant-row-ok');
    } finally {
      verifyDb.close();
    }
  });

  it('does not leave a pinned assistant message queued when legacy chat fails before spawning', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for assistant message pin tests');
    }
    const projectId = `proj-${randomUUID()}`;
    const assistantMessageId = `assistant-failed-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Failed assistant pin fixture' }),
    });
    expect(createProjectResponse.ok).toBe(true);

    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.ok).toBe(true);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        projectId,
        conversationId,
        assistantMessageId,
        message: 'fail before spawn',
      }),
    });
    const body = await response.text();
    expect(response.ok).toBe(true);
    expect(body).toContain('unknown agent');

    const dbFile = resolve(process.env.OD_DATA_DIR, 'app.sqlite');
    let lastStatus: string | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const sqlite = new Database(dbFile, { readonly: true });
      try {
        const row = sqlite
          .prepare(`SELECT run_status FROM messages WHERE id = ?`)
          .get(assistantMessageId) as { run_status: string | null } | undefined;
        lastStatus = row?.run_status ?? null;
        if (lastStatus && lastStatus !== 'queued' && lastStatus !== 'running') break;
      } finally {
        sqlite.close();
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(lastStatus).toBe('failed');
  });

  it('rewrites the OpenCode scanner overflow into a generic retry message', async () => {
    const conversationId = `conv-${randomUUID()}`;

    await withFakeAgent(
      'opencode',
      `
process.stderr.write('json-rpc id 4: opencode event stream: read opencode SSE: bufio.Scanner: token too long\\n');
process.exit(1);
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            conversationId,
            message: 'hello',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('AGENT_EXECUTION_FAILED');
        expect(body).toContain('The run failed due to an unknown upstream streaming error. Please retry.');
        expect(body).toContain('event: stderr');
        expect(body).toContain('"status":"failed"');
      },
    );
  });

  it('survives transient AMR Link catalog failures without aborting the run', async () => {
    // The run preflight resolves the AMR catalog through the shared
    // AmrModelLoadingCache, which degrades to the offline `vela model preset`
    // seed whenever the authoritative `vela model list` is momentarily
    // unavailable (and refreshes the remote catalog in the background). So a
    // transient catalog failure must NOT abort the run — the per-run path no
    // longer blocks on a synchronous `model list` retry loop.
    const previousRuntimeKey = process.env.VELA_RUNTIME_KEY;
    const previousLinkUrl = process.env.VELA_LINK_URL;
    const stateFile = join(tmpdir(), `od-amr-model-retry-${randomUUID()}.json`);
    try {
      // Unique key so the shared model cache key is unique per test run.
      process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
      process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';

      await withFakeAgent(
        'vela',
        `
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const fixture = ${JSON.stringify(FAKE_VELA_FIXTURE)};
const stateFile = ${JSON.stringify(stateFile)};
const args = process.argv.slice(2);
if (args[0] === 'model' && args[1] === 'list') {
  const state = existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : { attempts: 0 };
  state.attempts += 1;
  writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  if (state.attempts < 3) {
    process.stderr.write('Get "https://amr-link.open-design.ai/v1/models": context deadline exceeded\\n');
    process.exit(1);
  }
}
const child = spawn(process.execPath, [fixture, ...args], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
`,
        async () => {
          const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'amr',
              message: 'hello',
              model: 'deepseek-v3.2',
            }),
          });
          const body = await response.text();

          expect(response.ok).toBe(true);
          expect(body).toContain('"type":"text_delta","delta":"Hello from fake "');
          expect(body).toContain('"type":"text_delta","delta":"vela."');
          expect(body).not.toContain('model_catalog_unavailable');
          expect(body).not.toContain('AMR_MODEL_UNAVAILABLE');
          // The catalog probe runs at least once (remote attempted, then the
          // run proceeds from the preset seed). We no longer assert an exact
          // synchronous retry count: the remote retry/backoff now happens in
          // the cache's background refresh, not on the per-run hot path.
          const attempts = JSON.parse(readFileSync(stateFile, 'utf8')) as { attempts: number };
          expect(attempts.attempts).toBeGreaterThanOrEqual(1);
        },
      );
    } finally {
      rmSync(stateFile, { force: true });
      if (previousRuntimeKey == null) delete process.env.VELA_RUNTIME_KEY;
      else process.env.VELA_RUNTIME_KEY = previousRuntimeKey;
      if (previousLinkUrl == null) delete process.env.VELA_LINK_URL;
      else process.env.VELA_LINK_URL = previousLinkUrl;
    }
  });

  it('proceeds with the AMR run via the cached/preset catalog when the live model list is unavailable', async () => {
    // Red spec for the packaged-prerelease "AMR model the selected model is not
    // available from Vela" report: the run preflight used to do a fresh,
    // blocking `vela model list` (authoritative remote catalog) on EVERY run
    // and fail-close the run whenever that single call timed out / errored —
    // even though the user is logged in, the model picker already shows a
    // model (seeded from the offline `vela model preset`), and the selected
    // model is real. Under CorpLink/飞连 the remote call routinely exceeds the
    // 10s timeout, so a logged-in user with a valid model could not run AMR at
    // all. The fix reuses the shared AmrModelLoadingCache (cached remote when
    // hot, otherwise the offline preset seed) instead of a per-run blocking
    // remote probe, so a transient `model list` failure no longer kills the run.
    const previousRuntimeKey = process.env.VELA_RUNTIME_KEY;
    const previousLinkUrl = process.env.VELA_LINK_URL;
    try {
      // A unique runtime key both marks the user as logged-in AND makes the
      // shared model cache key unique so this case never reuses another test's
      // cached remote catalog.
      process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
      process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';

      await withFakeAgent(
        'vela',
        `
const { spawn } = require('node:child_process');
const fixture = ${JSON.stringify(FAKE_VELA_FIXTURE)};
const args = process.argv.slice(2);
// Simulate a persistently unreachable authoritative catalog (gateway
// timeout / 飞连 congestion): every \`vela model list\` fails. \`model preset\`,
// \`login\`, and \`agent run\` still delegate to the fixture, mirroring the real
// CLI where the offline preset and the ACP run do not need the gateway.
if (args[0] === 'model' && args[1] === 'list') {
  process.stderr.write('Get "https://amr-link.open-design.ai/v1/models": context deadline exceeded\\n');
  process.exit(1);
}
const child = spawn(process.execPath, [fixture, ...args], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
`,
        async () => {
          const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'amr',
              message: 'hello',
              // Present in the preset seed (DEFAULT_MODEL_PRESET_JSON) but the
              // live `model list` is unavailable, so only the preset path can
              // surface it.
              model: 'glm-5.1',
            }),
          });
          const body = await response.text();

          expect(response.ok).toBe(true);
          // The run must NOT be fail-closed on the unavailable live catalog.
          expect(body).not.toContain('AMR_MODEL_UNAVAILABLE');
          expect(body).not.toContain('model_catalog_unavailable');
          expect(body).not.toContain('is not available from Vela');
          // It must actually proceed into the ACP run and stream assistant text.
          expect(body).toContain('"type":"text_delta","delta":"Hello from fake "');
          expect(body).toContain('"type":"text_delta","delta":"vela."');
        },
      );
    } finally {
      if (previousRuntimeKey == null) delete process.env.VELA_RUNTIME_KEY;
      else process.env.VELA_RUNTIME_KEY = previousRuntimeKey;
      if (previousLinkUrl == null) delete process.env.VELA_LINK_URL;
      else process.env.VELA_LINK_URL = previousLinkUrl;
    }
  });

  it('allows plugin authoring to succeed when the requested generated-plugin artifacts exist before close', async () => {
    const projectId = `proj-plugin-authoring-success-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin authoring artifact success fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResponse.status).toBe(200);
    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
const fs = require('node:fs');
const path = require('node:path');
process.stdin.resume();
process.stdin.on('end', () => {
  const pluginDir = path.join(process.cwd(), 'generated-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'open-design.json'), JSON.stringify({ name: 'generated-plugin' }, null, 2));
  fs.writeFileSync(path.join(pluginDir, 'SKILL.md'), '# Generated plugin\\n');
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: '我来帮你创建一个通用的 Open Design 插件脚手架。先读取文档规范，再生成插件文件。' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            pluginId: 'od-plugin-authoring',
            message: '请创建一个可刷新、可审计、由 API 驱动的 Open Design 插件脚手架。',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('先读取文档规范，再生成插件文件');
        expect(statusBody.status).toBe('succeeded');

        const filesResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
        expect(filesResponse.status).toBe(200);
        const filesBody = await filesResponse.json() as { files: Array<{ name: string }> };
        expect(filesBody.files.some((file) => file.name === 'generated-plugin/open-design.json')).toBe(true);
        expect(filesBody.files.some((file) => file.name === 'generated-plugin/SKILL.md')).toBe(true);
      },
    );
  });

  it('does not report plugin authoring as succeeded when the agent only emits planning text without artifacts', async () => {
    const projectId = `proj-plugin-authoring-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin authoring completion fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResponse.status).toBe(200);
    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: '我来帮你创建一个通用的 Open Design 插件脚手架。先读取文档规范，再生成插件文件。' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            pluginId: 'od-plugin-authoring',
            message: '请创建一个可刷新、可审计、由 API 驱动的 Open Design 插件脚手架。',
          }),
        });
        expect(createResponse.status).toBe(202);
        const {
          runId,
          pluginId,
          appliedPluginSnapshotId,
        } = await createResponse.json() as {
          runId: string;
          pluginId: string | null;
          appliedPluginSnapshotId: string | null;
        };
        expect(pluginId).toBe('od-plugin-authoring');
        expect(appliedPluginSnapshotId).toBeTruthy();

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('先读取文档规范，再生成插件文件');
        expect(statusBody.status).not.toBe('succeeded');

        const filesResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
        expect(filesResponse.status).toBe(200);
        const filesBody = await filesResponse.json() as { files: Array<{ name: string }> };
        expect(filesBody.files.some((file) => file.name.startsWith('generated-plugin/'))).toBe(false);
      },
    );
  });
  it('does not fail plugin authoring when the turn-1 reply is a clarifying question-form awaiting the brief', async () => {
    // The `od-plugin-authoring` plugin's turn-1 flow is to emit a
    // `<question-form>` collecting the plugin brief, then STOP and wait for
    // the user to answer — artifacts only land on the follow-up turn. The
    // missing-artifacts guard must not treat that expected pause as a
    // failure (regression: "Plugin authoring ended before generating the
    // required generated-plugin artifacts.").
    const projectId = `proj-plugin-authoring-question-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin authoring question-form fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResponse.status).toBe(200);
    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: '先确认几个问题再开始搭建。\\n<question-form id="discovery" title="Plugin brief">\\n{"questions":[{"id":"purpose","label":"What should it do?","type":"text"}]}\\n</question-form>' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            pluginId: 'od-plugin-authoring',
            message: '帮我做个插件。',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('<question-form');
        expect(eventsBody).not.toContain('ended before generating the required generated-plugin artifacts');
        expect(statusBody.status).toBe('succeeded');
      },
    );
  });
  it('does not fail plugin authoring when the clarifying form uses the <ask-question> alias', async () => {
    // `<ask-question>` is the alias the web form parser accepts alongside
    // the canonical `<question-form>` (apps/web/src/artifacts/question-form.ts).
    // Models sometimes drift to it; the UI still renders a valid brief form,
    // so the daemon's missing-artifacts guard must recognize the alias too —
    // otherwise the same "ended before generating…" regression returns for a
    // supported clarification shape.
    const projectId = `proj-plugin-authoring-alias-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin authoring ask-question alias fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResponse.status).toBe(200);
    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: '先确认几个问题再开始搭建。\\n<ask-question id="discovery" title="Plugin brief">\\n{"questions":[{"id":"purpose","label":"What should it do?","type":"text"}]}\\n</ask-question>' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            pluginId: 'od-plugin-authoring',
            message: '帮我做个插件。',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('<ask-question');
        expect(eventsBody).not.toContain('ended before generating the required generated-plugin artifacts');
        expect(statusBody.status).toBe('succeeded');
      },
    );
  });
  it('still fails plugin authoring when a question-form tag wraps a non-renderable (non-JSON) body', async () => {
    // The clarification carve-out must match the web parser's renderable-form
    // contract (JSON body with a `questions` array), not just the opening
    // tag. A `<question-form>` whose body is not valid form JSON renders as
    // raw prose in the UI — no usable brief card — so suppressing the
    // missing-artifacts failure for it would turn a hard failure into a false
    // success. This pins that the guard stays gated on a renderable body.
    const projectId = `proj-plugin-authoring-badform-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin authoring malformed-form fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResponse.status).toBe(200);
    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: '先确认几个问题。\\n<question-form id="discovery">\\nWhat should it do? (free text)\\n</question-form>' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            pluginId: 'od-plugin-authoring',
            message: '帮我做个插件。',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('ended before generating the required generated-plugin artifacts');
        expect(statusBody.status).not.toBe('succeeded');
      },
    );
  });
  it('does not fail plugin authoring when a valid form follows a Unicode preamble that expands under toLowerCase', async () => {
    // The mirrored close-tag scan must stay in the original-string coordinate
    // space. Some code points expand under toLowerCase ("İ" -> "i̇"), so
    // lowercasing the whole buffer before indexing would desync the close-tag
    // offset and corrupt the JSON body slice, failing a valid form. The
    // preamble here contains "İ" before a well-formed form block.
    const projectId = `proj-plugin-authoring-unicode-${randomUUID()}`;

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin authoring unicode-preamble fixture',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProjectResponse.status).toBe(200);
    const conversationsResponse = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversationsResponse.status).toBe(200);
    const conversationsBody = await conversationsResponse.json() as {
      conversations: Array<{ id: string }>;
    };
    const conversationId = conversationsBody.conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'İstanbul brief — 先确认几个问题。\\n<ask-question id="discovery" title="Plugin brief">\\n{"questions":[{"id":"purpose","label":"What should it do?","type":"text"}]}\\n</ask-question>' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            pluginId: 'od-plugin-authoring',
            message: '帮我做个插件。',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`);
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).not.toContain('ended before generating the required generated-plugin artifacts');
        expect(statusBody.status).toBe('succeeded');
      },
    );
  });
  it('closes the # Instructions block with an explicit "do not echo" guard so models do not parrot the prompt back', async () => {
    // claude-opus-4-7 (and a few other instruction-tuned models) start
    // their reply by echoing the # Instructions block verbatim, which
    // shows up to users as the system prompt leading the visible
    // answer. server.ts:9934 closes every Instructions block with a
    // trailing guard line; this test pins the literal so a future
    // refactor cannot silently drop it.
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('Do not quote, restate, or echo the # Instructions block above')
      ? 'has-echo-guard'
      : 'missing-echo-guard',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            message: 'hello',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('has-echo-guard');
        expect(body).not.toContain('missing-echo-guard');
      },
    );
  });

  it('injects @-mention skillIds into the composed system prompt', async () => {
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('## Composed skill — faq-page') ? 'has-composed-skill-header' : 'missing-composed-skill-header',
    prompt.includes('# FAQ Page Skill') ? 'has-faq-skill-body' : 'missing-faq-skill-body',
    prompt.includes('category filtering') ? 'has-faq-skill-content' : 'missing-faq-skill-content',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            message: 'build an faq page',
            skillIds: ['faq-page'],
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('has-composed-skill-header');
        expect(body).toContain('has-faq-skill-body');
        expect(body).toContain('has-faq-skill-content');
        expect(body).not.toContain('missing-composed-skill-header');
        expect(body).not.toContain('missing-faq-skill-body');
        expect(body).not.toContain('missing-faq-skill-content');
      },
    );
  });

  it('stages ad-hoc skill side files into the project cwd', async () => {
    const projectId = `project-${randomUUID()}`;
    const stagedRelativePath = `.od-skills/${skillCwdAliasSegment(resolve(process.cwd(), '..', '..', 'skills', 'release-notes-one-pager'))}/references/checklist.md`;
    const expectedChecklist = await fsp.readFile(
      resolve(process.cwd(), '..', '..', 'skills', 'release-notes-one-pager', 'references', 'checklist.md'),
      'utf8',
    );

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Ad hoc staged skill project',
      }),
    });

    expect(createProjectResponse.ok).toBe(true);

    const fakeAgentScript = `
const fs = require('node:fs');
const stagedChecklist = fs.readFileSync(${JSON.stringify(stagedRelativePath)}, 'utf8');
if (stagedChecklist !== ${JSON.stringify(expectedChecklist)}) {
  console.error('staged-skill-side-files-mismatch');
  process.exit(1);
}
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'staged-skill-side-files-before-spawn' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`;

    await withFakeAgent(
      'opencode',
      fakeAgentScript,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            message: 'draft the release notes',
            skillIds: ['release-notes-one-pager'],
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('staged-skill-side-files-before-spawn');
      },
    );

    const stagedFileResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/raw/${stagedRelativePath}`,
    );
    const stagedFileBody = await stagedFileResponse.text();

    expect(stagedFileResponse.ok).toBe(true);
    expect(stagedFileBody).toBe(expectedChecklist);
  });

  it('stages side files for every composed skill into the project cwd', async () => {
    const projectId = `project-${randomUUID()}`;
    const stagedPaths = [
      `.od-skills/${skillCwdAliasSegment(resolve(process.cwd(), '..', '..', 'skills', 'release-notes-one-pager'))}/references/checklist.md`,
      `.od-skills/${skillCwdAliasSegment(resolve(process.cwd(), '..', '..', 'skills', 'swiss-creative-mode-template'))}/references/checklist.md`,
    ] as const;
    const expectedBodies = await Promise.all(
      [
        resolve(process.cwd(), '..', '..', 'skills', 'release-notes-one-pager', 'references', 'checklist.md'),
        resolve(process.cwd(), '..', '..', 'skills', 'swiss-creative-mode-template', 'references', 'checklist.md'),
      ].map((file) => fsp.readFile(file, 'utf8')),
    );

    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Multi staged skill project',
      }),
    });

    expect(createProjectResponse.ok).toBe(true);

    const fakeAgentScript = `
const fs = require('node:fs');
const stagedBodies = [
  fs.readFileSync(${JSON.stringify(stagedPaths[0])}, 'utf8'),
  fs.readFileSync(${JSON.stringify(stagedPaths[1])}, 'utf8'),
];
const expectedBodies = ${JSON.stringify(expectedBodies)};
if (JSON.stringify(stagedBodies) !== JSON.stringify(expectedBodies)) {
  console.error('multi-staged-skill-side-files-mismatch');
  process.exit(1);
}
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'multi-staged-skill-side-files-before-spawn' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`;

    await withFakeAgent(
      'opencode',
      fakeAgentScript,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            message: 'compose multiple skills',
            skillIds: ['release-notes-one-pager', 'swiss-creative-mode-template'],
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('multi-staged-skill-side-files-before-spawn');
      },
    );
  });

  it('propagates the composed skill mode for ad-hoc-only deck skills', async () => {
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('## Composed skill — open-design-landing-deck') ? 'has-deck-skill-header' : 'missing-deck-skill-header',
    prompt.includes('# Slide deck — fixed framework (this is non-negotiable for deck mode)') ? 'has-deck-framework' : 'missing-deck-framework',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            message: 'build an editorial brand deck',
            skillIds: ['open-design-landing-deck'],
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('has-deck-skill-header');
        expect(body).toContain('has-deck-framework');
        expect(body).not.toContain('missing-deck-skill-header');
        expect(body).not.toContain('missing-deck-framework');
      },
    );
  });

  it('preserves a persisted media skill as the primary surface over a composed deck mention', async () => {
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('# imagegen') ? 'has-base-image-skill-body' : 'missing-base-image-skill-body',
    prompt.includes('## Composed skill — open-design-landing-deck') ? 'has-composed-deck-skill-header' : 'missing-composed-deck-skill-header',
    prompt.includes('## Media generation contract (load-bearing — overrides softer wording above)') ? 'has-image-contract' : 'missing-image-contract',
    prompt.includes('# Slide deck — fixed framework (this is non-negotiable for deck mode)') ? 'unexpected-deck-framework' : 'kept-deck-framework-out',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            message: 'generate an image while also referencing a deck template',
            skillId: 'imagegen',
            skillIds: ['open-design-landing-deck'],
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('has-base-image-skill-body');
        expect(body).toContain('has-composed-deck-skill-header');
        expect(body).toContain('has-image-contract');
        expect(body).toContain('kept-deck-framework-out');
        expect(body).not.toContain('missing-base-image-skill-body');
        expect(body).not.toContain('missing-composed-deck-skill-header');
        expect(body).not.toContain('missing-image-contract');
        expect(body).not.toContain('unexpected-deck-framework');
      },
    );
  });

  it('honors mediaExecution on legacy chat requests', async () => {
    const conversationId = `conv-${randomUUID()}`;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: `missing-agent-${randomUUID()}`,
        conversationId,
        message: 'plan an image without using OD media',
        skillId: 'imagegen',
        mediaExecution: {
          mode: 'disabled',
          allowedSurfaces: ['image'],
        },
      }),
    });
    const body = await response.text();

    expect(response.ok).toBe(true);
    expect(body).toContain('unknown agent');

    const runsResponse = await fetch(
      `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
    );
    const runsBody = await runsResponse.json() as {
      runs: Array<{ mediaExecution?: { mode?: string; allowedSurfaces?: string[] } }>;
    };
    expect(runsBody.runs).toHaveLength(1);
    expect(runsBody.runs[0]?.mediaExecution).toMatchObject({
      mode: 'disabled',
      allowedSurfaces: ['image'],
    });
  });

  it('rejects invalid mediaExecution on legacy chat requests', async () => {
    const conversationId = `conv-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        conversationId,
        message: 'generate an image',
        mediaExecution: { mode: 'provider-router' },
      }),
    });
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain('mediaExecution.mode');

    const runsResponse = await fetch(
      `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
    );
    const runsBody = await runsResponse.json() as { runs: unknown[] };
    expect(runsBody.runs).toEqual([]);
  });

  it('propagates ad-hoc skill critique policy into the chat resolver', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for user skill critique-policy tests');
    }

    const skillId = `critique-opt-out-${randomUUID()}`;
    const skillDir = resolve(process.env.OD_DATA_DIR, 'skills', skillId);
    const originalCritiqueEnabled = process.env.OD_CRITIQUE_ENABLED;

    await fsp.mkdir(skillDir, { recursive: true });
    await fsp.writeFile(
      resolve(skillDir, 'SKILL.md'),
      `---
name: ${skillId}
description: Ad-hoc critique opt-out regression fixture.
od:
  critique:
    policy: opt-out
---

# Critique opt-out fixture

This skill should suppress critique when selected through skillIds.
`,
      'utf8',
    );

    process.env.OD_CRITIQUE_ENABLED = 'true';

    try {
      await withFakeAgent(
        'opencode',
        `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('## Composed skill — ${skillId}') ? 'has-opt-out-skill-header' : 'missing-opt-out-skill-header',
    prompt.includes('<CRITIQUE_RUN') ? 'unexpected-critique-panel' : 'critique-panel-disabled-by-skill-policy',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
        async () => {
          const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              designSystemId: 'default',
              message: 'draft an opt-out skill artifact',
              skillIds: [skillId],
            }),
          });
          const body = await response.text();

          expect(response.ok).toBe(true);
          expect(body).toContain('has-opt-out-skill-header');
          expect(body).toContain('critique-panel-disabled-by-skill-policy');
          expect(body).not.toContain('missing-opt-out-skill-header');
          expect(body).not.toContain('unexpected-critique-panel');
        },
      );
    } finally {
      if (originalCritiqueEnabled == null) {
        delete process.env.OD_CRITIQUE_ENABLED;
      } else {
        process.env.OD_CRITIQUE_ENABLED = originalCritiqueEnabled;
      }
      await fsp.rm(skillDir, { recursive: true, force: true });
    }
  });

  it('preserves plugin-local and composed @-mention skills in plugin-bound runs', async () => {
    const pluginId = `plugin-local-${randomUUID()}`;
    const pluginFixtureDir = await createPluginFixture({
      pluginId,
      dirName: `plugin-local-${randomUUID()}`,
      localSkillPath: './SKILL.md',
    });
    const installResponse = await fetch(`${baseUrl}/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ source: pluginFixtureDir }),
    });
    const installBody = await installResponse.text();

    expect(installResponse.status).toBe(200);
    expect(installBody).toContain(`"id":"${pluginId}"`);

    const projectId = `project-${randomUUID()}`;
    const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Plugin-bound skill composition project',
        pluginId,
        pluginInputs: { topic: 'agentic design' },
      }),
    });
    const createProjectBody = await createProjectResponse.json() as {
      appliedPluginSnapshotId?: string;
    };

    expect(createProjectResponse.ok).toBe(true);
    expect(createProjectBody.appliedPluginSnapshotId).toBeTruthy();

    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('# Sample Plugin') ? 'has-plugin-skill-body' : 'missing-plugin-skill-body',
    prompt.includes('## Composed skill — faq-page') ? 'has-composed-skill-header' : 'missing-composed-skill-header',
    prompt.includes('# FAQ Page Skill') ? 'has-composed-skill-body' : 'missing-composed-skill-body',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const createRunResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            message: 'build a plugin-backed faq page',
            appliedPluginSnapshotId: createProjectBody.appliedPluginSnapshotId,
            skillIds: ['faq-page'],
          }),
        });
        const createRunBody = await createRunResponse.json() as { runId: string };

        expect(createRunResponse.status).toBe(202);

        const eventsResponse = await fetch(`${baseUrl}/api/runs/${createRunBody.runId}/events`);
        const body = await readSseUntil(eventsResponse, 'event: final');

        expect(body).toContain('has-plugin-skill-body');
        expect(body).toContain('has-composed-skill-header');
        expect(body).toContain('has-composed-skill-body');
        expect(body).not.toContain('missing-plugin-skill-body');
        expect(body).not.toContain('missing-composed-skill-header');
        expect(body).not.toContain('missing-composed-skill-body');
      },
    );
  });

  it('stages colliding plugin and composed skill dirs under distinct aliases', async () => {
    if (!process.env.OD_DATA_DIR) {
      throw new Error('OD_DATA_DIR is required for colliding skill-dir staging tests');
    }

    const pluginId = `plugin-collision-${randomUUID()}`;
    const pluginFixtureDir = await createPluginFixture({
      pluginId,
      dirName: 'sample-plugin',
      localSkillPath: './SKILL.md',
    });
    const installResponse = await fetch(`${baseUrl}/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ source: pluginFixtureDir }),
    });
    const installBody = await installResponse.text();

    expect(installResponse.status).toBe(200);
    expect(installBody).toContain(`"id":"${pluginId}"`);

    const projectId = `project-${randomUUID()}`;
    const userSkillDir = resolve(process.env.OD_DATA_DIR, 'skills', 'sample-plugin');
    const userChecklist = 'user-skill-checklist';
    const userAlias = skillCwdAliasSegment(userSkillDir);

    await fsp.mkdir(resolve(userSkillDir, 'references'), { recursive: true });
    await fsp.writeFile(
      resolve(userSkillDir, 'SKILL.md'),
      '# Sample-plugin side-file fixture\n\nRead references/checklist.md before drafting.',
      'utf8',
    );
    await fsp.writeFile(resolve(userSkillDir, 'references', 'checklist.md'), userChecklist, 'utf8');

    try {
      const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Colliding skill-dir project',
          pluginId,
          pluginInputs: { topic: 'agentic design' },
        }),
      });
      const createProjectBody = await createProjectResponse.json() as {
        appliedPluginSnapshotId?: string;
      };
      const installedPluginResponse = await fetch(`${baseUrl}/api/plugins/${pluginId}`);
      const installedPluginBody = await installedPluginResponse.json() as { fsPath: string };
      const pluginAlias = skillCwdAliasSegment(installedPluginBody.fsPath);

      expect(createProjectResponse.ok).toBe(true);
      expect(installedPluginResponse.ok).toBe(true);
      expect(createProjectBody.appliedPluginSnapshotId).toBeTruthy();
      expect(pluginAlias).not.toBe(userAlias);

      await withFakeAgent(
        'opencode',
        `
const fs = require('node:fs');
const pluginSkill = fs.readFileSync(${JSON.stringify(`.od-skills/${pluginAlias}/SKILL.md`)}, 'utf8');
const userChecklist = fs.readFileSync(${JSON.stringify(`.od-skills/${userAlias}/references/checklist.md`)}, 'utf8');
if (!pluginSkill.includes('# Sample Plugin')) {
  console.error('plugin-skill-stage-missing');
  process.exit(1);
}
if (userChecklist !== ${JSON.stringify(userChecklist)}) {
  console.error('colliding-skill-stage-mismatch');
  process.exit(1);
}
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: 'colliding-skill-dirs-staged' } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
        async () => {
          const createRunResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              projectId,
              message: 'use both plugin and user skill side files',
              appliedPluginSnapshotId: createProjectBody.appliedPluginSnapshotId,
              skillIds: ['sample-plugin'],
            }),
          });
          const createRunBody = await createRunResponse.json() as { runId: string };

          expect(createRunResponse.status).toBe(202);

          const eventsResponse = await fetch(`${baseUrl}/api/runs/${createRunBody.runId}/events`);
          const body = await readSseUntil(eventsResponse, 'event: final');

          expect(body).toContain('colliding-skill-dirs-staged');
        },
      );
    } finally {
      await fsp.rm(userSkillDir, { recursive: true, force: true });
    }
  });

  it('canonicalizes aliased skill ids before deduping composed skills', async () => {
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const hasDuplicateComposedAlias = prompt.includes('## Composed skill — open-design-landing');
  const checks = [
    hasDuplicateComposedAlias ? 'duplicate-alias-composed-skill' : 'deduped-alias-composed-skill',
    prompt.includes('# open-design-landing') ? 'has-base-alias-skill-body' : 'missing-base-alias-skill-body',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            message: 'build the Open Design landing page',
            skillId: 'editorial-collage',
            skillIds: ['open-design-landing'],
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('deduped-alias-composed-skill');
        expect(body).toContain('has-base-alias-skill-body');
        expect(body).not.toContain('duplicate-alias-composed-skill');
        expect(body).not.toContain('missing-base-alias-skill-body');
      },
    );
  });

  it('classifies Cursor Agent authentication stderr as a typed run error', async () => {
    await withFakeAgent(
      'cursor-agent',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('auto');
  process.exit(0);
}
console.error("Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.");
process.exit(1);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'cursor-agent',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'AGENT_AUTH_REQUIRED');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('AGENT_AUTH_REQUIRED');
        expect(eventsBody).toContain('cursor-agent login');
        expect(eventsBody).toContain('cursor-agent status');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('classifies Cursor Agent Not logged in stderr as a typed run error', async () => {
    await withFakeAgent(
      'cursor-agent',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('auto');
  process.exit(0);
}
console.error('Not logged in');
process.exit(1);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'cursor-agent',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'AGENT_AUTH_REQUIRED');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('AGENT_AUTH_REQUIRED');
        expect(eventsBody).toContain('cursor-agent login');
        expect(eventsBody).toContain('cursor-agent status');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('classifies Cursor Agent stdout auth text as a typed run error', async () => {
    await withFakeAgent(
      'cursor-agent',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('auto');
  process.exit(0);
}
console.log('ConnectError: [unauthenticated]');
process.exit(1);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'cursor-agent',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'AGENT_AUTH_REQUIRED');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('AGENT_AUTH_REQUIRED');
        expect(eventsBody).toContain('cursor-agent login');
        expect(eventsBody).toContain('cursor-agent status');
        expect(eventsBody).not.toContain('AGENT_EXECUTION_FAILED');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('classifies Cursor Agent stdout error payloads as typed auth failures', async () => {
    const cursorErrorLine = JSON.stringify({
      type: 'error',
      message: 'Error: [unauthenticated] Error',
    });
    await withFakeAgent(
      'cursor-agent',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('2026.05.07-test');
  process.exit(0);
}
if (args[0] === 'models') {
  console.log('auto');
  process.exit(0);
}
console.log(${JSON.stringify(cursorErrorLine)});
process.exit(1);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'cursor-agent',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'AGENT_AUTH_REQUIRED');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('AGENT_AUTH_REQUIRED');
        expect(eventsBody).toContain('cursor-agent login');
        expect(eventsBody).toContain('cursor-agent status');
        expect(eventsBody).not.toContain('AGENT_EXECUTION_FAILED');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('classifies DeepSeek TUI config guidance as typed auth failures', async () => {
    await withFakeAgent(
      'deepseek',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('deepseek 0.3.0-test');
  process.exit(0);
}
console.error('KEY=<your-key> deepseek --api-key <your-key>');
console.error('api_key = "<your-key>" in ~/.deepseek/config.toml');
process.exit(1);
`,
      async () => {
        const deepseek = getAgentDef('deepseek');
        expect(deepseek).toBeDefined();
        const originalBudget = deepseek?.maxPromptArgBytes;
        if (deepseek) deepseek.maxPromptArgBytes = 200_000;
        try {
          const createResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'deepseek',
              message: 'hello',
            }),
          });
          expect(createResponse.status).toBe(202);
          const { runId } = await createResponse.json() as { runId: string };

          const eventsController = new AbortController();
          const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
            signal: eventsController.signal,
          });
          const eventsBody = await readSseUntil(eventsResponse, 'AGENT_AUTH_REQUIRED');
          eventsController.abort();
          const statusBody = await waitForRunStatus(baseUrl, runId);

          expect(eventsBody).toContain('event: error');
          expect(eventsBody).toContain('AGENT_AUTH_REQUIRED');
          expect(eventsBody).toContain('~/.deepseek/config.toml');
          expect(eventsBody).toContain('DEEPSEEK_API_KEY');
          expect(eventsBody).not.toContain('cursor-agent login');
          expect(eventsBody).not.toContain('AGENT_EXECUTION_FAILED');
          expect(statusBody.status).toBe('failed');
        } finally {
          if (deepseek) {
            if (originalBudget === undefined) {
              delete deepseek.maxPromptArgBytes;
            } else {
              deepseek.maxPromptArgBytes = originalBudget;
            }
          }
        }
      },
    );
  });

  it('suppresses Antigravity auth stdout and emits AGENT_AUTH_REQUIRED without an event: stdout delta', async () => {
    await withFakeAgent(
      'agy',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('1.107.0-test');
  process.exit(0);
}
// Simulate agy chat - printing the OAuth prompt and exiting 0
process.stdout.write('Authentication required. Please visit the URL to log in: https://accounts.google.com/o/oauth2/auth?client_id=12345&redirect_uri=antigravity-redirect\\n');
process.stdout.write('Waiting for authentication (timeout 30s)...\\n');
process.stdout.write('Error: authentication timed out.\\n');
process.exit(0);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'antigravity',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'AGENT_AUTH_REQUIRED');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('AGENT_AUTH_REQUIRED');
        expect(eventsBody).not.toContain('event: stdout');
        expect(eventsBody).not.toContain('accounts.google.com');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('parses successful Antigravity Gemini JSONL output instead of forwarding raw stdout', async () => {
    await withFakeAgent(
      'agy',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('1.107.0-test');
  process.exit(0);
}
process.stdout.write(JSON.stringify({ type: 'init', session_id: 'agy-1', model: 'gemini-3.5-flash' }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello from Antigravity.', delta: true }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'result', status: 'success', stats: { input_tokens: 4, output_tokens: 5, cached: 0, duration_ms: 25 } }) + '\\n');
process.exit(0);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'antigravity',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: agent');
        expect(eventsBody).toContain('"type":"text_delta","delta":"Hello from Antigravity."');
        expect(eventsBody).toContain('"type":"usage"');
        expect(eventsBody).not.toContain('event: stdout');
        expect(eventsBody).not.toContain('"role":"assistant"');
        expect(statusBody.status).toBe('succeeded');
      },
    );
  });

  it('forwards Antigravity plain stdout JSONL when it lacks the Gemini init marker', async () => {
    await withFakeAgent(
      'agy',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('1.107.0-test');
  process.exit(0);
}
process.stdout.write(JSON.stringify({ type: 'error', message: 'requested JSONL output' }) + '\\n');
process.exit(0);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'antigravity',
            message: 'return JSONL',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: stdout');
        expect(eventsBody).toContain('requested JSONL output');
        expect(eventsBody).not.toContain('event: error');
        expect(statusBody.status).toBe('succeeded');
      },
    );
  });

  it('fails plain-stream runs when stdout artifact persistence fails', async () => {
    await withFakeAgent(
      'agy',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('1.107.0-test');
  process.exit(0);
}
process.stdout.write('<artifact identifier="blocked" type="text/html" title="Blocked"><!doctype html><html><body>Name to confirm</body></html></artifact>\\n');
process.exit(0);
`,
      async () => {
        const projectId = `plain-artifact-fail-${randomUUID()}`;
        const createProjectResponse = await fetch(`${baseUrl}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: projectId, name: 'Plain artifact failure' }),
        });
        expect(createProjectResponse.ok).toBe(true);

        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'antigravity',
            projectId,
            message: 'emit blocked artifact',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'event: final');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('plain-stream artifact');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('fails Antigravity Gemini JSONL output with no visible assistant content', async () => {
    await withFakeAgent(
      'agy',
      `
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('1.107.0-test');
  process.exit(0);
}
process.stdout.write(JSON.stringify({ type: 'init', session_id: 'agy-1', model: 'gemini-3.5-flash' }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'result', status: 'success', stats: { input_tokens: 4, output_tokens: 0, cached: 0, duration_ms: 25 } }) + '\\n');
process.exit(0);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'antigravity',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'Agent completed without producing any output');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: agent');
        expect(eventsBody).toContain('"type":"usage"');
        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('AGENT_EXECUTION_FAILED');
        expect(eventsBody).not.toContain('event: stdout');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('preserves the first buffered stdout timestamp for Antigravity Gemini assistant text', () => {
    const timestamp = bufferedAntigravityGeminiFirstTokenAt(
      [{
        receivedAt: 1_234,
        text: [
          JSON.stringify({ type: 'init', session_id: 'agy-1', model: 'gemini-3.5-flash' }),
          JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello from Antigravity.', delta: true }),
          JSON.stringify({ type: 'result', status: 'success', stats: { input_tokens: 4, output_tokens: 5 } }),
        ].join('\n'),
      }],
    );

    expect(timestamp).toBe(1_234);
  });

  it('stamps Antigravity Gemini assistant text from the chunk that completes the first assistant message', () => {
    const timestamp = bufferedAntigravityGeminiFirstTokenAt([
      {
        receivedAt: 1_234,
        text: `${JSON.stringify({ type: 'init', session_id: 'agy-1', model: 'gemini-3.5-flash' })}\n`,
      },
      {
        receivedAt: 5_678,
        text: `${JSON.stringify({ type: 'message', role: 'assistant', content: 'Hello from Antigravity.', delta: true })}\n`,
      },
      {
        receivedAt: 9_999,
        text: `${JSON.stringify({ type: 'result', status: 'success', stats: { input_tokens: 4, output_tokens: 5 } })}\n`,
      },
    ]);

    expect(timestamp).toBe(5_678);
  });

  it('does not stamp a first token timestamp for Antigravity Gemini streams without assistant text', () => {
    const timestamp = bufferedAntigravityGeminiFirstTokenAt(
      [{
        receivedAt: 1_234,
        text: [
          JSON.stringify({ type: 'init', session_id: 'agy-1', model: 'gemini-3.5-flash' }),
          JSON.stringify({ type: 'result', status: 'success', stats: { input_tokens: 4, output_tokens: 0 } }),
        ].join('\n'),
      }],
    );

    expect(timestamp).toBeNull();
  });

  it('surfaces Qoder assistant error records through the SSE error channel', async () => {
    const qoderErrorLine = JSON.stringify({
      type: 'assistant',
      message: { content: [] },
      error: { message: 'Qoder authentication expired' },
    });
    await withFakeAgent(
      'qodercli',
      `console.log(${JSON.stringify(qoderErrorLine)});\nprocess.exit(0);\n`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'qoder',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'event: error');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('Qoder authentication expired');
        expect(eventsBody).not.toContain('event: agent\\ndata: {"type":"error"');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('marks reasoning-only stream runs failed when no assistant output is produced', async () => {
    const reasoningLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking: 'I should inspect the project before answering.',
          },
        ],
      },
    });
    const resultLine = JSON.stringify({
      type: 'result',
      is_error: false,
      usage: { input_tokens: 1, output_tokens: 0 },
    });

    await withFakeAgent(
      'qodercli',
      `
console.log(${JSON.stringify(reasoningLine)});
console.log(${JSON.stringify(resultLine)});
process.exit(0);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'qoder',
            message: 'think but do not answer',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(
          eventsResponse,
          'Agent completed without producing any output',
        );
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('"type":"thinking_delta"');
        expect(eventsBody).toContain('AGENT_EXECUTION_FAILED');
        expect(eventsBody).toContain('Agent completed without producing any output');
        expect(eventsBody).not.toContain('"status":"succeeded"');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('fails Qoder runs when the result reports is_error with exit code 0', async () => {
    const qoderResultLine = JSON.stringify({
      type: 'result',
      subtype: 'error',
      duration_ms: 17,
      is_error: true,
      stop_reason: 'tool_use_failed',
      total_cost_usd: 0,
      usage: {
        input_tokens: 3,
        output_tokens: 1,
      },
    });
    await withFakeAgent(
      'qodercli',
      `console.log(${JSON.stringify(qoderResultLine)});\nprocess.exit(0);\n`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'qoder',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'event: error');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: agent');
        expect(eventsBody).toContain('"type":"usage"');
        expect(eventsBody).toContain('"isError":true');
        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('Qoder run failed: tool_use_failed');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('fails stalled json-stream runs after the inactivity timeout elapses', async () => {
    const previous = process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '500';
    try {
      await withFakeAgent(
        'opencode',
        `
console.log(JSON.stringify({ type: 'step_start' }));
process.on('SIGTERM', () => process.exit(143));
setInterval(() => {}, 1000);
`,
        async () => {
          const createResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              message: 'hello',
            }),
          });
          expect(createResponse.status).toBe(202);
          const { runId } = await createResponse.json() as { runId: string };

          const eventsController = new AbortController();
          const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
            signal: eventsController.signal,
          });
          const eventsBody = await readSseUntil(eventsResponse, 'event: error');
          eventsController.abort();
          const statusBody = await waitForRunStatus(baseUrl, runId);

          expect(eventsBody).toContain('event: error');
          expect(eventsBody).toContain('Agent stalled without emitting any new output');
          expect(eventsBody).toContain('Phase details: spawned agent opencode;');
          expect(eventsBody).not.toContain('spawned agent binary');
          expect(eventsBody).toMatch(/stdout arrived: (yes|no)/);
          expect(statusBody.status).toBe('failed');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
      } else {
        process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = previous;
      }
    }
  });

  it('keeps Claude stream runs alive while structured output is still flowing', async () => {
    const previous = process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '3000';
    try {
      await withFakeAgent(
        'claude',
        `
const lines = [
  JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg-1' }, ttft_ms: 10 } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello ' } } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } } }),
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
  JSON.stringify({ type: 'result', usage: { input_tokens: 1, output_tokens: 2 }, duration_ms: 700, stop_reason: 'end_turn' }),
];
let index = 0;
console.log(lines[index++]);
const timer = setInterval(() => {
  if (index >= lines.length) {
    clearInterval(timer);
    process.exit(0);
    return;
  }
  console.log(lines[index++]);
}, 750);
`,
        async () => {
          const createResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'claude',
              message: 'hello',
            }),
          });
          expect(createResponse.status).toBe(202);
          const { runId } = await createResponse.json() as { runId: string };

          const statusBody = await waitForRunStatus(baseUrl, runId);
          expect(statusBody.status).toBe('succeeded');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
      } else {
        process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = previous;
      }
    }
  });

  it('surfaces Claude auth diagnostics through the SSE error channel', async () => {
    await withFakeAgent(
      'claude',
      `
console.error(JSON.stringify({ apiKeySource: 'none', error_status: 401 }));
process.exit(1);
`,
      async () => {
        const createResponse = await fetch(`${baseUrl}/api/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'claude',
            message: 'hello',
          }),
        });
        expect(createResponse.status).toBe(202);
        const { runId } = await createResponse.json() as { runId: string };

        const eventsController = new AbortController();
        const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
          signal: eventsController.signal,
        });
        const eventsBody = await readSseUntil(eventsResponse, 'event: error');
        eventsController.abort();
        const statusBody = await waitForRunStatus(baseUrl, runId);

        expect(eventsBody).toContain('event: error');
        expect(eventsBody).toContain('/login');
        expect(eventsBody).toContain('CLAUDE_CONFIG_DIR');
        expect(statusBody.status).toBe('failed');
      },
    );
  });

  it('caps oversized inactivity overrides so Node does not fire the timer immediately', async () => {
    const previous = process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '10000000000';
    try {
      await withFakeAgent(
        'opencode',
        `
setTimeout(() => {
  console.log(JSON.stringify({ type: 'text', part: { text: 'done' } }));
  process.exit(0);
}, 50);
`,
        async () => {
          const createResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              message: 'hello',
            }),
          });
          expect(createResponse.status).toBe(202);
          const { runId } = await createResponse.json() as { runId: string };

          const statusBody = await waitForRunStatus(baseUrl, runId);
          expect(statusBody.status).toBe('succeeded');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
      } else {
        process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = previous;
      }
    }
  });

  it('marks stalled runs failed even when the child ignores SIGTERM', async () => {
    const previous = process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '500';
    try {
      await withFakeAgent(
        'opencode',
        `
console.log(JSON.stringify({ type: 'step_start' }));
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`,
        async () => {
          const createResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              message: 'hello',
            }),
          });
          expect(createResponse.status).toBe(202);
          const { runId } = await createResponse.json() as { runId: string };

          const eventsController = new AbortController();
          const eventsResponse = await fetch(`${baseUrl}/api/runs/${runId}/events`, {
            signal: eventsController.signal,
          });
          const eventsBody = await readSseUntil(eventsResponse, 'event: error');
          eventsController.abort();
          const statusBody = await waitForRunStatus(baseUrl, runId);

          expect(eventsBody).toContain('Agent stalled without emitting any new output');
          expect(statusBody.status).toBe('failed');
        },
      );
    } finally {
      if (previous == null) {
        delete process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
      } else {
        process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = previous;
      }
    }
  });

  it('marks submitted discovery form answers as the active turn before the transcript', async () => {
    const captureDir = mkdtempSync(join(tmpdir(), 'od-form-answer-prompt-'));
    tempDirs.push(captureDir);
    const capturePath = join(captureDir, 'prompt.txt');
    const previousCapturePath = process.env.OD_CAPTURE_PROMPT_PATH;
    process.env.OD_CAPTURE_PROMPT_PATH = capturePath;
    try {
      await withFakeAgent(
        'opencode',
        `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.OD_CAPTURE_PROMPT_PATH, input, 'utf8');
  console.log(JSON.stringify({ type: 'text', part: { text: 'building now' } }));
});
`,
        async () => {
          const formAnswers = [
            '[form answers — discovery]',
            '- output: Dashboard / tool UI',
            '- brand: Pick a direction for me [value: pick_direction]',
          ].join('\n');
          const transcript = [
            '## user',
            'Design a metrics dashboard.',
            '',
            '## assistant',
            '<question-form id="discovery" title="Quick brief — 30 seconds"></question-form>',
            '',
            '## user',
            formAnswers,
          ].join('\n');

          const createResponse = await fetch(`${baseUrl}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: 'opencode',
              message: transcript,
              currentPrompt: formAnswers,
            }),
          });
          expect(createResponse.status).toBe(202);
          const { runId } = await createResponse.json() as { runId: string };
          const statusBody = await waitForRunStatus(baseUrl, runId);

          expect(statusBody.status).toBe('succeeded');
          expect(existsSync(capturePath)).toBe(true);
          const prompt = readFileSync(capturePath, 'utf8');
          const transitionIdx = prompt.indexOf('## Latest user turn - form answers submitted');
          const transcriptIdx = prompt.indexOf('## Full conversation transcript');
          expect(transitionIdx).toBeGreaterThan(-1);
          expect(transcriptIdx).toBeGreaterThan(transitionIdx);
          expect(prompt).toContain('The user has answered the discovery form. Do not emit another discovery form.');
          expect(prompt).toContain('Continue with RULE 2 / RULE 3 now.');
          expect(prompt).toContain(formAnswers);
        },
      );
    } finally {
      if (previousCapturePath == null) {
        delete process.env.OD_CAPTURE_PROMPT_PATH;
      } else {
        process.env.OD_CAPTURE_PROMPT_PATH = previousCapturePath;
      }
    }
  });

  it('uses a project design system in sandboxed chat runs without an explicit run designSystemId', async () => {
    const projectId = `project-ds-${randomUUID()}`;
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Project DS fixture',
        designSystemId: 'default',
        skipDiscoveryBrief: true,
      }),
    });
    expect(projectResponse.ok).toBe(true);

    const conversationId = `conv-${randomUUID()}`;
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('## Active design system') ? 'has-active-design-system' : 'missing-active-design-system',
    prompt.includes('Treat the following DESIGN.md as authoritative') ? 'has-design-system-contract' : 'missing-design-system-contract',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            message: 'draft a branded artifact',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('has-active-design-system');
        expect(body).toContain('has-design-system-contract');
        expect(body).not.toContain('missing-active-design-system');
        expect(body).not.toContain('missing-design-system-contract');

        const runsResponse = await fetch(
          `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
        );
        const runsBody = await runsResponse.json() as {
          runs: Array<{
            designSystemId: string | null;
            designSystemRequestedId: string | null;
            designSystemSelectionSource: string | null;
            designSystemDigest: string | null;
            promptCache?: { hit: boolean; missReason: string | null };
          }>;
        };
        expect(runsBody.runs).toHaveLength(1);
        expect(runsBody.runs[0]).toMatchObject({
          designSystemId: 'default',
          designSystemRequestedId: 'default',
          designSystemSelectionSource: 'project',
          promptCache: { hit: false, missReason: 'new-session' },
        });
        expect(runsBody.runs[0]?.designSystemDigest).toMatch(/^[a-f0-9]{64}$/);
      },
    );
  });

  it('keeps requested design systems separate from missing injected design systems', async () => {
    const missingDesignSystemId = `missing-ds-${randomUUID()}`;
    const projectId = `project-missing-ds-${randomUUID()}`;
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Missing project DS fixture',
        skipDiscoveryBrief: true,
      }),
    });
    expect(projectResponse.ok).toBe(true);

    const conversationId = `conv-${randomUUID()}`;
    await withFakeAgent(
      'opencode',
      `
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', () => {
  const checks = [
    prompt.includes('## Active design system') ? 'has-active-design-system' : 'missing-active-design-system',
    prompt.includes('Treat the following DESIGN.md as authoritative') ? 'has-design-system-contract' : 'missing-design-system-contract',
  ];
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: checks.join('\\n') } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
});
`,
      async () => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            designSystemId: missingDesignSystemId,
            message: 'draft a branded artifact',
          }),
        });
        const body = await response.text();

        expect(response.ok).toBe(true);
        expect(body).toContain('missing-design-system-contract');
        expect(body).not.toContain('has-design-system-contract');

        const runsResponse = await fetch(
          `${baseUrl}/api/runs?conversationId=${encodeURIComponent(conversationId)}`,
        );
        const runsBody = await runsResponse.json() as {
          runs: Array<{
            designSystemId: string | null;
            designSystemRequestedId: string | null;
            designSystemSelectionSource: string | null;
            designSystemDigest: string | null;
          }>;
        };
        expect(runsBody.runs).toHaveLength(1);
        expect(runsBody.runs[0]).toMatchObject({
          designSystemId: null,
          designSystemRequestedId: missingDesignSystemId,
          designSystemSelectionSource: 'none',
          designSystemDigest: null,
        });
      },
    );
  });
});

describe('daemon run creation during shutdown', () => {
  it('rejects new run creation while shutdown cleanup is still in flight', async () => {
    const previousGrace = process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS;
    process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS = '100';
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
      shutdown: () => Promise<void>;
    };
    try {
      await withFakeAgent(
        'opencode',
        `
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`,
        async () => {
          const activeResponse = await fetch(`${started.url}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'opencode', message: 'hello' }),
          });
          expect(activeResponse.status).toBe(202);
          const { runId } = await activeResponse.json() as { runId: string };
          await waitForRunStatus(started.url, runId, (status) => status === 'running');

          const shutdownPromise = started.shutdown();

          const runResponse = await fetch(`${started.url}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'opencode', message: 'late run' }),
          });
          const chatResponse = await fetch(`${started.url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 'opencode', message: 'late chat' }),
          });

          expect(runResponse.status).toBe(503);
          expect(chatResponse.status).toBe(503);
          await shutdownPromise;
        },
      );
    } finally {
      if (previousGrace == null) {
        delete process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS;
      } else {
        process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS = previousGrace;
      }
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
    }
  });
});

async function readSseUntil(response: Response, marker: string): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let body = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { done, value } = await reader.read();
    if (done) return body;
    body += decoder.decode(value, { stream: true });
    if (body.includes(marker)) return body;
  }
  return body;
}

async function waitForRunStatus(
  baseUrl: string,
  runId: string,
  done: (status: string) => boolean = (status) => status !== 'queued' && status !== 'running',
): Promise<{ status: string }> {
  let lastStatus = 'unknown';
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const statusResponse = await fetch(`${baseUrl}/api/runs/${runId}`);
    const statusBody = await statusResponse.json() as { status: string };
    lastStatus = statusBody.status;
    if (done(statusBody.status)) return statusBody;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`run did not reach expected status; last status: ${lastStatus}`);
}

describe('chat prompt helpers', () => {
  it('appends the validated Codex override after the client system prompt and removes earlier duplicates', () => {
    const override = renderCodexImagegenOverride('codex', {
      kind: 'image',
      imageModel: 'gpt-image-2',
      imageAspect: '1:1',
    });
    const clientMediaContract =
      '## Media generation contract\nclient contract wins unless a later override says otherwise';

    const prompt = composeLiveInstructionPrompt({
      daemonSystemPrompt: `daemon prompt\n${override}`,
      runtimeToolPrompt: 'runtime tools',
      clientSystemPrompt: clientMediaContract,
      finalPromptOverride: override,
    });

    const clientIdx = prompt.indexOf(clientMediaContract);
    const overrideIdx = prompt.indexOf('## Codex built-in imagegen override');
    expect(clientIdx).toBeGreaterThan(-1);
    expect(overrideIdx).toBeGreaterThan(clientIdx);
    expect(prompt.match(/## Codex built-in imagegen override/g)).toHaveLength(1);
  });

  it('omits the Codex final imagegen override when run media policy blocks execution', () => {
    const metadata = {
      kind: 'image',
      imageModel: 'gpt-image-2',
      imageAspect: '1:1',
    };
    const mediaExecution = {
      mode: 'disabled',
      allowedSurfaces: ['image'],
    };
    const generatedImagesDir = resolveCodexGeneratedImagesDir(
      'codex',
      metadata,
      { CODEX_HOME: '/tmp/custom-codex-home' },
      '/home/tester',
      mediaExecution,
    );
    const otherwiseGrantedDir = resolve('/tmp/custom-codex-home/generated_images');
    const override = resolveGrantedCodexImagegenOverride({
      agentId: 'codex',
      metadata,
      codexGeneratedImagesDir: otherwiseGrantedDir,
      extraAllowedDirs: [otherwiseGrantedDir],
      mediaExecution,
    });
    const prompt = composeLiveInstructionPrompt({
      daemonSystemPrompt: 'daemon media policy prompt',
      runtimeToolPrompt: 'runtime tools',
      clientSystemPrompt: 'client instructions',
      finalPromptOverride: override,
    });

    expect(generatedImagesDir).toBeNull();
    expect(override).toBeNull();
    expect(prompt).not.toContain('## Codex built-in imagegen override');
  });

  it('defaults enabled research without an explicit query to the current message', () => {
    const prompt = resolveResearchCommandContract(
      { enabled: true },
      'EV market 2025 trends',
    );

    expect(prompt).toContain('Canonical query for this run:');
    expect(prompt).toContain('EV market 2025 trends');
    expect(prompt).toContain('the first tool action must be the research command');
  });

  it('resolves only the narrow Codex generated_images allowlist for known gpt-image image projects', () => {
    expect(
      resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: '/tmp/custom-codex-home' },
        '/home/tester',
      ),
    ).toBe(resolve('/tmp/custom-codex-home/generated_images'));

    expect(
      resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2-preview' },
        { CODEX_HOME: '/tmp/custom-codex-home' },
        '/home/tester',
      ),
    ).toBeNull();

    expect(
      resolveCodexGeneratedImagesDir(
        'claude',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: '/tmp/custom-codex-home' },
        '/home/tester',
      ),
    ).toBeNull();
  });

  it('rejects a generated_images final-component symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-symlink-'));
    try {
      const codexHome = join(root, 'codex-home');
      const symlinkTarget = join(root, 'actual-generated-images');
      mkdirSync(codexHome, { recursive: true });
      mkdirSync(symlinkTarget, { recursive: true });
      symlinkDir(symlinkTarget, join(codexHome, 'generated_images'));

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: codexHome },
        '/home/tester',
      );

      expect(
        validateCodexGeneratedImagesDir(generatedImagesDir, {
          warn: () => undefined,
        }),
      ).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a generated_images dir whose canonical path is inside a protected root', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-protected-'));
    try {
      const protectedRoot = join(root, 'skills');
      const protectedGeneratedImages = join(protectedRoot, 'generated_images');
      mkdirSync(protectedGeneratedImages, { recursive: true });
      const codexHome = join(root, 'codex-home');
      symlinkDir(protectedRoot, codexHome);

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: codexHome },
        '/home/tester',
      );

      expect(
        validateCodexGeneratedImagesDir(generatedImagesDir, {
          protectedDirs: [protectedRoot],
          warn: () => undefined,
        }),
      ).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves design-system selection precedence for run prompt composition', () => {
    expect(resolveEffectiveDesignSystemSelection({
      requestDesignSystemId: 'request-ds',
      pluginDesignSystemId: 'plugin-ds',
      projectDesignSystemId: 'project-ds',
      appDefaultDesignSystemId: 'default-ds',
    })).toEqual({ id: 'request-ds', source: 'request' });

    expect(resolveEffectiveDesignSystemSelection({
      pluginDesignSystemId: 'plugin-ds',
      projectDesignSystemId: 'project-ds',
      appDefaultDesignSystemId: 'default-ds',
    })).toEqual({ id: 'plugin-ds', source: 'plugin' });

    expect(resolveEffectiveDesignSystemSelection({
      projectDesignSystemId: 'project-ds',
      appDefaultDesignSystemId: 'default-ds',
    })).toEqual({ id: 'project-ds', source: 'project' });

    expect(resolveEffectiveDesignSystemSelection({
      appDefaultDesignSystemId: 'default-ds',
    })).toEqual({ id: 'default-ds', source: 'app-default' });

    expect(resolveEffectiveDesignSystemSelection({
      appDefaultDesignSystemId: 'default-ds',
      allowAppDefault: false,
    })).toEqual({ id: null, source: 'none' });
  });

  it('extracts the primary design-system id from a plugin snapshot', () => {
    expect(designSystemIdFromPluginSnapshot({
      resolvedContext: {
        items: [
          { kind: 'skill', id: 'landing' },
          { kind: 'design-system', id: 'secondary' },
          { kind: 'design-system', id: 'primary', primary: true },
        ],
      },
    })).toBe('primary');

    expect(designSystemIdFromPluginSnapshot({
      resolvedContext: {
        items: [
          { kind: 'design-system', id: 'fallback' },
        ],
      },
    })).toBe('fallback');

    expect(designSystemIdFromPluginSnapshot({ resolvedContext: { items: [] } })).toBeNull();
  });

  it('describes stable prompt cache hits and miss reasons', () => {
    expect(describeStablePromptCache({
      isResuming: false,
      storedStablePromptHash: null,
      currentStableHash: 'hash-a',
    })).toEqual({
      stablePromptHash: 'hash-a',
      hit: false,
      missReason: 'new-session',
    });

    expect(describeStablePromptCache({
      isResuming: true,
      storedStablePromptHash: 'hash-a',
      currentStableHash: 'hash-a',
    })).toEqual({
      stablePromptHash: 'hash-a',
      hit: true,
      missReason: null,
    });

    expect(describeStablePromptCache({
      isResuming: true,
      storedStablePromptHash: 'hash-a',
      currentStableHash: 'hash-b',
    })).toEqual({
      stablePromptHash: 'hash-b',
      hit: false,
      missReason: 'stable-prompt-changed',
    });
  });

  it('grants Codex the canonical validated generated_images dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-canonical-'));
    try {
      const actualCodexHome = join(root, 'actual-codex-home');
      const symlinkCodexHome = join(root, 'codex-home-link');
      mkdirSync(actualCodexHome, { recursive: true });
      symlinkDir(actualCodexHome, symlinkCodexHome);

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        { kind: 'image', imageModel: 'gpt-image-2' },
        { CODEX_HOME: symlinkCodexHome },
        '/home/tester',
      );
      const validatedDir = validateCodexGeneratedImagesDir(
        generatedImagesDir,
        { warn: () => undefined },
      );
      const canonicalGeneratedImagesDir = join(
        realpathSync.native(actualCodexHome),
        'generated_images',
      );
      const extraAllowedDirs = resolveChatExtraAllowedDirs({
        agentId: 'codex',
        skillsDir: '/repo/skills',
        designSystemsDir: '/repo/design-systems',
        linkedDirs: ['/linked/reference'],
        codexGeneratedImagesDir: validatedDir,
        existsSync: () => true,
      });
      const codex = getAgentDef('codex');
      if (!codex) throw new Error('Codex agent definition missing');
      const args = codex.buildArgs('', [], extraAllowedDirs, {}, {
        cwd: '/tmp/od-project',
      });

      expect(generatedImagesDir).not.toBe(canonicalGeneratedImagesDir);
      expect(validatedDir).toBe(canonicalGeneratedImagesDir);
      expect(extraAllowedDirs).toEqual([canonicalGeneratedImagesDir]);
      expect(
        args.filter(
          (arg, index) =>
            arg === '--add-dir' || args[index - 1] === '--add-dir',
        ),
      ).toEqual(['--add-dir', canonicalGeneratedImagesDir]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('limits Codex extra allowed dirs to the generated_images output dir', () => {
    const generatedImagesDir = '/home/tester/.codex/generated_images';
    const dirs = resolveChatExtraAllowedDirs({
      agentId: '  CoDeX  ',
      skillsDir: '/repo/skills',
      designSystemsDir: '/repo/design-systems',
      linkedDirs: ['/linked/reference'],
      codexGeneratedImagesDir: generatedImagesDir,
      existsSync: () => true,
    });

    expect(dirs).toEqual([generatedImagesDir]);

    const codex = getAgentDef('codex');
    if (!codex) throw new Error('Codex agent definition missing');
    const args = codex.buildArgs('', [], dirs, {}, { cwd: '/tmp/od-project' });
    expect(
      args.filter(
        (arg, index) =>
          arg === '--add-dir' || args[index - 1] === '--add-dir',
      ),
    ).toEqual(['--add-dir', generatedImagesDir]);
    expect(args).not.toContain('/repo/skills');
    expect(args).not.toContain('/repo/design-systems');
    expect(args).not.toContain('/linked/reference');
  });

  it('keeps resource and linked dirs for non-Codex agents without the Codex output dir', () => {
    const existingDirs = new Set([
      '/repo/skills',
      '/repo/design-systems',
      '/linked/reference',
      '/home/tester/.codex/generated_images',
    ]);
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'claude',
      skillsDir: '/repo/skills',
      designSystemsDir: '/repo/design-systems',
      linkedDirs: ['/linked/reference'],
      codexGeneratedImagesDir: '/home/tester/.codex/generated_images',
      existsSync: (dir: string) => existingDirs.has(dir),
    });

    expect(dirs).toEqual([
      '/repo/skills',
      '/repo/design-systems',
      '/linked/reference',
    ]);
  });

  it('does not add resource dirs for Codex when imagegen is not whitelisted', () => {
    const dirs = resolveChatExtraAllowedDirs({
      agentId: 'codex',
      skillsDir: '/repo/skills',
      designSystemsDir: '/repo/design-systems',
      linkedDirs: ['/linked/reference'],
      codexGeneratedImagesDir: null,
      existsSync: () => true,
    });

    expect(dirs).toEqual([]);
  });

  it('omits the Codex override when validation fails or the dir is not granted', () => {
    const metadata = { kind: 'image', imageModel: 'gpt-image-2' };
    const root = mkdtempSync(join(tmpdir(), 'od-codex-generated-prompt-'));
    try {
      const codexHome = join(root, 'codex-home');
      const symlinkTarget = join(root, 'actual-generated-images');
      mkdirSync(codexHome, { recursive: true });
      mkdirSync(symlinkTarget, { recursive: true });
      symlinkDir(symlinkTarget, join(codexHome, 'generated_images'));

      const generatedImagesDir = resolveCodexGeneratedImagesDir(
        'codex',
        metadata,
        { CODEX_HOME: codexHome },
        '/home/tester',
      );
      const validatedDir = validateCodexGeneratedImagesDir(
        generatedImagesDir,
        { warn: () => undefined },
      );
      const extraAllowedDirs = resolveChatExtraAllowedDirs({
        agentId: 'codex',
        skillsDir: '/repo/skills',
        designSystemsDir: '/repo/design-systems',
        linkedDirs: ['/linked/reference'],
        codexGeneratedImagesDir: validatedDir,
        existsSync: () => true,
      });
      const validationFailedOverride = resolveGrantedCodexImagegenOverride({
        agentId: 'codex',
        metadata,
        codexGeneratedImagesDir: validatedDir,
        extraAllowedDirs,
      });
      const validationFailedPrompt = composeLiveInstructionPrompt({
        daemonSystemPrompt: 'daemon prompt',
        runtimeToolPrompt: 'runtime tools',
        clientSystemPrompt: 'client media contract',
        finalPromptOverride: validationFailedOverride,
      });

      expect(validatedDir).toBeNull();
      expect(extraAllowedDirs).toEqual([]);
      expect(validationFailedOverride).toBeNull();
      expect(validationFailedPrompt).not.toContain(
        '## Codex built-in imagegen override',
      );

      const validDir = join(root, 'safe-codex-home', 'generated_images');
      mkdirSync(validDir, { recursive: true });
      const notGrantedOverride = resolveGrantedCodexImagegenOverride({
        agentId: 'codex',
        metadata,
        codexGeneratedImagesDir: validDir,
        extraAllowedDirs: [],
      });

      expect(notGrantedOverride).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
