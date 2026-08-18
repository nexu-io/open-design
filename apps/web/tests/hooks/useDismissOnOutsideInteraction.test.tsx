// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { useDismissOnOutsideInteraction } from '../../src/hooks/useDismissOnOutsideInteraction';

afterEach(cleanup);

function Menu({ onDismissed }: { onDismissed?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutsideInteraction(open, containerRef, () => {
    setOpen(false);
    onDismissed?.();
  });
  return (
    <div>
      <div ref={containerRef}>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          toggle
        </button>
        {open ? (
          <div role="menu">
            <button type="button">item</button>
          </div>
        ) : null}
      </div>
      <button type="button" data-testid="outside">
        outside
      </button>
    </div>
  );
}

function openMenu() {
  fireEvent.click(screen.getByText('toggle'));
  expect(screen.getByRole('menu')).toBeTruthy();
}

describe('useDismissOnOutsideInteraction (#144)', () => {
  it('closes the panel when the user presses somewhere else on the page', () => {
    render(<Menu />);
    openMenu();

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open while the press lands inside the panel', () => {
    // A menu that dismissed on its own items would make every item unclickable.
    render(<Menu />);
    openMenu();

    fireEvent.pointerDown(screen.getByText('item'));

    expect(screen.queryByRole('menu')).toBeTruthy();
  });

  it('closes on Escape so the keyboard has the same exit', () => {
    render(<Menu />);
    openMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('leaves the trigger alone so a press on it toggles rather than double-closing', () => {
    render(<Menu />);
    openMenu();

    fireEvent.pointerDown(screen.getByText('toggle'));

    expect(screen.queryByRole('menu')).toBeTruthy();
  });

  it('detaches its listeners once closed', () => {
    // A listener that outlives the open state fires onDismiss on every stray
    // press for the rest of the page's life.
    let dismissals = 0;
    render(<Menu onDismissed={() => { dismissals += 1; }} />);
    openMenu();

    fireEvent.pointerDown(screen.getByTestId('outside'));
    fireEvent.pointerDown(screen.getByTestId('outside'));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(dismissals).toBe(1);
  });
});
