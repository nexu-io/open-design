// @vitest-environment jsdom
//
// Red spec for the scroll position lost by a style save.
//
// `applyManualEdit` snapshots the preview's scroll position before it writes,
// so the document that comes back after the write can be rebuilt where the user
// left it rather than at 0/0. It skips that snapshot for one patch kind:
//
//   apps/web/src/components/FileViewer.tsx
//   // Style patches stream live through postMessage and never reload.
//   if (patch.kind !== 'set-style') {
//     await capturePreviewScrollPosition();
//   }
//
// That comment was TRUE when it was written. Manual Edit used to pin one
// preview document for the length of a session, so a style save really did
// stream into the document already on screen and really never reloaded.
//
// #7828 changed it. The identity freeze now lifts for the rest of the session
// the moment a save cannot be mirrored into the live document
// (`shouldFreezeManualEditDocumentIdentity` returns false once
// `liveDocumentDiverged` is set) — deliberately, so unmirrored saves become
// visible. From that point on EVERY revision replaces the preview document,
// style saves included. The premise the skip rests on stopped holding, and the
// code that depends on it was not revisited.
//
// So the skip is no longer "this kind of patch never reloads". It is "this kind
// of patch never reloads, unless something else in the session already decided
// otherwise" — and in that case the user's scroll is gone. The condition that
// matters is whether the document is about to be REPLACED, and it was never
// about the patch kind at all. These tests pin that: the same `set-style` save
// must capture in one state and must not in the other.
//
// Scope note: this is a mechanism read out of the code, not an attribution.
// It produces the same symptom as a cluster of failures seen elsewhere, but
// nothing here claims those failures were this.

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
  + '<main data-od-id="hero">Hero</main>'
  + '<section data-od-id="panel">Panel</section>'
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

