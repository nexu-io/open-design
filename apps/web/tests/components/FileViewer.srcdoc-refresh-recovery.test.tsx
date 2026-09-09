// @vitest-environment jsdom
// File-watch recovery coverage for the converged real-URL Preview Runtime.
// A refreshed file stages a versioned candidate while the previous document
// remains current. If the candidate exhausts its settle budget, the viewer
// stops exposing stale output and offers an explicit retry.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  setFileViewerPreviewRuntimeAutoSettle,
  settleFileViewerPreviewRuntimeStandby,
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
      const fixture = syntheticPreviewFileSource(projectId, name);
      return fixture === undefined
        ? actual.fetchProjectFileText(projectId, name, options)
        : Promise.resolve(fixture);
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

function htmlFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'deepflow-landing.html',
    path: 'deepflow-landing.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'DeepFlow',
      entry: 'deepflow-landing.html',
      renderer: 'html',
      exports: ['html'],
    },
    ...overrides,
  };
}

function source(label: string): string {
  return `<!doctype html><html><body><main>${label}</main></body></html>`;
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
  vi.stubGlobal('fetch', vi.fn(async () => new Response(source('fixture'), { status: 200 })));
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer real-URL file-watch recovery', () => {
  it('offers retry instead of exposing stale output when a refreshed revision times out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={source('version-one')}
      />,
    );
    const current = await promoteStandby();

    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000001, size: 1025 })}
        filesRefreshKey={1}
        liveHtml={source('version-two')}
      />,
    );
    const candidate = await waitFor(standbyFrame);
    expect(candidate).not.toBe(current);
    expect(currentFrame()).toBe(current);
    expect(current.getAttribute('data-od-active')).toBe('true');

    act(() => vi.advanceTimersByTime(5_000));
    await waitFor(() => expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull());
    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    expect(screen.getByTestId('preview-runtime-navigation-error')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('preview-runtime-navigation-retry').click();
    });
    const retry = await waitFor(standbyFrame);
    expect(retry).not.toBe(current);
    settleFileViewerPreviewRuntimeStandby(retry);
    await waitFor(() => expect(currentFrame()).toBe(retry));
    expect(screen.queryByTestId('preview-runtime-navigation-error')).toBeNull();
  });

  it('fences a superseded file revision from the current document', async () => {
    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        liveHtml={source('version-one')}
      />,
    );
    const current = await promoteStandby();

    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000001 })}
        liveHtml={source('version-two')}
      />,
    );
    const staleCandidate = await waitFor(standbyFrame);
    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000002 })}
        liveHtml={source('version-three')}
      />,
    );
    const latestCandidate = await waitFor(() => {
      const frame = standbyFrame();
      expect(frame).not.toBe(staleCandidate);
      return frame;
    });

    expect(staleCandidate.isConnected).toBe(false);
    settleFileViewerPreviewRuntimeStandby(staleCandidate);
    expect(currentFrame()).toBe(current);

    settleFileViewerPreviewRuntimeStandby(latestCandidate);
    await waitFor(() => expect(currentFrame()).toBe(latestCandidate));
    expect(latestCandidate.dataset.odDocumentVersion).not.toBe(
      staleCandidate.dataset.odDocumentVersion,
    );
  });

  it('does not promote Runtime readiness for the wrong document version', async () => {
    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        liveHtml={source('version-one')}
      />,
    );
    const current = await promoteStandby();
    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000001 })}
        liveHtml={source('version-two')}
      />,
    );
    const candidate = await waitFor(standbyFrame);

    act(() => {
      for (const type of ['od:preview:hello', 'od:preview:ready']) {
        window.dispatchEvent(new MessageEvent('message', {
          source: candidate.contentWindow,
          data: {
            type,
            protocolVersion: '1',
            sessionId: candidate.dataset.odSessionId,
            documentVersion: 'stale-document-version',
            availableCapabilities: [],
          },
        }));
      }
    });
    expect(currentFrame()).toBe(current);
    expect(candidate.getAttribute('data-od-active')).toBe('false');

    settleFileViewerPreviewRuntimeStandby(candidate);
    await waitFor(() => expect(currentFrame()).toBe(candidate));
  });
});
