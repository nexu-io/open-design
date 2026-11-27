import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it, vi } from 'vitest';
import type { ChatRunCreateResponse, ChatRunStatusResponse } from '@open-design/contracts';
import { startServer, type StartServerResult } from '../src/server.js';

it('reaps a completed one-shot DSH process and resumes its saved session', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'od-dsh-completed-'));
  const windows = process.platform === 'win32';
  const home = path.join(root, 'dsh-home');
  const binary = path.join(root, windows ? 'dsh.cmd' : 'dsh');
  const fixture = fileURLToPath(new URL('fixtures/dsh-profile/fake-dsh.ts', import.meta.url));
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  let daemon: StartServerResult | undefined;
  async function request<T>(route: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
    const response = await fetch(daemon!.url + route, {
      method,
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8_000),
    });
    expect(response.ok, route).toBe(true);
    return await response.json() as T;
  }
  try {
    const profile = path.join(home, 'profiles', 'open-design');
    await mkdir(profile, { recursive: true });
    await writeFile(path.join(profile, 'package.json'), '{}');
    const args = `"${process.execPath}" --import "${loader}" "${fixture}"`;
    await writeFile(binary, windows ? `@echo off\r\n${args} %*\r\n` : `#!/bin/sh\nexec ${args} "$@"\n`, { mode: 0o755 });
    vi.stubEnv('DSH_BIN', binary);
    vi.stubEnv('DSH_HOME', home);
    vi.stubEnv('OD_DSH_FAKE_MODE', 'linger-after-result');
    vi.stubEnv('OD_DSH_FAKE_SESSION_ROOT', path.join(root, 'sessions'));
    vi.stubEnv('OD_NEXT_STRATEGY_ROLLOUT', 'off');
    daemon = await startServer({ port: 0, returnServer: true }) as StartServerResult;
    await request('/api/app-config', { agentCliEnv: { 'deepseek-harness': { DSH_BIN: binary } } }, 'PUT');
    const projectId = randomUUID();
    const { conversationId } = await request<{ conversationId: string }>('/api/projects', {
      id: projectId, name: 'Isolated DSH profile', skipDiscoveryBrief: true,
    });
    for (const [message, output] of [['start', 'created'], ['continue', 'updated']]) {
      const { runId } = await request<ChatRunCreateResponse>('/api/runs', {
        agentId: 'deepseek-harness', projectId, conversationId, message,
        assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
      });
      const response = await fetch(`${daemon.url}/api/runs/${runId}/events`, { signal: AbortSignal.timeout(7_000) });
      expect(await response.text()).toContain(`"delta":"${output}"`);
      expect((await request<ChatRunStatusResponse>(`/api/runs/${runId}`)).status).toBe('succeeded');
    }
  } finally {
    await daemon?.shutdown?.();
    if (daemon) await new Promise<void>(resolve => daemon?.server.close(() => resolve()));
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
