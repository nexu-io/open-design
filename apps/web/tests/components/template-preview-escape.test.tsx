// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TemplatePreviewModal, type TemplateDemo } from '../../src/components/CommunityTemplatePreview';

const template: TemplateDemo = {
  id: 'preview', title: 'Preview', tags: [], accent: '#4164f4', meta: 'Prototype',
  author: 'Open Design', type: 'Prototype', subtype: '', cardMedia: null,
  posterSrc: null, previewSrc: null, previewVideo: null, prompt: '',
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('focuses the dialog and consumes Escape before parent bubble handlers', () => {
  const onClose = vi.fn();
  render(<TemplatePreviewModal template={template} onClose={onClose} />);
  const dialog = screen.getByRole('dialog');
  expect(document.activeElement).toBe(dialog);
  const bubble = vi.fn();
  dialog.addEventListener('keydown', bubble);
  expect(fireEvent.keyDown(dialog, { key: 'Escape' })).toBe(false);
  expect(onClose).toHaveBeenCalledOnce();
  expect(bubble).not.toHaveBeenCalled();
});

it('handles Escape inside the preview document without relying on parent bubbling', () => {
  const onClose = vi.fn();
  render(<TemplatePreviewModal template={template} onClose={onClose} />);
  const frame = screen.getByTitle('Preview preview') as HTMLIFrameElement;
  const body = frame.contentDocument!.body;
  const bubble = vi.fn();
  body.addEventListener('keydown', bubble);
  fireEvent.keyDown(body, { key: 'ArrowRight' });
  expect(onClose).not.toHaveBeenCalled();
  bubble.mockClear();
  expect(fireEvent.keyDown(body, { key: 'Escape' })).toBe(false);
  expect(onClose).toHaveBeenCalledOnce();
  expect(bubble).not.toHaveBeenCalled();
});

it('rebinds on frame load and releases old documents and callbacks', () => {
  const onClose = vi.fn();
  const nextClose = vi.fn();
  const { rerender, unmount } = render(<TemplatePreviewModal template={template} onClose={onClose} />);
  const frame = screen.getByTitle('Preview preview') as HTMLIFrameElement;
  const oldDocument = frame.contentDocument!;
  const nextDocument = document.implementation.createHTMLDocument('Reloaded preview');
  vi.spyOn(frame, 'contentDocument', 'get').mockReturnValue(nextDocument);
  fireEvent.load(frame);
  fireEvent.keyDown(oldDocument.body, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent(nextDocument.body, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onClose).toHaveBeenCalledOnce();
  rerender(<TemplatePreviewModal template={template} onClose={nextClose} />);
  fireEvent(nextDocument.body, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(nextClose).toHaveBeenCalledOnce();
  unmount();
  fireEvent(nextDocument.body, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(nextClose).toHaveBeenCalledOnce();
});

it('keeps host Escape available when a loaded frame is inaccessible', () => {
  const onClose = vi.fn();
  render(<TemplatePreviewModal template={template} onClose={onClose} />);
  const frame = screen.getByTitle('Preview preview') as HTMLIFrameElement;
  vi.spyOn(frame, 'contentDocument', 'get').mockImplementation(() => {
    throw new DOMException('Cross-origin frame', 'SecurityError');
  });
  fireEvent.load(frame);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});
