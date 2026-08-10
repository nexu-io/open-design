// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

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

function srcDocHtml(label: string): string {
  // localStorage forces the same sandbox-shim/srcDoc transport used by the
  // artifact in the reported diagnostics bundle.
  return `<html><body><main>${label}</main><script>localStorage.setItem('deepflow', 'monthly')</script></body></html>`;
}

function transportGeneration(frame: HTMLIFrameElement): string {
  const generation = frame.srcdoc.match(
    /data-od-srcdoc-transport-activation>[\s\S]*?var generation = "([^"]+)";/,
  )?.[1];
  if (!generation) throw new Error('srcDoc transport generation missing');
  return generation;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer srcDoc file-watch refresh recovery', () => {
  it('remounts once when a refreshed srcDoc revision never acknowledges activation', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('version-one')}
      />,
    );

    const initialFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(initialFrame.getAttribute('data-od-render-mode')).toBe('srcdoc');

    rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000001, size: 1025 })}
        filesRefreshKey={1}
        liveHtml={srcDocHtml('version-two')}
      />,
    );

    const refreshedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(refreshedFrame).toBe(initialFrame);
    expect(refreshedFrame.srcdoc).toContain('version-two');

    act(() => {
      vi.runAllTimers();
    });

    const recoveredFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(recoveredFrame).not.toBe(refreshedFrame);
    expect(recoveredFrame.srcdoc).toContain('data-od-lazy-srcdoc-transport');

    const postMessage = vi.spyOn(recoveredFrame.contentWindow!, 'postMessage');
    fireEvent.load(recoveredFrame);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'od:srcdoc-transport-activate',
        html: expect.stringContaining('version-two'),
      }),
      '*',
    );
  });

  it('keeps the acknowledged refreshed srcDoc frame mounted', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('version-one')}
      />,
    );

    rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000001, size: 1025 })}
        filesRefreshKey={1}
        liveHtml={srcDocHtml('version-two')}
      />,
    );

    const refreshedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    act(() => {
      fireEvent.load(refreshedFrame);
      window.dispatchEvent(new MessageEvent('message', {
        source: refreshedFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: transportGeneration(refreshedFrame),
        },
      }));
      vi.runAllTimers();
    });

    expect(screen.getByTestId('artifact-preview-frame')).toBe(refreshedFrame);
  });

  it('revalidates an early activation acknowledgement after the frame load completes', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('version-one')}
      />,
    );

    rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile({ mtime: 1710000001, size: 1025 })}
        filesRefreshKey={1}
        liveHtml={srcDocHtml('version-two')}
      />,
    );

    const refreshedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: refreshedFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: transportGeneration(refreshedFrame),
        },
      }));
    });

    fireEvent.load(refreshedFrame);
    act(() => {
      vi.runAllTimers();
    });

    const recoveredFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(recoveredFrame).not.toBe(refreshedFrame);
    expect(recoveredFrame.srcdoc).toContain('data-od-lazy-srcdoc-transport');
  });
});
