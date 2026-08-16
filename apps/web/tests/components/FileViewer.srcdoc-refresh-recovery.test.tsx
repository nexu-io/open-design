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
    const postMessage = vi.spyOn(refreshedFrame.contentWindow!, 'postMessage');
    act(() => {
      // An eager head-script acknowledgement is provisional: Chromium can
      // still abort the about:srcdoc navigation after this message.
      fireEvent.load(refreshedFrame);
      const probe = postMessage.mock.calls.find(
        ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
      )?.[0] as { generation?: string; probeId?: string } | undefined;
      expect(probe?.probeId).toBeTruthy();
      window.dispatchEvent(new MessageEvent('message', {
        source: refreshedFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: transportGeneration(refreshedFrame),
          probeId: probe!.probeId,
        },
      }));
      vi.runAllTimers();
    });

    expect(screen.getByTestId('artifact-preview-frame')).toBe(refreshedFrame);
  });

  it('reuses an in-flight recovery probe when iframe load overlaps the recovery timer', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('overlapping-probes')}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    const firstProbe = postMessage.mock.calls.find(
      ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
    )?.[0] as { generation?: string; probeId?: string } | undefined;
    expect(firstProbe?.probeId).toBeTruthy();

    fireEvent.load(frame);
    const probes = postMessage.mock.calls.filter(
      ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
    );
    expect(probes).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: firstProbe!.generation,
          probeId: firstProbe!.probeId,
        },
      }));
      vi.runAllTimers();
    });

    expect(screen.getByTestId('artifact-preview-frame')).toBe(frame);
  });

  it('recovers when an eager activation acknowledgement is followed by an aborted navigation with no load', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('aborted-after-ack')}
      />,
    );

    const abortedFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    act(() => {
      // This is the incident ordering: the injected head bridge runs, then
      // Electron reports ERR_ABORTED for about:srcdoc and no iframe load event
      // follows to invalidate the eager acknowledgement.
      window.dispatchEvent(new MessageEvent('message', {
        source: abortedFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: transportGeneration(abortedFrame),
        },
      }));
      vi.runAllTimers();
    });

    const recoveredFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(recoveredFrame).not.toBe(abortedFrame);
    expect(recoveredFrame.srcdoc).toContain('data-od-lazy-srcdoc-transport');
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
