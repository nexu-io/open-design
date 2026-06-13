// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InterruptButton } from '../../../src/components/Theater/InterruptButton';

afterEach(() => cleanup());

describe('<InterruptButton> (Phase 8)', () => {
  it('renders the localized label and fires onInterrupt on click', () => {
    const onInterrupt = vi.fn();
    render(<InterruptButton onInterrupt={onInterrupt} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('fires onInterrupt when the user presses Escape', () => {
    const onInterrupt = vi.fn();
    render(<InterruptButton onInterrupt={onInterrupt} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('shows "Interrupting…" and disables the button while pending', () => {
    const onInterrupt = vi.fn();
    render(<InterruptButton pending onInterrupt={onInterrupt} />);
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.textContent).toBe('Interrupting…');
    expect(btn.disabled).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it('renders nothing once the run is done', () => {
    const { container } = render(<InterruptButton done onInterrupt={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('detaches the keydown listener on unmount', () => {
    const onInterrupt = vi.fn();
    const { unmount } = render(<InterruptButton onInterrupt={onInterrupt} />);
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onInterrupt).not.toHaveBeenCalled();
  });

  it('ignores Escape when focus is inside a textarea (lefarcen P2 on PR #1315)', () => {
    // Previously the Esc handler fired regardless of focus, so
    // pressing Escape while typing in the prompt textarea or any
    // other text-entry field would cancel the in-flight critique by
    // accident.
    const onInterrupt = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    render(<InterruptButton onInterrupt={onInterrupt} />);
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onInterrupt).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('ignores Escape when focus is inside an input', () => {
    const onInterrupt = vi.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    render(<InterruptButton onInterrupt={onInterrupt} />);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onInterrupt).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('ignores Escape when focus is inside a contenteditable surface', () => {
    const onInterrupt = vi.fn();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.appendChild(editor);
    editor.focus();
    render(<InterruptButton onInterrupt={onInterrupt} />);
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(onInterrupt).not.toHaveBeenCalled();
    document.body.removeChild(editor);
  });

  it('still fires Escape when focus is on a non-text element', () => {
    const onInterrupt = vi.fn();
    render(<InterruptButton onInterrupt={onInterrupt} />);
    // Body-level focus (no text input) still triggers the keybind.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('defers to an open dialog when Escape fires outside the Theater stage (PerishCode P3 on PR #1315)', () => {
    // Common UX collision: the workspace has a modal / popover open, the
    // user hits Esc to dismiss it, and the Theater's window-scope listener
    // synthesizes an interrupt at the same time. The handler should defer
    // to the modal's own Esc handler when a [role="dialog"] is on the page.
    const onInterrupt = vi.fn();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    try {
      render(<InterruptButton onInterrupt={onInterrupt} />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onInterrupt).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(dialog);
    }
  });

  it('ignores aria-hidden dialogs and still fires Escape (PerishCode P3 followup)', () => {
    // A dialog marked aria-hidden="true" is not really open; it should
    // not steal the interrupt keybind from a body-level Esc.
    const onInterrupt = vi.fn();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dialog);
    try {
      render(<InterruptButton onInterrupt={onInterrupt} />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onInterrupt).toHaveBeenCalledTimes(1);
    } finally {
      document.body.removeChild(dialog);
    }
  });

  it('still fires Escape when the event originates inside the Theater stage even if a dialog is open elsewhere', () => {
    // A Theater-internal Esc must always work, even when an unrelated
    // surface is open on the page. The dialog gate only defers Esc that
    // originates OUTSIDE the Theater region.
    const onInterrupt = vi.fn();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    const stage = document.createElement('section');
    stage.className = 'theater-stage';
    const child = document.createElement('button');
    stage.appendChild(child);
    document.body.appendChild(stage);
    try {
      render(<InterruptButton onInterrupt={onInterrupt} />);
      fireEvent.keyDown(child, { key: 'Escape' });
      expect(onInterrupt).toHaveBeenCalledTimes(1);
    } finally {
      document.body.removeChild(dialog);
      document.body.removeChild(stage);
    }
  });
});
