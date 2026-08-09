import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  envByokDefaultForProtocol,
  readEnvByokDefault,
  resolveProxyProviderFields,
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

describe('resolveProxyProviderFields (the atomicity contract)', () => {
  const envDefault = {
    provider: {
      protocol: 'openai' as const,
      apiKey: 'sk-host-managed-secret',
      baseUrl: 'https://host.example.com/v1',
      requiresApiKey: true,
    },
    model: 'host-model',
  };

  it('uses the env tuple when the request carries no provider fields', () => {
    const resolved = resolveProxyProviderFields({ messages: [] }, envDefault);
    expect(resolved).toEqual({
      baseUrl: 'https://host.example.com/v1',
      apiKey: 'sk-host-managed-secret',
      model: 'host-model',
    });
  });

  it('lets a complete request tuple win over the env default', () => {
    const resolved = resolveProxyProviderFields(
      {
        baseUrl: 'https://caller.example.com/v1',
        apiKey: 'sk-caller',
        model: 'caller-model',
      },
      envDefault,
    );
    expect(resolved).toEqual({
      baseUrl: 'https://caller.example.com/v1',
      apiKey: 'sk-caller',
      model: 'caller-model',
    });
  });

  it('rejects a partial request tuple rather than completing it with the host key', () => {
    // A caller-supplied baseUrl with no apiKey must NOT be completed with
    // the host credential — that would forward it to a request-controlled
    // upstream (the review's credential-exfiltration blocker).
    expect(
      resolveProxyProviderFields(
        { baseUrl: 'https://attacker.example.com' },
        envDefault,
      ),
    ).toBeNull();
    expect(
      resolveProxyProviderFields({ model: 'x' }, envDefault),
    ).toBeNull();
  });

  it('rejects everything when no env default is configured', () => {
    expect(resolveProxyProviderFields({}, null)).toBeNull();
    expect(
      resolveProxyProviderFields({ baseUrl: 'https://x.example.com' }, null),
    ).toBeNull();
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

  it('rejects a caller-controlled baseUrl paired with a missing key instead of forwarding the host key', async () => {
    // Given the env default is configured (the host key exists server-side)
    process.env.OD_BYOK_PROTOCOL = 'openai';
    process.env.OD_BYOK_BASE_URL = 'http://127.0.0.1:9';
    process.env.OD_BYOK_API_KEY = 'sk-host-managed-secret';
    process.env.OD_BYOK_MODEL = 'test-model';

    // When a request sends its own baseUrl but no apiKey
    const res = await fetch(`${url}/api/proxy/openai/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://attacker.example.com',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    // Then the route rejects the partial tuple (400) instead of mixing in
    // the host key
    expect(res.status).toBe(400);
  });

  it('sends the caller\'s own key to the caller\'s upstream — never the host key (exfiltration regression)', async () => {
    // Given a recording upstream on loopback and the env default configured
    const seen: { authorization?: string | undefined; body?: string | undefined } = {};
    const upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        seen.authorization = req.headers.authorization;
        seen.body = body;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end('data: [DONE]\n\n');
      });
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const upstreamPort = (upstream.address() as AddressInfo).port;

    process.env.OD_BYOK_PROTOCOL = 'openai';
    process.env.OD_BYOK_BASE_URL = `http://127.0.0.1:${upstreamPort}`;
    process.env.OD_BYOK_API_KEY = 'sk-host-managed-secret';
    process.env.OD_BYOK_MODEL = 'host-model';

    try {
      // When the caller provides a COMPLETE tuple of its own
      const res = await fetch(`${url}/api/proxy/openai/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl: `http://127.0.0.1:${upstreamPort}`,
          apiKey: 'sk-caller-owned',
          model: 'caller-model',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      await res.arrayBuffer().catch(() => undefined);

      // Then the upstream saw the CALLER's key, and the host key never left
      // the daemon
      expect(seen.authorization).toBe('Bearer sk-caller-owned');
      expect(JSON.stringify(seen)).not.toContain('sk-host-managed-secret');
    } finally {
      upstream.close();
    }
  });
});
