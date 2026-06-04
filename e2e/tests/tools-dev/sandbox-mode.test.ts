// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { startRun, waitForRunStatus } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';

type DaemonStatusResponse = {
  dataDir?: string;
  sandbox?: {
    enabled?: boolean;
    roots?: Record<string, string>;
  };
  sandboxMode?: boolean;
};

type ProjectResponse = {
  conversationId: string;
  project: { id: string };
};

type CapturedOpenCodeRun = {
  argv: string[];
  cwd: string;
  env: Record<string, string | null>;
  hasToolToken: boolean;
  promptLength: number;
};

const CAPTURE_ENV_KEYS = [
  'CODEX_HOME',
  'HOME',
  'OD_AGENT_HOME',
  'OD_DATA_DIR',
  'OD_PROJECT_DIR',
  'OD_PROJECT_ID',
  'OD_SANDBOX_MODE',
  'OPENCODE_CONFIG_CONTENT',
  'OPENCODE_TEST_HOME',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
];

describe('tools-dev sandbox mode smoke', () => {
  test('launches web/daemon with OD_SANDBOX_MODE=1 and a sandboxed agent spawn', async () => {
    const suite = await createSmokeSuite('tools-dev-sandbox-mode');
    const capturePath = join(suite.scratchDir, 'captures', 'opencode-run.json');
    const opencodeBin = await writeFakeOpenCodeBin(
      join(suite.scratchDir, 'fake-opencode'),
    );

    await suite.with.toolsDev(
      async ({ status, webUrl }) => {
        expect(status.namespace).toBe(suite.namespace);

        const daemonStatus = await requestJson<DaemonStatusResponse>(
          webUrl,
          '/api/daemon/status',
        );

        expect(daemonStatus.dataDir).toBe(suite.dataDir);
        expect(daemonStatus.sandboxMode).toBe(true);
        expect(daemonStatus.sandbox?.enabled).toBe(true);
        expect(daemonStatus.sandbox?.roots).toEqual(expect.any(Object));
        for (const root of Object.values(daemonStatus.sandbox?.roots ?? {})) {
          expect(root.startsWith(suite.dataDir)).toBe(true);
        }

        await requestJson(webUrl, '/api/app-config', {
          body: {
            agentCliEnv: { opencode: { OPENCODE_BIN: opencodeBin } },
            agentId: 'opencode',
            agentModels: { opencode: { model: 'default', reasoning: 'default' } },
            designSystemId: null,
            onboardingCompleted: true,
            skillId: null,
            telemetry: { artifactManifest: true, content: false, metrics: false },
          },
          method: 'PUT',
        });
        await requestJson(webUrl, '/api/mcp/servers', {
          body: {
            servers: [
              {
                args: ['persisted.js'],
                command: 'node',
                enabled: true,
                id: 'persisted-mcp',
                label: 'Persisted MCP',
                transport: 'stdio',
              },
            ],
          },
          method: 'PUT',
        });

        const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
          body: {
            designSystemId: null,
            id: randomUUID(),
            metadata: { kind: 'prototype' },
            name: 'Sandbox mode smoke',
            pendingPrompt: null,
            skillId: null,
          },
        });
        const run = await startRun(webUrl, {
          agentId: 'opencode',
          assistantMessageId: `assistant-sandbox-smoke-${Date.now()}`,
          clientRequestId: `sandbox-smoke-${Date.now()}`,
          conversationId: project.conversationId,
          designSystemId: null,
          message: 'Create a deterministic sandbox mode smoke artifact',
          model: 'default',
          projectId: project.project.id,
          reasoning: 'default',
          skillId: null,
          toolBundle: {
            mcpServers: [
              {
                args: ['run-scoped.js'],
                command: 'node',
                enabled: true,
                env: { RUN_SCOPED: '1' },
                id: 'run-scoped-mcp',
                label: 'Run-scoped MCP',
                transport: 'stdio',
              },
            ],
          },
        });

        await waitForRunStatus(webUrl, run.runId, 'succeeded', {
          timeoutMs: 30_000,
        });

        const capture = JSON.parse(
          await readFile(capturePath, 'utf8'),
        ) as CapturedOpenCodeRun;
        const roots = daemonStatus.sandbox?.roots ?? {};
        expect(capture.argv).toEqual(expect.arrayContaining(['run', '--format', 'json']));
        expect(capture.cwd.startsWith(`${suite.dataDir}/projects/`)).toBe(true);
        expect(capture.hasToolToken).toBe(true);
        expect(capture.promptLength).toBeGreaterThan(0);
        expect(capture.env.OD_SANDBOX_MODE).toBe('1');
        expect(capture.env.OD_DATA_DIR).toBe(suite.dataDir);
        expect(capture.env.OD_PROJECT_ID).toBe(project.project.id);
        expectPathUnder(capture.env.OD_AGENT_HOME, roots.agentHomeDir, 'OD_AGENT_HOME');
        expectPathUnder(capture.env.HOME, roots.agentHomeDir, 'HOME');
        expectPathUnder(capture.env.USERPROFILE, roots.agentHomeDir, 'USERPROFILE');
        expectPathUnder(capture.env.CODEX_HOME, roots.agentHomeDir, 'CODEX_HOME');
        expectPathUnder(capture.env.OPENCODE_TEST_HOME, roots.agentHomeDir, 'OPENCODE_TEST_HOME');
        expectPathUnder(capture.env.TMPDIR, roots.tempDir, 'TMPDIR');
        expectPathUnder(capture.env.TEMP, roots.tempDir, 'TEMP');
        expectPathUnder(capture.env.TMP, roots.tempDir, 'TMP');
        expectPathUnder(capture.env.XDG_CONFIG_HOME, roots.configDir, 'XDG_CONFIG_HOME');
        expectPathUnder(capture.env.XDG_CACHE_HOME, roots.cacheDir, 'XDG_CACHE_HOME');
        expectPathUnder(capture.env.XDG_DATA_HOME, roots.configDir, 'XDG_DATA_HOME');
        expectPathUnder(capture.env.XDG_STATE_HOME, roots.configDir, 'XDG_STATE_HOME');

        const opencodeConfig = JSON.parse(
          capture.env.OPENCODE_CONFIG_CONTENT ?? '{}',
        ) as { mcp?: Record<string, unknown> };
        expect(opencodeConfig.mcp).toHaveProperty('run-scoped-mcp');
        expect(opencodeConfig.mcp).not.toHaveProperty('persisted-mcp');

        await suite.report.json('summary.json', {
          capture,
          dataDir: daemonStatus.dataDir,
          namespace: suite.namespace,
          opencodeMcpServerIds: Object.keys(opencodeConfig.mcp ?? {}),
          sandbox: daemonStatus.sandbox,
          sandboxMode: daemonStatus.sandboxMode,
        });
      },
      {
        env: {
          OD_E2E_SANDBOX_CAPTURE_PATH: capturePath,
          OD_SANDBOX_MODE: '1',
        },
      },
    );
  }, 180_000);
});

