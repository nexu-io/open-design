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
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { attachAcpSession, detectAcpModels } from '../src/acp.js';
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
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'claude-opus-4.6', label: 'claude-opus-4.6' },
      { id: 'kimi-k2.6', label: 'kimi-k2.6' },
    ]);
    expect(models.every((model) => !model.label.includes('vela/'))).toBe(true);
    expect(models.map((model) => model.id)).not.toContain('gpt-image-2');
    expect(models.map((model) => model.id)).not.toContain('seedance-2');
  });

  it('parses Vela preset and remote JSON without legacy id normalization', () => {
    const models = parseVelaModelJson(JSON.stringify({
      source: 'remote',
      data: [
        { id: 'public_model_deepseek_v3_2' },
        { id: 'deepseek-v4-flash' },
        { id: 'gpt-image-2' },
        { id: 'deepseek-v4-flash' },
      ],
    }), 'remote');
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'public_model_deepseek_v3_2', label: 'public_model_deepseek_v3_2' },
    ]);
    expect(() => parseVelaModelJson(JSON.stringify({ source: 'preset', data: [] }), 'remote'))
      .toThrow(/expected remote/);
  });

  it('fetches AMR preset models from `vela model preset --format json`', async () => {
    const models = await fetchVelaPresetModels(FAKE_VELA, process.env);
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    ]);
  });

  it('fetches AMR authoritative models from `vela model list --format json`', async () => {
    const models = await amrAgentDef.fetchModels?.(FAKE_VELA, process.env);
    expect(models).toEqual([
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v3.2', label: 'deepseek-v3.2' },
      { id: 'glm-5.1', label: 'glm-5.1' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { id: 'gemini-3.1-flash-lite-preview', label: 'gemini-3.1-flash-lite-preview' },
      { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview' },
      { id: 'gpt-5.4', label: 'gpt-5.4' },
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'glm-5', label: 'glm-5' },
      { id: 'kimi-k2.6', label: 'kimi-k2.6' },
      { id: 'minimax-m2.7', label: 'minimax-m2.7' },
      { id: 'qwen3-235b-a22b', label: 'qwen3-235b-a22b' },
    ]);
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
      actionUrl: 'https://open-design.ai/amr/wallet',
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
    const child = spawnFakeVela({ FAKE_VELA_TEXT: '' });
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
