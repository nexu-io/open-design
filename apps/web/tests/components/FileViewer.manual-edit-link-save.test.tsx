// @vitest-environment jsdom
//
// Red spec for the manual-edit link/image save gap.
//
// Invariant under test: after Manual Edit persists a content patch, the live
// document must be mirrored to exactly the persisted bytes. Manual Edit freezes
// the preview's document identity while it is open (FileViewer.tsx, the
// `previewRuntimeRevisionIdentityRef` guard), so the live bridge is the ONLY
// way a save can become visible before the user leaves edit mode. `set-text`
// and `set-outer-html` have that bridge; `set-link` and `set-image` do not, so
// saving a link's text writes the file and changes nothing on screen.

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

// A call-to-action authored the way real pages author one: an anchor whose
// label sits next to an icon. `inferKind` in the preview runtime classifies any
// <a> as `link`, so this is the ordinary shape of a link target.
const CTA_SOURCE =
  '<!doctype html><html><body>'
  + '<a data-od-id="cta" href="./tokens.css">View tokens<svg viewBox="0 0 24 24"></svg></a>'
  + '</body></html>';

function ctaTarget(): ManualEditTarget {
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

function htmlPreviewFile(): ProjectFile {
  return {
    name: 'preview.html',
    path: 'preview.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    mime: 'text/html',
    kind: 'html',
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

describe('FileViewer manual edit — link save reaches the live preview', () => {
  function clickManualTool(testId: string) {
    fireEvent.click(screen.getByTestId(testId));
  }

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
    clickManualTool('manual-edit-mode-toggle');

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

  async function selectManualEditTarget(target: ManualEditTarget) {
    const frame = await previewFrame();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'od-edit-select', target },
        source: frame.contentWindow,
      }));
    });
    await waitFor(() => {
      expect(document.querySelector('.manual-edit-right')).not.toBeNull();
    });
  }

  it('mirrors a saved link-text edit into the retained document', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(CTA_SOURCE, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={CTA_SOURCE}
      />,
    );

    await enterManualEditMode();
    await selectManualEditTarget(ctaTarget());

    const frame = await previewFrame();
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'View tokens EDIT' } });
    fireEvent.click(screen.getByText('Save'));

    // The write itself is not in doubt — it is the half the user can already see
    // on disk.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/files',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // The half that is missing: nothing carries the persisted bytes into the
    // document the user is looking at, and Edit will not let it re-navigate.
    const mirrored = postMessage.mock.calls
      .map(([value]) => value as { type?: string; id?: string } | null)
      .filter((value) => (
        !!value
        && typeof value.type === 'string'
        && value.type.startsWith('od-edit-preview-')
        && value.id === 'cta'
      ));
    expect(
      JSON.stringify(mirrored),
    ).toContain('View tokens EDIT');
  });

  // Control: the identical flow on a text-leaf target, which DOES have a live
  // bridge. If this passes while the link case fails, the assertion above is
  // measuring the right thing and the gap is the link/image patch kind.
  it('control — mirrors a saved text edit into the retained document', async () => {
    const TEXT_SOURCE = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url.includes('/api/projects/project-1/files') && init?.method === 'POST') {
        return new Response(JSON.stringify({ file: htmlPreviewFile() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(TEXT_SOURCE, { status: 200, headers: { 'Content-Type': 'text/html' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml={TEXT_SOURCE}
      />,
    );

    await enterManualEditMode();
    await selectManualEditTarget({
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
    });

    const frame = await previewFrame();
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    const textarea = document.querySelector('.manual-edit-right textarea') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'Hero EDIT' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/files',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      const mirrored = postMessage.mock.calls
        .map(([value]) => value as { type?: string; id?: string } | null)
        .filter((value) => (
          !!value
          && typeof value.type === 'string'
          && value.type.startsWith('od-edit-preview-')
          && value.id === 'hero'
        ));
      expect(JSON.stringify(mirrored)).toContain('Hero EDIT');
    });
  });
});
