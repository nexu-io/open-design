/** USE-016 step 1: opt-in cross-repository fixture, never a provider account.
 * The controlled SDK really makes three HTTP calls to the isolated AMR Link.
 * It derives native cumulative notifications from those responses. Missing
 * OD_E2E_USE016_BINDING means not executed, never an acceptance pass.
 */
import { randomUUID, createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import { requestJson } from '@/vitest/http';
import { listMessages } from '@/vitest/messages';
import { startRun } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

type Binding = {
  schemaVersion: number;
  productionTuple: unknown;
  apiOrigin: string;
  linkOrigin: string;
  chatEndpoint: string;
  requestIdHeader: string;
  model: string;
  runtimeApiKey: string;
  workspaceId: string;
  sessionId?: string;
  requestTags: Array<{ requestId: string; totalTokens: number; inputTokens: number; outputTokens: number; body: unknown }>;
};
type Counters = { input: number; output: number; total: number; modelCalls: number };
type Usage = { input_tokens: number; output_tokens: number; total_tokens: number };
type Event = { id: number; event: string; data: { type?: string; usageScope?: string; usage?: Usage; evaluationTurnUsage?: Counters | null } };
const bindingPath = process.env.OD_E2E_USE016_BINDING;

function parseSse(text: string): Event[] {
  return text.split('\n\n').flatMap(frame => {
    const id = /^id: (\d+)$/m.exec(frame)?.[1];
    const event = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.*)$/m.exec(frame)?.[1];
    return id && event && data ? [{ id: Number(id), event, data: JSON.parse(data) }] : [];
  });
}

async function writeSdkFixture(directory: string, bindingFile: string) {
  const bin = join(directory, 'codex-controlled.cjs');
  const receiptsPath = join(directory, 'sdk-receipts.safe.json');
  const invocationsPath = join(directory, 'sdk-invocations.safe.jsonl');
  await mkdir(directory, { recursive: true });
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const binding = JSON.parse(fs.readFileSync(${JSON.stringify(bindingFile)}, 'utf8'));
const receiptsPath = ${JSON.stringify(receiptsPath)};
const invocationsPath = ${JSON.stringify(invocationsPath)};
fs.appendFileSync(invocationsPath, JSON.stringify({
  mode: process.argv.includes('app-server') ? 'app-server' : process.argv.includes('--version') ? 'version' : process.argv.includes('exec') ? 'exec-json' : 'other',
  flags: process.argv.slice(2).filter(arg => arg.startsWith('-')).map(arg => arg.split('=')[0]),
}) + '\\n');
const receipts = { threadId: require('node:crypto').randomUUID(), turnId: require('node:crypto').randomUUID(), turnStarts: 0, calls: [], notifications: [] };
const save = () => fs.writeFileSync(receiptsPath, JSON.stringify(receipts, null, 2));
const send = frame => { process.stdout.write(JSON.stringify(frame) + '\\n'); };
const notify = frame => { receipts.notifications.push(frame); save(); send(frame); };
if (process.argv.includes('--version')) { console.log('codex-cli 0.149.1 controlled-sdk'); process.exit(0); }
if (!process.argv.includes('app-server')) { console.log('{}'); process.exit(0); }
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async line => {
  const request = JSON.parse(line);
  const reply = result => send({ id: request.id, result });
  try {
    if (request.method === 'initialize') reply({ userAgent: 'codex-cli/0.149.1 controlled-sdk' });
    else if (request.method === 'initialized') return;
    else if (['thread/start', 'thread/resume'].includes(request.method)) {
      reply({ thread: { id: receipts.threadId } });
      send({ method: 'thread/started', params: { thread: { id: receipts.threadId, status: { type: 'idle' } } } });
    }
    else if (request.method === 'turn/start') {
      receipts.turnStarts += 1; save();
      if (receipts.turnStarts !== 1) throw new Error('unexpected repeated turn/start');
      reply({ turn: { id: receipts.turnId, status: 'inProgress' } });
      send({ method: 'turn/started', params: { threadId: receipts.threadId, turn: { id: receipts.turnId, items: [], status: 'inProgress' } } });
      const total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      let first;
      for (let index = 0; index < binding.requestTags.length; index++) {
        const tag = binding.requestTags[index];
        const response = await fetch(binding.chatEndpoint, {
          method: 'POST', signal: AbortSignal.timeout(30000),
          headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + binding.runtimeApiKey,
            'x-request-id': tag.requestId, 'session-id': binding.sessionId || receipts.threadId },
          body: JSON.stringify(tag.body),
        });
        const body = await response.json();
        const usage = body.usage;
        const call = { requestId: tag.requestId, status: response.status, responseId: body.id,
          model: body.model, usage, round: index + 1 };
        receipts.calls.push(call); save();
        if (!response.ok || !usage || ![usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(v => Number.isSafeInteger(v) && v >= 0))
          throw new Error('Link response lacks exact successful usage at round ' + (index + 1));
        const last = { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens };
        for (const key of Object.keys(total)) total[key] += last[key];
        const frame = { method: 'thread/tokenUsage/updated', params: { threadId: receipts.threadId, turnId: receipts.turnId,
          tokenUsage: { total: { ...total }, last, modelContextWindow: 128000 } } };
        if (index === 0) first = frame;
        notify(frame);
        if (index === 1) notify(frame); // Transport repeat: no fourth model HTTP.
      }
      notify(first); // Late old cumulative notification, no fourth model HTTP.
      const item = { type: 'agentMessage', id: 'use016-final', text: 'Three isolated Link calls completed.', phase: 'final_answer' };
      send({ method: 'item/completed', params: { threadId: receipts.threadId, turnId: receipts.turnId, item } });
      send({ method: 'turn/completed', params: { threadId: receipts.threadId, turn: { id: receipts.turnId,
        status: 'completed', items: [item], error: null } } });
      process.stdout.write('', () => process.exit(0));
    } else if (request.id != null) reply({});
  } catch (error) {
    receipts.failure = String(error); save();
    process.stderr.write(String(error) + '\\n'); process.exit(1);
  }
});
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, receiptsPath, invocationsPath };
}

