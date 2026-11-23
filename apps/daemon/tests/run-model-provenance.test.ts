import type { Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatRunCreateResponse, ChatRunStatusResponse } from '@open-design/contracts';
import { startServer } from '../src/server.js';

afterEach(() => vi.unstubAllEnvs());

it('keeps model provenance on each run and its saved assistant message', async () => {
  vi.stubEnv('OD_NEXT_STRATEGY_ROLLOUT', 'off');
  const root = await mkdtemp(path.join(tmpdir(), 'od-model-provenance-'));
  const fake = path.join(root, 'claude');
  let server: Server | undefined;
  let shutdown: (() => Promise<void>) | undefined;
  let base: string;
  async function request<T = unknown>(route: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    const response = await fetch(base + route, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    expect(response.ok, route).toBe(true);
    return await response.json() as T;
  }
  try {
    await writeFile(fake, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('2.1.233 (Claude Code)'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]'); process.exit(0); }
const index = process.argv.indexOf('--model');
const selected = index < 0 ? 'default' : process.argv[index + 1];
const emit = data => fs.writeSync(1, JSON.stringify(data) + '\\n');
emit({ type: 'system', subtype: 'init', model: 'cli-configured-model' });
emit({ type: 'assistant', message: { id: 'msg_fixture', ...(selected === 'requested-one' ? { model: 'provider-observed-one' } : {}),
  content: [{ type: 'text', text: 'Isolated model provenance fixture.' }], stop_reason: 'end_turn' } });
`, { mode: 0o755 });
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string; server: Server; shutdown: () => Promise<void>;
    };
    ({ url: base, server, shutdown } = started);
    await request('/api/app-config', {
      agentId: 'claude', agentCliEnv: { claude: { CLAUDE_BIN: fake } },
      telemetry: { metrics: false, content: false, artifactManifest: false }, privacyDecisionAt: Date.now(),
    }, 'PUT');
    const projectId = randomUUID();
    const { conversationId } = await request<{ conversationId: string }>('/api/projects', {
      id: projectId, name: 'Model provenance fixture', skipDiscoveryBrief: true,
    });
    const routes: Array<{ id: string; stream: string; model: string }> = [];
    for (const model of ['requested-one', 'requested-two']) {
      const id = randomUUID();
      const { runId } = await request<ChatRunCreateResponse>('/api/runs', {
        projectId, conversationId, agentId: 'claude', assistantMessageId: id,
        clientRequestId: randomUUID(), model, message: 'Run the local fixture only.',
      });
      const response = await fetch(`${base}/api/runs/${runId}/events`);
      expect(response.ok).toBe(true);
      const stream = await response.text();
      expect((await request<ChatRunStatusResponse>(`/api/runs/${runId}`)).status).toBe('succeeded');
      routes.push({ id, stream, model });
    }
    await request('/api/app-config', { agentId: 'codex' }, 'PUT');
    const historyPath = `/api/projects/${projectId}/conversations/${conversationId}/messages`;
    const { messages: history } = await request<{ messages: ChatMessage[] }>(historyPath);
    for (const turn of routes) {
      expect(turn.stream).toContain(`"requestedModel":"${turn.model}"`);
      const message = history.find((message) => message.id === turn.id);
      expect(message?.events).toContainEqual(expect.objectContaining({
        kind: 'status', label: 'starting', requestedModel: turn.model, dispatchedModel: turn.model, agentId: 'claude',
      }));
      const observed = message?.events?.filter((event) => event.kind === 'status' && event.label === 'provider_model');
      expect(observed).toEqual(turn.model === 'requested-one'
        ? [expect.objectContaining({ detail: 'provider-observed-one' })] : []);
    }
    const first = history.find((message) => message.id === routes[0]?.id);
    if (!first?.events) throw new Error('Fixture run did not save events');
    await request(`${historyPath}/${first.id}`, {
      ...first,
      events: first.events.map((event) =>
        event.kind === 'status' && (event.label === 'starting' || event.label === 'provider_model')
          ? { kind: 'status', label: 'starting', detail: 'claude' }
          : event),
    }, 'PUT');
    const { messages: afterStaleWrite } = await request<{ messages: ChatMessage[] }>(historyPath);
    expect(afterStaleWrite.find((message) => message.id === first.id)?.events).toEqual(first.events);
  } finally {
    await shutdown?.();
    await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve());
    await rm(root, { recursive: true, force: true });
  }
});
