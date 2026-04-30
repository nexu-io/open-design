import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewModal } from '../../apps/web/src/components/PreviewModal';

// Regression coverage for nexu-io/open-design#141: pressing Esc in fullscreen
// used to require two presses because the browser exits its native fullscreen
// element on the first press without delivering a keydown to JS, leaving the
// React `fullscreen` state stuck on. The fix listens to fullscreenchange and
// mirrors the native state into React.

const baseProps = {
  title: 'Sample',
  views: [{ id: 'main', label: 'Main', html: '<p>hi</p>' }],
  exportTitleFor: (id: string) => id,
};

function dispatchFullscreenChange() {
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

function setNativeFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => el,
  });
}

describe('PreviewModal fullscreen exit', () => {
  afterEach(() => {
    cleanup();
    setNativeFullscreenElement(null);
  });

  it('drops the fullscreen overlay when the browser exits native fullscreen', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PreviewModal {...baseProps} onClose={onClose} />,
    );

    // Click the Fullscreen button. jsdom does not implement requestFullscreen
    // on plain elements, so PreviewModal's fallback path runs and just sets
    // the React state — exactly matching what happens after a successful
    // browser fullscreen request.
    const fsButton = container.querySelector(
      'button[title="Fullscreen"]',
    ) as HTMLButtonElement;
    expect(fsButton).toBeTruthy();
    fireEvent.click(fsButton);
    const stage = container.querySelector('.ds-modal') as HTMLElement;
    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(true);

    // Simulate the user pressing Esc in browser fullscreen: the browser
    // exits its native fullscreen element and fires fullscreenchange, but
    // (in browsers like Firefox) does not deliver the keydown to JS.
    setNativeFullscreenElement(null);
    dispatchFullscreenChange();

    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the modal mounted on Esc while fullscreen, and closes only on a second Esc', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PreviewModal {...baseProps} onClose={onClose} />,
    );
    const fsButton = container.querySelector(
      'button[title="Fullscreen"]',
    ) as HTMLButtonElement;
    fireEvent.click(fsButton);
    const stage = container.querySelector('.ds-modal') as HTMLElement;
    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(true);

    // First Esc — drops fullscreen, must not close the modal.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    // Second Esc — closes the modal.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores fullscreenchange when another element is still fullscreen', () => {
    const onClose = vi.fn();
    const { container } = render(
      <PreviewModal {...baseProps} onClose={onClose} />,
    );
    const fsButton = container.querySelector(
      'button[title="Fullscreen"]',
    ) as HTMLButtonElement;
    fireEvent.click(fsButton);
    const stage = container.querySelector('.ds-modal') as HTMLElement;
    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(true);

    // Some other element is the active fullscreen target — our overlay must
    // not collapse to non-fullscreen on transitions that leave a different
    // element fullscreen.
    const other = document.createElement('div');
    document.body.appendChild(other);
    setNativeFullscreenElement(other);
    dispatchFullscreenChange();

    expect(stage.classList.contains('ds-modal-fullscreen')).toBe(true);
    document.body.removeChild(other);
  });
});
