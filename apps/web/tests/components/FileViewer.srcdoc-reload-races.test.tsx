// @vitest-environment jsdom
// Race condition regression tests for the prevSourceBeforeReloadRef approach
// introduced in commit 65fe10d1a (PR #4652).
//
// Two distinct races are covered:
//
// Race 1 — double-click failure:
//   The fallback ref is overwritten with null on the second click (because
//   source is null after the first setSource(null) call), so when the first
//   fetch fails there is nothing left to restore.  The user sees a blank
//   preview instead of their last good HTML.
//
// Race 2 — file-switch contamination:
//   The ref is not scoped to the current file, so when the user switches to a
//   new file while a reload fetch is in flight, a failed fetch for the new
//   file restores the *previous* file's HTML into the new preview.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Minimal deck file fixture that forces the srcDoc render path.
function deckFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'deck',
      title: 'Deck',
      entry: 'deck.html',
      renderer: 'deck-html',
      exports: ['html'],
    },
    ...overrides,
  };
}

// Embeds a label inside a minimal deck HTML body so the srcdoc can be
// searched for it.
function deckHtml(label: string): string {
  return `<html><body><section class="slide"><h1>${label}</h1></section></body></html>`;
}

const RAW_URL_PREFIX = '/api/projects/project-1/raw/';

// Returns the srcdoc iframe rendered for the deck (srcDoc) path.
function srcDocFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

// A controllable fetch stub — callers resolve or reject each queued request
// individually by calling the returned handle.
type FetchHandle = {
  resolve: (html: string | null, status?: number) => void;
};

function deferredFetch(): { handle: FetchHandle; stub: typeof fetch } {
  let resolveRequest!: (resp: Response) => void;
  const handle: FetchHandle = {
    resolve: (html, status = 200) => {
      resolveRequest(
        html !== null
          ? new Response(html, { status })
          : new Response('', { status: 500 }),
      );
    },
  };
  const stub = vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (url.startsWith(RAW_URL_PREFIX)) {
      return new Promise<Response>((ok) => {
        resolveRequest = ok;
      });
    }
    return new Response('', { status: 404 });
  });
  return { handle, stub };
}

// Fetches that resolve immediately with a fixed response.
function fetchReturning(html: string) {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (url.startsWith(RAW_URL_PREFIX)) {
      return new Response(html, { status: 200 });
    }
    return new Response('', { status: 404 });
  });
}

describe('FileViewer srcDoc reload — prevSourceBeforeReloadRef race conditions', () => {
  // ---------------------------------------------------------------------------
  // Race 1: double-click wipes the fallback ref before the first fetch fails
  // ---------------------------------------------------------------------------
  it('restores the last good preview when a second Reload click fires before the first fetch resolves and that first fetch fails', async () => {
    // Step 1: initial render — file content "V1" lands in the iframe srcdoc.
    const v1 = deckHtml('version-one');
    vi.stubGlobal('fetch', fetchReturning(v1));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile()}
        isDeck
      />,
    );

    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('version-one');
    });

    // Step 2: first Reload click — source goes null, fetch1 is in flight.
    const { handle: fetch1Handle, stub: fetch1Stub } = deferredFetch();
    vi.stubGlobal('fetch', fetch1Stub);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // At this point source === null, so the ref (if re-captured unconditionally
    // on every reload) would be overwritten with null on the next click.

    // Step 3: second Reload click fires BEFORE fetch1 resolves.
    // source is still null here (fetch1 has not resolved yet).
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Step 4: resolve fetch1 with a non-2xx to trigger the restore path.
    await act(async () => {
      fetch1Handle.resolve(null, 500);
      await Promise.resolve();
    });

    // Also drain any queued microtasks from the second click's pending fetch.
    await act(async () => {
      await Promise.resolve();
    });

    // --- KEY ASSERTION ---
    // The iframe must still display "version-one".  On the buggy branch the
    // ref was overwritten with null by the second click (source was null when
    // the second click captured it), so the restore path has nothing to set
    // and the preview goes blank.
    await waitFor(() => {
      const srcdoc = srcDocFrame().getAttribute('srcDoc') ?? '';
      expect(srcdoc).toContain('version-one');
    });
  });

  // ---------------------------------------------------------------------------
  // Race 2: file-switch contaminates the new file's preview with old HTML
  // ---------------------------------------------------------------------------
  it('does not restore File A HTML into File B preview when the user switches files while a reload fetch is in flight', async () => {
    // Build two distinct deck files rooted at different raw URLs so fetch
    // mocks can distinguish them.
    const fileA = deckFile({ name: 'deck-a.html', path: 'deck-a.html' });
    const fileB = deckFile({ name: 'deck-b.html', path: 'deck-b.html' });

    const RAW_A = `/api/projects/project-1/raw/deck-a.html`;
    const RAW_B = `/api/projects/project-1/raw/deck-b.html`;

    const htmlA = deckHtml('FILE-A-HTML');
    const htmlB = deckHtml('file-b-html');

    // Step 1: mount with File A and wait for it to load.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(RAW_A)) return new Response(htmlA, { status: 200 });
        return new Response('', { status: 404 });
      }),
    );

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={fileA}
        isDeck
      />,
    );

    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('FILE-A-HTML');
    });

    // Step 2: click Reload on File A — ref captures "FILE-A-HTML", source goes
    // null, fetch for File A is now in flight (deferred).
    let resolveFileAFetch!: (resp: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(RAW_A)) {
          return new Promise<Response>((ok) => {
            resolveFileAFetch = ok;
          });
        }
        return new Response('', { status: 404 });
      }),
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Step 3: switch to File B BEFORE the File A fetch resolves.
    // A fresh fetch for File B immediately returns null (non-2xx) to trigger
    // whatever fallback logic exists.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);
        if (url.startsWith(RAW_B)) {
          // Initial load for File B also fails so we can observe the srcdoc
          // state without a successful fetch masking the contamination.
          return new Response('', { status: 500 });
        }
        return new Response('', { status: 404 });
      }),
    );

    act(() => {
      rerender(
        <FileViewer
          projectId="project-1"
          projectKind="prototype"
          file={fileB}
          isDeck
        />,
      );
    });

    // Step 4: drain microtasks so React processes the file-switch re-render
    // and any pending fetch callbacks.
    await act(async () => {
      await Promise.resolve();
    });

    // --- KEY ASSERTION ---
    // File B's preview must never show File A's HTML.  On the buggy branch the
    // ref still holds "FILE-A-HTML" and is scoped to the component instance,
    // not to the specific file — so when File B's fetch fails, the restore
    // path writes the old File A content into File B's srcdoc.
    const srcdoc = srcDocFrame().getAttribute('srcDoc') ?? '';
    expect(srcdoc).not.toContain('FILE-A-HTML');

    // Additionally confirm File B's label is not silently coming from a
    // successful fetch that would mask the bug.
    expect(srcdoc).not.toContain('file-b-html');

    // Resolve the stale File A fetch last (it should be discarded, not applied
    // to the now-File-B viewer).
    if (resolveFileAFetch) {
      act(() => {
        resolveFileAFetch(new Response(htmlA, { status: 200 }));
      });
      await act(async () => {
        await Promise.resolve();
      });
      // After the stale resolution, File A's HTML must still not appear.
      expect(srcDocFrame().getAttribute('srcDoc') ?? '').not.toContain(
        'FILE-A-HTML',
      );
    }
  });
});
