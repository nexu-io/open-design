// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  syntheticPreviewFileSource,
  uninstallFileViewerPreviewRuntimeHarness,
  useSyntheticProjectScopedPreviewNavigation,
} from '../helpers/file-viewer-preview-runtime';

// Every distinct revision key is one minted preview scope: the navigation
// cache is keyed by it, and the daemon answers each miss with a new session id
// and a new browsing context. Counting them is how "the document was
// provisioned twice" becomes an assertion instead of a stopwatch.
const scopeRequests = vi.hoisted(() => ({ revisionKeys: [] as string[] }));

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
    ) => {
      if (options.enabled !== false && !scopeRequests.revisionKeys.includes(options.revisionKey)) {
        scopeRequests.revisionKeys.push(options.revisionKey);
      }
      return useSyntheticProjectScopedPreviewNavigation(options);
    },
  };
});

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

// The whitespace before `</body>` is the point. `normalizeDeckVisualSource`
// strips it for the deck render path, so a deck's rendered source is a
// different string from the bytes on disk by construction — which is exactly
// what the Manual Edit retention latch must not be compared against.
const DECK_SOURCE = [
  '<!doctype html><html><head><meta charset="utf-8"></head>',
  '<body>',
  '<section class="slide"><main data-od-id="hero">Hero</main></section>',
  '',
  '</body></html>',
].join('\n');

const PLAIN_SOURCE = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';

function heroTarget(): ManualEditTarget {
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

function previewFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    mime: 'text/html',
    kind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Preview',
      entry: name,
      renderer: 'html',
      exports: ['html'],
    },
  };
}

beforeEach(() => {
  scopeRequests.revisionKeys.length = 0;
  installFileViewerPreviewRuntimeHarness();
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('leaving Manual Edit does not provision the document twice', () => {
  async function previewFrame() {
    return waitFor(() => {
      const node = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
      if (!node.contentWindow) throw new Error('Preview frame not ready');
      return node;
    });
  }

  async function enterManualEditMode() {
    const initialFrame = await previewFrame();
    const postMessageSpy = vi.spyOn(initialFrame.contentWindow!, 'postMessage');
    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    const captureRequest = postMessageSpy.mock.calls
      .map(([value]) => value)
      .find((value) => (
        typeof value === 'object'
        && value !== null
        && (value as { type?: unknown }).type === 'od:preview-runtime-state-capture'
      )) as { type: string; id: string } | undefined;
    if (captureRequest) {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          data: {
            type: 'od:preview-runtime-state-captured',
            id: captureRequest.id,
            state: { version: 1, hash: '', htmlAttrs: {}, bodyAttrs: {}, entries: [] },
          },
          source: initialFrame.contentWindow,
        }));
      });
    }
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  }

  async function selectManualEditTarget() {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target: heroTarget() },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).not.toBeNull();
    });
  }

  function installSaveTransport(source: string) {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: previewFile('preview.html') }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(source, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  /**
   * Save one text edit through the panel, leave Edit, then deliver the watcher
   * content-refresh the save produces. The bridge has already applied the exact
   * persisted bytes to the live document, so that echo must be absorbed.
   */
  async function saveExitAndEcho(
    rerender: (ui: React.ReactElement) => void,
    view: (refreshKey: number) => React.ReactElement,
    source: string,
  ): Promise<void> {
    const fetchMock = installSaveTransport(source);
    await enterManualEditMode();
    await selectManualEditTarget();
    const frame = await previewFrame();
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hero edited' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/files',
        expect.objectContaining({ method: 'POST' }),
      );
      // The latch is only set once the bridge confirms the live DOM now holds
      // the saved bytes; without this the test would measure an unlatched exit.
      expect(postMessage).toHaveBeenCalledWith({
        type: 'od-edit-preview-text',
        id: 'hero',
        value: 'Hero edited',
      }, '*');
    });

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    });

    await act(async () => {
      rerender(view(2));
      await Promise.resolve();
    });
  }

  it('absorbs the save echo on a deck instead of minting a second preview scope', async () => {
    const view = (refreshKey: number) => (
      <FileViewer
        projectId="project-1"
        projectKind="slide_deck"
        isDeck
        file={previewFile('preview.html')}
        fileContentRefreshKey={refreshKey}
        liveHtml={DECK_SOURCE}
      />
    );
    const { rerender } = render(view(1));
    await previewFrame();
    const beforeEdit = [...scopeRequests.revisionKeys];
    expect(beforeEdit.length).toBeGreaterThan(0);

    await saveExitAndEcho(rerender, view, DECK_SOURCE);

    expect(scopeRequests.revisionKeys).toEqual(beforeEdit);
  });

  // Control: the same round trip on an ordinary document already absorbs the
  // echo. If this one ever goes red the defect is not deck-specific and the
  // fix above is aimed at the wrong rule.
  it('absorbs the save echo on an ordinary document', async () => {
    const view = (refreshKey: number) => (
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={previewFile('preview.html')}
        fileContentRefreshKey={refreshKey}
        liveHtml={PLAIN_SOURCE}
      />
    );
    const { rerender } = render(view(1));
    await previewFrame();
    const beforeEdit = [...scopeRequests.revisionKeys];
    expect(beforeEdit.length).toBeGreaterThan(0);

    await saveExitAndEcho(rerender, view, PLAIN_SOURCE);

    expect(scopeRequests.revisionKeys).toEqual(beforeEdit);
  });
});
