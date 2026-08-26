// @vitest-environment jsdom

// Red spec for the per-attempt clock on the Side Chat surface.
//
// `useConversationChat` runs the SAME daemon primitive the primary ProjectView
// chat loop runs on (`streamViaDaemon`) and renders its messages through the
// SAME `ChatPane` -> `AssistantMessage` -> `TaskActivityCard` stack, so it
// renders the same live elapsed clock. A daemon-side automatic same-run retry
// reuses one run and one assistant message and re-sends `start` with the new
// attempt's anchor; a caller that does not thread `onAttemptStarted` leaves its
// message pinned to `startedAt` and keeps rendering cumulative time -- the
// "running for 171 minutes" symptom -- until a reload rehydrates the row.
//
// This drives the REAL `streamViaDaemon` over a stubbed SSE body so the whole
// chain is under test: transport frame -> provider callback -> hook state.
//
// Fixture timeline (ms since epoch, arbitrary origin):
//   1_000    attempt 0 starts (also the run's logical start)
//   601_000  attempt 0 failed and was retried; attempt 1 starts here

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationChat } from '../../../src/components/workspace/useConversationChat';
import { streamViaDaemon } from '../../../src/providers/daemon';
import { listMessages, saveMessage } from '../../../src/state/projects';
import type { AppConfig } from '../../../src/types';

vi.mock('../../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/daemon')>(
    '../../../src/providers/daemon',
  );
  return { ...actual, streamViaDaemon: vi.fn() };
});

vi.mock('../../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../../src/state/projects')>(
    '../../../src/state/projects',
  );
  return {
    ...actual,
    listMessages: vi.fn(),
    saveMessage: vi.fn(),
  };
});

const mockedListMessages = vi.mocked(listMessages);
const mockedSaveMessage = vi.mocked(saveMessage);
const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);

const FIRST_ATTEMPT_STARTED_AT = 1_000;
const RETRY_ATTEMPT_STARTED_AT = 601_000;

const config = {
  mode: 'daemon',
  agentId: 'codex',
  agentModels: {},
} as AppConfig;

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A run whose first attempt fails and is automatically retried inside the same
 * run: two `start` frames, the second carrying the later attempt anchor.
 */
const RETRIED_RUN_SSE = [
  `event: start\ndata: ${JSON.stringify({
    runId: 'run-1',
    agentId: 'codex',
    bin: 'codex',
    streamFormat: 'plain',
    attemptStartedAt: FIRST_ATTEMPT_STARTED_AT,
    attemptIndex: 0,
  })}\n\n`,
  `event: start\ndata: ${JSON.stringify({
    runId: 'run-1',
    agentId: 'codex',
    bin: 'codex',
    streamFormat: 'plain',
    attemptStartedAt: RETRY_ATTEMPT_STARTED_AT,
    attemptIndex: 1,
  })}\n\n`,
  'event: chunk\ndata: {"chunk":"retrying"}\n\n',
  'event: end\ndata: {"code":0,"status":"succeeded"}\n\n',
].join('');

describe('useConversationChat per-attempt clock', () => {
  beforeEach(async () => {
    mockedListMessages.mockResolvedValue([]);
    mockedSaveMessage.mockResolvedValue(undefined);
    // Use the real transport so the `start` frame really has to travel through
    // consumeDaemonRun into this hook's message state.
    const actual = await vi.importActual<typeof import('../../../src/providers/daemon')>(
      '../../../src/providers/daemon',
    );
    mockedStreamViaDaemon.mockImplementation(actual.streamViaDaemon);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
        if (url.startsWith('/api/runs/run-1/events')) return sseResponse(RETRIED_RUN_SSE);
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('re-anchors the assistant message when the run retries mid-stream', async () => {
    const hook = renderHook(() =>
      useConversationChat('project-1', 'conversation-1', {
        config,
        agentsById: new Map(),
        locale: 'en',
        sessionMode: 'design',
      }),
    );

    await waitFor(() => expect(hook.result.current.sendDisabled).toBe(false));

    act(() => {
      hook.result.current.onSend('build me a deck', [], []);
    });

    await waitFor(() => {
      const assistant = hook.result.current.messages.find((m) => m.role === 'assistant');
      expect(assistant?.runStatus).toBe('succeeded');
    });

    const assistant = hook.result.current.messages.find((m) => m.role === 'assistant');
    // Both attempts really reached this surface: one `starting` status per
    // `start` frame. So the anchor was available and simply not consumed.
    expect(
      (assistant?.events ?? []).filter(
        (event) => event.kind === 'status' && event.label === 'starting',
      ),
    ).toHaveLength(2);
    // The clock anchor must be the attempt actually running, not the run start.
    expect(assistant?.attemptStartedAt).toBe(RETRY_ATTEMPT_STARTED_AT);
    expect(assistant?.attemptIndex).toBe(1);
    // `startedAt` stays the logical turn start: it is what the cumulative
    // "N total" secondary label is measured from.
    expect(typeof assistant?.startedAt).toBe('number');
    expect(assistant?.startedAt).not.toBe(RETRY_ATTEMPT_STARTED_AT);
  });
});
