import { describe, expect, it, vi } from 'vitest';

import { runByokToolCli } from '../src/tools-byok-cli.js';

const BASE_URL = 'http://127.0.0.1:17456';
const PROFILE = {
  id: 'byok-openrouter-1',
  label: 'OpenRouter',
  protocol: 'openai',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'openai/gpt-5.4-mini',
  requiresApiKey: true,
  configured: true,
  keyTail: 'tkey',
  createdAt: 1,
  updatedAt: 2,
};

function dependencies(fetchImpl: typeof fetch, stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    deps: {
      fetchImpl,
      readStdin: vi.fn(async () => stdin),
      resolveDaemonUrlImpl: vi.fn(async () => BASE_URL),
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

describe('secure BYOK CLI', () => {
  it('rejects API keys in argv before making any daemon request', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const { deps, stderr } = dependencies(fetchMock, 'not-used');

    const result = await runByokToolCli([
      'save',
      '--label', 'OpenRouter',
      '--protocol', 'openai',
      '--base-url', 'https://openrouter.ai/api/v1',
      '--model', 'openai/gpt-5.4-mini',
      '--api-key', 'argv-secret',
    ], deps);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('--api-key-stdin');
    expect(stderr.join('')).not.toContain('argv-secret');
  });

  it('rejects a non-loopback daemon before reading stdin', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const { deps, stderr } = dependencies(fetchMock, 'must-not-be-read');
    deps.resolveDaemonUrlImpl = vi.fn(async () => 'https://attacker.example');

    const result = await runByokToolCli([
      'save',
      '--label', 'OpenRouter',
      '--protocol', 'openai',
      '--base-url', 'https://openrouter.ai/api/v1',
      '--model', 'openai/gpt-5.4-mini',
      '--api-key-stdin',
    ], deps);

    expect(result.exitCode).toBe(1);
    expect(deps.readStdin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('loopback');
  });

  it('reads the key from stdin and prints only the safe profile', async () => {
    const secret = 'test-only-secret';
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe(`${BASE_URL}/api/byok/profiles`);
      expect(JSON.parse(String(init?.body)).apiKey).toBe(secret);
      return new Response(JSON.stringify({ profile: PROFILE }), { status: 201 });
    });
    const { deps, stdout, stderr } = dependencies(fetchMock, `${secret}\n`);

    const result = await runByokToolCli([
      'save',
      '--label', 'OpenRouter',
      '--protocol', 'openai',
      '--base-url', 'https://openrouter.ai/api/v1',
      '--model', 'openai/gpt-5.4-mini',
      '--api-key-stdin',
      '--json',
    ], deps);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(''))).toEqual({ profile: PROFILE });
    expect(`${stdout.join('')}${stderr.join('')}`).not.toContain(secret);
  });

  it('saves an explicit keyless profile without reading stdin', async () => {
    const keylessProfile = {
      ...PROFILE,
      id: 'byok-ollama-local',
      label: 'Local Ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2',
      protocol: 'ollama',
      requiresApiKey: false,
      configured: true,
      keyTail: undefined,
    };
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        label: 'Local Ollama',
        protocol: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.2',
        requiresApiKey: false,
      });
      return new Response(JSON.stringify({ profile: keylessProfile }), {
        status: 201,
      });
    });
    const { deps, stdout } = dependencies(fetchMock, 'must-not-be-read');

    const result = await runByokToolCli([
      'save',
      '--label', 'Local Ollama',
      '--protocol', 'ollama',
      '--base-url', 'http://127.0.0.1:11434',
      '--model', 'llama3.2',
      '--no-api-key',
      '--json',
    ], deps);

    expect(result.exitCode).toBe(0);
    expect(deps.readStdin).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.join(''))).toEqual({ profile: keylessProfile });
  });

  it('rejects conflicting or missing credential mode flags', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const shared = [
      'save',
      '--label', 'Local Ollama',
      '--protocol', 'ollama',
      '--base-url', 'http://127.0.0.1:11434',
      '--model', 'llama3.2',
    ];

    const conflicting = dependencies(fetchMock, 'must-not-be-read');
    expect((await runByokToolCli([
      ...shared,
      '--api-key-stdin',
      '--no-api-key',
    ], conflicting.deps)).exitCode).toBe(1);
    expect(conflicting.stderr.join('')).toContain('exactly one');
    expect(conflicting.deps.readStdin).not.toHaveBeenCalled();

    const missing = dependencies(fetchMock, 'must-not-be-read');
    expect((await runByokToolCli(shared, missing.deps)).exitCode).toBe(1);
    expect(missing.stderr.join('')).toContain('exactly one');
    expect(missing.deps.readStdin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists, tests, and deletes a profile without exposing extra fields', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/test')) {
        return new Response(JSON.stringify({
          ok: true,
          kind: 'success',
          latencyMs: 42,
          model: PROFILE.model,
          sample: 'must-be-dropped',
        }), { status: 200 });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(JSON.stringify({
        available: true,
        backend: 'macos-keychain',
        profiles: [{ ...PROFILE, apiKey: 'must-be-dropped' }],
      }), { status: 200 });
    });

    const listIo = dependencies(fetchMock);
    expect((await runByokToolCli(['list', '--json'], listIo.deps)).exitCode).toBe(0);
    expect(JSON.parse(listIo.stdout.join('')).profiles).toEqual([PROFILE]);
    expect(listIo.stdout.join('')).not.toContain('must-be-dropped');

    const testIo = dependencies(fetchMock);
    expect((await runByokToolCli(['test', PROFILE.id, '--json'], testIo.deps)).exitCode).toBe(0);
    expect(JSON.parse(testIo.stdout.join(''))).toEqual({
      ok: true,
      kind: 'success',
      latencyMs: 42,
      model: PROFILE.model,
    });

    const deleteIo = dependencies(fetchMock);
    expect((await runByokToolCli(['delete', PROFILE.id, '--json'], deleteIo.deps)).exitCode).toBe(0);
    expect(JSON.parse(deleteIo.stdout.join(''))).toEqual({
      deleted: true,
      id: PROFILE.id,
    });
  });
});
