// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TabLabel } from '../../src/components/workspace/TabLabel';
import {
  consumeChromeViewModeRequest,
  publishChromeViewMode,
  requestChromeViewMode,
  resetChromeViewMode,
  useChromeViewMode,
  usePendingChromeViewMode,
} from '../../src/components/workspace/chrome-view-mode';

/** The row as the two components see it: 预览 is drawn here, 代码 is portaled
 *  in by the open viewer, and only the current view carries its label. */
function Row() {
  const mode = useChromeViewMode();
  return (
    <div>
      <button type="button" data-testid="preview-tab" title="Preview">
        <TabLabel show={mode !== 'source'}>
          <span>Preview</span>
        </TabLabel>
      </button>
      <button type="button" data-testid="code-tab" title="Code">
        <TabLabel show={mode === 'source'}>
          <span>Code</span>
        </TabLabel>
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  resetChromeViewMode();
});

describe('chrome view mode', () => {
  it('gives the label to whichever view the row is on, never both', () => {
    render(<Row />);

    expect(screen.getByTestId('preview-tab').textContent).toContain('Preview');
    expect(screen.getByTestId('code-tab').textContent?.trim()).toBe('');

    act(() => publishChromeViewMode('source'));
    expect(screen.getByTestId('preview-tab').textContent?.trim()).toBe('');
    expect(screen.getByTestId('code-tab').textContent).toContain('Code');

    act(() => publishChromeViewMode('preview'));
    expect(screen.getByTestId('preview-tab').textContent).toContain('Preview');
    expect(screen.getByTestId('code-tab').textContent?.trim()).toBe('');
  });

  // The viewer that owns the 代码 tab hands the label back when it stops
  // owning it — otherwise leaving a source view would strand the row with
  // neither tab named.
  it('returns to preview when the viewer releases the tab', () => {
    render(<Row />);

    act(() => publishChromeViewMode('source'));
    act(() => resetChromeViewMode());

    expect(screen.getByTestId('preview-tab').textContent).toContain('Preview');
    expect(screen.getByTestId('code-tab').textContent?.trim()).toBe('');
  });
});

/** The viewer half: it owns 代码, publishes what it switched to, and obeys a
 *  request from the row (which is what clicking 预览 sends). */
function Viewer() {
  const pending = usePendingChromeViewMode();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');

  useEffect(() => {
    publishChromeViewMode(mode);
    return () => resetChromeViewMode();
  }, [mode]);

  useEffect(() => {
    if (pending === null) return;
    const requested = consumeChromeViewModeRequest();
    if (requested) setMode(requested);
  }, [pending]);

  return (
    <button type="button" data-testid="viewer-mode" onClick={() => setMode('source')}>
      {mode}
    </button>
  );
}

describe('chrome view mode requests', () => {
  it('pulls the open viewer out of source when the row selects preview', () => {
    render(
      <>
        <Row />
        <Viewer />
      </>,
    );

    // The viewer switches itself to 代码: it publishes, and the row follows.
    act(() => {
      screen.getByTestId('viewer-mode').click();
    });
    expect(screen.getByTestId('viewer-mode').textContent).toBe('source');
    expect(screen.getByTestId('code-tab').textContent).toContain('Code');
    expect(screen.getByTestId('preview-tab').textContent?.trim()).toBe('');

    // Clicking 预览 up in the row is a selection, not a no-op.
    act(() => requestChromeViewMode('preview'));
    expect(screen.getByTestId('viewer-mode').textContent).toBe('preview');
    expect(screen.getByTestId('preview-tab').textContent).toContain('Preview');
    expect(screen.getByTestId('code-tab').textContent?.trim()).toBe('');
  });
});

// Clicking 代码 from 设计文件 does two things at once: it asks for source view
// and it switches panes — so the viewer that has to obey mounts AFTER the ask.
// A request keyed on "did this change since I mounted" is invisible to it, and
// the click landed on 预览 every time.
describe('a request made before its viewer exists', () => {
  it('is answered by the viewer that mounts into it', () => {
    const { rerender } = render(<Row />);

    act(() => requestChromeViewMode('source'));
    // Only now does the pane swap in the viewer that owns 代码.
    rerender(
      <>
        <Row />
        <Viewer />
      </>,
    );

    expect(screen.getByTestId('viewer-mode').textContent).toBe('source');
    expect(screen.getByTestId('code-tab').textContent).toContain('Code');
    expect(screen.getByTestId('preview-tab').textContent?.trim()).toBe('');
  });

  it('is taken once, so a later viewer is not dragged along by a stale ask', () => {
    render(
      <>
        <Row />
        <Viewer />
      </>,
    );

    act(() => requestChromeViewMode('source'));
    expect(screen.getByTestId('viewer-mode').textContent).toBe('source');

    cleanup();
    render(
      <>
        <Row />
        <Viewer />
      </>,
    );
    expect(screen.getByTestId('viewer-mode').textContent).toBe('preview');
  });
});
