// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewViewportControls } from '../../../src/features/file-viewer/components/PreviewViewportControls';
import { FileVersionViewportControls } from '../../../src/features/file-viewer/components/FileVersionViewportControls';
import type { TranslateFn } from '../../../src/features/file-viewer/types';

afterEach(cleanup);

const t = ((key: string) => key) as TranslateFn;

describe('PreviewViewportControls', () => {
  it('opens the menu on trigger click and calls onViewport for a preset', () => {
    const onViewport = vi.fn();
    const { container } = render(<PreviewViewportControls viewport="desktop" onViewport={onViewport} t={t} />);
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    fireEvent.click(container.querySelector('.viewer-viewport-trigger')!);
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();

    fireEvent.click(screen.getByTitle('fileViewer.viewportMobileTitle'));
    expect(onViewport).toHaveBeenCalledWith('mobile');
  });

  it('closes the menu on an outside pointerdown', () => {
    const { container } = render(<PreviewViewportControls viewport="desktop" onViewport={() => {}} t={t} />);
    fireEvent.click(container.querySelector('.viewer-viewport-trigger')!);
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes the menu on Escape', () => {
    const { container } = render(<PreviewViewportControls viewport="desktop" onViewport={() => {}} t={t} />);
    fireEvent.click(container.querySelector('.viewer-viewport-trigger')!);
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe('FileVersionViewportControls', () => {
  it('renders one button per viewport preset and marks the active one', () => {
    render(<FileVersionViewportControls viewport="tablet" onViewport={() => {}} t={t} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons.some((button) => button.className.includes('active'))).toBe(true);
  });

  it('calls onViewport with the clicked preset id', () => {
    const onViewport = vi.fn();
    render(<FileVersionViewportControls viewport="desktop" onViewport={onViewport} t={t} />);
    fireEvent.click(screen.getAllByRole('button')[1]!);
    expect(onViewport).toHaveBeenCalled();
  });
});
