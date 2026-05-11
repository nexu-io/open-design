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
});
