// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManualEditSelectionOverlay } from '../../src/components/ManualEditSelectionOverlay';
import { emptyManualEditStyles, type ManualEditRect, type ManualEditTarget } from '../../src/edit-mode/types';

const target: ManualEditTarget = {
  id: 'move-me',
  kind: 'text',
  label: 'Move me',
  tagName: 'DIV',
  className: '',
  text: 'Move me',
  rect: { x: 100, y: 100, width: 200, height: 80 },
  scale: { x: 1, y: 1 },
  fields: { text: 'Move me' },
  attributes: {},
  styles: {
    ...emptyManualEditStyles(),
    position: 'absolute',
    left: '100px',
    top: '100px',
    width: '200px',
  },
  isLayoutContainer: false,
  outerHtml: '<div data-od-id="move-me">Move me</div>',
};

const imageTarget: ManualEditTarget = {
  ...target,
  id: 'photo',
  kind: 'image',
  tagName: 'IMG',
  label: 'Photo',
  fields: { src: 'photo.png', alt: '' },
  outerHtml: '<img data-od-id="photo" src="photo.png" alt="">',
};

let originalSetPointerCapture: typeof HTMLElement.prototype.setPointerCapture | undefined;
let originalReleasePointerCapture: typeof HTMLElement.prototype.releasePointerCapture | undefined;
let originalHasPointerCapture: typeof HTMLElement.prototype.hasPointerCapture | undefined;

beforeEach(() => {
  originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
  originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
  originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(1);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalSetPointerCapture) HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  if (originalReleasePointerCapture) HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  if (originalHasPointerCapture) HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
});

function renderOverlay() {
  const onGestureCommit = vi.fn();
  const onGestureCancel = vi.fn();
  const onGestureActiveChange = vi.fn();
  render(
    <ManualEditSelectionOverlay
      target={target}
      targets={[target]}
      scale={1}
      canvasSize={{ width: 1000, height: 800 }}
      onGesturePreview={vi.fn()}
      onGestureCommit={onGestureCommit}
      onGestureCancel={onGestureCancel}
      onGestureActiveChange={onGestureActiveChange}
      onDuplicate={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  return { onGestureCommit, onGestureCancel, onGestureActiveChange };
}

describe('ManualEditSelectionOverlay pointer capture fallbacks', () => {
  it('raises a host-side pointer shield for the whole active gesture', () => {
    renderOverlay();
    const layer = screen.getByTestId('manual-edit-overlay-layer');
    const handle = screen.getByTestId('manual-edit-resize-right');

    expect(layer).toHaveAttribute('data-gesture-active', 'false');
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 140, pointerId: 5 });

    // The selection chrome sits over an iframe. Once the handle starts a
    // gesture, the full host layer must own hit testing so later moves cannot
    // disappear into the child document when the handle reflows away from the
    // pointer (the common side-resize failure mode).
    expect(layer).toHaveAttribute('data-gesture-active', 'true');

    fireEvent.pointerMove(layer, { clientX: 420, clientY: 140, pointerId: 5 });
    fireEvent.pointerUp(layer, { clientX: 420, clientY: 140, pointerId: 5 });
    expect(layer).toHaveAttribute('data-gesture-active', 'false');
  });

  it('finishes a move when pointerup lands on the document instead of the handle', () => {
    const { onGestureCommit, onGestureActiveChange } = renderOverlay();
    const handle = screen.getByTestId('manual-edit-move-handle');

    fireEvent.pointerDown(handle, { clientX: 200, clientY: 100, pointerId: 7 });
    fireEvent.pointerMove(document, { clientX: 260, clientY: 140, pointerId: 7 });
    fireEvent.pointerUp(document, { clientX: 260, clientY: 140, pointerId: 7 });

    expect(onGestureActiveChange.mock.calls).toEqual([[true], [false]]);
    expect(onGestureCommit).toHaveBeenCalledTimes(1);
    expect(onGestureCommit).toHaveBeenCalledWith(
      expect.objectContaining({ left: '160px', top: '140px' }),
      expect.objectContaining({ x: 160, y: 140 }),
      'move',
    );
  });

  it('commits the last rendered position and unlocks when pointer capture is lost after a move', () => {
    const { onGestureCommit, onGestureCancel, onGestureActiveChange } = renderOverlay();
    const handle = screen.getByTestId('manual-edit-move-handle');

    fireEvent.pointerDown(handle, { clientX: 200, clientY: 100, pointerId: 9 });
    fireEvent.pointerMove(handle, { clientX: 240, clientY: 120, pointerId: 9 });
    fireEvent(handle, new Event('lostpointercapture'));

    expect(onGestureActiveChange.mock.calls).toEqual([[true], [false]]);
    expect(onGestureCommit).toHaveBeenCalledTimes(1);
    expect(onGestureCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId('manual-edit-action-bar')).not.toBeNull();
  });

  it('flushes the final queued pointer position before lost capture decides whether to commit', () => {
    let queuedFrame: FrameRequestCallback | null = null;
    vi.mocked(window.requestAnimationFrame).mockImplementation((callback) => {
      queuedFrame = callback;
      return 41;
    });
    const { onGestureCommit, onGestureCancel } = renderOverlay();
    const handle = screen.getByTestId('manual-edit-move-handle');

    fireEvent.pointerDown(handle, { clientX: 200, clientY: 100, pointerId: 11 });
    fireEvent.pointerMove(document, { clientX: 275, clientY: 145, pointerId: 11 });
    expect(queuedFrame).not.toBeNull();

    // Real OS drags can drop capture before the next animation frame. The
    // latest pointer coordinates are still the user's visible drop intent and
    // must be committed, not silently snapped back.
    fireEvent(handle, new Event('lostpointercapture'));

    expect(onGestureCommit).toHaveBeenCalledTimes(1);
    expect(onGestureCommit).toHaveBeenCalledWith(
      expect.objectContaining({ left: '175px', top: '145px' }),
      expect.objectContaining({ x: 175, y: 145 }),
      'move',
    );
    expect(onGestureCancel).not.toHaveBeenCalled();
  });
});

