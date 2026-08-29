import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractWithLLM,
  __resetMemoryTurnDedupeForTests,
} from '../src/memory-llm.js';
import { memoryDir, writeMemoryConfig } from '../src/memory.js';
import { __resetExtractionsForTests } from '../src/memory-extractions.js';
import { createClaudeStreamHandler } from '../src/runtimes/claude-stream.js';

// These specs pin the two halves of the memory-extractor fix:
//   - the cost half: a turn already extracted (a retry / re-fed build re-fire)
//     must NOT reach the provider a second time; and
//   - the correctness half: the "## Assistant reply" the extractor mines must be
//     the model's rendered reply, never the child's raw stdout (JSONL transport:
//     system:init, stream_event, hook_started/hook_response).
// They also cover the guards found in review: a failed extraction must not
// permanently skip the turn, and the de-dup must be scoped per conversation.

const dataDir = path.join(
  process.env.OD_DATA_DIR ?? process.cwd(),
  'memory-llm-dedupe-test',
);
const originalFetch = globalThis.fetch;

// An OpenAI chat-completions success returning an empty (valid) extraction.
function okResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ entries: [] }) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function mockOpenAiOk(): void {
  globalThis.fetch = vi.fn(async () => okResponse()) as typeof fetch;
}

// Reduce a Claude stream-json transcript to the visible reply exactly the way
// the daemon does: parse the raw stdout frames and keep only `text_delta`
// deltas. `memoryReplyText` in server.ts is this same concatenation (plus the
// plain/BYOK `stdout` channel, which structured agents don't use).
function renderVisibleReply(rawStdout: string): string {
  const events: Array<Record<string, unknown>> = [];
  const handler = createClaudeStreamHandler((ev) => events.push(ev));
  handler.feed(rawStdout);
  handler.flush();
  return events
    .filter((e) => e.type === 'text_delta' && typeof e.delta === 'string')
    .map((e) => e.delta as string)
    .join('');
}

describe('memory-llm chat extraction: duplicate-turn gate + reply serialization', () => {
  beforeEach(async () => {
    await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
    __resetExtractionsForTests();
    __resetMemoryTurnDedupeForTests();
    await writeMemoryConfig(dataDir, {
      // Chat auto-extraction defaults OFF product-wide; these specs cover
      // the extraction mechanics themselves, so opt in explicitly.
      chatExtractionEnabled: true,
      extraction: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
    });
    mockOpenAiOk();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('re-invoking with an unchanged turn early-returns with no second LLM call', async () => {
    const turn = {
      userMessage: 'I always work in dark mode — keep UIs dark by default.',
      assistantMessage: 'Understood — I will default new UIs to dark mode.',
    };
    const opts = { projectRoot: process.cwd(), conversationId: 'conv-1' };

    await extractWithLLM(dataDir, turn, opts);
    await extractWithLLM(dataDir, turn, opts);

    // The second pass over the identical turn is skipped before the provider call.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('does NOT permanently skip a turn whose extraction failed (records only after success)', async () => {
    // First provider call fails (rate-limited / out of credits); second succeeds.
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? new Response('upstream error', { status: 500 }) : okResponse();
    }) as typeof fetch;

    const turn = { userMessage: 'Remember I ship on Fridays.', assistantMessage: 'Noted.' };
    const opts = { projectRoot: process.cwd(), conversationId: 'conv-2' };

    await extractWithLLM(dataDir, turn, opts); // fails — must not record the signature
    await extractWithLLM(dataDir, turn, opts); // retried — must reach the provider again

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('still extracts a genuinely different reply to the same user message', async () => {
    const opts = { projectRoot: process.cwd(), conversationId: 'conv-3' };
    await extractWithLLM(
      dataDir,
      { userMessage: 'What did you change?', assistantMessage: 'Renamed the primary button.' },
      opts,
    );
    await extractWithLLM(
      dataDir,
      { userMessage: 'What did you change?', assistantMessage: 'Reworked the entire nav layout.' },
      opts,
    );

    // Distinct replies are distinct turns — both reach the provider.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('does not skip an identical turn that occurs in a different conversation', async () => {
    const turn = { userMessage: 'Same message.', assistantMessage: 'Same reply.' };
    await extractWithLLM(dataDir, turn, { projectRoot: process.cwd(), conversationId: 'conv-A' });
    await extractWithLLM(dataDir, turn, { projectRoot: process.cwd(), conversationId: 'conv-B' });

    // De-dup is scoped per conversation, so a different conversation is examined.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('does NOT de-dup when no conversation id is supplied (BYOK/API-mode HTTP path)', async () => {
    // The `/api/memory/extract` post-turn path invokes extractWithLLM without a
    // conversationId. An empty fallback key would be shared across every such
    // caller, so an identical (message, reply) pair from two unrelated
    // conversations would collide and the second would be wrongly skipped.
    // With no real conversation id the gate is disabled, so both are examined.
    const turn = { userMessage: 'Same HTTP message.', assistantMessage: 'Same HTTP reply.' };
    await extractWithLLM(dataDir, turn, { projectRoot: process.cwd() });
    await extractWithLLM(dataDir, turn, { projectRoot: process.cwd() });

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('feeds the rendered reply — not raw stream transport — as "## Assistant reply"', async () => {
    // A realistic Claude stream-json stdout capture: session bootstrap noise,
    // a resume hook, extended thinking, then the actual reply text.
    const rawStdout = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'sess-1',
        tools: ['Read', 'Edit', 'Bash'],
        mcp_servers: [],
      }),
      JSON.stringify({
        type: 'system',
        subtype: 'hook_started',
        hook_name: 'SessionStart:resume',
        session_id: 'sess-1',
      }),
      JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg-1' } } }),
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'They want the CTA in the brand green token.' },
        },
      }),
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'I set the primary CTA to the brand green token.' },
        },
      }),
    ].join('\n') + '\n';

    const rendered = renderVisibleReply(rawStdout);
    // Sanity: the parser yields the reply text and strips all transport frames.
    expect(rendered).toBe('I set the primary CTA to the brand green token.');
    expect(rendered).not.toContain('"type":"system"');
    expect(rendered).not.toContain('hook_started');

    await extractWithLLM(
      dataDir,
      { userMessage: 'Make the CTA pop.', assistantMessage: rendered },
      { projectRoot: process.cwd(), conversationId: 'conv-serialize' },
    );

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit)?.body));
    const userPayload: string = body.messages[1].content;

    // The reply the model is asked to mine is the rendered text under the
    // "## Assistant reply" heading — and carries none of the raw JSONL
    // transport that the old raw-stdout capture leaked in.
    expect(userPayload).toContain('## Assistant reply');
    expect(userPayload).toContain('I set the primary CTA to the brand green token.');
    expect(userPayload).not.toContain('"subtype":"init"');
    expect(userPayload).not.toContain('hook_started');
    expect(userPayload).not.toContain('stream_event');
    expect(userPayload).not.toContain('"type":"system"');
  });
});
