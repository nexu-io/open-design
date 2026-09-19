// @vitest-environment jsdom
// Reload and mode-switch race coverage for the converged real-URL Runtime.
// There is no srcDoc recovery lane: the current document stays visible while
// an exact replacement is pending, then an exhausted replacement becomes an
// explicit retry state instead of silently leaving stale output interactive.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
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

function htmlFile(name = 'preview.html', overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 256,
    mtime: 1,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: name,
      entry: name,
      renderer: 'html',
      exports: ['html'],
    },
    ...overrides,
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
    '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>',
    { status: 200 },
  )));
});

afterEach(() => {
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer real-URL reload race conditions', () => {
  it('offers retry when a reload Runtime handshake times out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<FileViewer projectId="project-1" projectKind="prototype" file={htmlFile()} />);
    const current = await promoteStandby();

    fireEvent.click(screen.getByRole('button', { name: 'Reload Preview' }));
    const candidate = await waitFor(standbyFrame);
    expect(candidate).not.toBe(current);

    act(() => vi.advanceTimersByTime(5_000));
    await waitFor(() => expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull());
    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    expect(screen.getByTestId('preview-runtime-navigation-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('preview-runtime-navigation-retry'));
    const retry = await waitFor(standbyFrame);
    expect(retry).not.toBe(current);
    settleFileViewerPreviewRuntimeStandby(retry);
    await waitFor(() => expect(currentFrame()).toBe(retry));
    expect(screen.queryByTestId('preview-runtime-navigation-error')).toBeNull();
  });

  it('settles only the latest candidate when Reload is clicked twice', async () => {
    render(<FileViewer projectId="project-1" projectKind="prototype" file={htmlFile()} />);
    const current = await promoteStandby();

    const reload = screen.getByRole('button', { name: 'Reload Preview' });
    fireEvent.click(reload);
    const firstCandidate = await waitFor(standbyFrame);
    fireEvent.click(reload);
    const secondCandidate = await waitFor(() => {
      const frame = standbyFrame();
      expect(frame).not.toBe(firstCandidate);
      return frame;
    });

    expect(currentFrame()).toBe(current);
    expect(firstCandidate.isConnected).toBe(false);
    settleFileViewerPreviewRuntimeStandby(secondCandidate);
    await waitFor(() => expect(currentFrame()).toBe(secondCandidate));
  });

  it('cannot promote a reload candidate after the user switches files', async () => {
    const view = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlFile('a.html')} />,
    );
    await promoteStandby();
    fireEvent.click(screen.getByRole('button', { name: 'Reload Preview' }));
    const staleCandidate = await waitFor(standbyFrame);

    view.rerender(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlFile('b.html')} />,
    );
    const fileBCandidate = await waitFor(() => {
      const frame = standbyFrame();
      expect(frame).not.toBe(staleCandidate);
      expect(frame.title).toBe('b.html');
      return frame;
    });

    settleFileViewerPreviewRuntimeStandby(staleCandidate);
    expect(screen.queryByTestId('artifact-preview-frame')).toBeNull();
    settleFileViewerPreviewRuntimeStandby(fileBCandidate);
    await waitFor(() => expect(currentFrame()).toBe(fileBCandidate));
    expect(currentFrame().title).toBe('b.html');
  });

  it('keeps a multi-file Babel prototype on the powered real-URL transport', async () => {
    const source = '<!doctype html><script src="https://cdn.example.test/babel.js"></script>'
      + '<script type="text/babel" src="./app.jsx"></script>';
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile('index.html')}
        liveHtml={source}
      />,
    );

    const frame = await promoteStandby();
    expect(frame.getAttribute('data-od-render-mode')).toBe('runtime-url');
    expect(frame.getAttribute('data-od-powered')).toBe('true');
    expect(new URL(frame.src).hostname).toMatch(/^p-fixture-scope-/);
    expect(frame.getAttribute('srcdoc')).toBeNull();
  });

  it('enables and disables Manual Edit without navigating the document', async () => {
    const source = '<!doctype html><html><body><main data-od-id="hero">Hero</main></body></html>';
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        liveHtml={source}
      />,
    );
    const frame = await promoteStandby();
    const runtimeUrl = frame.src;

    fireEvent.click(await screen.findByTestId('manual-edit-mode-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('true');
    });
    expect(currentFrame()).toBe(frame);
    expect(frame.src).toBe(runtimeUrl);

    fireEvent.click(screen.getByTestId('manual-edit-mode-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('manual-edit-mode-toggle').getAttribute('aria-pressed')).toBe('false');
    });
    expect(currentFrame()).toBe(frame);
    expect(frame.src).toBe(runtimeUrl);
  });

  it('enables Draw without replacing the retained Runtime', async () => {
    render(<FileViewer projectId="project-1" projectKind="prototype" file={htmlFile()} />);
    const frame = await promoteStandby();
    const runtimeUrl = frame.src;

    fireEvent.click(await screen.findByTestId('draw-overlay-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('draw-overlay-toggle').getAttribute('aria-pressed')).toBe('true');
    });
    expect(currentFrame()).toBe(frame);
    expect(frame.src).toBe(runtimeUrl);
  });
});
