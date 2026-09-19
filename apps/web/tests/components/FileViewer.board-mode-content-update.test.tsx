// @vitest-environment jsdom
// Comment mode must keep one coherent canvas: settled file versions replace
// the retained real-URL document atomically, while partial liveHtml chunks do
// not navigate the document underneath an active annotation session.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  uninstallFileViewerPreviewRuntimeHarness,
  useSyntheticProjectScopedPreviewNavigation,
} from '../helpers/file-viewer-preview-runtime';

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({ context: null, loading: false }),
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

function deckHtml(label: string): string {
  return `<html><body><section class="slide"><h1>${label}</h1></section></body></html>`;
}

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

function activeRuntimeFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

function installFetchMock(bytes: { current: string }): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof Request ? input.url : String(input);
    if (url.startsWith('/api/projects/project-1/raw/')) {
      return new Response(bytes.current, { status: 200 });
    }
    return new Response('', { status: 404 });
  }));
}

async function enterCommentMode(): Promise<void> {
  const toggle = await screen.findByTestId('board-mode-toggle');
  await act(async () => fireEvent.click(toggle));
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

describe('FileViewer Comment-mode content updates', () => {
  it('atomically promotes a settled on-disk version while Comment mode stays open', async () => {
    const bytes = { current: deckHtml('BOARD-V1') };
    installFetchMock(bytes);
    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
      />,
    );
    const firstFrame = await waitFor(activeRuntimeFrame);
    await enterCommentMode();

    bytes.current = deckHtml('BOARD-V2');
    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 2 })}
        isDeck
        filesRefreshKey={1}
      />,
    );

    const secondFrame = await waitFor(() => {
      const frame = activeRuntimeFrame();
      expect(frame).not.toBe(firstFrame);
      return frame;
    });
    expect(secondFrame.getAttribute('data-od-render-mode')).toBe('runtime-url');
    expect(screen.getByTestId('board-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
  });

  it('keeps the retained document stable across partial liveHtml updates', async () => {
    const bytes = { current: deckHtml('STREAM-BASE') };
    installFetchMock(bytes);
    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
      />,
    );
    const frame = await waitFor(activeRuntimeFrame);
    const runtimeUrl = frame.src;
    const sessionId = frame.dataset.odSessionId;
    const documentVersion = frame.dataset.odDocumentVersion;
    await enterCommentMode();

    view.rerender(
      <ProductFileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
        liveHtml={deckHtml('STREAM-T1')}
      />,
    );
    view.rerender(
      <ProductFileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
        liveHtml={deckHtml('STREAM-T2')}
      />,
    );

    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    const retained = activeRuntimeFrame();
    expect(retained.src).toBe(runtimeUrl);
    expect(retained.dataset.odSessionId).toBe(sessionId);
    expect(retained.dataset.odDocumentVersion).toBe(documentVersion);
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
  });
});
