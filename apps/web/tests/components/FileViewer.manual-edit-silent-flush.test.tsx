// @vitest-environment jsdom
//
// Red spec for the remaining silent no-ops in the Manual Edit save path.
//
// Every Manual Edit teardown — Save, dismissing the panel, clearing the
// selection, leaving edit mode, reloading — first flushes the pending work
// through `settlePendingManualEditCommit()` and `flushManualEditStyleSave()`,
// and both answer with a bare `boolean`. Callers uniformly do `if (!ok)
// return;`.
//
// That boolean conflates three different situations, and only one of them has
// told the user anything:
//
//   - nothing was pending, or everything pending committed  -> proceed
//   - the flush could not run right now (another write owns the editor, or no
//     document could be reached to answer for the inline edit) -> nothing was
//     lost, nothing was written, and NOTHING WAS SHOWN
//   - a pending save genuinely failed -> its error is already on screen
//
// The middle case is the defect. `applyManualEdit` returns `false` for
// `edit_busy` and `source_unavailable` without calling `setManualEditError`,
// `flushManualEditStyleSave` returns `false` outright when a write is already
// in flight, and `finishManualEditTextSession` returns `false` when it has no
// window to post into. Each one reaches `saveManualEditPanelDraft` as a bare
// `return` taken before `applyManualEdit` ever runs: the button never goes
// busy, no banner appears, no request is issued, and the file does not change.
//
// This is the same class as the replaced-document defect fixed alongside it,
// and it is the root that one was an instance of. The invariant is the same
// and it is deliberately weaker than "the save must succeed": whatever else
// happens, clicking Save must not leave the user with an idle button, no
// message, and an unchanged file. Some of these states genuinely cannot
// complete the save — being told so is the whole requirement.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  setSyntheticPreviewFileSource,
  syntheticPreviewFileSource,
  uninstallFileViewerPreviewRuntimeHarness,
  useSyntheticProjectScopedPreviewNavigation,
} from '../helpers/file-viewer-preview-runtime';

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    fetchProjectFileText(
      projectId: string,
      name: string,
      options?: Parameters<typeof actual.fetchProjectFileText>[2],
    ) {
      const source = syntheticPreviewFileSource(projectId, name);
      return source === undefined
        ? actual.fetchProjectFileText(projectId, name, options)
        : Promise.resolve(source);
    },
  };
});

vi.mock('../../src/runtime/use-project-preview-session-navigation', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/runtime/use-project-preview-session-navigation')
  >();
  return {
    ...actual,
    useProjectScopedPreviewNavigation: (
      options: Parameters<typeof actual.useProjectScopedPreviewNavigation>[0],
    ) => useSyntheticProjectScopedPreviewNavigation(options),
  };
});

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

beforeEach(() => {
  installFileViewerPreviewRuntimeHarness();
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PROJECT_ID = 'project-1';
const FILE_NAME = 'preview.html';

const PAGE_SOURCE =
  '<!doctype html><html><body>'
  + '<a data-od-id="cta" href="./tokens.css">View tokens<svg viewBox="0 0 24 24"></svg></a>'
  + '<main data-od-id="hero">Hero</main>'
  + '</body></html>';

function textTarget(): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'text',
    label: 'Hero',
    tagName: 'main',
    className: '',
    text: 'Hero',
    rect: { x: 24, y: 24, width: 160, height: 48 },
    fields: { text: 'Hero' },
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<main data-od-id="hero">Hero</main>',
  };
}

