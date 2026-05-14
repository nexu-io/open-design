// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDesignMdState, computeStale } from '../../src/hooks/useDesignMdState';

const FRESH_DESIGN_MD = `# DESIGN.md

## Provenance

- Project ID: p1
- Design system: alphatrace
- Current artifact: deck.html
- Transcript message count: 12
- Generated UTC timestamp: 2026-05-08T12:00:00Z
`;

const FRESH_GENERATED_MS = Date.parse('2026-05-08T12:00:00Z');

interface MockEndpoints {
  files?: { ok?: boolean; body: unknown };
  designMd?: { ok?: boolean; body: string };
  conversations?: { ok?: boolean; body: unknown };
}

function installFetchMock(endpoints: MockEndpoints) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.endsWith('/files')) {
      const m = endpoints.files;
      return new Response(JSON.stringify(m?.body ?? { files: [] }), {
        status: m?.ok === false ? 500 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/conversations')) {
      const m = endpoints.conversations;
      return new Response(JSON.stringify(m?.body ?? { conversations: [] }), {
        status: m?.ok === false ? 500 : 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/files/DESIGN.md')) {
      const m = endpoints.designMd;
      return new Response(m?.body ?? FRESH_DESIGN_MD, {
        status: m?.ok === false ? 500 : 200,
        headers: { 'content-type': 'text/markdown' },
      });
    }
    return new Response('not found', { status: 404 });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDesignMdState', () => {
  it('returns { exists: false, isStale: false } when DESIGN.md is absent', async () => {
    installFetchMock({
      files: { body: { files: [{ name: 'index.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' }] } },
    });

    const { result } = renderHook(() => useDesignMdState('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.staleReason).toBeNull();
  });

  it('returns { isStale: false } when DESIGN.md is present and nothing is newer', async () => {
    const olderMs = FRESH_GENERATED_MS - 60_000;
    installFetchMock({
      files: {
        body: {
          files: [
            { name: 'DESIGN.md', size: 100, mtime: FRESH_GENERATED_MS, kind: 'text', mime: 'text/markdown' },
            { name: 'index.html', size: 10, mtime: olderMs, kind: 'html', mime: 'text/html' },
          ],
        },
      },
      conversations: {
        body: {
          conversations: [
            { id: 'c1', projectId: 'p1', title: null, createdAt: olderMs, updatedAt: olderMs },
          ],
        },
      },
    });

    const { result } = renderHook(() => useDesignMdState('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.transcriptMessageCount).toBe(12);
    expect(result.current.designSystemId).toBe('alphatrace');
  });

  // Issue #1580: the synthesis prompt does not pin field-label syntax,
  // so Claude emits Provenance with Markdown-bold labels in practice.
  // This end-to-end test through useDesignMdState pins the parser fix
  // at the hook layer — a regression that re-introduces the `** ` leak
  // would surface `transcriptMessageCount === null` and trip the
  // `unknown-provenance` fail-closed path instead of the fresh path.
  it('reads bold-labelled Provenance correctly (issue #1580 end-to-end)', async () => {
    const olderMs = FRESH_GENERATED_MS - 60_000;
    const boldDesignMd = `# DESIGN.md

## Provenance

- **Project ID:** \`p1\`
- **Design system:** \`alphatrace\`
- **Current artifact:** \`deck.html\`
- **Transcript message count:** 12
- **Generated UTC timestamp:** 2026-05-08T12:00:00Z
`;
    installFetchMock({
      files: {
        body: {
          files: [
            { name: 'DESIGN.md', size: 100, mtime: FRESH_GENERATED_MS, kind: 'text', mime: 'text/markdown' },
            { name: 'index.html', size: 10, mtime: olderMs, kind: 'html', mime: 'text/html' },
          ],
        },
      },
      designMd: { body: boldDesignMd },
      conversations: { body: { conversations: [] } },
    });

    const { result } = renderHook(() => useDesignMdState('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(true);
    // Round 7 (mrcfps @ useDesignMdState.ts:160): a regression that
    // leaks `** ` would null transcriptMessageCount / generatedAt and
    // flip this to 'unknown-provenance'.
    expect(result.current.staleReason).toBeNull();
    expect(result.current.isStale).toBe(false);
    expect(result.current.transcriptMessageCount).toBe(12);
    // Backticks intentionally kept on the value (out of scope per
    // #1580 spec); the `** ` bold prefix must be stripped.
    expect(result.current.designSystemId).toBe('`alphatrace`');
  });

  it('marks stale with files-newer when a project file mtime exceeds generatedAt', async () => {
    const newerMs = FRESH_GENERATED_MS + 60_000;
    installFetchMock({
      files: {
        body: {
          files: [
            { name: 'DESIGN.md', size: 100, mtime: FRESH_GENERATED_MS, kind: 'text', mime: 'text/markdown' },
            { name: 'index.html', size: 10, mtime: newerMs, kind: 'html', mime: 'text/html' },
          ],
        },
      },
    });

    const { result } = renderHook(() => useDesignMdState('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleReason).toBe('files-newer');
  });

  it('marks stale with conversations-newer when a conversation updatedAt exceeds generatedAt', async () => {
    const olderMs = FRESH_GENERATED_MS - 60_000;
    const newerMs = FRESH_GENERATED_MS + 60_000;
    installFetchMock({
      files: {
        body: {
          files: [
            { name: 'DESIGN.md', size: 100, mtime: FRESH_GENERATED_MS, kind: 'text', mime: 'text/markdown' },
            { name: 'index.html', size: 10, mtime: olderMs, kind: 'html', mime: 'text/html' },
          ],
        },
      },
      conversations: {
        body: {
          conversations: [
            { id: 'c1', projectId: 'p1', title: null, createdAt: olderMs, updatedAt: newerMs },
          ],
        },
      },
    });

    const { result } = renderHook(() => useDesignMdState('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleReason).toBe('conversations-newer');
  });

  // Round 7 (mrcfps @ useDesignMdState.ts:131): the hook used to only
  // recompute on mount or explicit refresh(). ProjectView now bumps a
  // counter on file-changed / live_artifact / streaming-completion
  // events; the hook accepts that counter as a `refreshKey` arg and
  // recomputes when it changes, no remount required.
  it('flips stale state after a refreshKey bump without remounting', async () => {
    const olderMs = FRESH_GENERATED_MS - 60_000;
    const newerMs = FRESH_GENERATED_MS + 60_000;

    let fileMtime = olderMs;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/files')) {
        return new Response(
          JSON.stringify({
            files: [
              { name: 'DESIGN.md', size: 100, mtime: FRESH_GENERATED_MS, kind: 'text', mime: 'text/markdown' },
              { name: 'index.html', size: 10, mtime: fileMtime, kind: 'html', mime: 'text/html' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/conversations')) {
        return new Response(JSON.stringify({ conversations: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/files/DESIGN.md')) {
        return new Response(FRESH_DESIGN_MD, {
          status: 200,
          headers: { 'content-type': 'text/markdown' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const { result, rerender } = renderHook(
      ({ refreshKey }) => useDesignMdState('p1', refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isStale).toBe(false);

    // Simulate a post-finalize file mutation: index.html mtime moves
    // past generatedAt, then ProjectView bumps the refresh key.
    fileMtime = newerMs;
    rerender({ refreshKey: 1 });

    await waitFor(() => expect(result.current.isStale).toBe(true));
    expect(result.current.staleReason).toBe('files-newer');
  });
});

describe('computeStale', () => {
  // Round 7 (mrcfps @ useDesignMdState.ts:160): inverted from the
  // pre-round-7 "fresh on null timestamp" behavior. A missing /
  // malformed provenance timestamp now surfaces as the distinct
  // 'unknown-provenance' degraded state instead of misleading fresh.
  it('returns degraded unknown-provenance state when generatedMs is null (no usable timestamp parsed)', () => {
    expect(
      computeStale({ generatedMs: null, files: [], conversations: [] }),
    ).toEqual({ isStale: true, staleReason: 'unknown-provenance' });
  });

  it('ignores DESIGN.md mtime when comparing file ages', () => {
    expect(
      computeStale({
        generatedMs: 1000,
        files: [
          { name: 'DESIGN.md', size: 0, mtime: 5000, kind: 'text', mime: 'text/markdown' },
        ],
        conversations: [],
      }),
    ).toEqual({ isStale: false, staleReason: null });
  });
});

describe('useDesignMdState — malformed provenance', () => {
  // Round 7 (mrcfps @ useDesignMdState.ts:160): end-to-end through
  // compute() so a regression that re-pins fresh-on-null at the hook
  // level (not just computeStale) fails fast.
  it('reports unknown-provenance after a malformed ## Provenance section in DESIGN.md', async () => {
    const malformedDesignMd = `# DESIGN.md

## Provenance

- Project ID: p1
- Generated UTC timestamp: not-a-real-date
`;
    installFetchMock({
      files: {
        body: {
          files: [
            { name: 'DESIGN.md', size: 100, mtime: 1, kind: 'text', mime: 'text/markdown' },
            { name: 'index.html', size: 10, mtime: 1, kind: 'html', mime: 'text/html' },
          ],
        },
      },
      designMd: { body: malformedDesignMd },
      conversations: { body: { conversations: [] } },
    });

    const { result } = renderHook(() => useDesignMdState('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exists).toBe(true);
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleReason).toBe('unknown-provenance');
  });
});
