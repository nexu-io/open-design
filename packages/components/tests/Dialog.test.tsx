// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../src/dialog';
import styles from '../src/dialog.module.css';

afterEach(() => {
  cleanup();
});

describe('Dialog', () => {
  it('moves focus inside on opening and restores the connected trigger on closing', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    try {
      const view = render(<StrictMode><Dialog ariaLabel="Notice"><button>Close</button></Dialog></StrictMode>);
      const panel = screen.getByRole('dialog');
      expect(panel.contains(document.activeElement)).toBe(true);
      view.unmount();
      expect(document.activeElement).toBe(trigger);
    } finally {
      trigger.remove();
    }
  });

  it('keeps Tab and Shift+Tab inside, including a dialog with no controls', () => {
    const view = render(<Dialog ariaLabel="Notice"><button>First</button><button>Last</button></Dialog>);
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    view.rerender(<Dialog ariaLabel="Notice"><p>No controls</p></Dialog>);
    const panel = screen.getByRole('dialog');
    panel.focus();
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(panel);
  });

  it('preserves explicit autofocus and lets only the top dialog handle Escape', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const outer = <Dialog ariaLabel="Outer" onClose={outerClose} closeOnEscape>
      <button>Outer action</button>
    </Dialog>;
    const content = (open: boolean) => <>{outer}
      {open && <Dialog ariaLabel="Inner" onClose={innerClose} closeOnEscape>
        <input autoFocus aria-label="Name" />
      </Dialog>}
    </>;
    const view = render(content(false));
    const outerAction = screen.getByRole('button', { name: 'Outer action' });
    outerAction.focus();
    view.rerender(content(true));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
    view.rerender(content(false));
    expect(document.activeElement).toBe(outerAction);
  });

  it('respects a control that consumes Tab', () => {
    render(<Dialog ariaLabel="Editor"><button>Save</button><textarea aria-label="Code" onKeyDown={event => {
      if (event.key === 'Tab') event.preventDefault();
    }} /></Dialog>);
    const editor = screen.getByRole('textbox', { name: 'Code' });
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(document.activeElement).toBe(editor);
  });

  it('skips controls inside CSS-hidden ancestors when wrapping Tab', () => {
    render(<Dialog ariaLabel="Notice">
      <div style={{ display: 'none' }}><button>Hidden first</button></div>
      <button>First visible</button><button>Last visible</button>
      <div style={{ display: 'none' }}><button>Hidden last</button></div>
    </Dialog>);
    const first = screen.getByRole('button', { name: 'First visible' });
    const last = screen.getByRole('button', { name: 'Last visible' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('keeps form submission and control-owned Escape behavior intact', () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<Dialog as="form" ariaLabel="Edit" closeOnEscape onClose={onClose} onSubmit={onSubmit}>
      <input autoFocus aria-label="Name" onKeyDown={event => {
        if (event.key === 'Escape') event.preventDefault();
      }} />
      <button type="submit">Save</button>
    </Dialog>);
    const panel = screen.getByRole('dialog', { name: 'Edit' });
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.submit(panel);
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('wires labelled dialogs consistently', () => {
    render(
      <Dialog ariaLabelledBy="dialog-title">
        <h2 id="dialog-title">Rename design</h2>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Rename design' })).toBeTruthy();
  });

  // The overlay is portaled onto <body> (so its scrim out-ranks app chrome in
  // the root stacking context), which is why every query below goes through
  // `baseElement` rather than the render container.
  it('mounts the backdrop on <body>, outside the render container', () => {
    const { container, baseElement } = render(
      <Dialog>
        <h2>Portaled</h2>
      </Dialog>,
    );
    expect(container.querySelector('.modal-backdrop')).toBeNull();
    expect(baseElement.querySelector('.modal-backdrop')?.parentElement).toBe(document.body);
  });

  it('closes on backdrop click when enabled', () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <Dialog onClose={onClose}>
        <h2>Backdrop close</h2>
      </Dialog>,
    );

    fireEvent.click(baseElement.querySelector('.modal-backdrop') as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape when enabled', () => {
    const onClose = vi.fn();
    render(
      <Dialog onClose={onClose} closeOnEscape>
        <h2>Escape close</h2>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets custom panels opt out of the shared modal chrome class', () => {
    const { baseElement } = render(
      <Dialog className="plugin-details-modal" includeChromeClassName={false}>
        <h2>Plugin details</h2>
      </Dialog>,
    );

    const panel = baseElement.querySelector('.plugin-details-modal');

    expect(panel).toBeTruthy();
    expect(panel?.classList.contains('plugin-details-modal')).toBe(true);
    expect(panel?.classList.contains('modal')).toBe(false);
    expect(panel?.className.split(/\s+/)).not.toContain(styles.dialog);
  });

  it('keeps caller variant sizing overrides ahead of shared dialog defaults', () => {
    const variantStyles = document.createElement('style');
    variantStyles.textContent = '.modal-rename { width: 420px; gap: 14px; }';
    document.head.insertBefore(variantStyles, document.head.firstChild);

    try {
      const { baseElement } = render(
        <Dialog className="modal-rename">
          <h2>Rename design</h2>
        </Dialog>,
      );

      const panel = baseElement.querySelector('.modal-rename') as HTMLElement;
      const panelStyles = getComputedStyle(panel);

      expect(panelStyles.width).toBe('420px');
      expect(panelStyles.gap).toBe('14px');
    } finally {
      variantStyles.remove();
    }
  });

  it('supports sectioned layouts with shared header/body/footer primitives', () => {
    const { baseElement } = render(
      <Dialog layout="sectioned" ariaLabelledBy="dialog-title">
        <DialogHeader>
          <DialogTitle id="dialog-title">Sketch text</DialogTitle>
          <DialogDescription>Add a note to the canvas.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label>
            <span>Text</span>
            <input type="text" />
          </label>
        </DialogBody>
        <DialogFooter>
          <button type="button">Cancel</button>
          <button type="button">Save</button>
        </DialogFooter>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Sketch text' })).toBeTruthy();
    expect(baseElement.querySelector('[class*="dialogSectioned"]')).toBeTruthy();
    expect(baseElement.querySelector('[class*="header"]')).toBeTruthy();
    expect(baseElement.querySelector('[class*="body"]')).toBeTruthy();
    expect(baseElement.querySelector('[class*="footer"]')).toBeTruthy();
  });
});
