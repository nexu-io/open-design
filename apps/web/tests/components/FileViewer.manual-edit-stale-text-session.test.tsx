// @vitest-environment jsdom
//
// Red spec for a Manual Edit save that silently does nothing.
//
// Manual Edit keeps ONE piece of state about the preview document that is not
// owned by the preview document: `manualEditTextSessionIdRef`. The host sets it
// when the injected edit bridge reports `od-edit-text-session {active:true}`,
// and clears it only when the bridge reports the session ended, when the file
// changes, or when edit mode closes. Nothing clears it when the *document* is
// replaced.
//
// Every Save routes through `settlePendingManualEditCommit()` first, and while
// that ref is set the host posts `od-edit-text-finish` into the live frame and
// waits for the bridge to acknowledge. The runtime answers that message from
// `finishActiveTextEdit`, which returns immediately — sending nothing at all —
// when the document it is running in has no inline edit open
// (`packages/preview-runtime/src/manual-edit.ts`, `if (!activeTextEdit) return
// false;`). A replaced document therefore never answers, the 1500ms backstop
// resolves the settle as `false`, and `saveManualEditPanelDraft` takes its bare
// `return`.
//
// That return is the whole defect. It happens before `applyManualEdit`, so
// `manualEditSaving` is never set and the Save button never goes busy; it sets
// no `manualEditError`, so no banner appears; and it issues no write, so the
// file is byte-identical afterwards. The user clicks Save on a live-looking
// panel and loses the edit with no signal of any kind.
//
// The precondition is reachable in the shipped product because Manual Edit no
// longer pins one document for the length of a session. PR #7828 made the
// identity freeze lift for the rest of the session as soon as a save cannot be
// mirrored into the live document (`shouldFreezeManualEditDocumentIdentity`
// returns false once `liveDocumentDiverged` is set) — deliberately, so that
// unmirrored saves become visible. Once that freeze is lifted every subsequent
// revision of the file replaces the preview document while Manual Edit is still
// open, which is exactly the state these tests put the product in: a session
// belief minted against a document that is no longer on screen.
//
// The invariant under test is the plain one, and it is deliberately not phrased
// as "the settle must succeed": clicking Save either writes the file or tells
// the user why it did not. A silent no-op is neither.

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

