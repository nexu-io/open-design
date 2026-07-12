// @vitest-environment jsdom
// Race condition regression tests for the prevSourceBeforeReloadRef approach
// introduced in commit 65fe10d1a (PR #4652).
//
// Three distinct races are covered:
//
// Race 1 — double-click failure:
//   The fallback ref is overwritten with null on the second click (because
//   source is null after the first setSource(null) call), so when the first
//   fetch fails there is nothing left to restore.  The user sees a blank
//   preview instead of their last good HTML.
//
// Race 2 — file-switch contamination + loading state:
//   The ref is not scoped to the current file, so when the user switches to a
//   new file while a reload fetch is in flight, a failed fetch for the new
//   file restores the *previous* file's HTML into the new preview.
//   Additionally, the sourceEverLoadedRef sentinel stays true after a file
//   switch when a reload snapshot is present, so the new file B never shows
//   the loading skeleton while its fetch is in flight — it shows a blank
//   iframe instead.
//
// Race 3 — stale snapshot leaked by identity-mismatched fetch:
//   When the user switches to file B while a reload fetch is in flight,
//   B's fetch returns null.  The identity check (snap.fileName='A',
//   file.name='B') fails and the restore-branch returns without clearing
//   prevSourceBeforeReloadRef.  The old snapshot stays armed, so navigating
//   back to file A on a later normal failed load (no Reload click) wrongly
//   restores the old A snapshot instead of showing the loading indicator.
//
// Race P3 (Codex P2 line 7377) — Manual Edit save silently fails during Reload:
//   reloadHtmlPreview calls setSource(null) unconditionally.  The [source]
//   effect then writes null into sourceRef.current.  If the user makes or
//   saves a manual edit before the reload fetch resolves, applyManualEdit
//   hits sourceRef.current == null and returns false without calling the file
//   API — a silent, invisible failure even though the preview is still
//   interactive (manualEditFrozenSource still shows the old HTML).

import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

// ---------------------------------------------------------------------------
// ManualEditPanel mock — captures the props FileViewer passes so tests can
// invoke onApplyPatch / onStyleChange without needing real iframe interaction.
// The mock renders a lightweight sentinel so no real panel DOM is created.
// ---------------------------------------------------------------------------
const panelState = vi.hoisted(() => ({
  props: null as ComponentProps<typeof import('../../src/components/ManualEditPanel').ManualEditPanel> | null,
}));

vi.mock('../../src/components/ManualEditPanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ManualEditPanel')>();
  return {
    ...actual,
    ManualEditPanel: (
      props: ComponentProps<typeof actual.ManualEditPanel>,
    ) => {
      panelState.props = props;
      return <div data-testid="mock-manual-edit-panel" />;
    },
  };
});

import { FileViewer } from '../../src/components/FileViewer';

