import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  chatGptTenantDataDir,
  ManagedChatGptTenantManager,
  type ChatGptTenantCredentials,
  type ChatGptTenantDaemon,
  type StartChatGptTenantDaemonInput,
} from '../src/services/chatgpt-tenant-daemons.js';

function credentials(subject: string, expiresAtMs: number): ChatGptTenantCredentials {
  return {
    subject,
    controlKey: `control-${subject}`,
    runtimeKey: `runtime-${subject}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
    apiUrl: 'https://amr-api.open-design.ai',
    linkUrl: 'https://amr-link.open-design.ai',
  };
}

describe('ManagedChatGptTenantManager', () => {
  it('reuses one daemon per subject while isolating different users on disk', async () => {
    let now = Date.parse('2026-07-16T09:00:00.000Z');
    const exchangeCredentials = vi.fn(async (token: string) =>
      credentials(token.replace('token-', ''), now + 60 * 60_000));
    const starts: Array<{ subject: string; dataDir: string }> = [];
    const startDaemon = vi.fn(async (
      input: StartChatGptTenantDaemonInput,
    ): Promise<ChatGptTenantDaemon> => {
      starts.push({ subject: input.subject, dataDir: input.dataDir });
      return {
        url: `http://127.0.0.1:${4100 + starts.length}`,
        isRunning: () => true,
        stop: vi.fn(async () => {}),
      };
    });
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      exchangeCredentials,
      startDaemon,
      now: () => now,
    });

    const userAUrl = await manager.resolve('user-a', 'token-user-a');
    expect(await manager.resolve('user-a', 'token-user-a')).toBe(userAUrl);
    const userBUrl = await manager.resolve('user-b', 'token-user-b');

    expect(userBUrl).not.toBe(userAUrl);
    expect(exchangeCredentials).toHaveBeenCalledTimes(2);
    expect(startDaemon).toHaveBeenCalledTimes(2);
    expect(starts[0]?.dataDir).toBe(chatGptTenantDataDir('/runtime', 'user-a'));
    expect(starts[1]?.dataDir).toBe(chatGptTenantDataDir('/runtime', 'user-b'));
    expect(path.basename(starts[0]?.dataDir ?? '')).not.toContain('user-a');
    expect(starts[0]?.dataDir).not.toBe(starts[1]?.dataDir);

    now += 31 * 60_000;
    expect(await manager.reapIdle()).toBe(2);
  });

  it('fails closed when Vela returns credentials for another subject', async () => {
    const startDaemon = vi.fn();
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      exchangeCredentials: async () =>
        credentials('different-user', Date.now() + 60 * 60_000),
      startDaemon,
    });

    await expect(manager.resolve('expected-user', 'oauth-token')).rejects.toThrow(
      'different OAuth subject',
    );
    expect(startDaemon).not.toHaveBeenCalled();
  });

  it('fails closed when the configured active-tenant capacity is full', async () => {
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      maxActiveTenants: 1,
      exchangeCredentials: async (token) =>
        credentials(token, Date.now() + 60 * 60_000),
      startDaemon: async (input) => ({
        url: `http://tenant/${input.subject}`,
        isRunning: () => true,
        stop: async () => {},
      }),
    });

    await manager.resolve('user-a', 'user-a');
    await expect(manager.resolve('user-b', 'user-b')).rejects.toThrow(
      'capacity is full',
    );
  });

  it('rotates an expiring credential by restarting only that tenant', async () => {
    let now = Date.parse('2026-07-16T09:00:00.000Z');
    const stopped: string[] = [];
    let generation = 0;
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      now: () => now,
      exchangeCredentials: async () => credentials('user-a', now + 10 * 60_000),
      startDaemon: async () => {
        generation += 1;
        const current = generation;
        return {
          url: `http://127.0.0.1:${4200 + current}`,
          isRunning: () => true,
          stop: async () => {
            stopped.push(`generation-${current}`);
          },
        };
      },
    });

    expect(await manager.resolve('user-a', 'oauth-token')).toBe('http://127.0.0.1:4201');
    now += 6 * 60_000;
    expect(await manager.resolve('user-a', 'refreshed-token')).toBe('http://127.0.0.1:4202');
    expect(stopped).toEqual(['generation-1']);
  });

  it('keeps the current daemon alive when credential refresh fails', async () => {
    let now = Date.parse('2026-07-16T09:00:00.000Z');
    const stop = vi.fn(async () => {});
    const exchangeCredentials = vi.fn(async () =>
      credentials('user-a', now + 10 * 60_000));
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      now: () => now,
      exchangeCredentials,
      startDaemon: async () => ({
        url: 'http://127.0.0.1:4301',
        isRunning: () => true,
        stop,
      }),
    });

    await manager.resolve('user-a', 'oauth-token');
    now += 6 * 60_000;
    exchangeCredentials.mockRejectedValueOnce(new Error('Vela unavailable'));

    await expect(manager.resolve('user-a', 'refreshed-token')).rejects.toThrow(
      'Vela unavailable',
    );
    expect(stop).not.toHaveBeenCalled();
  });

  it('waits for idle shutdown before starting a replacement for the same subject', async () => {
    let now = Date.parse('2026-07-16T09:00:00.000Z');
    let releaseStop!: () => void;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    let generation = 0;
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      now: () => now,
      idleTtlMs: 1,
      exchangeCredentials: async () => credentials('user-a', now + 60 * 60_000),
      startDaemon: async () => {
        generation += 1;
        return {
          url: `http://127.0.0.1:${4400 + generation}`,
          isRunning: () => true,
          stop: async () => stopGate,
        };
      },
    });

    await manager.resolve('user-a', 'oauth-token');
    now += 2;
    const reaping = manager.reapIdle();
    const resolving = manager.resolve('user-a', 'oauth-token');
    await Promise.resolve();
    expect(generation).toBe(1);

    releaseStop();
    await reaping;
    await expect(resolving).resolves.toBe('http://127.0.0.1:4402');
  });

  it('publishes only tenant raw previews through an opaque active-tenant capability', async () => {
    let now = Date.parse('2026-07-16T09:00:00.000Z');
    const manager = new ManagedChatGptTenantManager({
      dataRoot: '/runtime',
      now: () => now,
      idleTtlMs: 1,
      exchangeCredentials: async () => credentials('user-a', now + 60 * 60_000),
      startDaemon: async () => ({
        url: 'http://127.0.0.1:4501',
        isRunning: () => true,
        stop: async () => {},
      }),
    });
    await manager.resolve('user-a', 'oauth-token');

    const publicUrl = manager.publicPreviewUrl(
      'user-a',
      'http://127.0.0.1:4501/api/projects/project-1/raw/site/index.html?theme=dark',
      'https://mcp.open-design.ai',
    );
    expect(publicUrl).toMatch(
      /^https:\/\/mcp\.open-design\.ai\/chatgpt\/preview\/[A-Za-z0-9_-]{43}\/api\/projects\/project-1\/raw\/site\/index\.html\?theme=dark$/u,
    );
    expect(publicUrl).not.toContain('user-a');
    expect(() => manager.publicPreviewUrl(
      'user-a',
      'http://127.0.0.1:4501/api/integrations/vela/wallet',
      'https://mcp.open-design.ai',
    )).toThrow('Only tenant-owned raw artifact previews');
    expect(() => manager.publicPreviewUrl(
      'user-a',
      'http://127.0.0.1:4501/api/projects/project-1/raw/%2e%2e%2fprivate.json',
      'https://mcp.open-design.ai',
    )).toThrow('Only tenant-owned raw artifact previews');

    const parsed = new URL(publicUrl);
    const [, token, ...pathParts] = parsed.pathname.split('/').slice(2);
    const fetchImpl = vi.fn(async (target: string | URL | Request) => new Response('preview', {
      headers: { 'content-type': 'text/html' },
    }));
    const proxied = await manager.fetchPreview(
      token ?? '',
      `/${pathParts.join('/')}${parsed.search}`,
      new Headers({ accept: 'text/html' }),
      fetchImpl as typeof fetch,
    );
    expect(await proxied.text()).toBe('preview');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:4501/api/projects/project-1/raw/site/index.html?theme=dark',
    );

    const forbidden = await manager.fetchPreview(
      token ?? '',
      '/api/integrations/vela/wallet',
      new Headers(),
      fetchImpl as typeof fetch,
    );
    expect(forbidden.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 2;
    await manager.reapIdle();
    const expired = await manager.fetchPreview(
      token ?? '',
      '/api/projects/project-1/raw/index.html',
      new Headers(),
      fetchImpl as typeof fetch,
    );
    expect(expired.status).toBe(404);
  });
});
