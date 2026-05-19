import { afterEach, describe, expect, it, vi } from 'vitest';

import { synthesizeHandoff } from '../../src/state/projects';

// A realistic request shape — synthesizeHandoff forwards the body
// verbatim, so the fixture uses a valid non-empty baseUrl rather than the
// empty string the handoff route rejects (caller-side omission of an
// unset baseUrl is ProjectView's job, covered in its own test).
const request = {
  conversationId: 'conv-1',
  apiKey: 'sk-test',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-7',
  maxTokens: 4096,
};

describe('synthesizeHandoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the handoff request to the project handoff endpoint and returns the synthesized prompt', async () => {
    const response = {
      prompt: '## Context\nResume here.',
      model: 'claude-opus-4-7',
      inputTokens: 1200,
      outputTokens: 340,
      transcriptMessageCount: 12,
    };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = await synthesizeHandoff('proj 1', request);

    expect(result).toEqual(response);
    const [url, init] = fetchMock.mock.calls[0]!;
    // The project id is path-encoded so ids with spaces/slashes stay safe.
    expect(url).toBe('/api/projects/proj%201/handoff');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it('returns null when the daemon rejects the request', async () => {
    // A 4xx/5xx must not throw — the caller surfaces a toast, not a crash.
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await synthesizeHandoff('p1', request)).toBeNull();
  });

  it('returns null when the daemon is unreachable', async () => {
    // Transport failure fails soft so the chat header stays interactive.
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await synthesizeHandoff('p1', request)).toBeNull();
  });

  it('returns the daemon error structure when the response carries a classified error', async () => {
    // A classified daemon failure (rate limit, empty transcript, upstream
    // detail) must survive to the caller, not collapse into a bare null.
    const error = { code: 'EMPTY_TRANSCRIPT', message: 'conversation has no messages' };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    expect(await synthesizeHandoff('p1', request)).toEqual({ error });
  });
});