async function writeFakeOpenCodeBin(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'opencode-sandbox-smoke.cjs');
  await writeFile(bin, renderFakeOpenCodeScript(), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function renderFakeOpenCodeScript(): string {
  return `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');

const args = process.argv.slice(2);
const captureEnvKeys = ${JSON.stringify(CAPTURE_ENV_KEYS)};

if (args.includes('--version')) {
  process.stdout.write('opencode-sandbox-smoke 0.0.0\\n');
  process.exit(0);
}

if (args[0] === 'models') {
  process.stdout.write('fake/default\\n');
  process.exit(0);
}

if (args[0] !== 'run') {
  process.exit(0);
}

let emitted = false;
let prompt = '';
let emitTimer = null;
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  prompt += chunk;
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = setTimeout(() => emitRun(prompt), 25);
});
process.stdin.on('end', () => emitRun(prompt));
setTimeout(() => emitRun(prompt), 500);

function emitRun(promptText) {
  if (emitted) return;
  emitted = true;
  const capturePath = process.env.OD_E2E_SANDBOX_CAPTURE_PATH;
  if (capturePath && process.env.OD_TOOL_TOKEN) {
    const env = {};
    for (const key of captureEnvKeys) {
      env[key] = typeof process.env[key] === 'string' ? process.env[key] : null;
    }
    mkdirSync(dirname(capturePath), { recursive: true });
    writeFileSync(
      capturePath,
      JSON.stringify({
        argv: args,
        cwd: process.cwd(),
        env,
        hasToolToken: Boolean(process.env.OD_TOOL_TOKEN),
        promptLength: promptText.length,
      }, null, 2) + '\\n',
      'utf8',
    );
  }
  const artifact = '<artifact identifier="sandbox-mode-smoke" type="text/html" title="Sandbox Mode Smoke"><!doctype html><html><body><main><h1>Sandbox Mode Smoke</h1></main></body></html></artifact>';
  writeJson({ type: 'step_start', sessionID: 'sandbox-smoke', part: { type: 'step-start' } });
  writeJson({ type: 'text', sessionID: 'sandbox-smoke', part: { type: 'text', text: artifact } });
  writeJson({ type: 'step_finish', sessionID: 'sandbox-smoke', part: { type: 'step-finish', tokens: { input: 1, output: 1 }, cost: 0 } });
  setTimeout(() => process.exit(0), 10);
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value) + '\\n');
}
`;
}

function expectPathUnder(
  actual: string | null | undefined,
  root: string | undefined,
  label: string,
): void {
  expect(root, `${label} root`).toEqual(expect.any(String));
  expect(actual, label).toEqual(expect.any(String));
  const actualPath = actual as string;
  const rootPath = root as string;
  expect(
    actualPath === rootPath || actualPath.startsWith(`${rootPath}/`),
    `${label}=${actualPath} should be under ${rootPath}`,
  ).toBe(true);
}
