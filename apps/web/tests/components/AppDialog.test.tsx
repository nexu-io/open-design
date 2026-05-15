// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialogProvider, useAppAlert, useAppConfirm } from '../../src/components/AppDialog';

function DialogHarness({
  onConfirmResult,
}: {
  onConfirmResult?: (value: boolean) => void;
}) {
  const alertDialog = useAppAlert();
  const confirmDialog = useAppConfirm();

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          onConfirmResult?.(
            await confirmDialog({
              title: 'Delete conversation',
              message: 'delete "Untitled conversation"? This removes its messages.',
              confirmLabel: 'Delete',
              danger: true,
            }),
          );
        }}
      >
        Open confirm
      </button>
      <button
        type="button"
        onClick={() =>
          void alertDialog({
            title: 'Open Design',
            message: 'Target file already exists',
          })
        }
      >
        Open alert
      </button>
    </div>
  );
}

describe('AppDialogProvider', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps modal pointer and Escape events from reaching document listeners', async () => {
    const onConfirmResult = vi.fn();
    const onDocumentMouseDown = vi.fn();
    const onDocumentKeyDown = vi.fn();
    document.addEventListener('mousedown', onDocumentMouseDown);
    document.addEventListener('keydown', onDocumentKeyDown);

    try {
      render(
        <AppDialogProvider>
          <DialogHarness onConfirmResult={onConfirmResult} />
        </AppDialogProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open confirm' }));
      const dialog = screen.getByRole('dialog', { name: 'Delete conversation' });
      fireEvent.mouseDown(dialog);
      expect(onDocumentMouseDown).not.toHaveBeenCalled();
      const backdrop = document.querySelector('.app-dialog-backdrop');
      expect(backdrop).toBeTruthy();
      fireEvent.mouseDown(backdrop as Element);
      expect(onDocumentMouseDown).not.toHaveBeenCalled();

      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      expect(onDocumentKeyDown).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(onConfirmResult).toHaveBeenCalledWith(false);
    } finally {
      document.removeEventListener('mousedown', onDocumentMouseDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    }
  });

  it('adds missing punctuation to alert message copy', () => {
    render(
      <AppDialogProvider>
        <DialogHarness />
      </AppDialogProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open alert' }));

    expect(screen.getByRole('alertdialog', { name: 'Open Design' })).toBeTruthy();
    expect(screen.getByText('Target file already exists.')).toBeTruthy();
  });
});
