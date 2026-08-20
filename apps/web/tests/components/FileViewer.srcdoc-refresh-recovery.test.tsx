// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from '../../src/components/FileViewer';
import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
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

beforeEach(() => {
  setExceptionTrackingContext({
    apiKey: 'phc_preview_test',
    host: 'https://posthog.test',
    distinctId: 'preview-test-user',
  });
});

afterEach(() => {
  cleanup();
  clearExceptionTrackingContext();
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
          bodyComplete: true,
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
          bodyComplete: true,
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

  it('recovers when a settled partial document answers the probe without completing its body', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response('', {
      status: String(input).includes('/i/v0/e/') ? 200 : 404,
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('partial-document')}
      />,
    );

    const partialFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessage = vi.spyOn(partialFrame.contentWindow!, 'postMessage');
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    const probe = postMessage.mock.calls.find(
      ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
    )?.[0] as { generation?: string; probeId?: string } | undefined;
    expect(probe?.probeId).toBeTruthy();

    act(() => {
      // Chromium can leave the head bridge alive after aborting the rest of
      // about:srcdoc. It can answer the challenge, but it has not observed the
      // body-end marker and therefore must remain provisional.
      window.dispatchEvent(new MessageEvent('message', {
        source: partialFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: probe!.generation,
          probeId: probe!.probeId,
          bodyComplete: false,
          documentReadyState: 'complete',
          bodyPresent: true,
          bodyChildCount: 2,
          documentElementChildCount: 2,
        },
      }));
    });

    const recoveredFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(recoveredFrame).not.toBe(partialFrame);
    expect(recoveredFrame.srcdoc).toContain('data-od-lazy-srcdoc-transport');

    const postHogCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/i/v0/e/'));
    expect(postHogCalls).toHaveLength(1);
    const [, postHogInit] = postHogCalls[0]!;
    expect(postHogInit).toBeDefined();
    const payload = JSON.parse(
      String(postHogInit?.body),
    ) as { event?: string; properties?: Record<string, unknown> };
    expect(payload).toMatchObject({
      event: 'client_preview_white_screen',
      properties: {
        reason: 'srcdoc_transport_unverified',
        transport_signal: 'body_incomplete',
        transport_stage: 'head_bridge_alive_body_tail_missing',
        activation_acknowledged: true,
        body_complete: false,
        frame_ready_state: 'complete',
        frame_body_present: true,
        frame_body_child_count: 2,
        frame_document_element_child_count: 2,
        recovery_attempted: true,
        recovery_path: 'lazy_shell_remount',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('partial-document');
  });

  it('does not remount a healthy document while a parser-blocking script is still loading', () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={`<html><body>
          <script>window.previewBootCount = (window.previewBootCount || 0) + 1;</script>
          <script src="https://slow.example/parser-blocking.js"></script>
          <main>Delayed but healthy</main>
        </body></html>`}
      />,
    );

    const parsingFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessage = vi.spyOn(parsingFrame.contentWindow!, 'postMessage');
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    const firstProbe = postMessage.mock.calls.find(
      ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
    )?.[0] as { generation?: string; probeId?: string } | undefined;
    expect(firstProbe?.probeId).toBeTruthy();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: parsingFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: firstProbe!.generation,
          probeId: firstProbe!.probeId,
          bodyComplete: false,
          documentReadyState: 'loading',
        },
      }));
    });
    expect(screen.getByTestId('artifact-preview-frame')).toBe(parsingFrame);

    fireEvent.load(parsingFrame);
    const probes = postMessage.mock.calls.filter(
      ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
    );
    const completionProbe = probes.at(-1)?.[0] as { generation?: string; probeId?: string };
    expect(completionProbe.probeId).not.toBe(firstProbe!.probeId);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: parsingFrame.contentWindow,
        data: {
          type: 'od:srcdoc-transport-activated',
          generation: completionProbe.generation,
          probeId: completionProbe.probeId,
          bodyComplete: true,
          documentReadyState: 'complete',
        },
      }));
      vi.runAllTimers();
    });

    expect(screen.getByTestId('artifact-preview-frame')).toBe(parsingFrame);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/i/v0/e/'))).toBe(false);
  });

  it('recovers when a truncated document stays loading through the parsing grace period', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        filesRefreshKey={0}
        liveHtml={srcDocHtml('stuck-loading-document')}
      />,
    );

    const partialFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    const postMessage = vi.spyOn(partialFrame.contentWindow!, 'postMessage');
    act(() => {
      vi.advanceTimersByTime(1_500);
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const probes = postMessage.mock.calls.filter(
        ([message]) => (message as { type?: unknown }).type === 'od:srcdoc-transport-ready-probe',
      );
      const probe = probes.at(-1)?.[0] as { generation?: string; probeId?: string };
      expect(probe.probeId).toBeTruthy();
      act(() => {
        window.dispatchEvent(new MessageEvent('message', {
          source: partialFrame.contentWindow,
          data: {
            type: 'od:srcdoc-transport-activated',
            generation: probe.generation,
            probeId: probe.probeId,
            bodyComplete: false,
            documentReadyState: 'loading',
          },
        }));
        if (attempt < 7) vi.advanceTimersByTime(1_500);
      });
    }

    const recoveredFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    expect(recoveredFrame).not.toBe(partialFrame);
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
