import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createReasoningCodex } from '@/codex-reasoning';
import { requestJson } from '@/vitest/http';
import { waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';
type AgentsResponse = { agents: Array<{ id: string; models?: Array<{ id: string; reasoningOptions?: Array<{ id: string }> }> }> };
type ConnectionTestResponse = { ok: boolean; kind: string };

test('Codex catalogue -> HTTP validation -> actual child arguments', async () => {
  const suite = await createSmokeSuite('codex-reasoning');
  await suite.with.toolsDev(async ({ webUrl }) => {
    const fixture = await createReasoningCodex(join(suite.scratchDir, 'codex'));
    await requestJson(webUrl, '/api/app-config', { method: 'PUT', body: {
      agentId: 'codex', agentCliEnv: { codex: fixture.env }, onboardingCompleted: true,
    } });
    const project = await requestJson<{ project: { id: string }; conversationId: string }>(webUrl, '/api/projects', {
      body: { id: randomUUID(), name: 'Reasoning acceptance', metadata: { kind: 'prototype' } },
    });
    const body = { projectId: project.project.id, conversationId: project.conversationId,
      agentId: 'codex', message: 'Reply ok', model: 'gpt-6-astra', reasoning: 'deep-v2' };
    // No /api/agents request first: headless callers must discover capabilities too.
    const run = await requestJson<{ runId: string }>(webUrl, '/api/runs', { body });
    const final = await waitForRunTerminal(webUrl, run.runId);
    expect(final.status).toBe('succeeded');
    const args = JSON.parse((await readFile(fixture.log, 'utf8')).trim().split('\n')[0]!);
    expect(args).toContain('model_reasoning_effort="deep-v2"');
    expect(args).toContain('gpt-6-astra');

    const rejected = await requestJson<{ runId: string }>(webUrl, '/api/runs', {
      body: { ...body, model: 'gpt-5.5', reasoning: 'ultra' },
    });
    expect((await waitForRunTerminal(webUrl, rejected.runId)).status).toBe('failed');
    const afterRejected = (await readFile(fixture.log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as string[]);
    expect(afterRejected.some((argv) => argv.includes('gpt-5.5'))).toBe(false);
    expect(afterRejected.filter((argv) => argv.some((arg) => arg.includes(project.project.id)))).toHaveLength(1);

    const agents = await requestJson<AgentsResponse>(webUrl, '/api/agents');
    expect(agents.agents.find((a) => a.id === 'codex')?.models?.find((m) => m.id === 'gpt-6-astra')
      ?.reasoningOptions?.map((r) => r.id)).toContain('deep-v2');
    for (const [model, reasoning, ok] of [
      ['gpt-5.6-sol', 'max', true], ['gpt-5.5', 'ultra', false],
    ] as const) {
      const result = await requestJson<ConnectionTestResponse>(webUrl, '/api/test/connection', {
        body: { mode: 'agent', agentId: 'codex', agentCliEnv: { codex: fixture.env }, model, reasoning },
      });
      expect(result.ok).toBe(ok);
      if (!ok) expect(result.kind).toBe('invalid_reasoning');
    }
    const executed = (await readFile(fixture.log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    // The daemon may also run a background title/summary task without an effort.
    const explicit = executed.filter((argv: string[]) => argv.some((arg) => arg.startsWith('model_reasoning_effort=')));
    expect(explicit).toHaveLength(2);
    expect(explicit[1]).toContain('model_reasoning_effort="max"');
    expect(executed.some((argv: string[]) => argv.includes('gpt-5.5'))).toBe(false);
    await suite.report.json('reasoning-argv.json', executed);
    await suite.report.json('agents.json', agents);
  });
}, 180_000);