describe('USE-016 cumulative SDK notifications with real isolated Link calls', () => {
  test.skipIf(!bindingPath)('[P1] keeps three Link rows 100/80/60 while native notifications repeat and arrive late', async () => {
    const binding = JSON.parse(await readFile(bindingPath!, 'utf8')) as Binding;
    expect(binding.schemaVersion).toBe(1);
    expect(binding.requestIdHeader).toBe('x-request-id');
    expect(new URL(binding.chatEndpoint).origin).toBe(binding.linkOrigin);
    expect(binding.requestTags.map(tag => tag.totalTokens)).toEqual([100, 80, 60]);
    expect(new Set(binding.requestTags.map(tag => tag.requestId)).size).toBe(3);
    for (const origin of [binding.apiOrigin, binding.linkOrigin]) {
      expect(new URL(origin).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    }
    const suite = await createSmokeSuite('use016-cumulative-link');
    const sdk = await writeSdkFixture(join(suite.scratchDir, 'sdk'), bindingPath!);
    const exportDir = process.env.OD_E2E_USE016_EVIDENCE_DIR;
    const save = async (name: string, value: unknown) => {
      await suite.report.json(name, value);
      if (exportDir) { await mkdir(exportDir, { recursive: true }); await writeFile(join(exportDir, name), JSON.stringify(value, null, 2) + '\n'); }
    };
    await suite.with.env({
      OD_CODEX_TRANSPORT: 'app-server', OPEN_DESIGN_VELA_TELEMETRY: 'off', POSTHOG_KEY: null, POSTHOG_HOST: null,
      LANGFUSE_PUBLIC_KEY: null, LANGFUSE_SECRET_KEY: null, LANGFUSE_BASE_URL: null, OPEN_DESIGN_TELEMETRY_RELAY_URL: null,
    }, async () => {
      await suite.with.toolsDev(async ({ runtime, status }) => {
        const origin = `http://127.0.0.1:${runtime.daemonPort}`;
        await requestJson(origin, '/api/app-config', { method: 'PUT', body: {
          agentId: 'codex', onboardingCompleted: true, designSystemId: null, skillId: null,
          agentCliEnv: { codex: { CODEX_BIN: sdk.bin, CODEX_HOME: suite.codexHomeDir } },
          privacyDecisionAt: Date.now(), telemetry: { metrics: false, content: false, artifactManifest: false },
        } });
        const projectId = randomUUID();
        const project = await requestJson<{ conversationId: string }>(origin, '/api/projects', { body: {
          id: projectId, name: 'USE-016 real Link cumulative', skipDiscoveryBrief: true, metadata: { kind: 'prototype' },
        } });
        const assistantMessageId = randomUUID();
        const { runId } = await startRun(origin, { projectId, conversationId: project.conversationId, assistantMessageId,
          clientRequestId: randomUUID(), agentId: 'codex', model: 'controlled-sdk', message: 'Run the three isolated test requests.' });
        const liveResponse = await fetch(`${origin}/api/runs/${runId}/events`);
        expect(liveResponse.ok).toBe(true);
        const live = parseSse(await liveResponse.text());
        await save('native-events.safe.json', live);
        const usages = live.filter(record => record.event === 'agent' && record.data.type === 'usage');
        expect(usages.map(record => record.data.usage?.total_tokens)).toEqual([100, 180, 180, 240, 100]);
        expect(usages.map(record => record.data.usageScope)).toEqual(Array(5).fill('sessionCumulative'));
        expect(usages.map(record => record.data.evaluationTurnUsage?.modelCalls ?? null)).toEqual([1, 2, 2, 3, null]);
        expect(usages[3]!.data.evaluationTurnUsage).toEqual({ input: 237, output: 3, total: 240, modelCalls: 3 });
        expect(usages[4]!.data.evaluationTurnUsage).toBeNull();
        const run = await requestJson<ChatRunStatusResponse>(origin, `/api/runs/${runId}`);
        expect(run.status).toBe('succeeded');
        // Public terminal diagnostics consume the production high-water scanner,
        // rather than a test importing/reimplementing daemon analytics internals.
        expect(run.executionDiagnostics?.cache.inputTokensEffective.value).toBe(237);
        expect(run.eventsLogPath).toEqual(expect.any(String));
        const disk = (await readFile(run.eventsLogPath!, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        expect(disk.map(({ id, event, data }: Event) => ({ id, event, data }))).toEqual(live);
        const cursor = usages[1]!.id;
        const resumed = await fetch(`${origin}/api/runs/${runId}/events`, { headers: { 'Last-Event-ID': String(cursor) } });
        expect(resumed.ok).toBe(true);
        expect(parseSse(await resumed.text())).toEqual(live.filter(record => record.id > cursor));
        const messages = await listMessages(origin, projectId, project.conversationId);
        const message = messages.find(row => row.id === assistantMessageId)!;
        expect(message.runId).toBe(runId);
        expect(message.runStatus).toBe('succeeded');
        const persistedUsage = (message.events ?? []).filter((event): event is { kind: string; inputTokens: number; outputTokens: number } =>
          event !== null && typeof event === 'object' && 'kind' in event && event.kind === 'usage');
        expect(persistedUsage.map(event => event.inputTokens)).toEqual([99, 178, 237, 99]);
        expect(persistedUsage.map(event => event.outputTokens)).toEqual([1, 2, 3, 1]);
        expect((await listMessages(origin, projectId, project.conversationId)).find(row => row.id === assistantMessageId)).toEqual(message);
        const receipts = JSON.parse(await readFile(sdk.receiptsPath, 'utf8')) as {
          calls: Array<{ requestId: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; status: number }>;
          notifications: Array<{ params: { tokenUsage: { total: { totalTokens: number } } } }>; turnStarts: number;
        };
        expect(receipts.turnStarts).toBe(1);
        expect(receipts.calls.map(call => call.requestId)).toEqual(binding.requestTags.map(tag => tag.requestId));
        expect(receipts.calls.map(call => call.usage.total_tokens)).toEqual([100, 80, 60]);
        expect(receipts.calls.map(call => call.usage.prompt_tokens)).toEqual([99, 79, 59]);
        expect(receipts.calls.map(call => call.usage.completion_tokens)).toEqual([1, 1, 1]);
        expect(receipts.calls.every(call => call.status === 200)).toBe(true);
        expect(receipts.notifications.map(frame => frame.params.tokenUsage.total.totalTokens)).toEqual([100, 180, 180, 240, 100]);
        const invocations = (await readFile(sdk.invocationsPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        expect(invocations.filter(item => item.mode === 'app-server')).toHaveLength(1);
        expect(invocations.filter(item => item.mode === 'exec-json')).toHaveLength(0);
        await save('sdk-invocations.safe.json', invocations);
        await save('sdk-receipts.safe.json', receipts);
        await save('summary.safe.json', { productionTuple: binding.productionTuple, workspaceId: binding.workspaceId,
          runId, projectId, conversationId: project.conversationId, assistantMessageId, namespace: suite.namespace,
          daemonPid: status.apps?.daemon?.pid, sdkSourceSHA256: createHash('sha256').update(await readFile(sdk.bin)).digest('hex'),
          requestIds: receipts.calls.map(call => call.requestId), requestTokens: [100, 80, 60], totalTokens: 240,
          nativeCumulative: [100, 180, 180, 240, 100], turnBeforeLate: usages[3]!.data.evaluationTurnUsage,
          turnAfterLate: usages[4]!.data.evaluationTurnUsage, persistedUsage,
          productionInputHighWater: run.executionDiagnostics?.cache.inputTokensEffective,
          exactJournalAndCursorReplay: true, assistantRereadIdentical: true, actualModelHttpCalls: receipts.calls.length,
          boundary: 'Controlled SDK and supplier; real Link HTTP and daemon native normalizer/HTTP/SSE/JSONL/SQLite. No new cumulative billing API. No daemon restart or remote analytics acceptance claimed.' });
      }, { env: { OD_CODEX_TRANSPORT: 'app-server' }, onFailure: async () => {
        await save('failure.safe.json', { receipts: JSON.parse(await readFile(sdk.receiptsPath, 'utf8').catch(() => '{}')), namespace: suite.namespace });
      } });
    });
  }, 180_000);
});