function linkTarget(): ManualEditTarget {
  return {
    id: 'cta',
    kind: 'link',
    label: 'View tokens',
    tagName: 'a',
    className: 'btn btn-primary',
    text: 'View tokens',
    rect: { x: 16, y: 358, width: 250, height: 40 },
    fields: { text: 'View tokens', href: './tokens.css' },
    attributes: { 'data-od-id': 'cta', href: './tokens.css' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<a data-od-id="cta" href="./tokens.css">View tokens<svg viewBox="0 0 24 24"></svg></a>',
  };
}

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

function liveSessionId(): string {
  const session = liveFrame().dataset.odSessionId;
  if (!session) throw new Error('Preview frame has no scoped session');
  return session;
}

describe('FileViewer manual edit — Save after the edited document was replaced', () => {
  /**
   * Drives the real product flow: mount the viewer on a settled HTML document
   * and open Manual Edit. The preview window stands in for the injected edit
   * bridge and answers mirror requests with `documentApplies`.
   *
   * The bridge double deliberately does NOT answer `od-edit-text-finish`. That
   * is not a weakened double: a document with no inline edit open is exactly
   * what the shipped runtime does with that message — `finishActiveTextEdit`
   * returns before posting anything.
   */
  async function openManualEdit(documentApplies = true) {
    let currentFile = htmlPreviewFile();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request ? input.url : String(input);
      if (url.includes(`/api/projects/${PROJECT_ID}/files`) && init?.method === 'POST') {
        const body = typeof init.body === 'string' ? init.body : '';
        try {
          const parsed = JSON.parse(body) as { content?: string };
          if (typeof parsed.content === 'string') {
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

    const view = render(
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
     * Install the bridge double on whichever document is currently on screen.
     * Every replacement mints a new frame, so this has to be re-installed the
     * same way the real injected bridge boots inside each new document.
     */
    const bridged = new WeakSet<Window>();
    function installBridge() {
      const win = liveFrame().contentWindow!;
      if (bridged.has(win)) return;
      bridged.add(win);
      const spy = vi.spyOn(win, 'postMessage');
      const previous = spy.getMockImplementation();
      spy.mockImplementation(((message: unknown, ...rest: unknown[]) => {
        (previous as ((...args: unknown[]) => void) | undefined)?.(message, ...rest);
        const data = message as { requestId?: unknown; id?: unknown } | null;
        if (typeof data?.requestId !== 'string') return;
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'od-edit-preview:applied',
            requestId: data.requestId,
            id: data.id ?? '',
            applied: documentApplies,
          },
          source: win,
        }));
      }) as Window['postMessage']);
    }
    installBridge();

    async function settle() {
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80); }); });
      view.rerender(
        <FileViewer projectId={PROJECT_ID} projectKind="prototype" file={currentFile} />,
      );
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80); }); });
      installBridge();
    }

    /** Select a target and save new text through the properties panel. */
    async function saveTextThroughPanel(target: ManualEditTarget, value: string) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-select', target },
          source: liveFrame().contentWindow,
        }));
      });
      await waitFor(() => {
        expect(document.querySelector('.manual-edit-right')).not.toBeNull();
      });
      const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value } });
      fireEvent.click(screen.getByText('Save'));
      // The settle backstop inside the product is 1500ms; give the save more
      // than that so a slow-but-correct path is never reported as a silent one.
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 2200); }); });
      await settle();
    }

    /**
     * The user clicks into a text element in the live document and starts
     * typing. This is the message the injected bridge posts from `makeEditable`.
     */
    function beginInlineTextEdit(id: string) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-text-session', id, active: true },
          source: liveFrame().contentWindow,
        }));
      });
    }

    /**
     * A new revision of the file lands while Manual Edit is open. Once the
     * identity freeze has lifted this replaces the preview document, which is
     * the product behavior PR #7828 introduced on purpose.
     */
    async function deliverExternalRevision() {
      currentFile = htmlPreviewFile(currentFile.size + 1, currentFile.mtime + 1);
      await settle();
    }

    return {
      beginInlineTextEdit,
      deliverExternalRevision,
      fetchMock,
      saveTextThroughPanel,
    };
  }

  /**
   * The defect. The session belief outlives the document that minted it, the
   * replacement document has nothing to acknowledge, and Save returns before it
   * ever reaches `applyManualEdit`.
   */
  it('persists a panel save after the document that held the inline edit was replaced', async () => {
    const { beginInlineTextEdit, deliverExternalRevision, saveTextThroughPanel } =
      await openManualEdit(false);

    // Lift the identity freeze the way the shipped product does: one save the
    // live document cannot mirror.
    await saveTextThroughPanel(linkTarget(), 'View tokens EDIT1');
    expect(syntheticPreviewFileSource(PROJECT_ID, FILE_NAME)).toContain('View tokens EDIT1');

    // The user clicks into the hero text and starts typing.
    beginInlineTextEdit('hero');
    const editedDocument = liveSessionId();

    // A new revision replaces the document out from under that inline edit.
    await deliverExternalRevision();
    expect(liveSessionId()).not.toBe(editedDocument);

    // The user now saves through the panel. This must reach the file.
    await saveTextThroughPanel(textTarget(), 'Hero EDIT2');

    expect(syntheticPreviewFileSource(PROJECT_ID, FILE_NAME)).toContain('Hero EDIT2');
  }, 30_000);

  /**
   * The severity claim, pinned separately so a fix cannot satisfy the spec by
   * swapping a silent no-op for a silent-but-different no-op: whatever happens,
   * the user is never left looking at a Save button that is idle, unerrored and
   * did nothing.
   */
  it('never leaves Save idle, unerrored and unwritten', async () => {
    const { beginInlineTextEdit, deliverExternalRevision, fetchMock, saveTextThroughPanel } =
      await openManualEdit(false);

    await saveTextThroughPanel(linkTarget(), 'View tokens EDIT1');
    beginInlineTextEdit('hero');
    await deliverExternalRevision();

    const writesBefore = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    ).length;

    await saveTextThroughPanel(textTarget(), 'Hero EDIT2');

    const writesAfter = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    ).length;
    const errorShown = document.querySelector('.manual-edit-error') !== null
      || document.body.textContent?.includes('Could not save') === true;

    expect(writesAfter > writesBefore || errorShown).toBe(true);
  }, 30_000);
});
