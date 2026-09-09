// @vitest-environment jsdom
//
// Red spec for the document that keeps answering to ids a save has retired.
//
// Manual Edit addresses an element by `data-od-source-path`, a positional
// ordinal counted through the source. Writing re-serializes the document
// through the HTML parser, which can add or remove an element — an implicit
// `</p>` before a block child, the `<tbody>` a table never wrote — and every
// ordinal after that point shifts by one.
//
// Whether that becomes a wrong-element edit depends on what happens to the
// document on screen. If the save is mirrored into it, the document is RETAINED
// and still carries the ids it was served with, while the source it will be
// patched against now answers to different ones. The user's next click travels
// back with a retired id and the host writes to the element beside the one they
// picked, with nothing on screen to suggest it.
//
// So a save that renumbers has to give the document up. That is what these
// tests pin, in both directions: renumbered means replaced, and unchanged means
// retained — because replacing on every save would throw away the live
// document's canvas, timers and scroll for nothing.
//
// Provenance: this was found from two `edit-landed-on-clicked-element` failures
// in a 500-artifact patrol, on `div` and `h3` targets, both with the document's
// own witnesses reporting continuity preserved and zero navigations — that is,
// with the document retained, which is the state this defect needs.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { annotateManualEditSourceOrdinals } from '@open-design/preview-runtime/manual-edit-source';
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

/** The parser rewrites this on the way in: `<p>` closes before the `<div>`. */
const RENUMBERS_ON_SAVE =
  '<!doctype html><html><body>'
  + '<p>Intro<div data-od-id="body-copy">Body copy</div></p>'
  + '<h3>Pricing</h3><h3>Support</h3>'
  + '</body></html>';

/** Nothing for the parser to rewrite. */
const STABLE_ON_SAVE =
  '<!doctype html><html><body>'
  + '<div data-od-id="body-copy">Body copy</div>'
  + '<h3>Pricing</h3><h3>Support</h3>'
  + '</body></html>';

function bodyCopyTarget(): ManualEditTarget {
  return {
    id: 'body-copy',
    kind: 'text',
    label: 'Body copy',
    tagName: 'div',
    className: '',
    text: 'Body copy',
    rect: { x: 24, y: 24, width: 160, height: 48 },
    fields: { text: 'Body copy' },
    attributes: { 'data-od-id': 'body-copy' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: false,
    outerHtml: '<div data-od-id="body-copy">Body copy</div>',
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

function liveSessionId(): string {
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  const session = frame.dataset.odSessionId;
  if (!session) throw new Error('Preview frame has no scoped session');
  return session;
}

/** The ordinal each editable element answers to in the served document. */
function servedIds(html: string): string[] {
  const doc = new DOMParser().parseFromString(annotateManualEditSourceOrdinals(html), 'text/html');
  return Array.from(doc.querySelectorAll('[data-od-source-path]')).map(
    (el) => `${el.getAttribute('data-od-source-path')}:${el.tagName.toLowerCase()}`,
  );
}

describe('FileViewer manual edit — a save that retires element ids', () => {
  async function openManualEdit(pageSource: string) {
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
      return new Response(pageSource, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <FileViewer
        projectId={PROJECT_ID}
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml={pageSource}
      />,
    );

    const frame = await waitFor(() => {
      const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
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

    const bridged = new WeakSet<Window>();
    /** The injected bridge, applying every mirror — so the document is retained
     *  unless the product itself decides to give it up. */
    function installBridge() {
      const win = (screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).contentWindow;
      if (!win || bridged.has(win)) return;
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
            applied: true,
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

    async function saveTextThroughPanel(target: ManualEditTarget, value: string) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-select', target },
          source: (screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement).contentWindow,
        }));
      });
      await waitFor(() => {
        expect(document.querySelector('.manual-edit-right')).not.toBeNull();
      });
      const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value } });
      fireEvent.click(screen.getByText('Save'));
      await waitFor(() => {
        expect(syntheticPreviewFileSource(PROJECT_ID, FILE_NAME) ?? '').toContain(value);
      });
      await settle();
    }

    return { saveTextThroughPanel };
  }

  /**
   * The defect. The save renumbers, the mirror lands, the document is kept —
   * and it keeps answering to ids that no longer mean what they meant.
   */
  it('replaces the document when the save retired its element ids', async () => {
    // The premise, checked rather than assumed: this document really does
    // renumber, so the test is not passing on a document that never moved.
    const beforeIds = servedIds(RENUMBERS_ON_SAVE);
    const { saveTextThroughPanel } = await openManualEdit(RENUMBERS_ON_SAVE);
    const before = liveSessionId();

    await saveTextThroughPanel(bodyCopyTarget(), 'Body copy rewritten');

    const persisted = syntheticPreviewFileSource(PROJECT_ID, FILE_NAME) ?? '';
    expect(servedIds(persisted)).not.toEqual(beforeIds);
    expect(liveSessionId()).not.toBe(before);
  }, 30_000);

  /**
   * The other direction, and the reason this cannot be fixed by replacing on
   * every save: a document whose ids survived keeps its browsing context, with
   * the canvas, timers and scroll the retained runtime exists to preserve.
   */
  it('keeps the document when the save left its element ids alone', async () => {
    const beforeIds = servedIds(STABLE_ON_SAVE);
    const { saveTextThroughPanel } = await openManualEdit(STABLE_ON_SAVE);
    const before = liveSessionId();

    await saveTextThroughPanel(bodyCopyTarget(), 'Body copy rewritten');

    const persisted = syntheticPreviewFileSource(PROJECT_ID, FILE_NAME) ?? '';
    expect(servedIds(persisted)).toEqual(beforeIds);
    expect(liveSessionId()).toBe(before);
  }, 30_000);
});
