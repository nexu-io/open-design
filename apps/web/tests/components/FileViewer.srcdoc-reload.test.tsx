// @vitest-environment jsdom
// Reload regression coverage after removing the srcDoc transport. Reload
// stages a second real-URL browsing context and keeps the current document on
// screen until the exact Runtime handshake completes.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  setFileViewerPreviewRuntimeAutoSettle,
  settleFileViewerPreviewRuntimeStandby,
  uninstallFileViewerPreviewRuntimeHarness,
  useSyntheticProjectScopedPreviewNavigation,
} from '../helpers/file-viewer-preview-runtime';

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

function htmlFile(): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    size: 128,
    mtime: 1,
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
  };
}

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

function standbyFrame(): HTMLIFrameElement {
  return screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
}

function currentFrame(): HTMLIFrameElement {
  return (screen.queryByTestId('artifact-preview-frame')
    ?? screen.getByTestId('preview-runtime-frame-current')) as HTMLIFrameElement;
}

async function promoteStandby(): Promise<HTMLIFrameElement> {
  const frame = await waitFor(standbyFrame);
  settleFileViewerPreviewRuntimeStandby(frame);
  await waitFor(() => expect(currentFrame()).toBe(frame));
  return frame;
}

beforeEach(() => {
  installFileViewerPreviewRuntimeHarness();
  setFileViewerPreviewRuntimeAutoSettle(false);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    '<html><body><section class="slide">same-content</section></body></html>',
    { status: 200 },
  )));
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer real-URL Reload regression (#4650)', () => {
  it('keeps the current document visible while a reload candidate settles', async () => {
    render(<FileViewer projectId="project-1" projectKind="prototype" file={htmlFile()} isDeck />);
    const current = await promoteStandby();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Preview' }));
    const candidate = await waitFor(standbyFrame);

    expect(candidate).not.toBe(current);
    expect(current.isConnected).toBe(true);
    expect(current.getAttribute('data-od-active')).toBe('true');
    expect(candidate.getAttribute('data-od-active')).toBe('false');
    expect(candidate.getAttribute('srcdoc')).toBeNull();
  });

  it('replaces a byte-equal document only after the new Runtime is ready', async () => {
    render(<FileViewer projectId="project-1" projectKind="prototype" file={htmlFile()} isDeck />);
    const first = await promoteStandby();
    const firstUrl = new URL(first.src);

    fireEvent.click(screen.getByRole('button', { name: 'Reload Preview' }));
    const candidate = await waitFor(standbyFrame);
    expect(currentFrame()).toBe(first);

    settleFileViewerPreviewRuntimeStandby(candidate);
    await waitFor(() => expect(currentFrame()).toBe(candidate));
    const secondUrl = new URL(candidate.src);

    expect(secondUrl.origin + secondUrl.pathname).toBe(firstUrl.origin + firstUrl.pathname);
    expect(secondUrl.searchParams.get('odPreviewAttempt'))
      .not.toBe(firstUrl.searchParams.get('odPreviewAttempt'));
  });
});
