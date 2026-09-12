// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { DesignFilesBuildingState } from '../../src/components/design-files/DesignFilesBuildingState';
import type { ProjectFile } from '../../src/types';
import type { RunProgressStep } from '../../src/runtime/run-progress';

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'index.html',
    size: 1200,
    mtime: 1_756_000_000_123,
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  } as ProjectFile;
}

function step(overrides: Partial<RunProgressStep> = {}): RunProgressStep {
  return {
    id: '1',
    category: 'edit',
    toolName: 'Edit',
    target: 'index.html',
    anchor: 'Studio Nine',
    ...overrides,
  };
}

function renderState(props: Partial<Parameters<typeof DesignFilesBuildingState>[0]> = {}) {
  return render(
    <I18nProvider initial="zh-CN">
      <DesignFilesBuildingState
        projectId="p1"
        file={file()}
        filesRefreshKey={7}
        steps={[step()]}
        workspaceContext={null}
        {...props}
      />
    </I18nProvider>,
  );
}

/** What the frame's bridge broadcasts after a load: the page's own parts. */
function sectionsMessage(sections: Array<{ key: string; label: string }>) {
  return { type: 'od:preview-build-focus-sections', version: 1, sections };
}

function rectMessage(requestId: string) {
  return {
    type: 'od:preview-build-focus-rect',
    version: 1,
    requestId,
    found: true,
    x: 40,
    y: 120,
    width: 300,
    height: 90,
    viewportWidth: 900,
    viewportHeight: 600,
  };
}

/** Every request the host posts into the frame, newest last. */
function watchFrame(): { posted: Array<Record<string, unknown>>; frame: HTMLIFrameElement } {
  const frame = document.querySelector('iframe');
  if (!frame) throw new Error('no preview frame');
  const posted: Array<Record<string, unknown>> = [];
  const target = frame.contentWindow;
  if (!target) throw new Error('no frame window');
  vi.spyOn(target, 'postMessage').mockImplementation(((message: unknown) => {
    posted.push(message as Record<string, unknown>);
  }) as typeof target.postMessage);
  return { posted, frame };
}

function send(frame: HTMLIFrameElement, data: unknown) {
  act(() => {
    fireEvent(window, new MessageEvent('message', { data, source: frame.contentWindow }));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('DesignFilesBuildingState', () => {
  it('previews the real file, busting on BOTH the mtime and the refresh key', () => {
    const { container } = renderState();
    const frame = container.querySelector('iframe');
    const src = frame?.getAttribute('src') ?? '';

    expect(src).toContain('/api/projects/p1/raw/index.html');
    expect(src).toContain('v=1756000000123');
    // An agent can rewrite one file twice inside a single mtime tick; without
    // the refresh key the second write would show the first write's bytes.
    expect(src).toContain('fr=7');
    expect(src).toContain('odPreviewBridge=buildfocus');
  });

  it('asks for its own bridge and nothing else', () => {
    const { container } = renderState();
    const src = container.querySelector('iframe')?.getAttribute('src') ?? '';
    // `observability` in particular would post generated-page errors into the
    // host's global preview error buffer and mis-attribute them to this pane.
    expect(src).not.toContain('observability');
    expect(src).not.toContain('odPreviewBridge=scroll');
  });

  it('sandboxes the page and keeps it out of the pointer path', () => {
    const { container } = renderState();
    const frame = container.querySelector('iframe');
    // No `allow-same-origin`: generated markup, and the host needs only
    // postMessage from it.
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts');
    // The class carries `pointer-events: none` (see the module CSS): an iframe
    // that takes pointer events swallows the pane's drag-to-upload target.
    expect(frame?.getAttribute('class')).toBeTruthy();
  });

  it('keeps loading until there is rendered content, then shows the page without an activity bubble', () => {
    renderState();
    const { frame } = watchFrame();
    send(frame, sectionsMessage([]));
    expect(frame.style.opacity).toBe('0');
    send(frame, sectionsMessage([{ key: 'a', label: 'Hero' }]));
    expect(frame.style.opacity).toBe('1');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('build-focus-outline')).toBeNull();
  });

  it('does not tour sections and preserves the plan title and anchor', () => {
    vi.useFakeTimers();
    renderState({ steps: [step({ title: 'Build hero', location: { file: 'index.html', anchor: 'Studio Nine' } })] });
    const { posted, frame } = watchFrame();
    send(frame, sectionsMessage([{ key: 'a', label: 'Hero' }, { key: 'b', label: 'Footer' }]));
    const request = posted.at(-1)!;
    expect(request.anchor).toBe('Studio Nine');
    expect(request.title).toBe('Build hero');
    const count = posted.length;
    act(() => vi.advanceTimersByTime(5000));
    expect(posted).toHaveLength(count);
    send(frame, { ...rectMessage(request.requestId as string), label: 'Hero' });
    expect(screen.getByTestId('build-focus-outline')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    const outlineStyle = screen.getByTestId('build-focus-outline').getAttribute('style');
    send(frame, { ...rectMessage('stale'), label: 'Footer', y: 500 });
    expect(screen.getByTestId('build-focus-outline').getAttribute('style')).toBe(outlineStyle);
  });

  it('keeps the prior frame through empty refreshes and swaps only when ready', () => {
    const { rerender } = renderState();
    const { frame } = watchFrame();
    send(frame, sectionsMessage([{ key: 'a', label: 'Hero' }]));
    rerender(<I18nProvider initial="zh-CN"><DesignFilesBuildingState projectId="p1" file={file()}
      filesRefreshKey={8} steps={[step()]} workspaceContext={null} /></I18nProvider>);
    const next = [...document.querySelectorAll('iframe')].find((item) => item !== frame)!;
    expect(frame.style.opacity).toBe('1');
    expect(next.style.opacity).toBe('0');
    send(next, sectionsMessage([]));
    expect(frame.isConnected).toBe(true);
    send(next, sectionsMessage([{ key: 'a', label: 'Updated hero' }]));
    expect(frame.isConnected).toBe(false);
    expect(next.style.opacity).toBe('1');
  });

  it('retains the last frame on failure and removes the activity outline', () => {
    const { rerender } = renderState();
    const { frame } = watchFrame();
    send(frame, sectionsMessage([{ key: 'a', label: 'Hero' }]));
    rerender(<I18nProvider initial="zh-CN"><DesignFilesBuildingState projectId="p1" file={file()}
      filesRefreshKey={7} steps={[step()]} workspaceContext={null} failure="failed" /></I18nProvider>);
    expect(frame.isConnected).toBe(true);
    expect(frame.style.opacity).toBe('1');
    expect(screen.queryByTestId('build-focus-outline')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('失败');
  });
});
