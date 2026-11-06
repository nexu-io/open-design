// @ts-nocheck
// HTTP-layer tests for `POST /api/projects/:id/handoff` — mirrors the
// pattern used by `finalize-design.test.ts`'s HTTP-layer block: spin
// up the real daemon via `startServer({ port: 0 })`, exercise the
// validation cases against it, and mock `globalThis.fetch` for the
// upstream Anthropic call so we can drive happy-path and upstream
// error-mapping responses without going to the network.

import fs from 'node:fs';
import * as http from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = 'handoff-route-fixture';

describe('POST /api/projects/:id/handoff — HTTP layer', () => {
  let server: http.Server;
  let baseUrl: string;
  // The seeded conversation (one message) — handoff is conversation-scoped,
  // so every request that should reach synthesis carries this id.
  let conversationId: string;

  beforeAll(async () => {
    const { startServer } = await import('../../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');

    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PROJECT_ID, name: 'Handoff fixture' }),
    });
    const projectDir = path.join(dataDir, 'projects', PROJECT_ID);
    await mkdir(projectDir, { recursive: true });

    // Seed a conversation with one message so transcript export succeeds.
    const convResp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Initial' }),
    });
    const convBody = (await convResp.json()) as { conversation: { id: string } };
    conversationId = convBody.conversation.id;
    await fetch(
      `${baseUrl}/api/projects/${PROJECT_ID}/conversations/${convBody.conversation.id}/messages/seed-msg`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'user',
          content: 'hello',
        }),
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function postHandoff(id: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/projects/${id}/handoff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function mockAnthropicResponse(status: number, body: string, contentType = 'application/json') {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('api.anthropic.com')) {
        return new Response(body, { status, headers: { 'content-type': contentType } });
      }
      return realFetch(input, init);
    });
  }

  it('400 BAD_REQUEST when apiKey is missing', async () => {
    const res = await postHandoff(PROJECT_ID, { model: 'claude-opus-4-7' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message.toLowerCase()).toContain('apikey');
  });

  it('400 BAD_REQUEST when model is missing', async () => {
    const res = await postHandoff(PROJECT_ID, { apiKey: 'sk-test' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message.toLowerCase()).toContain('model');
  });

  it('400 BAD_REQUEST when baseUrl is not a valid URL', async () => {
    const res = await postHandoff(PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'not-a-url',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('403 FORBIDDEN when baseUrl points at a private internal IP', async () => {
    const res = await postHandoff(PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'http://10.0.0.1',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('400 BAD_REQUEST when :id contains unsafe characters', async () => {
    const res = await postHandoff('bad!id', {
      conversationId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message.toLowerCase()).toContain('project id');
  });

  it('404 PROJECT_NOT_FOUND when the project id does not exist', async () => {
    const res = await postHandoff('does-not-exist', {
      conversationId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400 BAD_REQUEST when conversationId is missing', async () => {
    const res = await postHandoff(PROJECT_ID, {
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message.toLowerCase()).toContain('conversationid');
  });

  it('404 CONVERSATION_NOT_FOUND when the conversation is not in this project', async () => {
    const res = await postHandoff(PROJECT_ID, {
      conversationId: 'no-such-conversation',
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('400 EMPTY_TRANSCRIPT when the conversation has no messages', async () => {
    // An empty conversation must fail fast — synthesizing a handoff from
    // zero messages would spend BYOK tokens fabricating context.
    const convResp = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Empty' }),
    });
    const emptyId = ((await convResp.json()) as { conversation: { id: string } }).conversation.id;

    // Mock upstream so a regressed guard surfaces as a non-400 here
    // rather than reaching out to the real network.
    mockAnthropicResponse(
      200,
      JSON.stringify({ content: [{ type: 'text', text: 'x' }], usage: {} }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId: emptyId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('EMPTY_TRANSCRIPT');
  });

  it('200 happy path returns the synthesized prompt + usage', async () => {
    mockAnthropicResponse(
      200,
      JSON.stringify({
        content: [{ type: 'text', text: '## Context\nresume this work\n' }],
        usage: { input_tokens: 1234, output_tokens: 567 },
      }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBe('## Context\nresume this work\n');
    expect(body.model).toBe('claude-opus-4-7');
    expect(body.inputTokens).toBe(1234);
    expect(body.outputTokens).toBe(567);
    expect(typeof body.transcriptMessageCount).toBe('number');
  });

  it('401 UNAUTHORIZED when upstream rejects the api key', async () => {
    mockAnthropicResponse(
      401,
      JSON.stringify({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: 'sk-bad',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('429 RATE_LIMITED when upstream rate-limits', async () => {
    mockAnthropicResponse(
      429,
      JSON.stringify({ error: { type: 'rate_limit_error', message: 'rate limited' } }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('502 UPSTREAM_UNAVAILABLE on upstream 500', async () => {
    mockAnthropicResponse(
      500,
      JSON.stringify({ error: { type: 'api_error', message: 'oops' } }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('400 BAD_REQUEST when upstream rejects the request shape (Anthropic 400 invalid_request_error)', async () => {
    // An upstream 400 is deterministic caller input (unknown model, bad
    // maxTokens) — it must not be remapped to a 502 that invites pointless
    // retries and hides which field is wrong. The echoed key also exercises
    // the redacted-details path nettee asked the 400 branch to preserve.
    const echoedKey = 'sk-leaky-400';
    mockAnthropicResponse(
      400,
      JSON.stringify({
        error: {
          type: 'invalid_request_error',
          message: `model: unknown model (key ${echoedKey})`,
        },
      }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: echoedKey,
      model: 'claude-not-a-real-model',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(echoedKey); // inbound key redacted
    expect(serialized).toContain('invalid_request_error'); // upstream detail surfaced
  });

  it('502 UPSTREAM_UNAVAILABLE when upstream returns non-JSON body', async () => {
    mockAnthropicResponse(200, '<html>not json</html>', 'text/html');

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('409 CONFLICT when .transcript.lock is already held (concurrent handoff or overlapping transcript consumer)', async () => {
    // The transcript-export primitive (apps/daemon/src/transcript-export.ts:131-163)
    // acquires <projectDir>/.transcript.lock via fs.openSync('wx') and throws
    // TranscriptExportLockedError on EEXIST. A second concurrent handoff
    // request — or a handoff that races /finalize/anthropic — should not
    // fall through to the generic 500 INTERNAL_ERROR path. Pre-acquire the
    // lockfile on disk to simulate the contention without spawning a second
    // request (which would be race-flaky), then assert the route returns
    // 409 CONFLICT with the shared ApiErrorCode value.
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    const lockPath = path.join(dataDir, 'projects', PROJECT_ID, '.transcript.lock');

    let lockFd: number | null = null;
    try {
      lockFd = fs.openSync(lockPath, 'wx');

      const res = await postHandoff(PROJECT_ID, {
        conversationId,
        apiKey: 'sk-test',
        model: 'claude-opus-4-7',
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('CONFLICT');
    } finally {
      if (lockFd !== null) {
        try { fs.closeSync(lockFd); } catch { /* ignore */ }
      }
      try { fs.unlinkSync(lockPath); } catch { /* lock may already be gone */ }
    }
  });

  it('redacts the api key when an upstream error echoes inbound credentials', async () => {
    const echoedKey = 'sk-leaky-test';
    mockAnthropicResponse(
      401,
      JSON.stringify({ error: { message: `bad key ${echoedKey}` } }),
    );

    const res = await postHandoff(PROJECT_ID, {
      conversationId,
      apiKey: echoedKey,
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(echoedKey);
  });
});