afterEach(() => {
  cleanup();
  panelState.props = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

// A plain HTML file (not a deck) that supports Manual Edit (has data-od-id
// elements).  The manifest marks it as an 'html' artifact so the component
// uses the HTML preview path without needing deck logic.
function manualEditFile(): ProjectFile {
  return {
    name: 'preview.html',
    path: 'preview.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: 'preview.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

// Minimal target shape that the component accepts via od-edit-select.
function heroTarget(): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'text',
    label: 'Hero',
    tagName: 'h1',
    className: '',
    text: 'Hello',
    rect: { x: 0, y: 0, width: 120, height: 40 },
    fields: { text: 'Hello' },
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<h1 data-od-id="hero">Hello</h1>',
  };
}

// Pins the inspector to a target by dispatching the od-edit-select message
// that the edit-mode iframe bridge would normally send.  Returns the iframe
// element so callers can inspect it or use it for further messages.
async function selectManualEditTarget(target = heroTarget()): Promise<HTMLIFrameElement> {
  const frame = await waitFor(() => {
    const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    if (!node.contentWindow) throw new Error('Preview frame not ready');
    return node;
  });
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'od-edit-select', target },
        source: frame.contentWindow,
      }),
    );
  });
  await waitFor(() => expect(panelState.props).not.toBeNull());
  return frame;
}

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
  // Race 2: file-switch shows loading state, not blank iframe or old HTML
  // ---------------------------------------------------------------------------
  it('shows the loading indicator for File B (not a blank iframe or File A HTML) when the user switches files while a reload fetch is in flight and File B source is unavailable', async () => {
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

    // --- KEY ASSERTIONS ---
    //
    // 1. File B's source is null and has never been loaded, so the loading
    //    skeleton must be visible.  On the buggy branch sourceEverLoadedRef
    //    is still true from File A (the if-guard at ~5436 skips the reset
    //    when a reload snapshot is present), so the component skips the
    //    skeleton and renders the iframe instead — with File A's HTML if the
    //    restore-branch fires, or a blank srcdoc otherwise.
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();

    // 2. The srcdoc iframe itself must NOT be present while the loading state
    //    is active — a blank <iframe srcDoc=""> is not an acceptable stand-in
    //    for the loading indicator.
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull();

    // 3. The loading indicator text must not contain File A's HTML content.
    expect(screen.queryByText(/FILE-A-HTML/)).toBeNull();

    // Resolve the stale File A fetch last (it should be discarded, not applied
    // to the now-File-B viewer).
    if (resolveFileAFetch) {
      act(() => {
        resolveFileAFetch(new Response(htmlA, { status: 200 }));
      });
      await act(async () => {
        await Promise.resolve();
      });
      // After the stale resolution, File A's HTML must still not appear in
      // any rendered element.
      expect(screen.queryByText(/FILE-A-HTML/)).toBeNull();
    }
  });

  // ---------------------------------------------------------------------------
  // Race 4 (P2): routing decision must not flip to URL-load during the
  // source=null window opened by a Reload click on an artifact whose srcDoc
  // path is driven by a source-derived predicate (htmlNeedsSandboxShim).
  // ---------------------------------------------------------------------------
  it('keeps the srcDoc iframe active (does not flip to URL-load) while source is null after a Reload click on an htmlNeedsSandboxShim artifact', async () => {
    // An HTML file that uses localStorage — triggers htmlNeedsSandboxShim and
    // therefore forces the srcDoc path (forceInline=true).  No .slide class so
    // looksLikeDeck stays false and isDeck is passed as false; the ONLY reason
    // this file takes the srcDoc path is the sandbox-shim predicate.
    const shimFile: ProjectFile = {
      name: 'app.html',
      path: 'app.html',
      type: 'file',
      size: 512,
      mtime: 1710000001,
      kind: 'html',
      mime: 'text/html',
    };
    const shimHtml =
      '<html><body><script>localStorage.setItem("key","val");</script><p>loaded</p></body></html>';

    // Step 1: mount with shimHtml — source is non-null, needsSandboxShim=true,
    // forceInline=true, useUrlLoadPreview=false → srcDoc iframe is active.
    vi.stubGlobal('fetch', fetchReturning(shimHtml));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={shimFile}
        isDeck={false}
      />,
    );

    // Wait for the source fetch to resolve so the component has non-null source.
    await waitFor(() => {
      // The srcDoc iframe is active: its testid is 'artifact-preview-frame'
      // (not 'artifact-preview-frame-srcdoc') when useUrlLoadPreview=false.
      const frame = screen.queryByTestId('artifact-preview-frame');
      expect(frame).not.toBeNull();
      expect((frame as HTMLIFrameElement).getAttribute('data-od-render-mode')).toBe('srcdoc');
    });

    // Step 2: click Reload — source goes null synchronously.  Without the fix,
    // needsSandboxShim(null)=false → forceInline flips → useUrlLoadPreview
    // becomes true → the URL-load iframe hijacks testid 'artifact-preview-frame'
    // and the srcDoc iframe is renamed to 'artifact-preview-frame-srcdoc'.
    const { handle: reloadHandle, stub: reloadStub } = deferredFetch();
    vi.stubGlobal('fetch', reloadStub);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Step 3: assert BEFORE the fetch resolves — this is the reload window
    // where the source=null race can expose the bug.
    //
    // The srcDoc iframe must remain the active iframe: its testid stays
    // 'artifact-preview-frame' and its data-od-render-mode is 'srcdoc'.
    // If the routing flipped, a URL-load iframe would have taken the
    // 'artifact-preview-frame' testid and data-od-active='true' instead.
    const activeFrame = screen.getByTestId('artifact-preview-frame');
    expect(activeFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');
    expect(activeFrame.getAttribute('data-od-active')).toBe('true');

    // Confirm the URL-load iframe is NOT the active one (it would carry
    // data-od-render-mode='url-load' and data-od-active='true' on a buggy build).
    const urlLoadFrame = screen.queryByTestId('artifact-preview-frame-url-load');
    if (urlLoadFrame) {
      expect(urlLoadFrame.getAttribute('data-od-active')).toBe('false');
    }

    // Drain the deferred fetch so it doesn't leak into subsequent tests.
    await act(async () => {
      reloadHandle.resolve(shimHtml);
      await Promise.resolve();
    });
  });

  // ---------------------------------------------------------------------------
  // Race 3: stale snapshot must not survive an identity-mismatched fetch
  // ---------------------------------------------------------------------------
  it('does not restore the reload snapshot on a later normal failed load after an identity-mismatched fetch left the ref un-cleared', async () => {
    const fileA = deckFile({ name: 'deck-a.html', path: 'deck-a.html' });
    const fileB = deckFile({ name: 'deck-b.html', path: 'deck-b.html' });

    const RAW_A = `/api/projects/project-1/raw/deck-a.html`;
    const RAW_B = `/api/projects/project-1/raw/deck-b.html`;

    const htmlA = deckHtml('V1-CONTENT');

    // Step 1: mount with File A and wait for "V1-CONTENT" to appear.
    vi.stubGlobal('fetch', fetchReturning(htmlA));

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={fileA}
        isDeck
      />,
    );

    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('V1-CONTENT');
    });

    // Step 2: click Reload on File A.
    // prevSourceBeforeReloadRef is now { source: htmlA, projectId, fileName: 'deck-a.html' }.
    // source goes null; fetch for A is in flight (deferred).
    let resolveFileAReloadFetch!: (resp: Response) => void;
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
            resolveFileAReloadFetch = ok;
          });
        }
        return new Response('', { status: 404 });
      }),
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Step 3: switch to File B while the File A reload fetch is still in
    // flight.  File B's fetch returns null (500) immediately, triggering the
    // identity-mismatch branch.  On the buggy implementation the mismatch
    // branch returns early WITHOUT clearing prevSourceBeforeReloadRef, leaving
    // the stale snapshot armed.
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

    await act(async () => {
      await Promise.resolve();
    });

    // Step 4: switch back to File A.  File A's fetch returns null (500) — a
    // normal failed load, NOT a Reload click.  On the buggy implementation
    // prevSourceBeforeReloadRef is still non-null (leaked from step 2),
    // the identity check passes (projectId + fileName both match A again),
    // and the snapshot "V1-CONTENT" is incorrectly restored into the srcdoc.
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
          file={fileA}
          isDeck
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // --- KEY ASSERTION ---
    // The stale snapshot must NOT be restored.  A normal failed load with no
    // active Reload click must show the loading indicator, not old content.
    // On the buggy branch the leaked ref satisfies the identity check and
    // setSource(snap.source) is called, surfacing "V1-CONTENT" instead of the
    // skeleton.
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull();

    // Also confirm the stale HTML is not present anywhere in the rendered DOM.
    expect(screen.queryByText(/V1-CONTENT/)).toBeNull();

    // Drain the in-flight File A reload fetch so it doesn't leak into other
    // tests (it was started in step 2 and never resolved).
    if (resolveFileAReloadFetch) {
      act(() => {
        resolveFileAReloadFetch(new Response('', { status: 500 }));
      });
      await act(async () => {
        await Promise.resolve();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Annotation-freeze stale: Reload while Draw mode is active must update the
  // visible iframe to the freshly-fetched content, not stay frozen on the
  // snapshot captured at mode entry.
  //
  // Sequence:
  //   1. Mount deck, wait for "V1-HTML" to load in the srcdoc iframe.
  //   2. Click the Mark (Draw) button — drawOverlayOpen=true →
  //      annotationFreezeActive=true → annotationFrozenSource="V1-HTML".
  //   3. Click Reload — source cleared, fetch deferred (in flight).
  //   4. Resolve fetch with "V2-NEW-HTML".
  //   5. Assert: while still in Draw mode the srcdoc iframe shows "V2-NEW-HTML",
  //      NOT "V1-HTML".  On the current buggy branch previewSource is selected
  //      from annotationFrozenSource (line 5352 of FileViewer.tsx) whenever
  //      annotationFreezeActive && annotationFrozenSource !== null, so the reload
  //      lands in `source` / `livePreviewSource` but is never forwarded to the
  //      iframe because annotationFrozenSource still holds the stale V1 snapshot.
  // ---------------------------------------------------------------------------
  it('updates the srcdoc iframe to the reloaded content when Draw mode is active while Reload resolves', async () => {
    const v1 = deckHtml('V1-HTML');
    const v2 = deckHtml('V2-NEW-HTML');

    // Step 1: initial render — "V1-HTML" lands in the iframe srcdoc.
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
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('V1-HTML');
    });

    // Step 2: enter Draw (Mark) mode — drawOverlayOpen becomes true, which
    // sets annotationFreezeActive=true and captures annotationFrozenSource="V1".
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^mark$/i }));
    });

    // Step 3: click Reload while Draw mode is active.
    // source goes null; the deferred fetch is now in flight.
    const { handle: reloadHandle, stub: reloadStub } = deferredFetch();
    vi.stubGlobal('fetch', reloadStub);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Step 4: resolve fetch with V2 content.
    await act(async () => {
      reloadHandle.resolve(v2);
      await Promise.resolve();
    });

    // Step 5: KEY ASSERTION — the active srcdoc iframe must show V2 content.
    // On the buggy branch previewSource is pinned to annotationFrozenSource
    // ("V1-HTML") while annotationFreezeActive is true, so the iframe never
    // receives the new source even though `source` state was updated.
    await waitFor(() => {
      const srcdoc = srcDocFrame().getAttribute('srcDoc') ?? '';
      expect(srcdoc).toContain('V2-NEW-HTML');
    });
    // Confirm the stale snapshot is not what the user sees.
    expect(srcDocFrame().getAttribute('srcDoc') ?? '').not.toContain('V1-HTML');
  });

  // ---------------------------------------------------------------------------
  // Race P2 (Codex P2 #5): canceled-fetch ref leak
  //
  // Sequence:
  //   1. Mount file A ("A-V1"), wait for it to load.
  //   2. Click Reload on A — prevSourceBeforeReloadRef captures {A, A-V1},
  //      source goes null, A-reload fetch is in flight (deferred).
  //   3. Switch to file B — A's in-flight fetch is canceled (cancelled=true);
  //      the .then() callback returns early without touching the ref, so
  //      prevSourceBeforeReloadRef remains armed with the A-V1 snapshot.
  //   4. Switch back to A before B's fetch resolves (B fetch also deferred) —
  //      B's fetch is also canceled (cancelled=true), ref still armed.
  //   5. A's new fetch returns null (500) — a normal failed load, NOT a
  //      Reload click.  On the buggy build the identity check passes
  //      (snap.fileName='deck-a.html' === file.name='deck-a.html') and
  //      setSource(snap.source) restores "A-V1" from the stale snapshot.
  //
  // The fix: clear prevSourceBeforeReloadRef in the [projectId, file.name]
  // effect (the per-file reset that also clears sourceEverLoadedRef), so the
  // ref cannot outlive a file-identity change regardless of fetch-cancel order.
  // ---------------------------------------------------------------------------
  it('does not restore the reload snapshot on a normal failed load after B fetch was canceled and the ref was never cleared by a callback', async () => {
    const fileA = deckFile({ name: 'deck-a.html', path: 'deck-a.html' });
    const fileB = deckFile({ name: 'deck-b.html', path: 'deck-b.html' });

    const RAW_A = `/api/projects/project-1/raw/deck-a.html`;
    const RAW_B = `/api/projects/project-1/raw/deck-b.html`;

    const htmlA = deckHtml('A-V1-CONTENT');

    // Step 1: mount with File A and wait for "A-V1-CONTENT" to appear.
    vi.stubGlobal('fetch', fetchReturning(htmlA));

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={fileA}
        isDeck
      />,
    );

    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('A-V1-CONTENT');
    });

    // Step 2: click Reload on File A.
    // prevSourceBeforeReloadRef now = { source: htmlA, projectId, fileName: 'deck-a.html' }.
    // source goes null; A-reload fetch deferred (in flight, never resolved).
    let resolveAReloadFetch!: (resp: Response) => void;
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
            resolveAReloadFetch = ok;
          });
        }
        return new Response('', { status: 404 });
      }),
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Step 3: switch to file B while A-reload fetch is still in flight.
    // B's fetch is also deferred — it will never resolve in this test.
    // Switching files sets cancelled=true for A's fetch; the .then() callback
    // skips all branches (returns at "if (cancelled) return") so the ref stays
    // armed.  The [projectId, file.name] effect runs and resets
    // sourceEverLoadedRef (and lastGoodSourceForRoutingRef) — but on the buggy
    // build it does NOT clear prevSourceBeforeReloadRef.
    let resolveBFetch!: (resp: Response) => void;
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
          return new Promise<Response>((ok) => {
            resolveBFetch = ok;
          });
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

    await act(async () => {
      await Promise.resolve();
    });

    // Step 4: switch back to File A before B's fetch resolves.
    // B's fetch is canceled (cancelled=true for B's effect cleanup).
    // A's new fetch returns null (500) immediately — this is a NORMAL failed
    // load, not a Reload-triggered fetch.  The Reload button was NOT clicked.
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
          file={fileA}
          isDeck
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    // --- KEY ASSERTION ---
    // No Reload click happened for this A load.  prevSourceBeforeReloadRef
    // must have been invalidated when the file identity changed (A→B step 3
    // or B→A step 4).  A normal 500 response must NOT restore "A-V1-CONTENT".
    //
    // On the buggy build: the ref was left armed by the canceled-fetch path
    // (B's .then() never ran), the identity check passes (A===A), and
    // setSource(snap.source) wrongly surfaces "A-V1-CONTENT" in the srcdoc.
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull();
    expect(screen.queryByText(/A-V1-CONTENT/)).toBeNull();

    // Drain deferred fetches so they don't leak into subsequent tests.
    if (resolveAReloadFetch) {
      act(() => {
        resolveAReloadFetch(new Response('', { status: 500 }));
      });
      await act(async () => {
        await Promise.resolve();
      });
    }
    if (resolveBFetch) {
      act(() => {
        resolveBFetch(new Response('', { status: 500 }));
      });
      await act(async () => {
        await Promise.resolve();
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Race P3 (Codex P2 line 7377): Manual Edit save silently fails during Reload
  //
  // Sequence:
  //   1. Mount preview.html, wait for source V1 to load into the iframe.
  //   2. Enter Manual Edit mode — manualEditFrozenSource captures V1,
  //      sourceRef.current = V1.
  //   3. Select a target via od-edit-select postMessage (opens the panel so
  //      onApplyPatch is reachable).
  //   4. Click Reload — setSource(null) fires.  The [source] effect then sets
  //      sourceRef.current = null.  The reload fetch is deferred (in flight).
  //   5. BEFORE the fetch resolves: call panelState.props!.onApplyPatch(…).
  //      On the buggy build applyManualEdit returns false immediately because
  //      sourceRef.current == null — no file-write API call is made.
  //
  // Fix: either skip the setSource(null) when manualEditFrozenSource !== null,
  // or keep sourceRef.current pointed at the last-good source across the
  // reload window so applyManualEdit can still operate.
  //
  // Observable assertion: the file-write API is called, confirming the edit
  // was not silently dropped.
  // ---------------------------------------------------------------------------
  it('saves a Manual Edit patch made during the Reload window instead of silently discarding it', async () => {
    // Include localStorage to trigger htmlNeedsSandboxShim → forceInline=true
    // → srcDoc render path even before Manual Edit mode is entered.  This lets
    // the test confirm srcdoc content in Step 1 and verify the iframe is active.
    const initialSource =
      '<!doctype html><html><body>' +
      '<script>localStorage.setItem("k","v");</script>' +
      '<h1 data-od-id="hero">Hello</h1>' +
      '</body></html>';

    const savedSources: string[] = [];
    let resolveReloadFetch!: (resp: Response) => void;
    let reloadFetchStarted = false;

    // Initial fetch returns V1 immediately.  Subsequent fetches (reload) are
    // deferred so the test can act while source is null.
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : String(input);

      // File-write (save) POST — record and return success.
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { content: string };
        savedSources.push(payload.content);
        return new Response(
          JSON.stringify({ file: manualEditFile() }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Deployments — not relevant but FileViewer fetches this on mount.
      if (url.includes('/api/projects/project-1/deployments')) {
        return new Response(
          JSON.stringify({ deployments: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Raw source GET — the same URL is used by three distinct callers:
      //   (a) Initial load effect: cacheBust=<mtime>-<reloadKey>-<filesRefreshKey>
      //       → resolve immediately before reloadFetchStarted.
      //   (b) Reload effect (after Reload click): cacheBust=<mtime>-<N>-<N>
      //       → deferred so the test can assert inside the reload window.
      //   (c) confirmManualEditHistorySource: cacheBust=<Date.now() timestamp>
      //       → pure 13-digit integer, no dashes; resolve immediately with
      //       initialSource so applyManualEdit can proceed without blocking on
      //       the deferred reload fetch (avoids test deadlock after revert of
      //       the sourceMatchesFrozen shortcut, PR #4652 8th-pass review).
      if (url.includes('/api/projects/project-1/raw/preview.html')) {
        if (!reloadFetchStarted) {
          // (a) Initial load: resolve immediately.
          return new Response(initialSource, { status: 200 });
        }
        // Distinguish reload-effect fetch (cacheBust contains dashes, e.g.
        // "1710000000-1-0") from confirm-source fetch (cacheBust is a pure
        // integer timestamp, e.g. "1750800000000").
        const cacheBustParam = new URL(url, 'http://x').searchParams.get('cacheBust') ?? '';
        const isConfirmSourceFetch = /^\d+$/.test(cacheBustParam);
        if (isConfirmSourceFetch) {
          // (c) confirmManualEditHistorySource: resolve immediately so it can
          // return true and let applyManualEdit proceed to the file-write call.
          return new Response(initialSource, { status: 200 });
        }
        // (b) Reload fetch: deferred.
        return new Promise<Response>((ok) => {
          resolveReloadFetch = ok;
        });
      }

      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    // Step 1: mount and wait for source V1 to land in the preview.
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={manualEditFile()}
      />,
    );

    await waitFor(() => {
      const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      expect(frame.srcdoc).toContain('Hello');
    });

    // Step 2: enter Manual Edit mode — manualEditFrozenSource captures V1.
    act(() => {
      fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    });

    // Step 3: select a target so the panel (and onApplyPatch) is available.
    await selectManualEditTarget();

    // Step 4: arm the deferred reload fetch, then click Reload.
    // reloadHtmlPreview skips setSource(null) when manualEditFrozenSource !== null
    // (PR #4652 Codex P2 fix, kept), so sourceRef.current stays non-null.
    // The reload re-fetch is still triggered via reloadKey increment.
    reloadFetchStarted = true;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    });

    // Drain one microtask tick so React flushes the Reload render and any
    // synchronous state updates from the click handler settle.
    await act(async () => {
      await Promise.resolve();
    });

    // Step 5: attempt to save a Manual Edit patch BEFORE the reload fetch
    // resolves.  applyManualEdit calls confirmManualEditHistorySource (unconditional
    // after revert of the sourceMatchesFrozen shortcut), which fetches the
    // persisted source.  The confirm-source fetch is mocked to resolve immediately
    // (it uses a pure-integer cacheBust from Date.now(), distinguishable from the
    // reload-effect cacheBust which includes dashes), so applyManualEdit proceeds
    // to the file-write call while the reload fetch is still deferred.
    act(() => {
      panelState.props!.onApplyPatch(
        { id: 'hero', kind: 'set-text', value: 'Updated text' },
        'Content: Hero',
      );
    });

    // --- KEY ASSERTION ---
    // The file-write API must have been called.  The pre-fix regression was
    // applyManualEdit returning false at the sourceRef.current == null guard
    // before reaching writeProjectTextFileDetailed (savedSources stays empty).
    // The fix (reloadHtmlPreview skipping setSource(null) when Manual Edit is
    // active) keeps sourceRef.current non-null throughout the reload window.
    await waitFor(() => {
      expect(savedSources).toHaveLength(1);
    });

    // The written content must contain the user's edit.
    expect(savedSources[0]).toContain('Updated text');

    // Drain the deferred reload fetch so it doesn't leak into subsequent tests.
    await act(async () => {
      resolveReloadFetch(new Response(initialSource, { status: 200 }));
      await Promise.resolve();
    });
  });
});