function htmlPreviewFile(size = 1024, mtime = 1710000000): ProjectFile {
  return {
    name: FILE_NAME,
    path: FILE_NAME,
    type: 'file',
    size,
    mtime,
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: FILE_NAME,
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function liveFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

/**
 * What the user can actually see after clicking Save. `silent` is the defect:
 * no write reached the server and the panel says nothing about why.
 */
interface SaveVerdict {
  /** Save was unclickable, which is at least an honest visible state. */
  buttonDisabled: boolean;
  errorShown: boolean;
  silent: boolean;
  /** A write carrying THIS click's text. A concurrent write landing from
   *  somewhere else is not evidence that this click did anything. */
  wrote: boolean;
}

describe('FileViewer manual edit — Save must never fail without saying so', () => {
  async function openManualEdit() {
    let currentFile = htmlPreviewFile();
    /** Set to hold the next write open, modelling a save still in flight. */
    let holdWrite: Promise<void> | null = null;
    /** Set to make the next write come back as a server failure. */
    let failNextWrite = false;
    const writes: string[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request ? input.url : String(input);
      if (url.includes(`/api/projects/${PROJECT_ID}/files`) && init?.method === 'POST') {
        if (holdWrite) await holdWrite;
        if (failNextWrite) {
          failNextWrite = false;
          return new Response(JSON.stringify({ error: 'disk full' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const body = typeof init.body === 'string' ? init.body : '';
        try {
          const parsed = JSON.parse(body) as { content?: string };
          if (typeof parsed.content === 'string') {
            writes.push(parsed.content);
            setSyntheticPreviewFileSource(PROJECT_ID, FILE_NAME, parsed.content);
            currentFile = htmlPreviewFile(parsed.content.length, currentFile.mtime + 1);
          }
        } catch {
          /* not a file write */
        }
        return new Response(JSON.stringify({ file: currentFile }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(PAGE_SOURCE, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer
        projectId={PROJECT_ID}
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={PAGE_SOURCE}
      />,
    );

    const frame = await waitFor(() => {
      const node = liveFrame();
      if (!node.contentWindow) throw new Error('Preview frame not ready');
      return node;
    });

    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    const captureRequest = postMessage.mock.calls
      .map(([value]) => value)
      .find((value) => (
        typeof value === 'object'
        && value !== null
        && (value as { type?: unknown }).type === 'od:preview-runtime-state-capture'
      )) as { id: string } | undefined;
    if (captureRequest) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'od:preview-runtime-state-captured',
            id: captureRequest.id,
            state: { version: 1, hash: '', htmlAttrs: {}, bodyAttrs: {}, entries: [] },
          },
          source: frame.contentWindow,
        }));
      });
    }
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    });

    /**
     * The injected bridge, in the state these tests need: it applies mirrors,
     * and it closes an inline text edit when the host asks. A live document
     * always answers `od-edit-text-finish`; the cases below are about the host
     * never getting to ask, not about a document refusing.
     */
    const sessionWindow = liveFrame().contentWindow!;
    const spy = vi.spyOn(sessionWindow, 'postMessage');
    const previous = spy.getMockImplementation();
    spy.mockImplementation(((message: unknown, ...rest: unknown[]) => {
      (previous as ((...args: unknown[]) => void) | undefined)?.(message, ...rest);
      const data = message as { requestId?: unknown; id?: unknown; type?: unknown } | null;
      if (data?.type === 'od-edit-text-finish') {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-text-session', id: 'hero', active: false, committed: false },
          source: sessionWindow,
        }));
        return;
      }
      if (typeof data?.requestId !== 'string') return;
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'od-edit-preview:applied',
          requestId: data.requestId,
          id: data.id ?? '',
          applied: true,
        },
        source: sessionWindow,
      }));
    }) as Window['postMessage']);

    function selectTarget(target: ManualEditTarget) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-select', target },
          source: sessionWindow,
        }));
      });
      return waitFor(() => {
        expect(document.querySelector('.manual-edit-right')).not.toBeNull();
      });
    }

    /** Click Save with `value` typed into the panel, then report what the user sees. */
    async function saveThroughPanel(value: string): Promise<SaveVerdict> {
      const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value } });
      const button = screen.getByText('Save') as HTMLButtonElement;
      const buttonDisabled = button.disabled;
      fireEvent.click(button);
      // Comfortably past the product's own 1500ms settle backstop, so a slow
      // path is never mistaken for a silent one.
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 2400); }); });
      const wrote = writes.some((written) => written.includes(value));
      const errorShown = document.querySelector('.manual-edit-error') !== null;
      return {
        buttonDisabled,
        errorShown,
        silent: !wrote && !errorShown && !buttonDisabled,
        wrote,
      };
    }

    function beginInlineTextEdit(id: string) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-text-session', id, active: true },
          source: sessionWindow,
        }));
      });
    }

    /** Post a text commit from the document, as pressing Enter inline does. */
    function commitInlineText(id: string, value: string) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-text-commit', id, value },
          source: sessionWindow,
        }));
      });
    }

    /**
     * Take the host's route into the live document away while leaving the
     * document itself mounted and running. This is the instant during a
     * document replacement when the old frame has been detached but the new
     * one has not been adopted: the host holds a frame with no browsing
     * context, so it can neither post to the bridge nor accept a reply.
     */
    function detachHostRouteToDocument() {
      Object.defineProperty(frame, 'contentWindow', {
        configurable: true,
        get: () => null,
      });
    }

    function failWriteOnce() {
      failNextWrite = true;
    }

    function holdNextWrite() {
      let release = () => {};
      holdWrite = new Promise<void>((resolve) => { release = () => resolve(); });
      return () => {
        holdWrite = null;
        release();
      };
    }

    /** Click the toolbar toggle to leave edit mode; report whether it refused. */
    async function leaveManualEditFails(): Promise<boolean> {
      fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 2400); }); });
      return screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed') === 'true';
    }

    return {
      beginInlineTextEdit,
      commitInlineText,
      detachHostRouteToDocument,
      failWriteOnce,
      holdNextWrite,
      leaveManualEditFails,
      saveThroughPanel,
      selectTarget,
    };
  }

  /**
   * `finishManualEditTextSession` returns `false` when it has no window to post
   * into, and that `false` is indistinguishable from a failed commit. Save
   * takes its bare return.
   */
  it('says something when it cannot reach the document holding the inline edit', async () => {
    const view = await openManualEdit();
    await view.selectTarget(textTarget());
    view.beginInlineTextEdit('hero');
    view.detachHostRouteToDocument();

    const verdict = await view.saveThroughPanel('Hero EDIT1');

    expect(verdict.silent).toBe(false);
  });

  /**
   * `applyManualEdit` refuses with `edit_busy` while another write is in
   * flight, without setting an error — and the refusal is not discarded. The
   * commit record stores it as a FAILED commit, which lands the session id in
   * `manualEditTextFailedSessionIdsRef`, and `exitManualEditModeAfterFlush`
   * refuses to leave edit mode for as long as that set is non-empty.
   *
   * So the user is held inside Manual Edit by a failure they were never told
   * about. Reaching it needs no unusual timing beyond two inline commits close
   * together — type in an element, press Enter, immediately edit another and
   * press Enter again while the first write is still on the wire.
   *
   * Note the panel's Save button is NOT the way in: it disables itself while a
   * write is in flight, so `edit_busy` cannot be reached by clicking it. That
   * was checked before writing this case.
   */
  it('says something when a second inline commit is refused as busy', async () => {
    const view = await openManualEdit();
    await view.selectTarget(textTarget());

    // Two DIFFERENT elements. A refusal recorded against the same element id
    // as the write that succeeds is erased by that success, so the stuck state
    // needs the second edit to be a different element — which is also what a
    // user does: finish one, click the next, press Enter again.
    const release = view.holdNextWrite();
    view.commitInlineText('hero', 'Hero first');
    view.commitInlineText('cta', 'View tokens second');
    release();
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 400); }); });

    const stuck = await view.leaveManualEditFails();
    const errorShown = document.querySelector('.manual-edit-error') !== null;

    expect(stuck && !errorShown).toBe(false);
  });

  /**
   * The failure witness outlives the message that explained it.
   *
   * `manualEditTextFailedSessionIdsRef` records a commit that genuinely failed,
   * and `exitManualEditModeAfterFlush` consults it on every attempt to leave.
   * The error that explained the failure is transient: the next successful save
   * clears the banner via `setManualEditError(null)`. From then on the witness
   * gates the exit with nothing on screen, and the only way out is to re-edit
   * the exact element that failed — which the user has no way to know.
   */
  it('says something when an earlier failed edit is still holding edit mode', async () => {
    const view = await openManualEdit();
    await view.selectTarget(textTarget());

    view.failWriteOnce();
    view.commitInlineText('cta', 'View tokens that failed');
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 400); }); });

    // A later save succeeds and clears the banner the failure had put up.
    view.commitInlineText('hero', 'Hero that saved');
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 400); }); });

    const stuck = await view.leaveManualEditFails();
    const errorShown = document.querySelector('.manual-edit-error') !== null;

    expect(stuck && !errorShown).toBe(false);
  });
});
