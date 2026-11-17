/** USE-016 / OPEND-3078: recorded native usage survives real daemon HTTP,
 * assistant persistence, SSE cursor reconnect and a fresh daemon instance.
 * The only replacement is the Codex process's recorded upstream output.
 */
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase } from '../../src/db.js';
import { codexTurnUsageFromEvents } from '../../src/observability/codex-turn-usage.js';
import { buildEvalContext } from '../../src/observability/eval-context.js';
import { scanRunEventsForUsageAnalytics } from '../../src/run-analytics-observability.js';
import { startServer } from '../../src/server.js';

type Row = Record<string, any>;
type Running = { url: string; server: Server; shutdown?: () => Promise<void> | void };
const fixturePath = fileURLToPath(new URL('../fixtures/codex-app-server/turn-app-server.jsonl', import.meta.url));
const rawFixture = readFileSync(fixturePath, 'utf8');
const traceFrames: Row[] = rawFixture.split('\n').filter(Boolean).map(line => JSON.parse(line));
const tokenFrames = traceFrames.filter(frame => frame.method === 'thread/tokenUsage/updated');
const sensitiveEnv = ['POSTHOG_KEY', 'POSTHOG_HOST', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY',
  'LANGFUSE_BASE_URL', 'OPEN_DESIGN_TELEMETRY_RELAY_URL', 'OD_CODEX_TRANSPORT'] as const;

function sse(text: string): Row[] {
  return text.split('\n\n').flatMap(frame => {
    const id = /^id: (\d+)$/m.exec(frame)?.[1];
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.*)$/m.exec(frame)?.[1];
    return event && data !== undefined ? [{ id: Number(id), event, data: JSON.parse(data) }] : [];
  });
}

function usageProjection(events: Row[]) {
  const analytics = scanRunEventsForUsageAnalytics(events as any, 'codex', 0);
  const turn = codexTurnUsageFromEvents(events as any);
  return {
    cumulative: analytics.total_tokens,
    turn,
    evaluation: buildEvalContext({ runStatus: 'succeeded', toolErrorCount: 0,
      attachmentManifest: [], artifactManifest: [], agentId: 'codex',
      usage: {
        ...(analytics.input_tokens !== undefined ? { inputTokens: analytics.input_tokens } : {}),
        ...(analytics.output_tokens !== undefined ? { outputTokens: analytics.output_tokens } : {}),
        ...(analytics.total_tokens !== undefined ? { totalTokens: analytics.total_tokens } : {}),
      }, turnUsage: turn }).usage,
  };
}

async function recordedCodex(root: string, variant: string) {
  const bin = path.join(root, 'recorded-codex.cjs');
  const calls = path.join(root, 'turn-starts.jsonl');
  await writeFile(calls, '');
  // Recorded tool events are emitted as data only: this child never executes
  // commands, writes an artifact, calls a model or accesses a provider account.
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const frames = ${JSON.stringify(traceFrames)};
const variant = ${JSON.stringify(variant)};
const calls = ${JSON.stringify(calls)};
if (process.argv.includes('--version')) { console.log('codex-cli 0.149.1'); process.exit(0); }
if (!process.argv.includes('app-server')) { console.log('{}'); process.exit(0); }
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
rl.on('line', line => {
  const request = JSON.parse(line);
  const reply = result => send({ id: request.id, result });
  if (request.method === 'initialize') reply({ userAgent: 'codex-cli/0.149.1 recorded-fixture' });
  else if (request.method === 'initialized') return;
  else if (['thread/start', 'thread/resume'].includes(request.method)) reply({ thread: { id: ${JSON.stringify(tokenFrames[0]!.params.threadId)} } });
  else if (request.method === 'turn/start') {
    fs.appendFileSync(calls, JSON.stringify({ method: request.method }) + '\\n');
    reply({ turn: { id: ${JSON.stringify(tokenFrames[0]!.params.turnId)}, status: 'inProgress' } });
    for (const original of frames) {
      if (original.method === 'turn/completed' && ['duplicate', 'late'].includes(variant)) {
        send(${JSON.stringify(tokenFrames[2])});
        if (variant === 'late') send(${JSON.stringify(tokenFrames[0])});
      }
      const frame = JSON.parse(JSON.stringify(original));
      if (frame.method === 'thread/tokenUsage/updated') {
        if (variant === 'missing-last') delete frame.params.tokenUsage.last;
        if (variant === 'foreign-turn') frame.params.turnId = 'foreign-recorded-turn';
      }
      send(frame);
    }
    process.stdout.write('', () => process.exit(0));
  } else if (request.id != null) reply({});
});
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, calls };
}

