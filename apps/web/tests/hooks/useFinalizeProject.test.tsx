// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  messageForCode,
  useFinalizeProject,
} from '../../src/hooks/useFinalizeProject';

const REQUEST = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-opus-4-7',
  maxTokens: 8192,
};

const SUCCESS_BODY = {
  designMdPath: '/tmp/p1/DESIGN.md',
  bytesWritten: 4096,
  model: 'claude-opus-4-7',
  inputTokens: 100,
  outputTokens: 200,
  artifact: { name: 'deck.html', updatedAt: '2026-05-08T00:00:00Z' },
  transcriptMessageCount: 12,
  designSystemId: 'alphatrace',
};

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useFinalizeProject', () => {
  it('POSTs the FinalizeAnthropicRequest body verbatim and returns the success response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(SUCCESS_BODY));
    const { result } = renderHook(() => useFinalizeProject('p1'));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.trigger(REQUEST);
    });

    expect(returned).toEqual(SUCCESS_BODY);
    expect(result.current.status).toBe('success');
    expect(result.current.result).toEqual(SUCCESS_BODY);
    expect(result.current.error).toBeNull();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/projects/p1/finalize/anthropic');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toEqual(REQUEST);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  const ERROR_TABLE: Array<{ code: string; expected: string }> = [
    { code: 'BAD_REQUEST', expected: 'Bad request — check the API key and model.' },
    { code: 'UNAUTHORIZED', expected: 'API key was rejected. Check it in Settings.' },
    { code: 'FORBIDDEN', expected: 'Access denied by the upstream API.' },
    { code: 'RATE_LIMITED', expected: 'Anthropic rate-limited the request. Try again in a minute.' },
    { code: 'UPSTREAM_UNAVAILABLE', expected: 'The Anthropic API is unavailable right now.' },
    { code: 'CONFLICT', expected: 'Another finalize is in progress for this project.' },
    { code: 'PROJECT_NOT_FOUND', expected: 'Project not found.' },
    { code: 'INTERNAL_ERROR', expected: 'Something went wrong while finalizing. Check the daemon logs.' },
  ];

  it.each(ERROR_TABLE)(
    'maps daemon error code $code to the canonical user-facing message',
    async ({ code, expected }) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ error: { code, message: 'whatever' } }, 400),
      );
      const { result } = renderHook(() => useFinalizeProject('p1'));

      await act(async () => {
        await result.current.trigger(REQUEST);
      });

      expect(result.current.status).toBe('error');
      expect(result.current.error?.code).toBe(code);
      expect(result.current.error?.message).toBe(expected);
    },
  );

  it('maps a network error (fetch rejection) to the catch-all toast string', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useFinalizeProject('p1'));

    await act(async () => {
      await result.current.trigger(REQUEST);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('NETWORK_ERROR');
    expect(result.current.error?.message).toBe(
      "Couldn't reach the daemon. Make sure it's running.",
    );
  });

  it('renders body.error.details as a separate field on the error state when present (#450 commitment)', async () => {
    const usageCapDetails =
      'You have reached your specified API usage limits. You will regain access on 2026-06-01 at 00:00 UTC.';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'upstream',
            details: usageCapDetails,
          },
        },
        400,
      ),
    );
    const { result } = renderHook(() => useFinalizeProject('p1'));

    await act(async () => {
      await result.current.trigger(REQUEST);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(result.current.error?.message).toBe('The Anthropic API is unavailable right now.');
    expect(result.current.error?.details).toBe(usageCapDetails);
  });

  it('cancels the in-flight request and returns to idle without an error surface', async () => {
    let abortFromHandler: AbortSignal | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      abortFromHandler = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        abortFromHandler?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const { result } = renderHook(() => useFinalizeProject('p1'));

    let triggerPromise!: Promise<unknown>;
    act(() => {
      triggerPromise = result.current.trigger(REQUEST);
    });
    await waitFor(() => expect(result.current.status).toBe('pending'));
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      await triggerPromise;
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(abortFromHandler?.aborted).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});

describe('messageForCode', () => {
  it('returns the network-error catch-all for unknown codes', () => {
    expect(messageForCode('SOME_NEW_CODE_THE_DAEMON_WILL_ADD')).toBe(
      "Couldn't reach the daemon. Make sure it's running.",
    );
  });
});
