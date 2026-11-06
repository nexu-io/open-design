// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipLayer } from '../../src/components/TooltipLayer';

afterEach(() => cleanup());

/**
 * W129 note on `queryByRole('tooltip')` below.
 *
 * The bubble node is now mounted for the lifetime of the app (it has to be, or
 * the design's opacity transition has nothing to run on — see
 * `components/TooltipLayer.tsx`). "Dismissed" therefore means **out of the
 * accessibility tree**, not "removed from the DOM": `aria-hidden="true"` is
 * what these `toBeNull()` assertions are reading, and that is exactly the
 * guarantee that matters here — a screen reader must not keep announcing a
 * tooltip nobody can see. The mounting model itself, and the screen-reader
 * evidence for it, are pinned in `w129-tooltip-fade.test.tsx`.
 */
describe('TooltipLayer', () => {
  it('takes a hovered icon tooltip out of the a11y tree when the icon is activated', () => {
    render(
      <>
        <button
          type="button"
          className="od-tooltip"
          data-tooltip="Settings"
          title="Settings"
        >
          Settings
        </button>
        <TooltipLayer />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Settings' });
    fireEvent.pointerOver(button);

    expect(screen.getByRole('tooltip').textContent).toBe('Settings');

    fireEvent.pointerDown(button);
    fireEvent.focusIn(button);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(
      document.querySelector('.od-tooltip-layer')?.getAttribute('aria-hidden'),
      'the bubble stays mounted, so aria-hidden is the only thing keeping it quiet',
    ).toBe('true');
  });

  it('takes a tooltip out of the a11y tree when the trigger expands under the pointer', async () => {
    function ExpandingTrigger() {
      const [open, setOpen] = useState(false);
      return (
        <button
          type="button"
          className="od-tooltip"
          data-tooltip="Design Agent mode"
          title="Design Agent mode"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          Design Agent
        </button>
      );
    }

    render(
      <>
        <ExpandingTrigger />
        <TooltipLayer />
      </>,
    );

    const button = screen.getByRole('button', { name: 'Design Agent' });
    fireEvent.pointerOver(button);
    expect(screen.getByRole('tooltip').textContent).toBe('Design Agent mode');

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  it('lifts only a tooltip whose trigger lives inside an open menu', () => {
    render(
      <>
        <div role="menu">
          <button
            type="button"
            className="od-tooltip"
            data-tooltip="Only one file can be shared"
            data-tooltip-placement="top"
          >
            Help
          </button>
        </div>
        <TooltipLayer />
      </>,
    );

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('tooltip').getAttribute('data-tooltip-context')).toBe('menu');
  });
});
