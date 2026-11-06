// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MODAL_WINDOW_DRAG_STRIP_HEIGHT,
  useModalWindowDragGuard,
} from '../../src/hooks/useModalWindowDragGuard';

function GuardHarness({
  onBackdropClick,
  onBackdropMouseDown,
  onAction,
}: {
  onBackdropClick: () => void;
  onBackdropMouseDown: () => void;
  onAction: () => void;
}) {
  useModalWindowDragGuard();
  return (
    <div
      className="modal-backdrop"
      data-testid="backdrop"
      onClick={onBackdropClick}
      onMouseDown={onBackdropMouseDown}
    >
      <button type="button" onClick={onAction}>
        Modal action
      </button>
    </div>
  );
}

describe('useModalWindowDragGuard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps top backdrop clicks from dismissing while allowing normal backdrop clicks', () => {
    const onBackdropClick = vi.fn();
    const onBackdropMouseDown = vi.fn();
    render(
      <GuardHarness
        onBackdropClick={onBackdropClick}
        onBackdropMouseDown={onBackdropMouseDown}
        onAction={vi.fn()}
      />,
    );

    const backdrop = screen.getByTestId('backdrop');
    fireEvent.mouseDown(backdrop, { clientY: MODAL_WINDOW_DRAG_STRIP_HEIGHT - 1 });
    fireEvent.click(backdrop, { clientY: MODAL_WINDOW_DRAG_STRIP_HEIGHT - 1 });
    expect(onBackdropMouseDown).not.toHaveBeenCalled();
    expect(onBackdropClick).not.toHaveBeenCalled();

    fireEvent.click(backdrop, { clientY: MODAL_WINDOW_DRAG_STRIP_HEIGHT + 8 });
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it('does not block controls inside the top band', () => {
    const onBackdropClick = vi.fn();
    const onAction = vi.fn();
    render(
      <GuardHarness
        onBackdropClick={onBackdropClick}
        onBackdropMouseDown={vi.fn()}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Modal action' }), {
      clientY: MODAL_WINDOW_DRAG_STRIP_HEIGHT - 1,
    });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });
});