describe('FileViewer manual edit — scroll across a style save', () => {
  /**
   * `documentApplies` is the bridge's answer to a mirror request, and it is what
   * decides whether this session's preview document is retained or replaced:
   * a refusal sets `liveDocumentDiverged`, which lifts the identity freeze for
   * the rest of the session.
   */
  async function openManualEdit(documentApplies: boolean) {
    let currentFile = htmlPreviewFile();
    const writes: string[] = [];
    /**
     * The host's preview postMessages AND its writes, in the order they
     * happened. Order is the whole point: a snapshot taken after the write has
     * already lost the race with the file watcher.
     */
    const posted: { type: string }[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request ? input.url : String(input);
      if (url.includes(`/api/projects/${PROJECT_ID}/files`) && init?.method === 'POST') {
        posted.push({ type: '__write__' });
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

    const bridged = new WeakSet<Window>();
    /**
     * Stand in for the injected bridge on whichever document is on screen, and
     * record what the host posts into it. Every replacement mints a new
     * document, so this re-installs the same way the real bridge boots.
     */
    function installBridge() {
      const win = liveFrame().contentWindow;
      if (!win || bridged.has(win)) return;
      bridged.add(win);
      const spy = vi.spyOn(win, 'postMessage');
      const previous = spy.getMockImplementation();
      spy.mockImplementation(((message: unknown, ...rest: unknown[]) => {
        (previous as ((...args: unknown[]) => void) | undefined)?.(message, ...rest);
        const data = message as { requestId?: unknown; id?: unknown; type?: unknown } | null;
        if (typeof data?.type === 'string') posted.push({ type: data.type });
        if (typeof data?.requestId !== 'string') return;
        // A scroll capture is answered by the document, not by the edit bridge.
        if (data.type === 'od:preview-scroll-capture') {
          window.dispatchEvent(new MessageEvent('message', {
            data: {
              type: 'od:preview-scroll',
              requestId: data.requestId,
              frameLeft: 0,
              frameTop: 640,
              canvasLeft: 0,
              canvasTop: 640,
            },
            source: win,
          }));
          return;
        }
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
    installBridge();

    async function settle() {
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80); }); });
      view.rerender(
        <FileViewer projectId={PROJECT_ID} projectKind="prototype" file={currentFile} />,
      );
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80); }); });
      installBridge();
    }

    function selectTarget(target: ManualEditTarget) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'od-edit-select', target },
          source: liveFrame().contentWindow,
        }));
      });
      return waitFor(() => {
        expect(document.querySelector('.manual-edit-right')).not.toBeNull();
      });
    }

    /** The user scrolls the preview; the document reports where it is. */
    function reportScroll(top: number) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'od:preview-scroll',
            frameLeft: 0,
            frameTop: top,
            canvasLeft: 0,
            canvasTop: top,
          },
          source: liveFrame().contentWindow,
        }));
      });
    }

    /** Save new panel text — the ordinary way to reach a non-style save. */
    async function saveTextThroughPanel(value: string) {
      const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value } });
      fireEvent.click(screen.getByText('Save'));
      await waitFor(() => {
        expect(writes.some((written) => written.includes(value))).toBe(true);
      });
      await settle();
    }

    /**
     * Drag an element, then Save. Dragging routes through the same pending-style
     * pipeline the inspector uses, so this is a `set-style` save on the ordinary
     * path.
     */
    async function saveStyleThroughDrag(transform: string) {
      const before = writes.length;
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'od-edit-drag-commit',
            id: 'hero',
            transform,
            display: 'block',
          },
          source: liveFrame().contentWindow,
        }));
      });
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 20); }); });
      fireEvent.click(screen.getByText('Save'));
      await waitFor(() => {
        expect(writes.length).toBeGreaterThan(before);
      });
      await settle();
    }

    async function undo() {
      const before = writes.length;
      fireEvent.click(screen.getByLabelText('Undo'));
      await waitFor(() => {
        expect(writes.length).toBeGreaterThan(before);
      });
      await settle();
    }

    function capturedScrollBeforeWrite(): boolean {
      const capture = posted.findIndex((m) => m.type === 'od:preview-scroll-capture');
      const write = posted.findIndex((m) => m.type === '__write__');
      return capture !== -1 && write !== -1 && capture < write;
    }

    function forgetPostedMessages() {
      posted.length = 0;
    }

    return {
      capturedScrollBeforeWrite,
      forgetPostedMessages,
      reportScroll,
      saveStyleThroughDrag,
      saveTextThroughPanel,
      selectTarget,
      undo,
      writes,
    };
  }

  /**
   * The defect. The session has already diverged, so the identity freeze is
   * lifted and this style save WILL replace the document — and the scroll
   * position is never snapshotted, so the replacement comes back at the top.
   */
  it('captures the scroll before a style save that will replace the document', async () => {
    const view = await openManualEdit(false);
    await view.selectTarget(textTarget());

    // One save the document cannot mirror lifts the freeze for the session.
    await view.saveTextThroughPanel('Hero EDIT1');
    // Prove the probe can see a capture at all before relying on its absence:
    // a content save on this same harness does snapshot the scroll.
    expect(view.capturedScrollBeforeWrite()).toBe(true);

    // A successful panel save closes the inspector; the user picks the element
    // again to keep editing it.
    await view.selectTarget(textTarget());
    view.reportScroll(640);
    view.forgetPostedMessages();
    await view.saveStyleThroughDrag('translate(12px, 8px)');

    expect(view.capturedScrollBeforeWrite()).toBe(true);
  }, 30_000);

  /**
   * The other direction, and the reason this cannot be fixed by capturing
   * unconditionally: while the freeze holds, the style really does stream into
   * the document already on screen and nothing is replaced. Paying for a
   * capture round trip there would put 120ms on the wire in front of every
   * style save for nothing.
   *
   * Together with the case above this is what makes the dependency explicit —
   * the same `set-style` patch answers differently in the two states, so the
   * decision is demonstrably about replacement and not about the patch kind.
   */
  it('does not capture the scroll for a style save that keeps the document', async () => {
    const view = await openManualEdit(true);
    await view.selectTarget(textTarget());

    view.reportScroll(640);
    view.forgetPostedMessages();
    await view.saveStyleThroughDrag('translate(12px, 8px)');

    expect(view.writes.length).toBeGreaterThan(0);
    expect(view.capturedScrollBeforeWrite()).toBe(false);
  }, 30_000);

  /**
   * The same retired premise, one function over.
   *
   * Undo and Redo write the previous source and then snapshot the scroll:
   *
   *   // Same srcDoc rebuild as a committed patch — keep the scroll position
   *   // across the reload (#92).
   *   await capturePreviewScrollPosition();
   *
   * `applyManualEdit` documents at length why that order is wrong — "a
   * committed content patch can notify the file watcher as soon as the write
   * lands" — and captures BEFORE writing for exactly that reason. Undo was
   * written when the freeze made the ordering moot, because during a Manual
   * Edit session nothing was going to replace the document anyway. Once the
   * freeze lifts, the watcher can land the replacement between the write and
   * the snapshot, and the snapshot then measures the fresh document at 0/0 —
   * recording the top of the page as the place to restore to.
   */
  it('captures the scroll before an undo writes', async () => {
    const view = await openManualEdit(false);
    await view.selectTarget(textTarget());
    await view.saveTextThroughPanel('Hero EDIT1');
    await view.selectTarget(textTarget());

    view.reportScroll(640);
    view.forgetPostedMessages();
    await view.undo();

    expect(view.capturedScrollBeforeWrite()).toBe(true);
  }, 30_000);
});
