// @vitest-environment jsdom
import { createPortal } from 'react-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceEditLayout, useWorkspaceEditDock } from '../../src/components/workspace/WorkspaceEditLayout';

function Inspector({ id = 'a', visible = true }: { id?: string; visible?: boolean }) {
  const dock = useWorkspaceEditDock(id, visible);
  return dock?.target && visible ? createPortal(<span>Inspector {id}</span>, dock.target) : null;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('project edit sidebar layout', () => {
  it('retains the requested width across closing and reopening without remounting the preview', () => {
    const content = (visible: boolean) => <WorkspaceEditLayout>
      <iframe title="Preview" /><Inspector visible={visible} />
    </WorkspaceEditLayout>;
    const view = render(content(true));
    const frame = screen.getByTitle('Preview');
    const separator = screen.getByRole('separator', { name: 'Resize edit panel' });
    expect(separator).toHaveAttribute('aria-valuenow', '320');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator).toHaveAttribute('aria-valuenow', '330');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    view.rerender(content(false));
    expect(screen.queryByRole('separator')).toBeNull();
    view.rerender(content(true));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '480');
    expect(screen.getByTitle('Preview')).toBe(frame);
  });

  it('clamps to the available space and restores the preference when the window grows', () => {
    let containerWidth = 800;
    let measure: (() => void) | undefined;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => containerWidth);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { measure = callback; }
      observe() {} disconnect() {}
    });
    render(<WorkspaceEditLayout><Inspector /></WorkspaceEditLayout>);
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    containerWidth = 500;
    act(() => measure?.());
    expect(separator).toHaveAttribute('aria-valuenow', '296');
    containerWidth = 800;
    act(() => measure?.());
    expect(separator).toHaveAttribute('aria-valuenow', '480');
  });

  it('resizes from pointer movement and restores the width when dragging is canceled', () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    render(<WorkspaceEditLayout><Inspector /></WorkspaceEditLayout>);
    const separator = screen.getByRole('separator');
    separator.setPointerCapture = vi.fn();
    fireEvent.pointerDown(separator, { button: 0, clientX: 600 });
    fireEvent.pointerMove(window, { clientX: 520 });
    fireEvent.pointerUp(window);
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    fireEvent.pointerDown(separator, { button: 0, clientX: 600 });
    fireEvent.pointerMove(window, { clientX: 540 });
    fireEvent.pointerCancel(window);
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(separator).toHaveAttribute('aria-valuenow', '400');
  });

  it('does not let an old viewer cleanup hide the new active inspector', () => {
    const content = (oldVisible: boolean) => <WorkspaceEditLayout>
      {oldVisible && <Inspector key="a" id="a" />}
      <Inspector key="b" id="b" />
    </WorkspaceEditLayout>;
    const view = render(content(true));
    view.rerender(content(false));
    expect(screen.getByRole('separator')).toBeVisible();
    expect(screen.getByText('Inspector b')).toBeVisible();
    view.unmount();
    expect(screen.queryByText('Inspector b')).toBeNull();
  });
});
