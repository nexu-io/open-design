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

  it('names the page and the current step, and draws no cursor before the frame answers', () => {
    renderState();
    // The page being built, once — the step log carries the rest.
    expect(screen.getByRole('status').textContent).toBe('index.html');
    expect(screen.getByText('编辑 index.html')).toBeTruthy();
    // Nothing is known about WHERE yet; a cursor at 0,0 would be a lie.
    expect(screen.queryByTestId('build-focus-cursor')).toBeNull();
  });

  it('falls back to "thinking" when the turn has called nothing yet', () => {
    renderState({ steps: [] });
    expect(screen.getByText('思考中')).toBeTruthy();
  });

  // The way out moved to the topbar switch (DesignFilesPanel owns it), so this
  // surface carries no control of its own on top of the page it is rendering.
  it('puts no button on top of the page it renders', () => {
    renderState();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // A whole page landing in one Write is ONE step with one anchor, which used
  // to send the cursor straight to the footer. The frame reports the page's
  // own parts instead, and the cursor rests on each one that just appeared.
  it('walks the parts that just landed, one stop at a time', () => {
    vi.useFakeTimers();
    renderState();
    const { posted, frame } = watchFrame();

    send(frame, sectionsMessage([
      { key: '0|header|Studio Nine', label: 'Studio Nine' },
      { key: '1|section|Selected work', label: 'Selected work' },
    ]));
    expect(posted.at(-1)?.section).toBe('0|header|Studio Nine');

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(posted.at(-1)?.section).toBe('1|section|Selected work');

    // Tour over: back to the step's own anchor, which is the right target for
    // an edit inside a part that already exists.
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(posted.at(-1)?.section).toBeNull();
    expect(posted.at(-1)?.anchor).toBe('Studio Nine');
  });

  it('names the part it is pointing at, not the file', () => {
    renderState();
    const { posted, frame } = watchFrame();

    send(frame, sectionsMessage([{ key: '1|section|Selected work', label: 'Selected work' }]));
    const requestId = posted.at(-1)?.requestId;
    expect(typeof requestId).toBe('string');
    send(frame, rectMessage(requestId as string));

    expect(screen.getByTestId('build-focus-cursor').textContent).toContain('Selected work');
    expect(screen.getByTestId('build-focus-cursor').textContent).not.toContain('index.html');
  });

  // A load that only changed things INSIDE existing parts adds no keys, so
  // there is nothing to tour and the step's anchor keeps the cursor.
  it('does not re-tour parts it has already shown', () => {
    vi.useFakeTimers();
    renderState();
    const { posted, frame } = watchFrame();
    const parts = sectionsMessage([{ key: '0|header|Studio Nine', label: 'Studio Nine' }]);

    send(frame, parts);
    expect(posted.at(-1)?.section).toBe('0|header|Studio Nine');
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const before = posted.length;
    send(frame, parts);
    expect(posted.slice(before).every((message) => message.section === null)).toBe(true);
  });
});
