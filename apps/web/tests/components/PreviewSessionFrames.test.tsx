// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_RUNTIME_PROTOCOL_VERSION,
  type PreviewRuntimeCapability,
} from '@open-design/contracts/runtime/preview-runtime';
import {
  IframeKeepAliveProvider,
} from '../../src/components/IframeKeepAlivePool';
import {
  PREVIEW_SESSION_STANDBY_TIMEOUT_MS,
  PreviewSessionFrames,
  previewSessionNavigationAttemptUrl,
  type PreviewSessionFramesProps,
  type PreviewSessionNavigation,
} from '../../src/components/PreviewSessionFrames';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function navigation(
  version: string,
  sandboxProfile: PreviewSessionNavigation['sandboxProfile'] = 'normal',
): PreviewSessionNavigation {
  return {
    sessionId: 'scope-0001',
    documentVersion: version,
    url: `http://${sandboxProfile === 'powered' ? 'p' : 'n'}-scope-0001.localhost:17456/index.html?v=${version}`,
    runtimeProtocol: 'universal',
    sandboxProfile,
    deck: false,
  };
}

function signal(
  frame: HTMLIFrameElement,
  document: PreviewSessionNavigation,
  type: 'od:preview:hello' | 'od:preview:capabilities-applied' | 'od:preview:navigation-failed' | 'od:preview:presentation-state-applied' | 'od:preview:ready',
  enabledCapabilities: readonly PreviewRuntimeCapability[] = [],
  revision = 1,
  navigationAttempt = 0,
) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type,
        protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
        sessionId: document.sessionId,
        documentVersion: document.documentVersion,
        ...(type === 'od:preview:hello' ? { availableCapabilities: ['scroll', 'edit'] } : {}),
        ...(type === 'od:preview:capabilities-applied' ? { enabledCapabilities } : {}),
        ...(type === 'od:preview:navigation-failed'
          ? { reason: 'version_changed', navigationAttempt }
          : {}),
        ...(type === 'od:preview:presentation-state-applied' ? { revision } : {}),
      },
    }));
  });
}

function settle(frame: HTMLIFrameElement, document: PreviewSessionNavigation) {
  signal(frame, document, 'od:preview:hello');
  signal(frame, document, 'od:preview:capabilities-applied');
  signal(frame, document, 'od:preview:ready');
  signal(frame, document, 'od:preview:presentation-state-applied');
}

function installAtomicMoveBefore(): () => void {
  const prototype = Element.prototype as Element & {
    moveBefore?: (node: Node, child: Node | null) => void;
  };
  const original = prototype.moveBefore;
  Object.defineProperty(Element.prototype, 'moveBefore', {
    configurable: true,
    value(this: Element, node: Node, child: Node | null) {
      this.insertBefore(node, child);
    },
    writable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(Element.prototype, 'moveBefore', {
        configurable: true,
        value: original,
        writable: true,
      });
    } else {
      Reflect.deleteProperty(Element.prototype, 'moveBefore');
    }
  };
}

function disableAtomicMoveBefore(): () => void {
  const prototype = Element.prototype as Element & {
    moveBefore?: (node: Node, child: Node | null) => void;
  };
  const original = prototype.moveBefore;
  Reflect.deleteProperty(Element.prototype, 'moveBefore');
  return () => {
    if (!original) return;
    Object.defineProperty(Element.prototype, 'moveBefore', {
      configurable: true,
      value: original,
      writable: true,
    });
  };
}

function legacyNavigation(): PreviewSessionNavigation {
  return {
    ...navigation('legacy-v1'),
    runtimeProtocol: 'legacy-url',
    url: 'http://localhost/api/projects/project-1/preview/legacy-scope/index.html',
  };
}

function LegacyRetentionHarness({
  shown,
  navigation: legacy,
  onPromoted,
}: {
  shown: boolean;
  navigation: PreviewSessionNavigation;
  onPromoted?: PreviewSessionFramesProps['onPromoted'];
}) {
  return (
    <IframeKeepAliveProvider>
      {shown ? (
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={legacy}
          active
          onPromoted={onPromoted}
        />
      ) : null}
    </IframeKeepAliveProvider>
  );
}

