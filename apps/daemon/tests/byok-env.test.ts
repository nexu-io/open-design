import http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  envByokDefaultForProtocol,
  envByokDefaultsView,
  readEnvByokDefault,
} from '../src/byok-env.js';
import { startServer } from '../src/server.js';

/**
 * The host-managed default BYOK provider (OD_BYOK_*): server deployments
 * where the host holds the inference key. Browser-sent config always wins;
 * the key never leaves the daemon.
 */

const ENV_KEYS = [
  'OD_BYOK_PROTOCOL',
  'OD_BYOK_BASE_URL',
  'OD_BYOK_API_KEY',
  'OD_BYOK_MODEL',
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENV_KEYS) delete env[key];
  Object.assign(env, values);
  return env;
}

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('readEnvByokDefault', () => {
  it('returns null when the activation pair (base URL, model) is missing', () => {
    expect(readEnvByokDefault(withEnv({}))).toBeNull();
    expect(
      readEnvByokDefault(withEnv({ OD_BYOK_BASE_URL: 'https://api.example.com' })),
    ).toBeNull();
    expect(
      readEnvByokDefault(withEnv({ OD_BYOK_MODEL: 'my-model' })),
    ).toBeNull();
  });

  it('parses a full config, defaulting the protocol to anthropic', () => {
    const d = readEnvByokDefault(
      withEnv({
        OD_BYOK_BASE_URL: 'https://api.example.com',
        OD_BYOK_MODEL: 'my-model',
        OD_BYOK_API_KEY: 'sk-test-1234',
      }),
    );
    expect(d).not.toBeNull();
    expect(d!.provider).toMatchObject({
      protocol: 'anthropic',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test-1234',
      requiresApiKey: true,
    });
    expect(d!.model).toBe('my-model');
  });

  it('marks a keyless endpoint as not requiring a key (local Ollama)', () => {
    const d = readEnvByokDefault(
      withEnv({
        OD_BYOK_PROTOCOL: 'ollama',
        OD_BYOK_BASE_URL: 'http://127.0.0.1:11434',
        OD_BYOK_MODEL: 'qwen3',
      }),
    );
    expect(d!.provider.requiresApiKey).toBe(false);
    expect(d!.provider.apiKey).toBe('');
  });

  it('fails closed on an unknown OD_BYOK_PROTOCOL', () => {
    expect(
      readEnvByokDefault(
        withEnv({
          OD_BYOK_PROTOCOL: 'not-a-protocol',
          OD_BYOK_BASE_URL: 'https://api.example.com',
          OD_BYOK_MODEL: 'my-model',
        }),
      ),
    ).toBeNull();
  });

  it('scopes the default to its protocol only', () => {
    const env = withEnv({
      OD_BYOK_PROTOCOL: 'openai',
      OD_BYOK_BASE_URL: 'https://api.example.com/v1',
      OD_BYOK_API_KEY: 'sk-test',
      OD_BYOK_MODEL: 'my-model',
    });
    expect(envByokDefaultForProtocol('openai', env)).not.toBeNull();
    expect(envByokDefaultForProtocol('anthropic', env)).toBeNull();
  });
});

describe('envByokDefaultsView', () => {
  it('exposes protocol/baseUrl/model/tail but never the key', () => {
    const view = envByokDefaultsView(
      withEnv({
        OD_BYOK_PROTOCOL: 'openai',
        OD_BYOK_BASE_URL: 'https://api.example.com/v1',
        OD_BYOK_API_KEY: 'sk-super-secret-value',
        OD_BYOK_MODEL: 'my-model',
      }),
    );
    expect(view).toMatchObject({
      configured: true,
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'my-model',
      apiKeyTail: 'alue',
    });
    expect(JSON.stringify(view)).not.toContain('sk-super-secret-value');
  });

  it('reports configured: false when unset', () => {
    expect(envByokDefaultsView(withEnv({}))).toEqual({ configured: false });
  });
});

describe('GET /api/byok-defaults (integration)', () => {
  let url: string;
  let server: http.Server;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    url = started.url;
    server = started.server;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('reports the host-managed provider shape without the key', async () => {
    process.env.OD_BYOK_PROTOCOL = 'openai';
    process.env.OD_BYOK_BASE_URL = 'https://api.example.com/v1';
    process.env.OD_BYOK_API_KEY = 'sk-super-secret-value';
    process.env.OD_BYOK_MODEL = 'my-model';

    const res = await fetch(`${url}/api/byok-defaults`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      configured: true,
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'my-model',
      apiKeyTail: 'alue',
    });
    expect(JSON.stringify(body)).not.toContain('sk-super-secret-value');
  });

  it('reports configured: false when the env is unset', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const res = await fetch(`${url}/api/byok-defaults`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: false });
  });
});

describe('proxy fallback (integration)', () => {
  let url: string;
  let server: http.Server;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    url = started.url;
    server = started.server;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('the openai proxy no longer 400s for a field-less body when the env default is set', async () => {
    // Given the env default pointing at an unreachable loopback (no real
    // network in tests)
    process.env.OD_BYOK_PROTOCOL = 'openai';
    process.env.OD_BYOK_BASE_URL = 'http://127.0.0.1:9';
    process.env.OD_BYOK_API_KEY = 'sk-test';
    process.env.OD_BYOK_MODEL = 'test-model';

    // When a browser posts a chat with NO provider fields
    const res = await fetch(`${url}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });

    // Then the request passes the field guard (the env filled them) — it
    // fails LATER, talking to the unreachable endpoint, with any status but
    // the field-guard's 400
    expect(res.status).not.toBe(400);
  });

  it('the openai proxy still 400s on a field-less body when no env default is set', async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const res = await fetch(`${url}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(400);
  });
});
