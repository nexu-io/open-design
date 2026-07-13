// Transport adapter for reviewing a pending automation-evolution proposal.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reviewAutomationProposal } from '../../../src/providers/routines/proposals';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('reviewAutomationProposal', () => {
  it('POSTs an empty body for apply', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/automation-proposals/p1/apply');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe('{}');
      return { ok: true } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    await expect(reviewAutomationProposal('p1', 'apply', 'unused')).resolves.toBeUndefined();
  });

  it('POSTs the reason for reject', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/automation-proposals/p1/reject');
      expect(JSON.parse(String(init?.body))).toEqual({ reason: 'Not needed' });
      return { ok: true } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    await reviewAutomationProposal('p1', 'reject', 'Not needed');
  });

  it('throws the daemon error message on failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'review boom' }),
    })) as unknown as typeof fetch;
    await expect(reviewAutomationProposal('p1', 'apply', '')).rejects.toThrow('review boom');
  });

  it('falls back to a generic action-specific message when the error body is unparsable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    await expect(reviewAutomationProposal('p1', 'reject', 'x')).rejects.toThrow('reject failed: 500');
  });
});
