/**
 * Integration coverage for the AMR (vela) ACP runtime def.
 *
 * Spawns the fake vela stub at tests/fixtures/fake-vela.mjs (which speaks
 * just enough ACP JSON-RPC to drive one turn) and verifies the daemon's
 * `attachAcpSession` + `detectAcpModels` can walk through initialize →
 * session/new → session/set_model → session/prompt without hand-stubbing
 * the child stream.
 *
 * The runtime def itself (apps/daemon/src/runtimes/defs/amr.ts) is a pure
 * data record, so this test also pins the contract the def declares:
 *   - id, bin, streamFormat are stable for downstream consumers
 *   - buildArgs() emits the vela invocation shape the docs describe
 *   - AMR authoritative models come from `vela model list --format json`, not stale static ids.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { attachAcpSession, detectAcpModels } from '../src/agent-protocol/index.js';
import { classifyAmrAccountFailure } from '../src/integrations/vela-errors.js';
import { AmrModelLoadingCache } from '../src/runtimes/amr-model-cache.js';
import {
  amrAgentDef,
  fetchVelaPresetModels,
  normalizeVelaModelId,
  parseVelaModelJson,
  parseVelaModels,
} from '../src/runtimes/defs/amr.js';
import { getAgentDef } from '../src/runtimes/registry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_VELA = path.join(HERE, 'fixtures', 'fake-vela.mjs');

function spawnFakeVela(env: NodeJS.ProcessEnv = {}): ChildProcess {
  return spawn(process.execPath, [FAKE_VELA], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function spawnFixtureScript(source: string): ChildProcess {
  return spawn(process.execPath, ['-e', source], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
}

function spawnAcpUpdateFixture(updates: unknown[], usage: unknown = {}): ChildProcess {
  return spawnFixtureScript(`
    const updates = ${JSON.stringify(updates)};
    const usage = ${JSON.stringify(usage)};
    function write(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }
    process.stdin.setEncoding('utf8');
    let buffer = '';
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          write({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } });
        } else if (msg.method === 'session/new') {
          write({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1', models: { currentModelId: null, availableModels: [] } } });
        } else if (msg.method === 'session/set_model' || msg.method === 'session/set_config_option') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} });
        } else if (msg.method === 'session/prompt') {
          for (const update of updates) {
            write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's1', update } });
          }
          write({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn', usage } });
        } else if (msg.method === 'session/cancel') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} });
        }
      }
    });
    process.stdin.on('end', () => process.exit(0));
  `);
}

function spawnAcpStderrRetryFixture(stderrChunks: string | string[]): ChildProcess {
  return spawnFixtureScript(`
    const stderrChunks = ${JSON.stringify(
      typeof stderrChunks === 'string' ? [stderrChunks] : stderrChunks,
    )};
    function write(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }
    process.stdin.setEncoding('utf8');
    let buffer = '';
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          write({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } });
        } else if (msg.method === 'session/new') {
          write({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1', models: { currentModelId: null, availableModels: [] } } });
        } else if (msg.method === 'session/set_model' || msg.method === 'session/set_config_option') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} });
        } else if (msg.method === 'session/prompt') {
          stderrChunks.forEach((stderrChunk, index) => {
            setTimeout(() => {
              process.stderr.write(stderrChunk);
              if (index === stderrChunks.length - 1) {
                process.stderr.write('\\n');
                setTimeout(() => process.exit(0), 25);
              }
            }, index * 5);
          });
        } else if (msg.method === 'session/cancel') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} });
        }
      }
    });
    process.stdin.on('end', () => process.exit(0));
  `);
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('close', () => resolve());
    child.once('exit', () => resolve());
  });
}

describe('AMR runtime def', () => {
  it('is registered with the expected ACP wiring', () => {
    const def = getAgentDef('amr');
    expect(def).toBeTruthy();
    expect(def?.id).toBe('amr');
    expect(def?.name).toBe('AMR');
    expect(def?.bin).toBe('vela');
    expect(def?.streamFormat).toBe('acp-json-rpc');
  });

  it('builds the documented `vela agent run --runtime opencode` argv', () => {
    expect(amrAgentDef.buildArgs()).toEqual([
      'agent',
      'run',
      '--runtime',
      'opencode',
    ]);
  });

  it('fails closed instead of exposing static stale fallback models', () => {
    // Real vela rejects session/prompt without a prior session/set_model,
    // and attachAcpSession skips set_model whenever model === 'default'.
    // AMR must rely on the live `vela models` catalog so stale defaults like
    // gpt-5.4-mini cannot be offered after link stops accepting them.
    const ids = amrAgentDef.fallbackModels.map((m) => m.id);
    expect(ids).not.toContain('default');
    expect(ids).not.toContain('gpt-5.4-mini');
    expect(ids).toEqual([]);
  });

  it('normalizes Vela public model ids to link-canonical ACP model ids', () => {
    expect(normalizeVelaModelId('public_model_deepseek_v3_2')).toBe('deepseek-v3.2');
    expect(normalizeVelaModelId('public_model_kimi_k2_6')).toBe('kimi-k2.6');
    expect(normalizeVelaModelId('public_model_kimi_k2_7_code')).toBe('kimi-k2.7-code');
    expect(normalizeVelaModelId('public_model_gemini_2_5_flash')).toBe('gemini-2.5-flash');
    expect(normalizeVelaModelId('public_model_gemini_3_1_flash_lite_preview')).toBe(
      'gemini-3.1-flash-lite-preview',
    );
    expect(normalizeVelaModelId('public_model_gemini_3_1_pro_preview')).toBe(
      'gemini-3.1-pro-preview',
    );
    expect(normalizeVelaModelId('public_model_claude_haiku_4_5')).toBe('claude-haiku-4.5');
    expect(normalizeVelaModelId('public_model_claude_opus_4_6')).toBe('claude-opus-4.6');
    expect(normalizeVelaModelId('vela/claude-sonnet-4-7')).toBe('claude-sonnet-4.7');
    expect(normalizeVelaModelId('public_model_gpt_5_4')).toBe('gpt-5.4');
    expect(normalizeVelaModelId('public_model_gpt_5_4_mini')).toBe('gpt-5.4-mini');
    expect(normalizeVelaModelId('public_model_minimax_m2_7')).toBe('minimax-m2.7');
    expect(normalizeVelaModelId('public_model_glm_5_1')).toBe('glm-5.1');
    expect(normalizeVelaModelId('public_model_glm_5')).toBe('glm-5');
    expect(normalizeVelaModelId('public_model_qwen3_235b_a22b')).toBe('qwen3-235b-a22b');
    expect(normalizeVelaModelId('deepseek-v3.2')).toBe('deepseek-v3.2');
    expect(normalizeVelaModelId('vela/deepseek-v3.2')).toBe('deepseek-v3.2');
    expect(normalizeVelaModelId('deepseek-v3-2')).toBe('deepseek-v3.2');
    expect(normalizeVelaModelId('vela/deepseek-v3-2')).toBe('deepseek-v3.2');
  });

  it('parses `vela models` output with fast chat defaults and plain canonical labels', () => {
    const models = parseVelaModels([
      'public_model_claude_opus_4_6  vela',
      'public_model_deepseek_v3_2    vela',
      'public_model_deepseek_v4_flash    vela',
      'public_model_glm_5_1          vela',
      'public_model_claude_opus_4_6  vela',
      'public_model_gpt_image_2      vela',
      'vela/kimi-k2.6                vela',
      'public_model_seedance_2       vela',
      'public_model_deepseek_v3_2    vela',
      '',
    ].join('\n'));
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'claude-opus-4.6', label: 'claude-opus-4.6' },
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'kimi-k2.6', label: 'kimi-k2.6' },
    ]);
    expect(models.every((model) => !model.label.includes('vela/'))).toBe(true);
    expect(models.map((model) => model.id)).not.toContain('gpt-image-2');
    expect(models.map((model) => model.id)).not.toContain('seedance-2');
  });

  it('parses Vela JSON catalog ids through normalizeVelaModelId on the live AMR path', () => {
    const models = parseVelaModelJson(JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_kimi_k2_7_code', enabled: false },
        { id: 'public_model_deepseek_v3_2' },
        {
          id: 'deepseek-v4-flash',
          enabled: true,
          default: true,
          cost: { input: 0.14, output: 0.28 },
        },
        { id: 'gpt-image-2' },
        { id: 'deepseek-v4-flash' },
      ],
    }), 'remote');
    expect(models).toEqual([
      {
        id: 'deepseek-v4-flash',
        label: 'deepseek-v4-flash',
        enabled: true,
        default: true,
        inputPriceUsdPerMillion: 0.14,
        outputPriceUsdPerMillion: 0.28,
      },
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'kimi-k2.7-code', label: 'kimi-k2.7-code', enabled: false },
    ]);
    expect(models.map((m) => m.id)).not.toContain('gpt-image-2');
    expect(models.map((m) => m.id)).not.toContain('public_model_kimi_k2_7_code');
    expect(() => parseVelaModelJson(JSON.stringify({ source: 'preset', data: [] }), 'remote'))
      .toThrow(/expected remote/);
  });

  it('enriches Vela models from the AMR OpenCode model-price cache', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'od-amr-model-prices-'));
    try {
      const cacheDir = path.join(tempDir, 'opencode');
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        path.join(cacheDir, 'models.json'),
        JSON.stringify({
          opencode: {
            models: {
              'claude-fable-5': {
                id: 'claude-fable-5',
                cost: { input: 10, output: 50 },
              },
              'claude-opus-4-6': {
                id: 'claude-opus-4-6',
                cost: { input: 5, output: 25 },
              },
            },
          },
          'opencode-go': {
            models: {
              'mimo-v2.5-pro': {
                id: 'mimo-v2.5-pro',
                cost: { input: 1.74, output: 3.48 },
              },
            },
          },
          openrouter: {
            models: {
              'google/gemini-3-flash-preview': {
                id: 'google/gemini-3-flash-preview',
                cost: { input: 0.5, output: 3 },
              },
            },
          },
        }),
        'utf8',
      );
      const models = await amrAgentDef.fetchModels?.(FAKE_VELA, {
        ...process.env,
        OPENCODE_TEST_HOME: tempDir,
        FAKE_VELA_MODEL_LIST_JSON: JSON.stringify({
          source: 'remote',
          data: [
            { id: 'claude-fable-5' },
            { id: 'claude-opus-4.6' },
            { id: 'mimo-v2.5-pro' },
            { id: 'gemini-3-flash-preview' },
          ],
        }),
      });

      expect(models).toEqual([
        {
          id: 'claude-fable-5',
          label: 'claude-fable-5',
          inputPriceUsdPerMillion: 10,
          outputPriceUsdPerMillion: 50,
        },
        {
          id: 'claude-opus-4.6',
          label: 'claude-opus-4.6',
          inputPriceUsdPerMillion: 5,
          outputPriceUsdPerMillion: 25,
        },
        {
          id: 'gemini-3-flash-preview',
          label: 'gemini-3-flash-preview',
          inputPriceUsdPerMillion: 0.5,
          outputPriceUsdPerMillion: 3,
        },
        {
          id: 'mimo-v2.5-pro',
          label: 'mimo-v2.5-pro',
          inputPriceUsdPerMillion: 1.74,
          outputPriceUsdPerMillion: 3.48,
        },
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fetches AMR preset models from `vela model preset --format json`', async () => {
    const models = await fetchVelaPresetModels(FAKE_VELA, process.env);
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { id: 'glm-5.1', label: 'glm-5.1' },
    ]);
  });

  it('fetches AMR authoritative models from `vela model list --format json`', async () => {
    const models = await amrAgentDef.fetchModels?.(FAKE_VELA, process.env);
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { id: 'gemini-3.1-flash-lite-preview', label: 'gemini-3.1-flash-lite-preview' },
      { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview' },
      { id: 'glm-5', label: 'glm-5' },
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'gpt-5.4', label: 'gpt-5.4' },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'kimi-k2.6', label: 'kimi-k2.6' },
      { id: 'minimax-m2.7', label: 'minimax-m2.7' },
      { id: 'qwen3-235b-a22b', label: 'qwen3-235b-a22b' },
    ]);
  });

  it('regression #4410: normalizes kimi_k2_7_code from live catalog and routes it via session/set_model', async () => {
    const rawListJson = JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_kimi_k2_7_code' },
        { id: 'deepseek-v4-flash' },
      ],
    });

    // Step 1: live catalog path normalizes the raw id to the canonical form.
    const models = await amrAgentDef.fetchModels?.(FAKE_VELA, {
      ...process.env,
      FAKE_VELA_MODEL_LIST_JSON: rawListJson,
    });
    const ids = (models ?? []).map((m) => m.id);
    expect(ids).toContain('kimi-k2.7-code');
    expect(ids).not.toContain('public_model_kimi_k2_7_code');
    expect(ids).not.toContain('kimi-k2-7-code');

    // Step 2: the normalized id survives the full ACP session/set_model flow.
    const child = spawnFakeVela({
      FAKE_VELA_TEXT: 'K2.7 response.',
      FAKE_VELA_MODEL_LIST_JSON: rawListJson,
    });
    const events: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Hello',
        cwd: process.cwd(),
        model: 'kimi-k2.7-code',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => events.push({ event, payload }),
      });
      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const textDeltas = events
      .filter((e) => e.event === 'agent' && (e.payload as { type?: unknown }).type === 'text_delta')
      .map((e) => (e.payload as { delta?: unknown }).delta);
    expect(textDeltas.join('')).toBe('K2.7 response.');
  });

  it('retries transient `vela model list --format json` failures before succeeding', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'od-amr-retry-'));
    const stateFile = path.join(tempDir, 'retry-state.json');
    const wrapperPath = path.join(tempDir, 'vela-wrapper');
    const wrapperSource = `#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const stateFile = process.env.RETRY_STATE_FILE;
const fakeVela = process.env.FAKE_VELA_PATH;
const args = process.argv.slice(2);
if (args[0] === 'model' && args[1] === 'list') {
  const state = stateFile && existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : { attempts: 0 };
  state.attempts += 1;
  if (stateFile) writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  if (state.attempts < 3) {
    process.stderr.write('Get "https://amr-link.open-design.ai/v1/models": context deadline exceeded\\n');
    process.exit(1);
  }
}
const child = spawn(process.execPath, [fakeVela, ...args], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += String(chunk); });
child.stderr.on('data', (chunk) => { stderr += String(chunk); });
child.on('exit', (code) => {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(code ?? 0);
});
`;
    writeFileSync(wrapperPath, wrapperSource, 'utf8');
    chmodSync(wrapperPath, 0o755);
    try {
      const models = await amrAgentDef.fetchModels?.(
        wrapperPath,
        {
          ...process.env,
          FAKE_VELA_PATH: FAKE_VELA,
          RETRY_STATE_FILE: stateFile,
        },
      );
      expect(models?.[0]?.id).toBe('deepseek-v4-flash');
      expect(existsSync(stateFile)).toBe(true);
      const attempts = JSON.parse(readFileSync(stateFile, 'utf8')) as { attempts: number };
      expect(attempts.attempts).toBe(3);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not retry credential failures from `vela model list --format json`', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'od-amr-invalid-key-'));
    const stateFile = path.join(tempDir, 'invalid-key-state.json');
    const wrapperPath = path.join(tempDir, 'vela-wrapper');
    const wrapperSource = `#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const stateFile = process.env.RETRY_STATE_FILE;
const args = process.argv.slice(2);
if (args[0] === 'model' && args[1] === 'list') {
  const state = stateFile && existsSync(stateFile)
    ? JSON.parse(readFileSync(stateFile, 'utf8'))
    : { attempts: 0 };
  state.attempts += 1;
  if (stateFile) writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  process.stderr.write('Error: list Link models: API request failed with status 401: invalid_api_key\\n');
  process.exit(1);
}
process.stderr.write('unexpected argv: ' + args.join(' ') + '\\n');
process.exit(2);
`;
    writeFileSync(wrapperPath, wrapperSource, 'utf8');
    chmodSync(wrapperPath, 0o755);
    try {
      await expect(amrAgentDef.fetchModels?.(
        wrapperPath,
        {
          ...process.env,
          RETRY_STATE_FILE: stateFile,
        },
      )).rejects.toThrow(/invalid_api_key/);
      expect(existsSync(stateFile)).toBe(true);
      const attempts = JSON.parse(readFileSync(stateFile, 'utf8')) as { attempts: number };
      expect(attempts.attempts).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('AMR model loading cache', () => {
  it('returns preset immediately, coalesces remote refreshes, then serves remote', async () => {
    const cache = new AmrModelLoadingCache(1_000);
    let remoteCalls = 0;
    const releaseRemote: Array<() => void> = [];
    const fetchRemote = async () => {
      remoteCalls += 1;
      await new Promise<void>((resolve) => {
        releaseRemote.push(resolve);
      });
      return [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }];
    };

    const first = await cache.get('vela:local', {
      fetchPreset: async () => [{ id: 'preset-a', label: 'preset-a' }],
      fetchRemote,
    });
    const second = await cache.get('vela:local', {
      fetchPreset: async () => [{ id: 'preset-b', label: 'preset-b' }],
      fetchRemote,
    });
    expect(first).toMatchObject({ source: 'preset', refreshing: true });
    expect(second).toMatchObject({ source: 'preset', refreshing: true });
    expect(remoteCalls).toBe(1);

    releaseRemote[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const remote = await cache.get('vela:local', {
      fetchPreset: async () => {
        throw new Error('preset should not be required after remote cache exists');
      },
      fetchRemote,
    });
    expect(remote).toMatchObject({
      source: 'remote',
      refreshing: false,
      models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
    });
  });

  it('keeps stale remote rows when a later refresh fails', async () => {
    const cache = new AmrModelLoadingCache(0);
    cache.warm('vela:local', async () => [{ id: 'deepseek-v3.2', label: 'deepseek-v3.2' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stale = await cache.get('vela:local', {
      fetchPreset: async () => [{ id: 'preset-a', label: 'preset-a' }],
      fetchRemote: async () => {
        throw new Error('remote unavailable');
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterFailure = await cache.get('vela:local', {
      fetchPreset: async () => [{ id: 'preset-a', label: 'preset-a' }],
      fetchRemote: async () => {
        throw new Error('remote unavailable');
      },
    });
    expect(stale.source).toBe('remote');
    expect(afterFailure).toMatchObject({
      source: 'remote',
      stale: true,
      remoteError: 'remote unavailable',
      models: [{ id: 'deepseek-v3.2', label: 'deepseek-v3.2' }],
    });
  });

  it('surfaces stale remote auth failures without dropping the last usable model list', async () => {
    const cache = new AmrModelLoadingCache(0);
    cache.warm('vela:prod', async () => [{ id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stale = await cache.get('vela:prod', {
      fetchPreset: async () => [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
      fetchRemote: async () => {
        throw new Error('API request failed with status 401: invalid_api_key');
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterFailure = await cache.get('vela:prod', {
      fetchPreset: async () => [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
      fetchRemote: async () => {
        throw new Error('API request failed with status 401: invalid_api_key');
      },
    });

    expect(stale.models).toEqual([
      { id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    ]);
    expect(afterFailure).toMatchObject({
      source: 'remote',
      stale: true,
      remoteError: 'API request failed with status 401: invalid_api_key',
      models: [{ id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' }],
    });
  });

  it('keeps remote catalogs isolated per resolved Vela environment', async () => {
    const cache = new AmrModelLoadingCache(60_000);
    cache.warm('vela:local', async () => [{ id: 'remote-local', label: 'remote-local' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const otherEnv = await cache.get('vela:prod', {
      fetchPreset: async () => [{ id: 'preset-prod', label: 'preset-prod' }],
      fetchRemote: async () => [{ id: 'remote-prod', label: 'remote-prod' }],
    });

    expect(otherEnv).toMatchObject({
      source: 'preset',
      models: [{ id: 'preset-prod', label: 'preset-prod' }],
      refreshing: true,
    });
  });

  it('drops a cached remote catalog for a single environment when invalidated', async () => {
    const cache = new AmrModelLoadingCache(60_000);
    cache.warm('vela:local', async () => [{ id: 'locked-old', label: 'locked-old', enabled: false }]);
    cache.warm('vela:prod', async () => [{ id: 'remote-prod', label: 'remote-prod' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    cache.invalidate('vela:local');

    const local = await cache.get('vela:local', {
      fetchPreset: async () => [{ id: 'preset-local', label: 'preset-local' }],
      fetchRemote: async () => [{ id: 'remote-local-new', label: 'remote-local-new', enabled: true }],
    });
    const prod = await cache.get('vela:prod', {
      fetchPreset: async () => {
        throw new Error('prod preset should not be required');
      },
      fetchRemote: async () => [{ id: 'remote-prod-new', label: 'remote-prod-new' }],
    });

    expect(local).toMatchObject({
      source: 'preset',
      models: [{ id: 'preset-local', label: 'preset-local' }],
      refreshing: true,
    });
    expect(prod).toMatchObject({
      source: 'remote',
      models: [{ id: 'remote-prod', label: 'remote-prod' }],
    });
  });
});

describe('AMR ACP transport — end-to-end against fake vela stub', () => {
  it('drives a complete turn: initialize → session/new → session/set_model → session/prompt', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_TEXT: 'Hello from AMR.',
      FAKE_VELA_THOUGHT: 'thinking-chunk',
    });
    const events: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        // Pass a real model id so attachAcpSession sends session/set_model
        // before session/prompt, matching the real vela contract the AMR
        // runtime def encodes.
        model: 'deepseek-v3.2',
        mcpServers: [],
        send: (event, payload) => {
          events.push({ event, payload });
        },
      });

      // attachAcpSession owns the stdin lifecycle: it sends initialize on
      // construction and ends stdin after session/prompt completes. We just
      // wait for the child to exit on its own.
      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const textDeltas = events
      .filter((e) => {
        const payload = e.payload as { type?: unknown };
        return e.event === 'agent' && payload.type === 'text_delta';
      })
      .map((e) => (e.payload as { delta?: unknown }).delta);

    expect(textDeltas.join('')).toBe('Hello from AMR.');

    const thinkingDeltas = events
      .filter((e) => {
        const payload = e.payload as { type?: unknown };
        return e.event === 'agent' && payload.type === 'thinking_delta';
      })
      .map((e) => (e.payload as { delta?: unknown }).delta);
    expect(thinkingDeltas.join('')).toBe('thinking-chunk');
  });

  it('resumes a prior session via session/load and captures the durable handle', async () => {
    const child = spawnFakeVela({ FAKE_VELA_TEXT: 'Resumed.' });
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'continue',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        // A stored durable handle drives session/load instead of session/new.
        resumeSessionId: 'oc-prev-handle',
        mcpServers: [],
        send: () => {},
      });
      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
      // The fake echoes the requested handle back as the durable id; the daemon
      // would persist this to resume again next turn.
      expect(session.getDurableSessionId()).toBe('oc-prev-handle');
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  });

  it('surfaces resume_failed (no completion) when the resumed session is gone', async () => {
    const child = spawnFakeVela({ FAKE_VELA_RESUME_FAILED: '1' });
    const events: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'continue',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        resumeSessionId: 'oc-gone',
        mcpServers: [],
        send: (event, payload) => events.push({ event, payload }),
      });
      await waitForExit(child);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
    // The structured resume_failed marker reaches the host (the daemon matches
    // it on stdout to clear the stale handle and reseed). It must never look
    // like a successful turn.
    expect(JSON.stringify(events)).toContain('resume_failed');
  });

  it('regression: stub mirrors real vela by rejecting session/prompt before session/set_model', async () => {
    const child = spawnFakeVela({ FAKE_VELA_TEXT: 'unused' });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        // model === 'default' triggers the daemon to skip session/set_model.
        // Against a vela-faithful stub that should surface as a fatal error,
        // not a silent success — otherwise this same call path would also
        // silently fail against a real vela in production.
        model: 'default',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    expect(errors.length).toBeGreaterThan(0);
    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message.toLowerCase()).toContain('session/set_model');
  });

  it('detectAcpModels surfaces availableModels from the vela ACP session/new response', async () => {
    const result = await detectAcpModels({
      bin: process.execPath,
      args: [FAKE_VELA],
      env: process.env,
      timeoutMs: 10_000,
      defaultModelOption: { id: 'deepseek-v3.2', label: 'deepseek-v3.2 (default)' },
    });
    const ids = (result || []).map((m) => m.id);
    expect(ids).toContain('deepseek-v3.2');
    expect(ids).toContain('openai/gpt-5.4-mini');
    expect(ids).toContain('anthropic/claude-3.7-sonnet');
  });

  it('surfaces session/new JSON-RPC errors as fatal daemon events', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_SESSION_NEW_ERROR: 'forced session/new failure',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('forced session/new failure');
  });

  it('surfaces unrecoverable session/set_model failures as fatal daemon events', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_SET_MODEL_ERROR: 'forced session/set_model failure',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('forced session/set_model failure');
  });

  it('surfaces session/prompt JSON-RPC errors as fatal daemon events', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_PROMPT_ERROR: 'forced session/prompt failure',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('forced session/prompt failure');
  });

  it('maps ACP model-not-found prompt errors to AMR_MODEL_UNAVAILABLE', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_PROMPT_ERROR: 'Model not found: vela/gpt-5.4-mini.',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'gpt-5.4-mini',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown };
    };
    expect(String(payload?.message ?? '')).toContain('Model not found');
    expect(payload?.error?.code).toBe('AMR_MODEL_UNAVAILABLE');
  });

  it('keeps ACP insufficient-balance prompt errors classifiable as AMR recharge failures', async () => {
    const child = spawnFakeVela({
      FAKE_VELA_PROMPT_ERROR:
        'HTTP 429: {"error":{"code":"insufficient_balance","message":"insufficient wallet balance"}}',
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'claude-opus-4-6',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('insufficient_balance');
    expect(classifyAmrAccountFailure(message)).toMatchObject({
      code: 'AMR_INSUFFICIENT_BALANCE',
      action: 'recharge',
      actionUrl: 'https://open-design.ai/amr/wallet?source=open_design',
    });
  });

  it('promotes ACP retry status insufficient-balance updates to AMR recharge failures', async () => {
    const child = spawnAcpUpdateFixture([
      {
        sessionUpdate: 'status',
        type: 'retry',
        status: 'retry',
        message: '[code=insufficient_balance] insufficient wallet balance',
      },
    ]);
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'claude-opus-4-6',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown; retryable?: unknown; details?: Record<string, unknown> };
    };
    expect(payload?.error?.code).toBe('AMR_INSUFFICIENT_BALANCE');
    expect(payload?.error?.retryable).toBe(false);
    expect(payload?.error?.details).toMatchObject({
      kind: 'amr_account',
      action: 'recharge',
    });
    expect(String(payload?.message ?? '')).toContain('AMR Cloud reported insufficient balance');
  });

  it('promotes structured manual-topup recovery retry updates to AMR recharge failures', async () => {
    const child = spawnAcpUpdateFixture([
      {
        sessionUpdate: 'status',
        type: 'retry',
        status: 'retry',
        recovery: {
          status: 'waiting_payment',
          manualTopupRequired: true,
          pauseReason: 'insufficient_balance',
          error: {
            code: 'insufficient_balance',
            message: 'insufficient wallet balance',
          },
        },
      },
    ]);
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'claude-opus-4-6',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown; retryable?: unknown; details?: Record<string, unknown> };
    };
    expect(payload?.error?.code).toBe('AMR_INSUFFICIENT_BALANCE');
    expect(payload?.error?.retryable).toBe(false);
    expect(payload?.error?.details).toMatchObject({
      kind: 'amr_account',
      action: 'recharge',
      promoted_by: 'open_design_acp_retry_status',
    });
    expect(String(payload?.message ?? '')).toContain('AMR Cloud reported insufficient balance');
  });

  it('promotes OpenCode stderr retry status insufficient-balance logs to AMR recharge failures', async () => {
    const child = spawnAcpStderrRetryFixture(
      'opencode_event_stream_failure: phase=event_stream session=ses_123 error="{\\"id\\":\\"evt_123\\",\\"properties\\":{\\"sessionID\\":\\"ses_123\\",\\"status\\":{\\"attempt\\":1,\\"message\\":\\"[code=insufficient_balance] insufficient wallet balance\\",\\"next\\":1782915664490,\\"type\\":\\"retry\\"}},\\"type\\":\\"session.status\\"}"',
    );
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'claude-opus-4-6',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown; retryable?: unknown; details?: Record<string, unknown> };
    };
    expect(payload?.error?.code).toBe('AMR_INSUFFICIENT_BALANCE');
    expect(payload?.error?.retryable).toBe(false);
    expect(payload?.error?.details).toMatchObject({
      kind: 'amr_account',
      action: 'recharge',
      promoted_by: 'open_design_acp_stderr_retry_status',
    });
    expect(String(payload?.message ?? '')).toContain('AMR Cloud reported insufficient balance');
  });

  it('promotes OpenCode stderr retry status when the balance log is split across chunks', async () => {
    const child = spawnAcpStderrRetryFixture([
      'opencode_event_stream_failure: phase=event_stream session=ses_123 error="{\\"id\\":\\"evt_123\\",\\"properties\\":{\\"sessionID\\":\\"ses_123\\",\\"status\\":{\\"attempt\\":1,\\"message\\":\\"[code=',
      'insufficient_balance] insufficient wallet balance\\",\\"next\\":1782915664490,\\"type\\":\\"retry\\"}},\\"type\\":\\"session.status\\"}"',
    ]);
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'claude-opus-4-6',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown; retryable?: unknown; details?: Record<string, unknown> };
    };
    expect(payload?.error?.code).toBe('AMR_INSUFFICIENT_BALANCE');
    expect(payload?.error?.retryable).toBe(false);
    expect(payload?.error?.details).toMatchObject({
      kind: 'amr_account',
      action: 'recharge',
      promoted_by: 'open_design_acp_stderr_retry_status',
    });
  });

  it('allows non-AMR ACP completions that produce no assistant text', async () => {
    const child = spawnFakeVela({ FAKE_VELA_TEXT: '' });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    expect(errors).toHaveLength(0);
  });

  it('maps AMR empty-text completions to AMR_MODEL_UNAVAILABLE', async () => {
    const child = spawnAcpUpdateFixture([], {
      inputTokens: 12,
      outputTokens: 0,
      totalTokens: 12,
    });
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'glm-5',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown };
    };
    const message = String(
      payload?.message ?? '',
    );
    expect(message).toContain('without producing any assistant text');
    expect(payload?.error?.code).toBe('AMR_MODEL_UNAVAILABLE');
  });

  it('fails AMR turns that report activity but produce no visible text or concrete tool event', async () => {
    const child = spawnAcpUpdateFixture(
      [
        {
          sessionUpdate: 'tool_call',
          toolCallId: 'call_1',
          title: 'Thinking',
          status: 'pending',
        },
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'call_1',
          title: 'Thinking',
          status: 'completed',
        },
      ],
      { inputTokens: 75_734, outputTokens: 5_071, totalTokens: 80_805 },
    );
    const errors: Array<{ event: string; payload: unknown }> = [];
    const agentEvents: unknown[] = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Generate a test',
        cwd: process.cwd(),
        model: 'step-3.7-flash',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
          if (event === 'agent') agentEvents.push(payload);
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const payload = errors[0]?.payload as {
      message?: unknown;
      error?: { code?: unknown; retryable?: unknown; details?: Record<string, unknown> };
    };
    expect(String(payload?.message ?? '')).toContain('did not produce visible assistant text');
    expect(payload?.error?.code).toBe('AGENT_EXECUTION_FAILED');
    expect(payload?.error?.retryable).toBe(true);
    expect(payload?.error?.details).toMatchObject({
      kind: 'acp_no_visible_output',
      output_tokens: 5_071,
      raw_tool_update_seen: true,
    });
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        name: 'acp_raw_event_shape',
        shape: expect.objectContaining({
          sessionUpdate: 'tool_call',
          hasToolCallId: true,
          titlePresent: true,
        }),
      }),
    );
    expect(agentEvents).not.toContainEqual(expect.objectContaining({ type: 'tool_use' }));
  });

  it('accepts ACP message chunks that carry text outside content.text', async () => {
    const child = spawnAcpUpdateFixture([
      {
        sessionUpdate: 'agent_message_chunk',
        content: [{ type: 'text', text: 'Hello ' }],
      },
      {
        sessionUpdate: 'agent_message_chunk',
        delta: 'world',
      },
    ], { inputTokens: 1, outputTokens: 2, totalTokens: 3 });
    const text: string[] = [];
    const errors: unknown[] = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'step-3.7-flash',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'error') errors.push(payload);
          if (
            event === 'agent' &&
            typeof (payload as { type?: unknown; delta?: unknown }).delta === 'string' &&
            (payload as { type?: unknown }).type === 'text_delta'
          ) {
            text.push((payload as { delta: string }).delta);
          }
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    expect(errors).toHaveLength(0);
    expect(text.join('')).toBe('Hello world');
  });

  it('records suppressed artifact echo after an ACP artifact write without claiming visible streaming', async () => {
    const child = spawnAcpUpdateFixture([
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'write_1',
        title: 'Write index.html',
        status: 'pending',
      },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'write_1',
        title: 'Write index.html',
        status: 'completed',
        locations: [{ path: 'index.html' }],
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: '<artifact identifier="page" type="text/html"><!doctype html><html></html></artifact>',
        },
      },
    ], { inputTokens: 1, outputTokens: 50, totalTokens: 51 });
    const agentEvents: unknown[] = [];
    const errors: unknown[] = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Build a page',
        cwd: process.cwd(),
        model: 'step-3.7-flash',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'agent') agentEvents.push(payload);
          if (event === 'error') errors.push(payload);
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    expect(errors).toHaveLength(0);
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'tool_use',
        id: 'write_1',
        name: 'Write',
        input: { file_path: 'index.html' },
      }),
    );
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        name: 'acp_artifact_text_suppression',
        reason: 'artifact_echo',
        suppressedChars: expect.any(Number),
        openedBlocks: 1,
        closedBlocks: 1,
      }),
    );
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        name: 'unexpected_text_artifact_in_filesystem_run',
        suppressedChars: expect.any(Number),
        openedBlocks: 1,
        closedBlocks: 1,
      }),
    );
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        name: 'acp_artifact_text_suppression_summary',
        suppressedChars: expect.any(Number),
        openedBlocks: 1,
        closedBlocks: 1,
      }),
    );
    expect(agentEvents).not.toContainEqual(expect.objectContaining({ type: 'text_delta' }));
    expect(agentEvents).not.toContainEqual(
      expect.objectContaining({ type: 'status', label: 'streaming' }),
    );
  });

  it('suppresses XML tool-call text that AMR emits as an assistant message chunk', async () => {
    const child = spawnAcpUpdateFixture([
      {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '<od-card type="task-brief">ok</od-card>' },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: '<edit>\n<parameter=filePath>/tmp/index.html</parameter>\n',
        },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: '<parameter=newString><section>new</section></parameter>\n',
        },
      },
      {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: '<parameter=oldString><section>old</section></parameter>\n</function>\n</tool_call>',
        },
      },
    ], { inputTokens: 1, outputTokens: 50, totalTokens: 51 });
    const agentEvents: unknown[] = [];
    const errors: unknown[] = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Edit a page',
        cwd: process.cwd(),
        model: 'step-3.7-flash',
        mcpServers: [],
        modelUnavailableErrorCode: 'AMR_MODEL_UNAVAILABLE',
        send: (event, payload) => {
          if (event === 'agent') agentEvents.push(payload);
          if (event === 'error') errors.push(payload);
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(false);
      expect(session.completedSuccessfully()).toBe(true);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    expect(errors).toHaveLength(0);
    const visibleText = agentEvents
      .filter((event): event is { type: 'text_delta'; delta: string } =>
        typeof event === 'object' &&
        event !== null &&
        (event as { type?: unknown }).type === 'text_delta' &&
        typeof (event as { delta?: unknown }).delta === 'string',
      )
      .map((event) => event.delta)
      .join('');
    expect(visibleText).toBe('<od-card type="task-brief">ok</od-card>');
    expect(visibleText).not.toContain('<edit>');
    expect(visibleText).not.toContain('<parameter=');
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        name: 'acp_tool_call_text_suppression',
        reason: 'tool_call_xml',
        suppressedChars: expect.any(Number),
        openedBlocks: 1,
        closedBlocks: 1,
      }),
    );
    expect(agentEvents).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        name: 'acp_tool_call_text_suppression_summary',
        suppressedChars: expect.any(Number),
        openedBlocks: 1,
        closedBlocks: 1,
      }),
    );
  });

  it('surfaces an actionable error when the ACP child exits before initialize completes', async () => {
    const child = spawnFixtureScript(
      "process.stdout.write('not-json\\n'); setTimeout(() => process.exit(0), 20);",
    );
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        mcpServers: [],
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('ACP session exited before completion');
  });

  it('times out silent ACP children instead of hanging forever', async () => {
    const child = spawnFixtureScript(
      'setTimeout(() => process.exit(0), 200);',
    );
    const errors: Array<{ event: string; payload: unknown }> = [];
    try {
      const session = attachAcpSession({
        child: child as never,
        prompt: 'Say hello',
        cwd: process.cwd(),
        model: 'deepseek-v3.2',
        mcpServers: [],
        stageTimeoutMs: 25,
        send: (event, payload) => {
          if (event === 'error') errors.push({ event, payload });
        },
      });

      await waitForExit(child);
      expect(session.hasFatalError()).toBe(true);
      expect(session.completedSuccessfully()).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }

    const message = String(
      (errors[0]?.payload as { message?: unknown })?.message ?? '',
    );
    expect(message).toContain('timed out');
  });
});
