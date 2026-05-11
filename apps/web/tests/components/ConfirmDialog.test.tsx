// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../../src/components/ConfirmDialog';

const baseProps = {
  title: 'Delete project',
  message: 'Delete "Test project"?',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
};

describe('ConfirmDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        {...baseProps}
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders title, message, and both action buttons when open', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Delete project')).toBeTruthy();
    expect(screen.getByText('Delete "Test project"?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('invokes onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel when the backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onCancel when the modal body is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('alertdialog'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('invokes onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // The whole point of this component (over native confirm) is that
  // closing the dialog must restore focus to the trigger element so
  // Electron's native focus tracker doesn't strand the host inputs in
  // an unfocusable state — this is the regression in #1129.
  it('restores focus to the previously focused element on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Confirm button receives focus on open (via queueMicrotask in the
    // component); flush microtasks before asserting.
    return Promise.resolve().then(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Delete' }),
      );

      rerender(
        <ConfirmDialog
          {...baseProps}
          open={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(document.activeElement).toBe(trigger);

      document.body.removeChild(trigger);
    });
  });

  // Trigger-detached path: destructive flows often unmount the trigger
  // (e.g. the project card disappears the moment delete is confirmed).
  // Focusing a detached node is a no-op, so the close path must fall
  // back to a stable focus owner — otherwise Electron's focus tracker
  // is stranded and we're back to the #1129 regression even with the
  // React dialog in place.
  it('falls back to document.body when the previously focused element has been detached', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    return Promise.resolve().then(() => {
      // Simulate the trigger unmounting while the dialog is open — the
      // exact React batch a destructive confirm produces in DesignsTab.
      document.body.removeChild(trigger);
      expect(trigger.isConnected).toBe(false);

      rerender(
        <ConfirmDialog
          {...baseProps}
          open={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      // Body is the neutral fallback owner — `document.activeElement`
      // is body either because the parent code focused it or because
      // jsdom defaulted there after the detached focus attempt was
      // dropped. Either way, focus is NOT stranded on the detached
      // trigger node.
      expect(document.activeElement).toBe(document.body);
    });
  });

  // Modal regression: keyboard users must not be able to Tab past the
  // alertdialog into the host page. Native confirm(...) blocks all
  // background interaction; without focus trapping the in-app dialog
  // is a non-modal modal and an accidental Tab can land on (and Enter
  // can activate) an unrelated background control while a destructive
  // prompt is still open.
  it('traps Tab inside the dialog, cycling between cancel and confirm', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    return Promise.resolve().then(() => {
      const cancel = screen.getByTestId('confirm-dialog-cancel');
      const confirm = screen.getByTestId('confirm-dialog-confirm');

      // queueMicrotask in the component lands focus on confirm.
      expect(document.activeElement).toBe(confirm);

      // Forward: confirm → cancel → confirm.
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(cancel);
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(confirm);

      // Reverse: confirm → cancel (Shift+Tab from confirm).
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(cancel);
      // And Shift+Tab from cancel cycles back to confirm.
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(confirm);
    });
  });
});
