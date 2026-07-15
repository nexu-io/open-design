// @ts-nocheck
// Tests for `apps/daemon/src/handoff-design.ts` — the synthesis pipeline
// behind `POST /api/projects/:id/handoff`. Mirrors the finalize-design
// test layout: a prompt-builder block, then a full-pipeline block with
// mocked Anthropic upstream.

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import {
  buildHandoffPrompt,
  EmptyTranscriptError,
  HANDOFF_SYSTEM_PROMPT,
  synthesizeHandoffPrompt,
} from '../src/design/index.js';
import { FinalizeUpstreamError } from '../src/design/index.js';

const PROJECT_ID = 'project-handoff-1';
let tempDir: string | null = null;
let projectsRoot: string | null = null;

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  projectsRoot = null;
});

function setupProjectFixture(): { db: any; projectsRoot: string } {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-handoff-'));
  const db = openDatabase(tempDir);
  insertProject(db, {
    id: PROJECT_ID,
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
  });
  projectsRoot = path.join(tempDir, 'projects');
  fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });
  return { db, projectsRoot };
}

function seedConversation(
  db: any,
  options?: { messageCount?: number; conversationId?: string; text?: string },
) {
  const count = options?.messageCount ?? 2;
  const conversationId = options?.conversationId ?? 'conv-1';
  const text = options?.text ?? 'message';
  insertConversation(db, {
    id: conversationId,
    projectId: PROJECT_ID,
    title: 'Resume me',
    createdAt: 100,
    updatedAt: 100,
  });
  for (let i = 0; i < count; i += 1) {
    upsertMessage(db, conversationId, {
      id: `${conversationId}-msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: '',
      events: [{ kind: 'text', text: `${text} ${i}` }],
    });
  }
}

describe('buildHandoffPrompt', () => {
  const FIXED_NOW = new Date('2026-05-14T13:41:05.000Z');
  const TRANSCRIPT_FIXTURE =
    JSON.stringify({ kind: 'header', schemaVersion: 2, projectId: PROJECT_ID, messageCount: 2 }) +
    '\n' +
    JSON.stringify({ kind: 'message', id: 'm1', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }) +
    '\n' +
    JSON.stringify({ kind: 'message', id: 'm2', role: 'assistant', blocks: [{ type: 'text', text: 'hello' }] }) +
    '\n';

  it('uses HANDOFF_SYSTEM_PROMPT as the exported system prompt constant', () => {
    const out = buildHandoffPrompt({
      projectId: PROJECT_ID,
      transcriptJsonl: TRANSCRIPT_FIXTURE,
      transcriptMessageCount: 2,
      now: FIXED_NOW,
    });

    expect(out.systemPrompt).toBe(HANDOFF_SYSTEM_PROMPT);
    expect(HANDOFF_SYSTEM_PROMPT).toContain('## Context');
    expect(HANDOFF_SYSTEM_PROMPT).toContain('## Decisions made');
    expect(HANDOFF_SYSTEM_PROMPT).toContain('## Open questions');
    expect(HANDOFF_SYSTEM_PROMPT).toContain('## Current focus');
    expect(HANDOFF_SYSTEM_PROMPT).toContain('## Provenance');
  });

  it('includes the transcript verbatim and the generation context fields in the user prompt', () => {
    const out = buildHandoffPrompt({
      projectId: PROJECT_ID,
      transcriptJsonl: TRANSCRIPT_FIXTURE,
      transcriptMessageCount: 2,
      now: FIXED_NOW,
    });

    expect(out.userPrompt).toContain(TRANSCRIPT_FIXTURE);
    expect(out.userPrompt).toContain(`Project ID: ${PROJECT_ID}`);
    expect(out.userPrompt).toContain('Transcript message count: 2');
    expect(out.userPrompt).toContain('Generated at: 2026-05-14T13:41:05.000Z');
  });

  it('emits an ISO 8601 UTC timestamp (suffix Z, millisecond precision)', () => {
    const out = buildHandoffPrompt({
      projectId: PROJECT_ID,
      transcriptJsonl: TRANSCRIPT_FIXTURE,
      transcriptMessageCount: 0,
      now: FIXED_NOW,
    });

    expect(out.userPrompt).toMatch(/Generated at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});

describe('synthesizeHandoffPrompt (pipeline)', () => {
  function jsonResponse(status: number, body: any): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function textResponse(status: number, body: string): Response {
    return new Response(body, { status });
  }

  function fakeAnthropicSuccess(promptBody: string, inputTokens = 1234, outputTokens = 567): Response {
    return jsonResponse(200, {
      content: [{ type: 'text', text: promptBody }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  }

  const baseOptions = {
    conversationId: 'conv-1',
    apiKey: 'sk-test',
    model: 'claude-opus-4-7',
    maxTokens: 4096,
  };

  it('returns { prompt, model, inputTokens, outputTokens, transcriptMessageCount } on happy path', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db, { messageCount: 4 });

    const synthesized = '## Context\nresume this work\n\n## Decisions made\n- (none)\n';
    const fetchImpl = vi.fn(async () => fakeAnthropicSuccess(synthesized, 100, 50));

    const result = await synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      fetchImpl,
    });

    expect(result.prompt).toBe(synthesized);
    expect(result.model).toBe('claude-opus-4-7');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.transcriptMessageCount).toBe(4);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('defaults baseUrl to https://api.anthropic.com when caller omits it', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db);

    let observedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      observedUrl = url;
      return fakeAnthropicSuccess('p');
    });

    await synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      fetchImpl,
    });

    expect(observedUrl.startsWith('https://api.anthropic.com/v1/messages')).toBe(true);
  });

  it('rewraps fetch network errors as FinalizeUpstreamError(502)', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db);

    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
        ...baseOptions,
        fetchImpl,
      }),
    ).rejects.toThrow(FinalizeUpstreamError);

    try {
      await synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
        ...baseOptions,
        fetchImpl,
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(FinalizeUpstreamError);
      expect(err.status).toBe(502);
    }
  });

  it('rewraps non-JSON 200 body as FinalizeUpstreamError(502)', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db);

    const fetchImpl = vi.fn(async () => textResponse(200, '<html>not json</html>'));

    await expect(
      synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
        ...baseOptions,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'FinalizeUpstreamError', status: 502 });
  });

  it('honors a caller-supplied AbortSignal — aborting the call surfaces an AbortError', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db);

    const controller = new AbortController();
    const fetchImpl = vi.fn((url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const pending = synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      fetchImpl,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('bounds upstream calls via the exported DEFAULT_TIMEOUT_MS (test-only timeoutMs override)', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db);

    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('timed out');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const pending = synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      fetchImpl,
      timeoutMs: 5,
    });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps the timeout armed through the body read — a stalled response body aborts instead of hanging', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db);

    // fetch() resolves as soon as the upstream sends headers; this body
    // never enqueues and never closes. The stream honors init.signal the
    // way a real fetch body does, so a mid-read abort errors the stream.
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            controller.error(err);
          });
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const pending = synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      fetchImpl,
      timeoutMs: 5,
    });

    // If clearTimeout runs before response.json() (the regressed bug), the
    // timeout is disarmed and the stalled body read hangs forever — 'hung'
    // would win this race. The timeout must stay armed and abort the read.
    let hangTimer: ReturnType<typeof setTimeout>;
    const outcome = await Promise.race([
      pending.then(
        () => 'resolved',
        (err) => err,
      ),
      new Promise((resolve) => {
        hangTimer = setTimeout(() => resolve('hung'), 500);
      }),
    ]);
    clearTimeout(hangTimer!);

    expect(outcome).not.toBe('hung');
    expect(outcome).not.toBe('resolved');
    expect(outcome).toMatchObject({ name: 'AbortError' });
  });

  it('truncates transcripts over 384 KiB to fit the prompt budget', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db, { messageCount: 5_000 });

    let capturedBody = '';
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body ?? '');
      return fakeAnthropicSuccess('p');
    });

    const result = await synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      fetchImpl,
    });

    const parsed = JSON.parse(capturedBody);
    const userMessage = parsed.messages[0].content as string;
    expect(userMessage.length).toBeLessThan(400 * 1024);
    expect(userMessage).toContain('"kind":"truncated"');
    expect(result.transcriptMessageCount).toBe(5_000);
  });

  it('scopes the synthesized transcript to the requested conversation, not the whole project', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    // Two unrelated conversations in the same project. A project-wide
    // export would blend both histories; handoff must summarize only the
    // conversation the user is resuming.
    seedConversation(db, { conversationId: 'conv-alpha', messageCount: 2, text: 'ALPHA-TOPIC' });
    seedConversation(db, { conversationId: 'conv-bravo', messageCount: 2, text: 'BRAVO-TOPIC' });

    let capturedBody = '';
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body ?? '');
      return fakeAnthropicSuccess('p');
    });

    const result = await synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
      ...baseOptions,
      conversationId: 'conv-alpha',
      fetchImpl,
    });

    const userMessage = JSON.parse(capturedBody).messages[0].content as string;
    expect(userMessage).toContain('ALPHA-TOPIC');
    expect(userMessage).not.toContain('BRAVO-TOPIC');
    expect(result.transcriptMessageCount).toBe(2);
  });

  it('rejects an empty conversation with EmptyTranscriptError instead of spending BYOK tokens', async () => {
    const { db, projectsRoot } = setupProjectFixture();
    seedConversation(db, { conversationId: 'conv-empty', messageCount: 0 });

    const fetchImpl = vi.fn(async () => fakeAnthropicSuccess('p'));

    await expect(
      synthesizeHandoffPrompt(db, projectsRoot, PROJECT_ID, {
        ...baseOptions,
        conversationId: 'conv-empty',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(EmptyTranscriptError);
    // The guard must fire before the upstream call — no tokens spent.
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
