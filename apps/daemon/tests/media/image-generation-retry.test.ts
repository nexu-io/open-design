import { describe, expect, it, vi } from 'vitest';

import { fetchImageGenerationWithResponseRetry } from '../../src/media/image-generation-retry.js';

describe('image-generation response retry', () => {
  it('respects an HTTP-date Retry-After before retrying', async () => {
    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    const sleep = vi.fn(async () => {});
    const issueRequest = vi.fn()
      .mockResolvedValueOnce(new Response('busy', {
        status: 429,
        headers: { 'retry-after': 'Wed, 21 Oct 2015 07:28:02 GMT' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchImageGenerationWithResponseRetry(
      issueRequest,
      undefined,
      { now: () => now, sleep },
    );

    expect(response.status).toBe(200);
    expect(issueRequest).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('retries immediately when an HTTP-date Retry-After is already past', async () => {
    const sleep = vi.fn(async () => {});
    const issueRequest = vi.fn()
      .mockResolvedValueOnce(new Response('busy', {
        status: 429,
        headers: { 'retry-after': 'Wed, 21 Oct 2015 07:27:59 GMT' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await fetchImageGenerationWithResponseRetry(issueRequest, undefined, {
      now: () => Date.parse('Wed, 21 Oct 2015 07:28:00 GMT'),
      sleep,
    });

    expect(issueRequest).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([undefined, 'not-a-date'])(
    'uses a short jittered delay when Retry-After is %s',
    async (retryAfter) => {
      const sleep = vi.fn(async () => {});
      const onSettled = vi.fn();
      const issueRequest = vi.fn()
        .mockResolvedValueOnce(new Response('busy', {
          status: 503,
          ...(retryAfter ? { headers: { 'retry-after': retryAfter } } : {}),
        }))
        .mockResolvedValueOnce(new Response('ok', { status: 200 }));

      await fetchImageGenerationWithResponseRetry(issueRequest, onSettled, {
        random: () => 0.5,
        sleep,
      });

      expect(sleep).toHaveBeenCalledWith(1_125);
      expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({
        retryReason: 'service_unavailable_503',
        retryDelayMs: 1_125,
        retryFinalResult: 'success',
      }));
    },
  );

  it('does not retry early when Retry-After exceeds the wait budget', async () => {
    const sleep = vi.fn(async () => {});
    const onSettled = vi.fn();
    const issueRequest = vi.fn(async () => new Response('come back later', {
      status: 429,
      headers: { 'retry-after': '61' },
    }));

    const response = await fetchImageGenerationWithResponseRetry(
      issueRequest,
      onSettled,
      { sleep },
    );

    expect(issueRequest).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    expect(await response.text()).toBe('come back later');
    expect(onSettled).toHaveBeenCalledWith({
      attemptCount: 1,
      retryCount: 0,
      initialResponseStatus: 429,
      responseStatus: 429,
      retryReason: 'rate_limit_429',
      retryAfterMs: 61_000,
      retryFinalResult: 'skipped_retry_after_budget',
    });
  });

  it('makes at most one retry and preserves the final response', async () => {
    const onSettled = vi.fn();
    const issueRequest = vi.fn()
      .mockResolvedValueOnce(new Response('first failure', {
        status: 503,
        headers: { 'retry-after': '0' },
      }))
      .mockResolvedValueOnce(new Response('final failure', { status: 503 }));

    const response = await fetchImageGenerationWithResponseRetry(issueRequest, onSettled);

    expect(issueRequest).toHaveBeenCalledTimes(2);
    expect(await response.text()).toBe('final failure');
    expect(onSettled).toHaveBeenCalledWith({
      attemptCount: 2,
      retryCount: 1,
      initialResponseStatus: 503,
      responseStatus: 503,
      retryReason: 'service_unavailable_503',
      retryAfterMs: 0,
      retryDelayMs: 0,
      retryFinalResult: 'failed',
    });
  });

  it('does not report the initial response as the final status when the retry is rejected', async () => {
    const networkError = new TypeError('retry fetch failed');
    const onSettled = vi.fn();
    const issueRequest = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '0' },
      }))
      .mockRejectedValueOnce(networkError);

    await expect(fetchImageGenerationWithResponseRetry(issueRequest, onSettled))
      .rejects.toBe(networkError);

    expect(issueRequest).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenCalledWith({
      attemptCount: 2,
      retryCount: 1,
      initialResponseStatus: 429,
      retryReason: 'rate_limit_429',
      retryAfterMs: 0,
      retryDelayMs: 0,
      retryFinalResult: 'failed',
    });
  });

  it('does not retry other response failures', async () => {
    const issueRequest = vi.fn(async () => new Response('bad gateway', { status: 502 }));

    const response = await fetchImageGenerationWithResponseRetry(issueRequest);

    expect(response.status).toBe(502);
    expect(issueRequest).toHaveBeenCalledOnce();
  });

  it.each([
    new TypeError('fetch failed'),
    new DOMException('request timed out', 'AbortError'),
  ])('does not retry rejected fetches (%s)', async (networkError) => {
    const onSettled = vi.fn();
    const issueRequest = vi.fn(async () => {
      throw networkError;
    });

    await expect(fetchImageGenerationWithResponseRetry(issueRequest, onSettled))
      .rejects.toBe(networkError);

    expect(issueRequest).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith({
      attemptCount: 1,
      retryCount: 0,
      retryFinalResult: 'not_attempted',
    });
  });
});