describe('ManualEditSelectionOverlay whole-image move', () => {
  function renderImageOverlay() {
    const onGestureCommit = vi.fn();
    render(
      <ManualEditSelectionOverlay
        target={imageTarget}
        targets={[imageTarget]}
        scale={1}
        canvasSize={{ width: 1000, height: 800 }}
        onGesturePreview={vi.fn()}
        onGestureCommit={onGestureCommit}
        onGestureCancel={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    return { onGestureCommit };
  }

  it('moves an image by dragging its body, not only the top pill', () => {
    const { onGestureCommit } = renderImageOverlay();
    const body = screen.getByTestId('manual-edit-move-body');

    fireEvent.pointerDown(body, { clientX: 200, clientY: 140, pointerId: 4 });
    fireEvent.pointerMove(document, { clientX: 260, clientY: 180, pointerId: 4 });
    fireEvent.pointerUp(document, { clientX: 260, clientY: 180, pointerId: 4 });

    expect(onGestureCommit).toHaveBeenCalledTimes(1);
    expect(onGestureCommit).toHaveBeenCalledWith(
      expect.objectContaining({ left: '160px', top: '140px' }),
      expect.objectContaining({ x: 160, y: 140 }),
      'move',
    );
  });

  it('keeps the body-drag surface off non-image targets so text stays click-to-edit', () => {
    renderOverlay();
    expect(screen.queryByTestId('manual-edit-move-body')).toBeNull();
  });
});

describe('ManualEditSelectionOverlay resize frame sync', () => {
  it('locks the frame onto the element measured box, not the raw gesture rect', () => {
    let applied: ((rect: ManualEditRect | null) => void) | undefined;
    render(
      <ManualEditSelectionOverlay
        target={imageTarget}
        targets={[imageTarget]}
        scale={1}
        canvasSize={{ width: 1000, height: 800 }}
        onGesturePreview={(_partial, onApplied) => {
          applied = onApplied;
        }}
        onGestureCommit={vi.fn()}
        onGestureCancel={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const handle = screen.getByTestId('manual-edit-resize-right');
    const frame = screen.getByTestId('manual-edit-selection-frame');

    // Right handle sits at the element's right edge (x + width = 300); drag it
    // out by 60px. The gesture INTENT keeps the left edge at 100 and widens to
    // 260, so before any measurement the frame follows that intent.
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 140, pointerId: 3 });
    fireEvent.pointerMove(document, { clientX: 360, clientY: 140, pointerId: 3 });
    expect(applied).toBeInstanceOf(Function);
    expect(frame.style.left).toBe('100px');
    expect(frame.style.width).toBe('260px');

    // The element actually re-centred as it widened (a margin:auto image slides
    // its left edge inward): its real box starts at x=70. The frame must adopt
    // that measured box on BOTH axes, or it drifts off the picture (the 错位).
    act(() => applied!({ x: 70, y: 100, width: 260, height: 80 }));
    expect(frame.style.left).toBe('70px');
    expect(frame.style.width).toBe('260px');
  });
});

describe('ManualEditSelectionOverlay image replacement', () => {
  it('snapshots a picked image into a fresh File before handing it to the async upload path', async () => {
    const onReplaceImage = vi.fn();
    const imageTarget: ManualEditTarget = {
      ...target,
      kind: 'image',
      tagName: 'IMG',
      fields: { src: 'before.png', alt: 'Before' },
      outerHtml: '<img data-od-id="move-me" src="before.png" alt="Before">',
    };
    const sourceBytes = new Uint8Array([137, 80, 78, 71]);
    const pickedFile = new File([sourceBytes], 'replacement.png', {
      type: 'image/png',
      lastModified: 123,
    });
    const readBytes = vi.fn(async () => sourceBytes.buffer.slice(0));
    Object.defineProperty(pickedFile, 'arrayBuffer', { value: readBytes });

    const view = render(
      <ManualEditSelectionOverlay
        target={imageTarget}
        targets={[imageTarget]}
        scale={1}
        canvasSize={{ width: 1000, height: 800 }}
        onGesturePreview={vi.fn()}
        onGestureCommit={vi.fn()}
        onGestureCancel={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onReplaceImage={onReplaceImage}
      />,
    );
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [pickedFile] } });

    await waitFor(() => expect(onReplaceImage).toHaveBeenCalledTimes(1));
    const snapshotted = onReplaceImage.mock.calls[0]![0] as File;
    expect(readBytes).toHaveBeenCalledTimes(1);
    expect(snapshotted).not.toBe(pickedFile);
    expect(snapshotted.name).toBe('replacement.png');
    expect(snapshotted.type).toBe('image/png');
    expect(snapshotted.lastModified).toBe(123);
  });
});
