// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../src/dialog';

afterEach(() => {
  cleanup();
});

describe('Dialog', () => {
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
    expect(panel?.className).toBe('plugin-details-modal');
    expect(panel?.classList.contains('modal')).toBe(false);
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
