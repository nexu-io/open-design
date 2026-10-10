import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { startServer } from '../src/server.js';

type Started = { url: string; server: Server; shutdown: () => unknown };
let started: Started | undefined;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
async function json(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  assert(isRecord(value));
  return value;
}
let directory: string | undefined;
const previousBin = process.env.DSH_BIN;
const previousHome = process.env.DSH_HOME;
const previousState = process.env.OD_DSH_GENERATION_STATE;
afterEach(async () => {
  if (started) {
    const active = started;
    await active.shutdown();
    await new Promise<void>((resolve) => active.server.close(() => resolve()));
    started = undefined;
  }
  if (previousBin === undefined) delete process.env.DSH_BIN; else process.env.DSH_BIN = previousBin;
  if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
  if (previousState === undefined) delete process.env.OD_DSH_GENERATION_STATE; else process.env.OD_DSH_GENERATION_STATE = previousState;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it('uses spawned generations for cold turns, same-generation resume, upgrade, rollback and stale-target reseed', async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'od-dsh-lifecycle-'));
  const statePath = path.join(directory, 'state.json');
  const fixture = path.resolve('tests/fixtures/dsh-profile/generation-dsh.ts');
  const bin = path.join(directory, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  writeFileSync(bin, process.platform === 'win32'
    ? '@echo off\r\n"' + process.execPath + '" "' + fixture + '" %*\r\n'
    : '#!/bin/sh\nexec ' + quote(process.execPath) + ' ' + quote(fixture) + ' "$@"\n');
  chmodSync(bin, 0o700);
  writeFileSync(statePath, JSON.stringify({ generation: 'generation-1' }));
  process.env.DSH_BIN = bin;
  process.env.DSH_HOME = directory;
  process.env.OD_DSH_GENERATION_STATE = statePath;
  mkdirSync(path.join(directory, 'profiles/open-design'), { recursive: true });
  writeFileSync(path.join(directory, 'profiles/open-design/package.json'), '{}');
  const runtime = await startServer({ port: 0, returnServer: true });
  assert(isRecord(runtime));
  const { url, server, shutdown } = runtime;
  assert(typeof url === 'string' && server instanceof Server && typeof shutdown === 'function');
  started = { url, server, shutdown: () => shutdown() };
  const config = await fetch(`${url}/api/app-config`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId: 'deepseek-harness', agentCliEnv: {
      'deepseek-harness': { DSH_BIN: bin, OD_DSH_GENERATION_STATE: statePath },
    } }),
  });
  expect(config.status).toBe(200);
  const project = await fetch(`${url}/api/projects`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: `generation_${randomUUID()}`, name: 'Generation test', metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }),
  });
  expect(project.status).toBe(200);
  const projectBody = await json(project);
  assert(isRecord(projectBody.project));
  const projectId = projectBody.project.id;
  assert(typeof projectId === 'string');
  const conversation = await fetch(url + '/api/projects/' + projectId + '/conversations', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Generation' }),
  });
  expect(conversation.status, await conversation.clone().text()).toBe(200);
  const conversationBody = await json(conversation);
  assert(isRecord(conversationBody.conversation));
  const conversationId = conversationBody.conversation.id;
  assert(typeof conversationId === 'string');
  const commands = (): Array<{ prompt: string; resume_session_id?: string }> =>
    readFileSync(`${statePath}.commands`, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  async function turn(cancel = false) {
    const response = await fetch(`${url}/api/runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, conversationId, assistantMessageId: randomUUID(),
        clientRequestId: randomUUID(), agentId: 'deepseek-harness',
        message: 'HISTORY_SENTINEL\nCURRENT_SENTINEL', currentPrompt: 'CURRENT_SENTINEL',
      }),
    });
    expect(response.status, await response.clone().text()).toBe(202);
    const { runId } = await json(response);
    assert(typeof runId === 'string');
    const events = await fetch(`${url}/api/runs/${runId}/events`);
    expect(events.status).toBe(200);
    if (cancel) {
      const reader = events.body?.getReader();
      if (!reader) throw new Error('Event stream unavailable');
      let cancelled = false;
      let pending = '';
      const decoder = new TextDecoder();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        pending += decoder.decode(next.value, { stream: true });
        const frames = pending.split('\n\n');
        pending = frames.pop() ?? '';
        const validatedSession = frames.some((frame) => {
          const lines = frame.split('\n');
          if (!lines.includes('event: agent')) return false;
          const data = lines.find((line) => line.startsWith('data: '));
          if (!data) return false;
          const payload: unknown = JSON.parse(data.slice(6));
          return isRecord(payload) && payload.type === 'status' &&
            payload.label === 'working' && typeof payload.sessionId === 'string';
        });
        if (!cancelled && validatedSession) {
          cancelled = true;
          const response = await fetch(url + '/api/runs/' + runId + '/cancel', { method: 'POST' });
          expect(response.status).toBe(200);
        }
      }
      expect(cancelled).toBe(true);
    } else {
      await events.text();
    }
    const status = await json(await fetch(`${url}/api/runs/${runId}`));
    expect(status.status).toBe(cancel ? 'canceled' : 'succeeded');
    return commands().at(-1);
  }
  expect((await turn())?.prompt).toContain('HISTORY_SENTINEL');
  const resumed = await turn();
  expect(resumed?.resume_session_id).toBeTruthy();
  expect(resumed?.prompt).not.toContain('HISTORY_SENTINEL');
  writeFileSync(statePath, JSON.stringify({ generation: 'generation-2' }));
  const upgraded = await turn();
  expect(upgraded?.resume_session_id).toBeUndefined();
  expect(upgraded?.prompt).toContain('HISTORY_SENTINEL');
  expect((await turn())?.resume_session_id).toBeTruthy();
  writeFileSync(statePath, JSON.stringify({ generation: 'generation-1' }));
  expect((await turn())?.resume_session_id).toBeUndefined();
  writeFileSync(statePath, JSON.stringify({ generation: 'generation-1', reject: true }));
  const before = commands().length;
  const reseeded = await turn();
  expect(commands()).toHaveLength(before + 2);
  expect(reseeded?.resume_session_id).toBeUndefined();
  expect(reseeded?.prompt).toContain('HISTORY_SENTINEL');
  writeFileSync(statePath, JSON.stringify({ generation: 'generation-2', wait: true }));
  const cancelled = await turn(true);
  expect(cancelled?.resume_session_id).toBeUndefined();
  writeFileSync(statePath, JSON.stringify({ generation: 'generation-2' }));
  expect((await turn())?.resume_session_id).toBeTruthy();
}, 30_000);
