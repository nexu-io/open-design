// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenDesignGithubRepoResponse } from '@open-design/contracts';

const originalFetch = globalThis.fetch;

describe('GithubStarBadge', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.localStorage?.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('uses the daemon-backed GitHub endpoint and keeps a fallback label on failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
    const { GithubStarBadge } = await import('../../src/components/GithubStarBadge');

    render(<GithubStarBadge />);

    expect(screen.getByText('Star')).toBeTruthy();
    expect(screen.getByText('40K+')).toBeTruthy();
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/github/open-design',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it('backs off after an offline failure instead of retrying on every remount', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
    const { GithubStarBadge } = await import('../../src/components/GithubStarBadge');

    render(<GithubStarBadge />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    cleanup();

    render(<GithubStarBadge />);

    expect(screen.getByText('40K+')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('backs off when the daemon returns an offline 502 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } satisfies Partial<Response>) as typeof fetch;
    const { GithubStarBadge } = await import('../../src/components/GithubStarBadge');

    render(<GithubStarBadge />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    cleanup();

    render(<GithubStarBadge />);

    expect(screen.getByText('40K+')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not back off after effect cleanup aborts an in-flight request', async () => {
    const fetchCalls: AbortSignal[] = [];
    globalThis.fetch = vi.fn((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      if (!(signal instanceof AbortSignal)) {
        throw new Error('expected fetch to receive an AbortSignal');
      }
      fetchCalls.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    }) as typeof fetch;
    const { GithubStarBadge } = await import('../../src/components/GithubStarBadge');

    render(<GithubStarBadge />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    render(<GithubStarBadge />);

    expect(fetchCalls[0]?.aborted).toBe(true);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });

  it('renders the live star count returned by the daemon endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        repo: 'nexu-io/open-design',
        stargazers_count: 42137,
        fetchedAt: Date.parse('2026-05-22T00:00:00.000Z'),
        stale: false,
      } satisfies OpenDesignGithubRepoResponse),
    } satisfies Partial<Response>) as typeof fetch;
    const { GithubStarBadge } = await import('../../src/components/GithubStarBadge');

    render(<GithubStarBadge />);

    await waitFor(() => expect(screen.getByText('42.1K')).toBeTruthy());
  });
});