describe('recorded cumulative usage durable recovery', () => {
  let running: Running | undefined;
  let scratch: string | undefined;
  const originalEnv = Object.fromEntries(sensitiveEnv.map(key => [key, process.env[key]]));
  async function stop() {
    if (!running) return;
    await running.shutdown?.();
    await new Promise<void>(resolve => running!.server.close(() => resolve()));
    running = undefined;
    closeDatabase();
  }
  afterEach(async () => {
    await stop();
    if (scratch) await rm(scratch, { recursive: true, force: true });
    scratch = undefined;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  for (const variant of ['normal', 'duplicate', 'late', 'missing-last', 'foreign-turn']) {
    it(`keeps ${variant} native usage semantics through HTTP, SQLite and restart`, async () => {
      scratch = await mkdtemp(path.join(os.tmpdir(), 'od-use016-durable-'));
      const upstream = await recordedCodex(scratch, variant);
      for (const key of sensitiveEnv) delete process.env[key];
      process.env.OD_CODEX_TRANSPORT = 'app-server';
      running = await startServer({ port: 0, host: '127.0.0.1', returnServer: true }) as Running;
      const url = running.url;
      const put = await fetch(`${url}/api/app-config`, { method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: 'codex', model: 'recorded-usage', onboardingCompleted: true,
          agentCliEnv: { codex: { CODEX_BIN: upstream.bin, CODEX_HOME: path.join(scratch, 'codex-home') } },
          privacyDecisionAt: Date.now(), telemetry: { metrics: false, content: false, artifactManifest: false } }) });
      expect(put.ok).toBe(true);
      const projectId = randomUUID();
      const created = await fetch(`${url}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: `Recorded usage ${variant}`, skipDiscoveryBrief: true, metadata: { kind: 'prototype' } }) });
      expect(created.status).toBe(200);
      const { conversationId } = await created.json() as { conversationId: string };
      const assistantMessageId = randomUUID();
      const submitted = await fetch(`${url}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, conversationId, assistantMessageId, clientRequestId: randomUUID(), agentId: 'codex',
          message: 'Replay the saved native usage fixture.', currentPrompt: 'Replay the saved native usage fixture.' }) });
      expect(submitted.status).toBe(202);
      const { runId } = await submitted.json() as { runId: string };
      const response = await fetch(`${url}/api/runs/${runId}/events`);
      expect(response.status).toBe(200);
      const live = sse(await response.text());
      const usage = live.filter(record => record.event === 'agent' && record.data.type === 'usage');
      expect(usage.length).toBe(variant === 'duplicate' ? 4 : variant === 'late' ? 5 : 3);
      expect(usage.slice(0, 3).map(record => record.data.usage.total_tokens)).toEqual([16600, 33304, 50052]);
      expect(usage.every(record => record.data.usageScope === 'sessionCumulative')).toBe(true);
      // The saved fixture is one explicit Turn containing three model calls,
      // not three Vela HTTP requests or a new cross-request billing protocol.
      expect(new Set(tokenFrames.map(frame => frame.params.turnId)).size).toBe(1);
      if (variant === 'normal' || variant === 'duplicate') {
        expect(usage.map(record => record.data.evaluationTurnUsage?.modelCalls)).toEqual(
          variant === 'duplicate' ? [1, 2, 3, 3] : [1, 2, 3],
        );
      }
      if (variant === 'late') {
        expect(usage.map(record => record.data.evaluationTurnUsage?.modelCalls ?? null))
          .toEqual([1, 2, 3, 3, null]);
      }
      if (variant === 'missing-last' || variant === 'foreign-turn') {
        expect(usage.map(record => record.data.evaluationTurnUsage)).toEqual([null, null, null]);
      }
      const expectedUnknown = ['late', 'missing-last', 'foreign-turn'].includes(variant);
      const projected = usageProjection(live);
      expect(projected.cumulative).toBe(50052);
      if (expectedUnknown) {
        expect(projected.turn).toBeNull();
        expect(projected.evaluation.status).toBe('unavailable');
        expect(projected.evaluation).not.toHaveProperty('turn');
      } else {
        expect(projected.turn).toEqual({ input: 49802, output: 250, total: 50052, modelCalls: 3 });
        expect(projected.evaluation.status).toBe('derived');
      }
      const statusResponse = await fetch(`${url}/api/runs/${runId}`);
      const status = await statusResponse.json() as { status: string; eventsLogPath: string };
      expect(status.status).toBe('succeeded');
      const messagesUrl = `/api/projects/${projectId}/conversations/${conversationId}/messages`;
      const readMessage = async (origin: string) => {
        const readStartedAt = Date.now();
        const result = await fetch(origin + messagesUrl);
        expect(result.ok).toBe(true);
        const body = await result.json() as { messages: Row[] };
        const message = body.messages.find(item => item.id === assistantMessageId);
        expect(message).toBeTruthy();
        // Each HTTP projection observes the durable task at its own read time.
        const observedAt = message?.taskDisplay?.observedAt;
        expect(observedAt).toEqual(expect.any(Number));
        expect(observedAt).toBeGreaterThanOrEqual(readStartedAt);
        expect(observedAt).toBeLessThanOrEqual(Date.now());
        return message!;
      };
      const before = await readMessage(url);
      expect(before.runId).toBe(runId);
      expect(before.runStatus).toBe('succeeded');
      const messageUsage = before.events.filter((event: Row) => event.kind === 'usage');
      // Assistant metadata compacts byte-identical adjacent non-delta events
      // (db.ts mergeMessageAgentEvents). The raw Run journal above still keeps
      // every frame; a changed late snapshot must remain independently visible.
      expect(messageUsage.map((event: Row) => event.inputTokens)).toEqual(
        variant === 'late' ? [16412, 33059, 49802, 16412] : [16412, 33059, 49802],
      );
      expect(messageUsage.map((event: Row) => event.outputTokens)).toEqual(
        variant === 'late' ? [188, 245, 250, 188] : [188, 245, 250],
      );
      const cursor = usage[0]!.id;
      const resume = await fetch(`${url}/api/runs/${runId}/events`, { headers: { 'Last-Event-ID': String(cursor) } });
      expect(resume.ok).toBe(true);
      expect(sse(await resume.text())).toEqual(live.filter(record => record.id > cursor));
      const callsBefore = await readFile(upstream.calls, 'utf8');
      expect(callsBefore.trim().split('\n')).toHaveLength(1);
      await stop();
      const durable = (await readFile(status.eventsLogPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      expect(durable.map(({ id, event, data }: Row) => ({ id, event, data }))).toEqual(live);
      expect(usageProjection(durable)).toEqual(projected);
      running = await startServer({ port: 0, host: '127.0.0.1', returnServer: true }) as Running;
      const hydrated = await fetch(`${running.url}/api/runs/${runId}/events`);
      expect(hydrated.ok).toBe(true);
      const restored = sse(await hydrated.text());
      expect(restored).toEqual(live);
      expect(usageProjection(restored)).toEqual(projected);
      expect(await readMessage(running.url)).toEqual({
        ...before,
        taskDisplay: { ...before.taskDisplay, observedAt: expect.any(Number) },
      });
      expect(await readFile(upstream.calls, 'utf8'), 'Reading/reconnecting must not invoke another model turn').toBe(callsBefore);
      if (process.env.USE016_DURABLE_EVIDENCE_DIR) {
        const evidence = { variant, runId, projectId, assistantMessageId, traceSHA256: createHash('sha256').update(rawFixture).digest('hex'),
          originalTraceUsage: tokenFrames.map(frame => ({
            threadId: frame.params.threadId, turnId: frame.params.turnId,
            total: frame.params.tokenUsage.total, last: frame.params.tokenUsage.last,
          })),
          liveUsage: usage, messageUsage, projected, cursor, reconnectRecords: live.filter(record => record.id > cursor).length,
          restoredIdentical: true, persistedMessageIdentical: true, nativeTurnStarts: 1,
          boundary: 'Real daemon HTTP/SSE, SQLite and fresh-instance recovery; controlled recorded Codex process, no provider or AMR money call.' };
        await writeFile(path.join(process.env.USE016_DURABLE_EVIDENCE_DIR, `${variant}.safe.json`), JSON.stringify(evidence, null, 2) + '\n');
      }
    });
  }
});