describe('PreviewSessionFrames', () => {
  it('keeps standby inert until exact runtime and presentation readiness, then promotes it', () => {
    const first = navigation('v1');
    const onCurrentFrameChange = vi.fn();
    render(
      <IframeKeepAliveProvider>
        <div className="artifact-preview-transport-stack">
          <PreviewSessionFrames
            projectId="project-1"
            fileName="index.html"
            navigation={first}
            active
            onCurrentFrameChange={onCurrentFrameChange}
          />
        </div>
      </IframeKeepAliveProvider>,
    );

    const standby = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(standby.dataset.odActive).toBe('false');
    expect(standby.dataset.odStandby).toBe('true');
    expect(standby).toHaveAttribute('aria-hidden', 'true');
    expect(standby).toHaveAttribute('tabindex', '-1');
    signal(standby, first, 'od:preview:hello');
    signal(standby, first, 'od:preview:ready');
    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();

    signal(standby, first, 'od:preview:capabilities-applied');
    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    signal(standby, first, 'od:preview:presentation-state-applied');
    const current = screen.getByTestId('preview-runtime-frame-current');
    expect(current).toBe(standby);
    expect(current).toHaveAttribute('data-od-active', 'true');
    expect(current).not.toHaveAttribute('data-od-standby');
    expect(onCurrentFrameChange.mock.calls.filter(([frame]) => frame === standby)).toHaveLength(1);
  });

  it('retains same-file last-good until a replacement settles and then evicts the old version', () => {
    const first = navigation('v1');
    const second = navigation('v2');
    const view = (next: PreviewSessionNavigation) => (
      <IframeKeepAliveProvider>
        <div className="artifact-preview-transport-stack">
          <PreviewSessionFrames
            projectId="project-1"
            fileName="index.html"
            navigation={next}
            active
          />
        </div>
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(first));
    const firstFrame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(firstFrame, first);

    rerender(view(second));
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(firstFrame);
    const secondFrame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(secondFrame).not.toBe(firstFrame);
    expect(firstFrame.dataset.odActive).toBe('true');

    settle(secondFrame, second);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(secondFrame);
    expect(document.body.contains(firstFrame)).toBe(false);
  });

  it('keeps iframe privileges bound to each document during a profile replacement', () => {
    const normal = navigation('v1');
    const powered = navigation('v2', 'powered');
    const view = (next: PreviewSessionNavigation) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={next}
          active
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(normal));
    const normalFrame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(normalFrame, normal);

    rerender(view(powered));
    const retained = screen.getByTestId('preview-runtime-frame-current') as HTMLIFrameElement;
    const replacement = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(retained).toBe(normalFrame);
    expect(retained.getAttribute('sandbox') ?? '').not.toContain('allow-same-origin');
    expect(retained).not.toHaveAttribute('data-od-powered');
    expect(replacement.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(replacement.getAttribute('allow')).toContain('cross-origin-isolated');
    expect(replacement).toHaveAttribute('data-od-powered', 'true');

    settle(replacement, powered);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(replacement);
    expect(replacement.getAttribute('sandbox')).toContain('allow-same-origin');
  });

  it('suspends and resumes by visibility without changing the retained URL', () => {
    const first = navigation('v1');
    const view = (active: boolean) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          active={active}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(true));
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(frame, first);
    const url = frame.getAttribute('src');

    rerender(view(false));
    expect(frame).toHaveAttribute('data-od-active', 'false');
    expect(frame.getAttribute('src')).toBe(url);
    rerender(view(true));
    expect(frame).toHaveAttribute('data-od-active', 'true');
    expect(frame.getAttribute('src')).toBe(url);
  });

  it('replaces only an unpromoted standby when its navigation retry token changes', () => {
    const first = navigation('v1');
    const onStandbyFrameChange = vi.fn();
    const view = (navigationRetryToken: number) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          navigationRetryToken={navigationRetryToken}
          active
          onStandbyFrameChange={onStandbyFrameChange}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(0));
    const failed = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const failedUrl = new URL(failed.src);
    expect(failedUrl.searchParams.get('odPreviewAttempt')).toBe('scope-0001.0');

    rerender(view(1));

    const retry = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(retry).not.toBe(failed);
    const retryUrl = new URL(retry.src);
    expect(retryUrl.searchParams.get('odPreviewAttempt')).toBe('scope-0001.1');
    failedUrl.searchParams.delete('odPreviewAttempt');
    retryUrl.searchParams.delete('odPreviewAttempt');
    expect(retryUrl.href).toBe(failedUrl.href);
    expect(onStandbyFrameChange).toHaveBeenCalledWith(null);
    expect(onStandbyFrameChange).toHaveBeenLastCalledWith(retry);

    settle(retry, first);
    rerender(view(2));
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(retry);
    expect(new URL(retry.src).searchParams.get('odPreviewAttempt')).toBe('scope-0001.1');
  });

  it('reloads a promoted same-version document behind the retained last-good frame', () => {
    const first = navigation('v1');
    const view = (navigationRetryToken: number) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          navigationRetryToken={navigationRetryToken}
          active
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(0));
    const retained = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(retained, first);
    const url = retained.getAttribute('src');

    rerender(view(1));

    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(retained);
    const replacement = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(replacement).not.toBe(retained);
    expect(new URL(url!).searchParams.get('odPreviewAttempt')).toBe('scope-0001.0');
    expect(new URL(replacement.src).searchParams.get('odPreviewAttempt')).toBe('scope-0001.1');

    settle(replacement, first);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(replacement);
    expect(retained).toHaveAttribute('data-od-active', 'false');
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
  });

  it('ends an unsettled initial attempt and allows an explicit same-URL retry', () => {
    vi.useFakeTimers();
    const first = navigation('v1');
    const onStandbyTimedOut = vi.fn();
    const view = (navigationRetryToken: number) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          navigationRetryToken={navigationRetryToken}
          active
          onStandbyTimedOut={onStandbyTimedOut}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(0));
    const failed = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const url = failed.getAttribute('src');

    act(() => {
      vi.advanceTimersByTime(PREVIEW_SESSION_STANDBY_TIMEOUT_MS);
    });

    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
    expect(onStandbyTimedOut).toHaveBeenCalledWith(first, null);
    expect(document.body.contains(failed)).toBe(false);

    rerender(view(1));
    const retry = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(retry).not.toBe(failed);
    expect(new URL(url!).searchParams.get('odPreviewAttempt')).toBe('scope-0001.0');
    expect(new URL(retry.src).searchParams.get('odPreviewAttempt')).toBe('scope-0001.1');

    settle(retry, first);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(retry);
  });

  it('ends an exact version-changed attempt immediately and ignores duplicate or old attempts', () => {
    const first = navigation('v1');
    const onStandbyVersionChanged = vi.fn();
    const view = (navigationRetryToken: number) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          navigationRetryToken={navigationRetryToken}
          active
          onStandbyVersionChanged={onStandbyVersionChanged}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(0));
    const failed = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;

    signal(failed, first, 'od:preview:navigation-failed', [], 1, 0);

    expect(onStandbyVersionChanged).toHaveBeenCalledTimes(1);
    expect(onStandbyVersionChanged).toHaveBeenCalledWith(first, null, 0);
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
    expect(document.body.contains(failed)).toBe(false);

    signal(failed, first, 'od:preview:navigation-failed', [], 1, 0);
    expect(onStandbyVersionChanged).toHaveBeenCalledTimes(1);

    rerender(view(1));
    const retry = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    signal(retry, first, 'od:preview:navigation-failed', [], 1, 0);
    expect(onStandbyVersionChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('preview-runtime-frame-standby')).toBe(retry);

    signal(retry, first, 'od:preview:navigation-failed', [], 1, 1);
    expect(onStandbyVersionChanged).toHaveBeenCalledTimes(2);
    expect(onStandbyVersionChanged).toHaveBeenLastCalledWith(first, null, 1);
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
  });

  it('drops a timed-out replacement without disturbing the last-good frame', () => {
    vi.useFakeTimers();
    const first = navigation('v1');
    const second = navigation('v2');
    const onStandbyTimedOut = vi.fn();
    const view = (next: PreviewSessionNavigation) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={next}
          active
          onStandbyTimedOut={onStandbyTimedOut}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(first));
    const current = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(current, first);

    rerender(view(second));
    const failed = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(current);

    act(() => {
      vi.advanceTimersByTime(PREVIEW_SESSION_STANDBY_TIMEOUT_MS);
    });

    expect(onStandbyTimedOut).toHaveBeenCalledWith(second, first);
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(current);
    expect(document.body.contains(failed)).toBe(false);
  });

  it('does not spend the navigation timeout while the preview is suspended', () => {
    vi.useFakeTimers();
    const first = navigation('v1');
    const onStandbyTimedOut = vi.fn();
    const view = (active: boolean) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          active={active}
          onStandbyTimedOut={onStandbyTimedOut}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(false));
    const standby = screen.getByTestId('preview-runtime-frame-standby');

    act(() => {
      vi.advanceTimersByTime(PREVIEW_SESSION_STANDBY_TIMEOUT_MS * 2);
    });
    expect(onStandbyTimedOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview-runtime-frame-standby')).toBe(standby);

    rerender(view(true));
    act(() => {
      vi.advanceTimersByTime(PREVIEW_SESSION_STANDBY_TIMEOUT_MS);
    });
    expect(onStandbyTimedOut).toHaveBeenCalledWith(first, null);
  });

  it('reattaches the same pooled browsing context and stages it for handshaking again', () => {
    const first = navigation('v1');
    function Harness({ shown }: { shown: boolean }) {
      return (
        <IframeKeepAliveProvider>
          {shown ? (
            <PreviewSessionFrames
              projectId="project-1"
              fileName="index.html"
              navigation={first}
              active
            />
          ) : null}
        </IframeKeepAliveProvider>
      );
    }
    const { rerender } = render(<Harness shown />);
    const firstFrame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(firstFrame, first);

    rerender(<Harness shown={false} />);
    rerender(<Harness shown />);

    const reattached = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(reattached).toBe(firstFrame);
    settle(reattached, first);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(firstFrame);
  });

  it('suspends the previous file session and reuses its exact frame when switching back', () => {
    const first = navigation('v1');
    const second = {
      ...navigation('v1'),
      sessionId: 'scope-0002',
      url: 'http://n-scope-0002.localhost:17456/index.html?v=v1',
    };
    const view = (projectId: string, fileName: string, next: PreviewSessionNavigation) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId={projectId}
          fileName={fileName}
          navigation={next}
          active
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view('project-1', 'index.html', first));
    const oldFrame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    settle(oldFrame, first);

    rerender(view('project-2', 'other.html', second));

    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    const standby = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(standby).not.toBe(oldFrame);
    expect(standby).toHaveAttribute(
      'src',
      previewSessionNavigationAttemptUrl(second, 0),
    );
    settle(standby, second);

    rerender(view('project-1', 'index.html', first));

    expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
    const restored = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(restored).toBe(oldFrame);
    expect(restored).toHaveAttribute(
      'src',
      previewSessionNavigationAttemptUrl(first, 0),
    );
    settle(restored, first);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(oldFrame);
  });

  it('reports exact capability application for standby and retained current frames', async () => {
    const first = navigation('v1');
    const onCapabilitiesApplied = vi.fn();
    const view = (enabledCapabilities: readonly PreviewRuntimeCapability[]) => (
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={first}
          enabledCapabilities={enabledCapabilities}
          active
          onCapabilitiesApplied={onCapabilitiesApplied}
        />
      </IframeKeepAliveProvider>
    );
    const { rerender } = render(view(['edit']));
    const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    const target = frame.contentWindow!;
    const postMessage = vi.spyOn(target, 'postMessage');

    signal(frame, first, 'od:preview:hello');
    signal(frame, first, 'od:preview:capabilities-applied', ['edit']);
    expect(onCapabilitiesApplied).toHaveBeenLastCalledWith(frame, ['edit']);
    signal(frame, first, 'od:preview:ready');
    signal(frame, first, 'od:preview:presentation-state-applied');

    postMessage.mockClear();
    await act(async () => {
      rerender(view(['scroll']));
      await Promise.resolve();
    });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'od:preview:set-capabilities',
      enabledCapabilities: ['scroll'],
    }), '*');
    signal(frame, first, 'od:preview:capabilities-applied', ['scroll']);
    signal(frame, first, 'od:preview:presentation-state-applied', ['scroll'], 2);
    expect(onCapabilitiesApplied).toHaveBeenLastCalledWith(frame, ['scroll']);
    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
  });

  it('keeps an old-daemon preview on one real URL without mounting a srcdoc runtime', () => {
    const legacy: PreviewSessionNavigation = {
      ...navigation('legacy-v1'),
      runtimeProtocol: 'legacy-url',
      url: 'http://localhost/api/projects/project-1/preview/legacy-scope/index.html',
    };
    const onPromoted = vi.fn();
    render(
      <IframeKeepAliveProvider>
        <PreviewSessionFrames
          projectId="project-1"
          fileName="index.html"
          navigation={legacy}
          enabledCapabilities={['edit']}
          active
          onPromoted={onPromoted}
        />
      </IframeKeepAliveProvider>,
    );

    const standby = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
    expect(standby).toHaveAttribute('src', legacy.url);
    expect(standby).not.toHaveAttribute('srcdoc');
    expect(standby).toHaveAttribute('data-od-capabilities', 'unavailable');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);

    act(() => standby.dispatchEvent(new Event('load')));

    expect(screen.getByTestId('preview-runtime-frame-current')).toBe(standby);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(onPromoted).toHaveBeenCalledWith(legacy, null);
  });

  it('restores an exact settled old-daemon frame without waiting for a second load event', () => {
    const restoreMoveBefore = installAtomicMoveBefore();
    const legacy = legacyNavigation();
    const onPromoted = vi.fn();
    const view = (shown: boolean) => (
      <LegacyRetentionHarness shown={shown} navigation={legacy} onPromoted={onPromoted} />
    );

    try {
      const { rerender } = render(view(true));
      const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
      act(() => frame.dispatchEvent(new Event('load')));
      expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);

      rerender(view(false));
      rerender(view(true));

      expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
      expect(onPromoted).toHaveBeenCalledTimes(2);
    } finally {
      restoreMoveBefore();
    }
  });

  it('keeps an unsettled old-daemon frame on standby after reattachment', () => {
    const restoreMoveBefore = installAtomicMoveBefore();
    const legacy = legacyNavigation();
    const view = (shown: boolean) => (
      <LegacyRetentionHarness shown={shown} navigation={legacy} />
    );

    try {
      const { rerender } = render(view(true));
      const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;

      rerender(view(false));
      rerender(view(true));

      expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
      expect(screen.getByTestId('preview-runtime-frame-standby')).toBe(frame);
      act(() => frame.dispatchEvent(new Event('load')));
      expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
    } finally {
      restoreMoveBefore();
    }
  });

  it('waits for a new load when fallback reattachment cannot preserve the old document', () => {
    const restoreMoveBefore = disableAtomicMoveBefore();
    const legacy = legacyNavigation();
    const view = (shown: boolean) => (
      <LegacyRetentionHarness shown={shown} navigation={legacy} />
    );

    try {
      const { rerender } = render(view(true));
      const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
      act(() => frame.dispatchEvent(new Event('load')));
      expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);

      rerender(view(false));
      rerender(view(true));

      expect(screen.queryByTestId('preview-runtime-frame-current')).toBeNull();
      expect(screen.getByTestId('preview-runtime-frame-standby')).toBe(frame);
      act(() => frame.dispatchEvent(new Event('load')));
      expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
    } finally {
      restoreMoveBefore();
    }
  });

  it('records an old-daemon load that completes while the frame is parked', () => {
    const restoreMoveBefore = installAtomicMoveBefore();
    const legacy = legacyNavigation();
    const view = (shown: boolean) => (
      <LegacyRetentionHarness shown={shown} navigation={legacy} />
    );

    try {
      const { rerender } = render(view(true));
      const frame = screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
      rerender(view(false));

      act(() => frame.dispatchEvent(new Event('load')));
      rerender(view(true));

      expect(screen.getByTestId('preview-runtime-frame-current')).toBe(frame);
    } finally {
      restoreMoveBefore();
    }
  });
});
